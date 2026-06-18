# On importe la classe API et la fonction de téléchargement depuis votre module api.py
from api import API, download_video_from_m3u8

def main():
    # 1. Instanciation de l'API
    api = API()
    
    # ID du film à télécharger (Exemple à remplacer par celui de votre choix)
    movie_id = "1265609" 
    
    print(f"Recherche et résolution des flux pour le film ID: {movie_id}...")
    
    # 2. On résout les flux (méthode synchrone existante dans votre API)
    sources = api.resolve_movie_streams(movie_id)
    meilleure_url = sources.best_url()
    
    print(f"Flux trouvé : {meilleure_url}")
    
    # 3. On lance le téléchargement automatique via FFmpeg
    download_video_from_m3u8(
        m3u8_url=meilleure_url,
        output_filename=f"film_{movie_id}.mp4",
        user_agent=api.user_agent,
        referer=sources.page_url
    )

if __name__ == "__main__":
    main()