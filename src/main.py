import sys, os, asyncio, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse, urljoin, quote 

import httpx
from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from api import API

app = FastAPI()
api = API()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
executor = ThreadPoolExecutor(max_workers=4)

SEARCH_CACHE = {}
INFO_CACHE = {}      
SEASONS_CACHE = {} 

# Headers qui imitent un vrai navigateur — évite le 403 du CDN
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Accept": "*/*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Origin": "https://vidfast.pro",
    "Referer": "https://vidfast.pro/",
}

PROXY_BASE = "http://localhost:8000"  # ← URLs absolues pour hls.js

# ── CAST KODI ──────────────────────────────────────────────────────────────────

KODI_URL  = "http://192.168.1.185:8080/jsonrpc"  # IP du Pi
KODI_AUTH = ("kodi", "kodi")                     # identifiants KODI

@app.post("/cast")
async def cast_to_kodi(stream_url: str = Body(..., embed=True)):
    """Envoie un flux HLS directement dans KODI sur le Pi."""
    payload = {
        "jsonrpc": "2.0",
        "method":  "Player.Open",
        "params":  {"item": {"file": stream_url}},
        "id":      1
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(KODI_URL, json=payload, auth=KODI_AUTH, timeout=5)
    return resp.json()

# ── Recherche ──────────────────────────────────────────────────────────────────

@app.get("/search")
async def search(q: str):
    q_lower = q.strip().lower()
    
    # Si la recherche a déjà été faite, on renvoie le résultat stocké sans appeler l'API
    if q_lower in SEARCH_CACHE:
        print(f"[CACHE] Résultat trouvé pour: {q}")
        return SEARCH_CACHE[q_lower]
        
    titles = await asyncio.get_event_loop().run_in_executor(executor, api.get_titles, q)
    if titles is None:
        raise HTTPException(500, "Erreur API IMDB (Rate Limit ou indisponible)")
        
    # On sauvegarde dans le cache
    SEARCH_CACHE[q_lower] = titles
    return titles


# ── Infos détaillées ───────────────────────────────────────────────────────────

@app.get("/info/{title_id}")
async def get_info(title_id: str):
    title_id_clean = title_id.strip()
    
    # 1. Vérification dans le cache
    if title_id_clean in INFO_CACHE:
        print(f"[CACHE] Infos trouvées pour l'ID: {title_id}")
        return INFO_CACHE[title_id_clean]
        
    # 2. Si non trouvé, appel à l'API IMDb
    info = await asyncio.get_event_loop().run_in_executor(executor, api.get_title_info, title_id)
    if info is None:
        raise HTTPException(500, "Erreur API IMDB (Rate Limit ou indisponible)")
        
    # 3. Sauvegarde dans le cache et retour
    INFO_CACHE[title_id_clean] = info
    return info


# ── Saisons ────────────────────────────────────────────────────────────────────

@app.get("/seasons/{title_id}")
async def get_seasons(title_id: str):
    title_id_clean = title_id.strip()
    
    # 1. Vérification dans le cache
    if title_id_clean in SEASONS_CACHE:
        print(f"[CACHE] Saisons trouvées pour l'ID: {title_id}")
        return SEASONS_CACHE[title_id_clean]
        
    # 2. Si non trouvé, appel à l'API IMDb
    seasons = await asyncio.get_event_loop().run_in_executor(executor, api.get_seasons, title_id)
    if seasons is None:
        raise HTTPException(500, "Erreur API IMDB (Rate Limit ou indisponible)")
        
    # 3. Sauvegarde dans le cache et retour
    SEASONS_CACHE[title_id_clean] = seasons
    return seasons


# ── Proxy HLS ──────────────────────────────────────────────────────────────────

@app.get("/proxy")
async def proxy(url: str, request: Request):
    decoded = urllib.parse.unquote(url)

    headers = {**BROWSER_HEADERS}
    if "range" in request.headers:
        headers["range"] = request.headers["range"]

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(decoded, headers=headers)
        ct   = resp.headers.get("content-type", "application/octet-stream")

        if "mpegurl" in ct or decoded.endswith(".m3u8"):
            lines = []
            for line in resp.text.splitlines():
                s = line.strip()
                if s and not s.startswith("#"):
                    seg = s if s.startswith("http") else urljoin(decoded, s)
                    enc = urllib.parse.quote(seg, safe="")
                    line = f"{PROXY_BASE}/proxy?url={enc}"
                lines.append(line)
            return Response(
                "\n".join(lines),
                media_type="application/vnd.apple.mpegurl",
                headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
            )

        return Response(
            resp.content,
            status_code=resp.status_code,
            media_type=ct,
            headers={"Access-Control-Allow-Origin": "*"},
        )


# ── Stream film ────────────────────────────────────────────────────────────────

@app.get("/stream/movie/{imdb_id}")
async def stream_movie(imdb_id: str):
    try:
        raw = await asyncio.get_event_loop().run_in_executor(
            executor, api.get_movie_m3u8, imdb_id
        )
        enc = urllib.parse.quote(raw, safe="")
        return {"url": f"{PROXY_BASE}/proxy?url={enc}"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Stream série ───────────────────────────────────────────────────────────────

@app.get("/stream/series/{imdb_id}/{season}/{episode}")
async def stream_series(imdb_id: str, season: int, episode: int):
    try:
        raw = await asyncio.get_event_loop().run_in_executor(
            executor, api.get_series_m3u8, imdb_id, season, episode
        )
        enc = urllib.parse.quote(raw, safe="")
        return {"url": f"{PROXY_BASE}/proxy?url={enc}"}
    except Exception as e:
        raise HTTPException(500, str(e))