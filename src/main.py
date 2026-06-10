import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api import API  # adapte selon le nom exact de ta classe dans api.py

app = FastAPI()
api = API()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=4)


# ── Recherche ──────────────────────────────────────────────────────────────────

@app.get("/search")
async def search(q: str):
    titles = await asyncio.get_event_loop().run_in_executor(
        executor, api.get_titles, q
    )
    if titles is None:
        raise HTTPException(500, "Erreur API IMDB")
    return titles


# ── Saisons ────────────────────────────────────────────────────────────────────

@app.get("/seasons/{title_id}")
async def get_seasons(title_id: str):
    return await asyncio.get_event_loop().run_in_executor(
        executor, api.get_seasons, title_id
    )


# ── Stream film ────────────────────────────────────────────────────────────────

@app.get("/stream/movie/{imdb_id}")
async def stream_movie(imdb_id: str):
    try:
        url = await asyncio.get_event_loop().run_in_executor(
            executor, api.get_movie_m3u8, imdb_id
        )
        return {"url": url}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Stream série ───────────────────────────────────────────────────────────────

@app.get("/stream/series/{imdb_id}/{season}/{episode}")
async def stream_series(imdb_id: str, season: int, episode: int):
    try:
        url = await asyncio.get_event_loop().run_in_executor(
            executor, api.get_series_m3u8, imdb_id, season, episode
        )
        return {"url": url}
    except Exception as e:
        raise HTTPException(500, str(e))