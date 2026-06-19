import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Set
from urllib.parse import parse_qs, urlparse

import requests
from playwright.async_api import async_playwright, BrowserContext, Page
from playwright_stealth import Stealth


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
VIDFAST_BASE_URL = "https://vidfast.pro"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) "
    "Gecko/20100101 Firefox/125.0"
)

BAD_SEGMENT_EXTENSIONS = {".html", ".css", ".js"}
GOOD_SEGMENT_EXTENSIONS = {".ts", ".m4s", ".mp4", ".m4a", ".aac", ".vtt", ".webvtt", ".key"}

_IS_FROZEN = getattr(sys, "frozen", False) or "__compiled__" in globals()
APP_ROOT = Path(sys.executable).resolve().parent if _IS_FROZEN else Path(__file__).resolve().parent
PLAYWRIGHT_BUNDLE_DIR = APP_ROOT / "ms-playwright"
if PLAYWRIGHT_BUNDLE_DIR.exists():
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(PLAYWRIGHT_BUNDLE_DIR))


# ---------------------------------------------------------------------------
# Modèles de données
# ---------------------------------------------------------------------------
@dataclass
class Subtitle:
    display: str
    language: str
    url: str
    encoding: str = "UTF-8"


@dataclass
class StreamSources:
    servers: list[str] = field(default_factory=list)
    urls: dict[str, str] = field(default_factory=dict)
    default_server: str | None = None
    page_url: str = ""
    subtitles: list[Subtitle] = field(default_factory=list)

    def best_url(self, server: str | None = None) -> str:
        if server and server in self.urls:
            return self.urls[server]
        if self.default_server and self.default_server in self.urls:
            return self.urls[self.default_server]
        if self.urls:
            return next(iter(self.urls.values()))
        raise ValueError("Aucun flux disponible")


# ---------------------------------------------------------------------------
# Fonctions utilitaires
# ---------------------------------------------------------------------------
def _request_headers(user_agent: str = DEFAULT_USER_AGENT, referer: str = VIDFAST_BASE_URL) -> dict[str, str]:
    return {
        "User-Agent": user_agent,
        "Referer": referer,
        "Origin": VIDFAST_BASE_URL,
    }


def _token_from_url(url: str) -> str:
    return parse_qs(urlparse(url).query).get("q", [""])[0]


def _playlist_score(content: str) -> int:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    score = 0

    if not lines or lines[0] != "#EXTM3U":
        return -10_000

    is_master = any(line.startswith("#EXT-X-STREAM-INF") for line in lines)
    has_segments = any(line.startswith("#EXTINF") for line in lines)

    if has_segments:
        score += 10_000
    if is_master:
        score += 500
    if any(line.startswith("#EXT-X-ENDLIST") for line in lines):
        score += 200

    for line in lines:
        if line.startswith("#"):
            continue

        extension = os.path.splitext(urlparse(line).path)[1].lower()
        if extension in BAD_SEGMENT_EXTENSIONS:
            score -= 1_000
        elif extension in GOOD_SEGMENT_EXTENSIONS or extension in {"", ".m3u8"}:
            score += 40
        else:
            score += 10

    return score


def select_best_m3u8_url(urls, timeout=5, user_agent=None, referer: str = VIDFAST_BASE_URL):
    candidates = sorted(set(urls))
    if not candidates:
        raise ValueError("Aucun lien m3u8 trouvé")

    headers = _request_headers(user_agent or DEFAULT_USER_AGENT, referer)
    scored_candidates = []
    for url in candidates:
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            score = _playlist_score(response.text)
        except requests.RequestException:
            score = -1_000_000
        scored_candidates.append((score, url))

    scored_candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return scored_candidates[0][1]


def pick_master_playlist_url(urls: list[str], referer: str = VIDFAST_BASE_URL) -> str | None:
    masters = [url for url in urls if "video.m3u8" in url]
    if masters:
        return masters[-1]
    if urls:
        return select_best_m3u8_url(urls, referer=referer)
    return None


def resolve_playback_url(url: str, user_agent: str, referer: str = VIDFAST_BASE_URL, timeout: int = 8) -> str:
    headers = _request_headers(user_agent, referer)
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    playlist = response.text

    if "#EXT-X-STREAM-INF" not in playlist:
        return url

    variants: list[tuple[int, str]] = []
    lines = [line.strip() for line in playlist.splitlines()]
    for index, line in enumerate(lines):
        if not line.startswith("#EXT-X-STREAM-INF"):
            continue
        bandwidth_match = re.search(r"BANDWIDTH=(\d+)", line)
        bandwidth = int(bandwidth_match.group(1)) if bandwidth_match else 0
        if index + 1 < len(lines) and not lines[index + 1].startswith("#"):
            variants.append((bandwidth, lines[index + 1]))

    if not variants:
        return url

    variants.sort(key=lambda item: item[0], reverse=True)
    return variants[0][1]


