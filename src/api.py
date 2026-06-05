import asyncio
import re
from typing import Set
import requests
from playwright.async_api import async_playwright, BrowserContext, Page, Route
from playwright_stealth import Stealth

class API:
    def __init__(self):
        self.imdb_base_url = "https://api.imdbapi.dev"
        self.found: Set[str] = set()
        self.default_target: int = 2  # Nombre de liens à retrouver
        self.user_agent: str = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) "
            "Gecko/20100101 Firefox/125.0"
        )
        self.timeout: float = 2.5  # Temps à passer au maximum sur la recherche des liens

    @staticmethod
    def extract_m3u8(text: str) -> list[str]:
        return re.compile(r'https?://[^\s\'"<>{}\[\]\\]+\.m3u8(?:\?[^\s\'"<>{}\[\]\\]*)?').findall(text)

    @staticmethod
    def _build_url(_type, _id, season=0, episode=0):
        if _type == "movie":
            return f"https://vidfast.pro/movie/{_id}"
        elif _type == "series":
            return f"https://vidfast.pro/tv/{_id}/{season}/{episode}"
        else:
            raise ValueError(f"Unknown type: {_type}")

    async def on_request(
            self,
            request,
            done: asyncio.Event,
            target: int,
            source: str,
            debug: bool = False,
    ):
        links = self.extract_m3u8(request.url)
        for link in links:
            if link not in self.found:
                self.found.add(link)
                if debug:
                    print(f"  [GET /{source}]   {link}")
        if len(self.found) >= target:
            done.set()

    async def on_response(
            self,
            response,
            done: asyncio.Event,
            target: int,
            source: str,
            debug: bool = False,
    ):
        try:
            ct = response.headers.get("content-type", "")
            if not any(t in ct for t in ("json", "text", "javascript", "mpegurl")):
                return
            body = await response.text()
            for link in self.extract_m3u8(body):
                if link not in self.found:
                    self.found.add(link)
                    if debug:
                        print(f"  [body/{source}]  {link}  ← {response.url[:55]}")
            if len(self.found) >= target:
                done.set()
        except Exception:
            pass

    async def attach_to_page(self, page: Page, label: str, done: asyncio.Event, target: int, stealth: Stealth):
        try:
            await stealth.apply_stealth_async(page)
        except Exception:
            pass
        page.on("request", lambda r: asyncio.ensure_future(self.on_request(r, done, target, label)))
        page.on("response", lambda r: asyncio.ensure_future(self.on_response(r, done, target, label)))

    async def find_m3u8(
            self,
            url: str,
            headless: bool = True,
            use_firefox: bool = True,
    ) -> Set[str]:

        found: Set[str] = set()
        done = asyncio.Event()
        stealth = Stealth()

        async with async_playwright() as pw:
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
            await self.attach_to_page(page, "main", done, self.default_target, stealth)

            await page.goto(url, wait_until="domcontentloaded", timeout=0)

            await asyncio.sleep(1)

            try:
                await asyncio.wait_for(done.wait(), timeout=self.timeout)
            except asyncio.TimeoutError:
                print("Timeout")

            await browser.close()

        return found

    def get_movie_m3u8(self, movie_id):
        self.found = set()
        url = self._build_url("movie", movie_id)
        asyncio.run(self.find_m3u8(url))
        return self.found.pop()

    def get_series_m3u8(self, series_id, season, episode):
        self.found = set()
        url = self._build_url("series", series_id, season, episode)
        asyncio.run(self.find_m3u8(url))
        return self.found.pop()

    def get_titles(self, query):
        response = requests.get(f"{self.imdb_base_url}/search/titles?query={query}")
        try:
            return response.json()["titles"]
        except KeyError:
            print(response.json(), "\n", response.headers)
            return None

    def get_title_info(self, title_id):
        response = requests.get(f"{self.imdb_base_url}/titles/{title_id}")
        return response.json()

    def get_seasons(self, title_id):
        response = requests.get(f"{self.imdb_base_url}/titles/{title_id}/seasons")
        return response.json()

    def get_episode_id(self, title_id, season, episode):
        response = requests.get(f"{self.imdb_base_url}/titles/{title_id}/episodes?season={season}")
        return response.json()["episodes"][episode - 1]["id"]


if __name__ == "__main__":
    api = API()
    print(
        api.get_series_m3u8(
            "95396",
            1,
            1
        )
    )