# ---------------------------------------------------------------------------
# Classe principale
# ---------------------------------------------------------------------------
class API:
    """Client d'accès à VidFast et IMDb."""

    def __init__(self):
        self.imdb_base_url = "https://api.imdbapi.dev"
        self.found: Set[str] = set()
        self.default_target: int = 2  
        self.user_agent: str = DEFAULT_USER_AGENT
        self.timeout: float = 5.0  
        self.server_switch_timeout: float = 4.0

    @staticmethod
    def _build_url(_type, _id, season=0, episode=0):
        """Construit l'URL de la page VidFast (film ou série)."""
        if _type == "movie":
            return f"https://vidfast.pro/movie/{_id}"
        elif _type == "series":
            return f"https://vidfast.pro/tv/{_id}/{season}/{episode}"
        else:
            raise ValueError(f"Unknown type: {_type}")

    def operational_servers(self, scrapers_data: dict) -> list[str]:
        """Extrait la liste des serveurs fonctionnels à partir de l'API de statut."""
        servers = []
        for name, info in scrapers_data.get("scrapers", {}).items():
            if info.get("status") == "operational":
                servers.append(name)
        return servers if servers else ["VidFast"]

    async def attach_collectors(self, page: Page, collected: list[str], stealth: Stealth):
        """Met en place l'intercepteur réseau pour capturer les playlists .m3u8."""
        try:
            await stealth.apply_stealth_async(page)
        except Exception:
            pass

        async def handle_request(request):
            url = request.url
            if ".m3u8" in url or "master" in url or "index" in url:
                if url not in collected:
                    collected.append(url)

        page.on("request", handle_request)

    def attach_subtitle_collector(self, page: Page, subtitles: list[Subtitle]):
        """Intercepte les fichiers de sous-titres demandés par le lecteur."""
        async def handle_response(response):
            url = response.url
            if ".vtt" in url or "subtitle" in url:
                lang = "fr" if "fr" in url.lower() else "en"
                subtitles.append(Subtitle(display=f"Sous-titre ({lang.upper()})", language=lang, url=url))
        page.on("response", handle_response)

    async def _detect_visible_server(self, page: Page, operational_servers: list[str]) -> str | None:
        """Détecte quel serveur est actuellement sélectionné à l'écran."""
        try:
            for server in operational_servers:
                is_visible = await page.locator(f"text={server}").is_visible()
                if is_visible:
                    return server
        except Exception:
            pass
        return operational_servers[0] if operational_servers else None

    async def _select_server(self, page: Page, server_name: str) -> bool:
        """Simule un clic sur l'interface pour changer de serveur vidéo."""
        try:
            btn = page.locator(f"button:has-text('{server_name}')").first
            if await btn.is_visible():
                await btn.click()
                await asyncio.sleep(1.5)
                return True
        except Exception:
            pass
        return False

    async def _wait_for_new_urls(self, collected: list, before: set, timeout: float):
        """Attend que de nouvelles requêtes réseau soient interceptées."""
        start = asyncio.get_running_loop().time()
        while asyncio.get_running_loop().time() - start < timeout:
            if len(set(collected) - before) > 0:
                return
            await asyncio.sleep(0.2)

    def _new_master_urls(self, collected: list, before: set) -> list[str]:
        return [url for url in collected if url not in before and ".m3u8" in url]

    def _finalize_playback_url(self, master_url: str, referer: str) -> str:
        """Convertit une playlist maître en URL de lecture (meilleure variante)."""
        return resolve_playback_url(master_url, self.user_agent, referer=referer)

    async def _create_browser_page(self, pw, headless: bool, use_firefox: bool):
        """Lance un navigateur furtif et renvoie le couple ``(browser, page)``."""
        browser_type = pw.firefox if use_firefox else pw.chromium
        browser = await browser_type.launch(
            headless=headless,
            args=[] if use_firefox else [
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        context: BrowserContext = await browser.new_context(
            user_agent=self.user_agent,
            viewport={"width": 1280, "height": 720},
            locale="fr-FR",
            extra_http_headers={"Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"},
        )
        page = await context.new_page()
        return browser, page

    async def _collect_server_stream(
            self,
            page: Page,
            collected: list[str],
            server_name: str,
            referer: str,
            known_tokens: set[str],
    ) -> str | None:
        """Sélectionne un serveur et renvoie son flux si un jeton inédit apparaît."""
        before_urls = set(collected)
        before_tokens = set(known_tokens)
        if not await self._select_server(page, server_name):
            return None

        try:
            await self._wait_for_new_urls(collected, before_urls, self.server_switch_timeout)
        except asyncio.TimeoutError:
            pass

        for master_url in self._new_master_urls(collected, before_urls):
            token = _token_from_url(master_url)
            if token and token not in before_tokens:
                known_tokens.add(token)
                return self._finalize_playback_url(master_url, referer)

        return None

    async def resolve_streams(
            self,
            url: str,
            headless: bool = False, 
            use_firefox: bool = True,
    ) -> StreamSources:
        """Résout, en une session, le flux de chaque serveur opérationnel."""
        scrapers = self.get_scrapers()
        operational = self.operational_servers(scrapers)
        collected: list[str] = []
        subtitles: list[Subtitle] = []
        urls_by_server: dict[str, str] = {}
        known_tokens: set[str] = set()
        stealth = Stealth()

        async with async_playwright() as pw:
            browser, page = await self._create_browser_page(pw, headless, use_firefox)
            await self.attach_collectors(page, collected, stealth)
            self.attach_subtitle_collector(page, subtitles)
            await page.goto(url, wait_until="domcontentloaded", timeout=0)
            await asyncio.sleep(2.0) 

            try:
                await asyncio.wait_for(self._wait_for_new_urls(collected, set(), self.timeout), timeout=self.timeout)
            except asyncio.TimeoutError:
                pass

            active_server = await self._detect_visible_server(page, operational)
            initial_master = pick_master_playlist_url(collected, referer=url)
            if initial_master:
                token = _token_from_url(initial_master)
                if token:
                    known_tokens.add(token)
                playback_url = self._finalize_playback_url(initial_master, url)
                if active_server:
                    urls_by_server[active_server] = playback_url

            for server in operational:
                if server in urls_by_server:
                    continue

                playback_url = await self._collect_server_stream(
                    page,
                    collected,
                    server,
                    url,
                    known_tokens,
                )
                if playback_url:
                    urls_by_server[server] = playback_url

            await browser.close()

        if not urls_by_server:
            raise ValueError("Aucun lien m3u8 trouvé pour cette vidéo")

        default_server = active_server if active_server in urls_by_server else next(iter(urls_by_server))

        return StreamSources(
            servers=operational,
            urls=urls_by_server,
            default_server=default_server,
            page_url=url,
            subtitles=subtitles,
        )

    def get_scrapers(self) -> dict:
        response = requests.get(
            f"{VIDFAST_BASE_URL}/api/status/scrapers",
            headers={"User-Agent": self.user_agent},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def get_movie_m3u8(self, movie_id):
        """Résout l'URL de lecture d'un film (serveur par défaut, rapide)."""
        self.found = set()
        page_url = API._build_url("movie", movie_id)
        return asyncio.run(self.resolve_streams(page_url, headless=False)).best_url()

    def get_series_m3u8(self, series_id, season, episode):
        """Résout l'URL de lecture d'un épisode (serveur par défaut, rapide)."""
        self.found = set()
        page_url = API._build_url("series", series_id, season, episode)
        return asyncio.run(self.resolve_streams(page_url, headless=False)).best_url()

    def resolve_movie_streams(self, movie_id) -> StreamSources:
        """Résout tous les serveurs disponibles pour un film."""
        url = API._build_url("movie", movie_id)
        return asyncio.run(self.resolve_streams(url, headless=False))

    def resolve_series_streams(self, series_id, season, episode) -> StreamSources:
        """Résout tous les serveurs disponibles pour un épisode."""
        url = API._build_url("series", series_id, season, episode)
        return asyncio.run(self.resolve_streams(url, headless=False))


# -- Fonction autonome (hors de la classe API) ------------------------------
def _find_ffmpeg() -> str:
    """Localise le binaire FFmpeg : node_modules en priorité, sinon le système."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if sys.platform.startswith("win"):
        candidate = os.path.join(base_dir, "node_modules", "ffmpeg-static", "ffmpeg.exe")
    else:
        candidate = os.path.join(base_dir, "node_modules", "ffmpeg-static", "ffmpeg")

    if os.path.exists(candidate):
        # Sur Linux, s'assurer que le binaire est exécutable
        if not sys.platform.startswith("win"):
            os.chmod(candidate, 0o755)
        return candidate

    # Fallback : FFmpeg installé dans le PATH système (ex: sudo apt install ffmpeg)
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg

    raise RuntimeError(
        "FFmpeg introuvable.\n"
        "  • Sur Linux  : sudo apt install ffmpeg\n"
        "  • Sur macOS  : brew install ffmpeg\n"
        "  • Sur Windows: npm install ffmpeg-static  (dans le dossier parent)"
    )


def download_video_from_m3u8(m3u8_url: str, output_filename: str, user_agent: str, referer: str):
    ffmpeg_path = _find_ffmpeg()

    headers = f"User-Agent: {user_agent}\r\nReferer: {referer}\r\nOrigin: https://vidfast.pro\r\n"

    command = [
        ffmpeg_path,
        "-headers", headers,
        "-i", m3u8_url,
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
        output_filename
    ]

    print(f"[FFmpeg] Binaire utilisé : {ffmpeg_path}")
    print(f"Téléchargement démarré vers {output_filename}...")
    process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if process.returncode == 0:
        print("Téléchargement et assemblage réussis !")
    else:
        print("Erreur lors du téléchargement :")
        # Affiche uniquement les 30 dernières lignes de stderr (évite le spam du header FFmpeg)
        stderr_lines = process.stderr.strip().splitlines()
        print("\n".join(stderr_lines[-30:]))