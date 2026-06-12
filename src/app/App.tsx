import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, Play, Pause, Volume2, VolumeX,
  Star, Clock, X, Film, Tv, Loader2, ChevronRight, SlidersHorizontal,
} from "lucide-react";
import Hls from "hls.js";

const API_BASE = "http://localhost:8000";

interface MediaItem {
  id: string; title: string; type: "film" | "série";
  year: number; rating: number; duration: string;
  genre: string[]; thumb: string; description: string;
}
interface Season { season: number; episodes: { id: string; title?: string }[]; }

const SERIES_TYPES = ["tvSeries", "tvMiniSeries", "tvSpecial", "tvShort"];

function normalizeTitle(raw: any): MediaItem {
  const isSeries = SERIES_TYPES.includes(raw.type ?? "");
  return {
    id: raw.id ?? "", title: raw.primaryTitle ?? raw.originalTitle ?? "—",
    type: isSeries ? "série" : "film", year: raw.startYear ?? 0,
    rating: raw.rating?.aggregateRating ?? 0,
    duration: isSeries ? "— min / ép." : "—", genre: [],
    thumb: raw.primaryImage?.url ?? "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=600&fit=crop",
    description: "",
  };
}

// ─── Hook recherche debouncée ──────────────────────────────────────────────────

function useSearch(query: string, delay = 450) {
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setResults((await res.json() ?? []).map(normalizeTitle));
      } catch (e: any) {
        setError(e.message ?? "Erreur réseau"); setResults([]);
      } finally { setLoading(false); }
    }, delay);
    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading, error };
}

// ─── VideoPlayer ───────────────────────────────────────────────────────────────

function VideoPlayer({ item, streamUrl, streamLoading }: {
  item: MediaItem | null; streamUrl: string | null; streamLoading: boolean;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const hlsRef      = useRef<Hls | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying]     = useState(false);
  const [muted, setMuted]         = useState(false);
  const [progress, setProgress]   = useState(0);
  const [hlsError, setHlsError]   = useState<string | null>(null);
  const [hlsState, setHlsState]   = useState<string>("idle");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    hlsRef.current?.destroy(); hlsRef.current = null;
    setHlsError(null); setHlsState("idle");
    if (!streamUrl) return;
    setHlsState("loading");

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_LOADING,  () => setHlsState("manifest loading"));
      hls.on(Hls.Events.MANIFEST_PARSED,   () => {
        setHlsState("ready");
        video.play().catch(e => {
          console.warn("[HLS] play() bloqué :", e.message);
          setHlsState("paused");
        });
        setPlaying(true);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) { setHlsError(`${data.type} — ${data.details}`); setHlsState("erreur"); }
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.play().catch(() => {}); setPlaying(true);
    }

    const onTimeUpdate = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => { hlsRef.current?.destroy(); video.removeEventListener("timeupdate", onTimeUpdate); };
  }, [streamUrl]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !streamUrl) return;
    v.paused ? v.play() : v.pause();
  };
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted; setMuted(m => !m);
  };
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !videoRef.current?.duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    videoRef.current.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * videoRef.current.duration;
  };

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
      {item && !streamUrl && (
        <img src={item.thumb} alt={item.title} className="w-full h-full object-cover"
          style={{ opacity: 0.5, filter: "blur(4px)" }} />
      )}

      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover"
        style={{ display: streamUrl ? "block" : "none" }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />

      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to top, #09090e 0%, transparent 50%, rgba(9,9,14,0.4) 100%)" }} />

      {streamLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--primary)" }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--primary)", letterSpacing: "0.1em" }}>
            EXTRACTION DU FLUX…
          </span>
        </div>
      )}

      {/* Badge état HLS */}
      {streamUrl && !streamLoading && hlsError && (
        <div className="absolute top-3 left-3 px-2 py-1 rounded"
          style={{ background: "rgba(0,0,0,0.7)", fontFamily: "'DM Mono', monospace",
            fontSize: 10, color: "#e05c5c", backdropFilter: "blur(4px)" }}>
          {hlsError}
        </div>
      )}

      {/* Bouton play central */}
      {streamUrl && !streamLoading && !playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{ background: "rgba(226,201,126,0.15)", border: "1.5px solid rgba(226,201,126,0.5)", backdropFilter: "blur(8px)" }}>
            <Play size={26} className="ml-1" fill="var(--primary)" style={{ color: "var(--primary)" }} />
          </button>
        </div>
      )}

      {!item && !streamLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
            SÉLECTIONNER UN TITRE
          </span>
        </div>
      )}

      {/* Contrôles — touch-friendly (min 44px) */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8"
        style={{ background: "linear-gradient(to top, rgba(9,9,14,0.95) 0%, transparent 100%)" }}>
        <div ref={progressRef} onClick={handleProgressClick}
          className="w-full rounded-full cursor-pointer mb-3 group"
          style={{ height: 4, background: "rgba(255,255,255,0.12)" }}>
          <div className="h-full rounded-full"
            style={{ width: `${progress}%`, background: "var(--primary)", transition: "width 0.1s linear" }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Boutons avec zone de touch 44px minimum */}
            <button onClick={togglePlay} disabled={!streamUrl}
              className="flex items-center justify-center w-11 h-11 text-foreground/80 hover:text-foreground disabled:opacity-30 transition-colors">
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button onClick={toggleMute}
              className="flex items-center justify-center w-11 h-11 text-foreground/80 hover:text-foreground transition-colors">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            {item && (
              <span className="text-muted-foreground hidden sm:block" style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                {item.title} · {item.duration}
              </span>
            )}
          </div>
          <span className="px-2 py-0.5 rounded border border-border text-muted-foreground"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
            HLS
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── EpisodePicker ─────────────────────────────────────────────────────────────

function EpisodePicker({ item, onConfirm, onClose }: {
  item: MediaItem; onConfirm: (season: number, episode: number) => void; onClose: () => void;
}): React.ReactElement {
  const [seasons, setSeasons]               = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [rawDebug, setRawDebug]             = useState("");

  useEffect(() => {
    setLoadingSeasons(true);
    fetch(`${API_BASE}/seasons/${item.id}`)
      .then(r => r.json())
      .then((data: any) => {
        setRawDebug(JSON.stringify(data).slice(0, 200));
        const arr = Array.isArray(data) ? data : data?.seasons ?? data?.data ?? [];
        const normalized: Season[] = arr.map((s: any) => ({
          season: s.season ?? s.seasonNumber ?? s.number ?? 1,
          episodes: s.episodes ?? Array.from({ length: s.episodeCount ?? 1 }, (_, i) => ({ id: String(i + 1) })),
        }));
        setSeasons(normalized);
        if (normalized.length > 0) setSelectedSeason(normalized[0].season);
      })
      .catch(() => setSeasons([]))
      .finally(() => setLoadingSeasons(false));
  }, [item.id]);

  const currentEpisodes = seasons.find(s => s.season === selectedSeason)?.episodes ?? [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(9,9,14,0.88)", backdropFilter: "blur(14px)" }}>
      {/* Sur mobile : sheet qui monte du bas ; sur desktop : modal centré */}
      <div className="w-full sm:w-96 rounded-t-2xl sm:rounded-lg border border-border"
        style={{ background: "var(--card)", boxShadow: "0 32px 64px rgba(0,0,0,0.8)", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>

        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-foreground" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600 }}>
              {item.title}
            </h2>
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.1em" }}>
              CHOISIR UN ÉPISODE
            </span>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loadingSeasons ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--primary)" }} />
              <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                Chargement des saisons…
              </span>
            </div>
          ) : seasons.length === 0 ? (
            <div className="py-4 text-center">
              <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                Aucune saison trouvée
              </span>
              {rawDebug && <p style={{ fontSize: 9, color: "#e05c5c", marginTop: 8, wordBreak: "break-all" }}>Raw: {rawDebug}</p>}
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 flex-wrap mb-4">
                {seasons.map(s => (
                  <button key={s.season} onClick={() => setSelectedSeason(s.season)}
                    className="px-3 py-1.5 rounded transition-all"
                    style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 11,
                      background: selectedSeason === s.season ? "var(--primary)" : "var(--secondary)",
                      color:      selectedSeason === s.season ? "#09090e" : "var(--muted-foreground)",
                    }}>
                    S{String(s.season).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
                {currentEpisodes.map((_, i) => (
                  <button key={i} onClick={() => onConfirm(selectedSeason, i + 1)}
                    className="rounded flex items-center justify-center transition-all active:scale-95"
                    style={{ aspectRatio: "1", fontFamily: "'DM Mono', monospace", fontSize: 11,
                      background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid transparent" }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--primary)";
                      (e.currentTarget as HTMLElement).style.color = "var(--primary)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
                    }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── InfoTooltip — desktop uniquement ─────────────────────────────────────────

const TOOLTIP_WIDTH = 272;

const clampStyle = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 11.5,
  color: "rgba(240,240,245,0.6)", lineHeight: 1.55, margin: "0 0 12px", overflow: "hidden",
  ...({ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" } as any),
} as React.CSSProperties;

function InfoTooltip({ item, anchorRect }: { item: MediaItem; anchorRect: DOMRect }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (containerRef.current) { setTooltipHeight(containerRef.current.offsetHeight); setReady(true); }
  }, []);

  const left = anchorRect.left - TOOLTIP_WIDTH - 10;
  const top  = ready
    ? Math.max(8, Math.min(anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 8))
    : -9999;

  return createPortal(
    <div ref={containerRef}
      style={{ position: "fixed", top, left, width: TOOLTIP_WIDTH, zIndex: 9999, pointerEvents: "none" }}>
      <div style={{
        position: "absolute", right: -6,
        top: ready ? Math.min(Math.max(anchorRect.top + anchorRect.height / 2 - top - 6, 12), tooltipHeight - 20) : "50%",
        width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent",
        borderLeft: "6px solid rgba(255,255,255,0.06)",
      }} />
      <div style={{
        background: "rgba(13,13,20,0.97)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8, overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.7)",
        backdropFilter: "blur(16px)", animation: "tooltipIn 120ms ease-out forwards",
      }}>
        <div style={{ width: "100%", height: 110, position: "relative", overflow: "hidden" }}>
          <img src={item.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.65 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, rgba(13,13,20,0.97) 100%)" }} />
        </div>
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ background: "rgba(226,201,126,0.12)", color: "var(--primary)",
              fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "2px 7px", borderRadius: 4 }}>
              {item.type}
            </span>
            {item.genre.slice(0, 2).map((g, i) => (
              <span key={g} style={{ color: "var(--muted-foreground, #6b6b80)", fontFamily: "'DM Mono', monospace", fontSize: 9 }}>
                {i > 0 && <span style={{ marginRight: 4 }}>·</span>}{g}
              </span>
            ))}
          </div>
          <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
            color: "var(--foreground, #f0f0f5)", margin: "0 0 6px", lineHeight: 1.25 }}>
            {item.title}
          </h2>
          {item.description && <p style={clampStyle}>{item.description}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Star size={11} fill="currentColor" style={{ color: "var(--primary, #e2c97e)", flexShrink: 0 }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--primary, #e2c97e)" }}>
                {item.rating || "—"}
              </span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>|</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted-foreground, #6b6b80)" }}>
              {item.year || "—"}
            </span>
          </div>
        </div>
      </div>
      <style>{`@keyframes tooltipIn { from { opacity:0; transform:translateX(6px) scale(.97); } to { opacity:1; transform:translateX(0) scale(1); } }`}</style>
    </div>,
    document.body
  );
}

// ─── SearchResult ──────────────────────────────────────────────────────────────

function SearchResult({ item, onSelect, active }: {
  item: MediaItem; onSelect: () => void; active: boolean;
}) {
  const [hovered, setHovered]       = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isDesktop, setIsDesktop]   = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <>
      <button ref={btnRef}
        onMouseEnter={() => {
          if (!isDesktop) return;
          if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        onClick={onSelect}
        className="w-full flex items-center gap-3 p-2 rounded text-left transition-colors focus:outline-none active:bg-secondary"
        style={{ background: active ? "rgba(226,201,126,0.08)" : undefined }}>

        <img src={item.thumb} alt={item.title} className="w-10 h-14 sm:w-8 sm:h-11 object-cover rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-foreground truncate" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px" }}>
            {item.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.type === "film"
              ? <Film size={10} className="text-muted-foreground flex-shrink-0" />
              : <Tv size={10} className="text-muted-foreground flex-shrink-0" />
            }
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              {item.type} · {item.year || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Star size={9} fill="currentColor" style={{ color: "var(--primary)" }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "var(--primary)" }}>
              {item.rating || "—"}
            </span>
            <span className="text-muted-foreground mx-1" style={{ fontSize: "10px" }}>·</span>
            <Clock size={9} className="text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              {item.duration}
            </span>
          </div>
        </div>
        {item.type === "série" && <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />}
      </button>

      {/* Tooltip uniquement sur desktop (lg+) */}
      {isDesktop && hovered && anchorRect && <InfoTooltip item={item} anchorRect={anchorRect} />}
    </>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery]         = useState("");
  const [filter, setFilter]       = useState<"tous" | "film" | "série">("tous");
  const [searchOpen, setSearchOpen] = useState(false); // pour mobile : panneau recherche ouvert

  const { results, loading: searchLoading, error: searchError } = useSearch(query);

  const [activeItem, setActiveItem]       = useState<MediaItem | null>(null);
  const [streamUrl, setStreamUrl]         = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError]     = useState<string | null>(null);
  const [pendingSeries, setPendingSeries] = useState<MediaItem | null>(null);

  const filtered = results.filter(m => filter === "tous" || m.type === filter);

  const fetchStream = useCallback(async (item: MediaItem, season?: number, episode?: number) => {
    setStreamLoading(true); setStreamUrl(null); setStreamError(null);
    try {
      const endpoint = item.type === "série"
        ? `${API_BASE}/stream/series/${item.id}/${season}/${episode}`
        : `${API_BASE}/stream/movie/${item.id}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      setStreamUrl(url);
    } catch (e: any) {
      setStreamError(e.message ?? "Erreur lors de l'extraction du flux");
    } finally { setStreamLoading(false); }
  }, []);

  const handleSelect = useCallback(async (item: MediaItem) => {
    setActiveItem(item); setStreamUrl(null); setStreamError(null);
    setSearchOpen(false); // ferme le panneau sur mobile après sélection

    try {
      const info = await fetch(`${API_BASE}/info/${item.id}`).then(r => r.json());
      setActiveItem(prev => prev?.id === item.id ? {
        ...prev,
        genre:       info.genres?.map((g: any) => g.text ?? g) ?? [],
        description: info.plot?.plotText?.plainText ?? "",
        duration:    info.runtime?.seconds ? `${Math.floor(info.runtime.seconds / 60)}m` : prev.duration,
      } : prev);
    } catch (_) {}

    if (item.type === "série") setPendingSeries(item);
    else fetchStream(item);
  }, [fetchStream]);

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col"
      style={{ fontFamily: "'DM Sans', sans-serif", background: "var(--background)" }}>

      {/* ── Topbar ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 z-10"
        style={{ background: "rgba(9,9,14,0.96)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "var(--primary)" }}>
            <Play size={10} fill="#09090e" className="ml-0.5" style={{ color: "#09090e" }} />
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", letterSpacing: "0.06em", color: "var(--foreground)" }}>
            WEBVIEW
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtres — toujours visibles */}
          <div className="flex items-center gap-1">
            {(["tous", "film", "série"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-2 sm:px-3 py-1 rounded transition-all capitalize focus:outline-none"
                style={{
                  fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "0.08em",
                  background: filter === f ? "var(--primary)" : "transparent",
                  color:      filter === f ? "#09090e" : "var(--muted-foreground)",
                }}>
                {f}
              </button>
            ))}
          </div>

          {/* Bouton recherche — mobile uniquement */}
          <button
            onClick={() => setSearchOpen(o => !o)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded transition-colors"
            style={{
              background: searchOpen ? "var(--primary)" : "rgba(255,255,255,0.06)",
              color: searchOpen ? "#09090e" : "var(--foreground)",
            }}>
            <Search size={15} />
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0 lg:overflow-hidden">

        {/* ── Colonne gauche : player + info ── */}
        <div className="flex flex-col flex-1 lg:min-w-0 lg:overflow-hidden">

          {/* Player */}
          <div className="flex-shrink-0 lg:max-h-[45vh]">
            <VideoPlayer item={activeItem} streamUrl={streamUrl} streamLoading={streamLoading} />
          </div>

          {/* Info strip */}
          <div className="px-4 py-4 md:px-6 md:py-5 lg:flex-1 lg:overflow-hidden" style={{ background: "var(--card)" }}>
            {activeItem ? (
              <div className="flex items-start gap-4 md:gap-6">
                <div className="flex-1 min-w-0 flex flex-col gap-2 md:gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded" style={{
                      background: "rgba(226,201,126,0.12)", color: "var(--primary)",
                      fontFamily: "'DM Mono', monospace", fontSize: "10px",
                      letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                      {activeItem.type}
                    </span>
                    {activeItem.genre.map((g, i) => (
                      <span key={g} className="text-muted-foreground"
                        style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
                        {i > 0 && <span className="mr-1">·</span>}{g}
                      </span>
                    ))}
                  </div>

                  <h1 className="text-foreground"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 600 }}>
                    {activeItem.title}
                  </h1>

                  {activeItem.description
                    ? <p className="text-foreground/70 leading-relaxed" style={{ fontSize: "13px" }}>
                        {activeItem.description}
                      </p>
                    : <p className="text-muted-foreground" style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace" }}>
                        Chargement des informations…
                      </p>
                  }

                  {streamError && (
                    <p style={{ fontSize: 11, color: "#e05c5c", fontFamily: "'DM Mono', monospace" }}>
                      ⚠ {streamError}
                    </p>
                  )}
                </div>

                {/* Méta droite */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Star size={12} fill="currentColor" style={{ color: "var(--primary)" }} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--primary)" }}>
                      {activeItem.rating || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={11} className="text-muted-foreground" />
                    <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                      {activeItem.duration}
                    </span>
                  </div>
                  <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                    {activeItem.year || "—"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 lg:h-full">
                <span className="text-muted-foreground text-center"
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em" }}>
                  RECHERCHEZ UN TITRE
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Panneau recherche ──
             Desktop : sidebar fixe à droite
             Mobile  : panneau plein largeur, affiché/masqué via searchOpen
        ── */}
        <div
          className={`
            flex flex-col border-border flex-shrink-0
            w-full lg:w-64
            border-t lg:border-t-0 lg:border-l
            lg:overflow-hidden
            transition-all duration-200
            ${searchOpen ? "max-h-[60vh] lg:max-h-none" : "max-h-0 lg:max-h-none"}
            overflow-hidden lg:overflow-y-auto
          `}
          style={{ background: "var(--card)" }}>

          <div className="p-3 border-b border-border flex-shrink-0">
            <span className="text-muted-foreground block mb-3 hidden lg:block"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "0.1em" }}>
              RECHERCHE
            </span>
            <div className="relative">
              {searchLoading
                ? <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin pointer-events-none" />
                : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              }
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Titre, genre…"
                className="w-full pl-9 pr-8 py-2.5 rounded border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                style={{ background: "var(--secondary)", fontFamily: "'DM Sans', sans-serif", fontSize: "13px" }}
              />
              {query && (
                <button onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Résultats */}
          <div className="overflow-y-auto p-2 flex-1">
            {searchError ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center">
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#e05c5c" }}>
                  {searchError}
                </span>
                <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
                  Vérifiez que le serveur Python tourne sur le port 8000
                </span>
              </div>
            ) : !query.trim() ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Search size={20} className="text-muted-foreground/30" />
                <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                  Tapez pour rechercher
                </span>
              </div>
            ) : filtered.length === 0 && !searchLoading ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Film size={20} className="text-muted-foreground/40" />
                <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                  Aucun résultat
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map(item => (
                  <SearchResult key={item.id} item={item}
                    active={activeItem?.id === item.id}
                    onSelect={() => handleSelect(item)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border flex-shrink-0">
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              {query.trim() ? `${filtered.length} titre${filtered.length !== 1 ? "s" : ""}` : "IMDB · vidfast.pro"}
            </span>
          </div>
        </div>
      </div>

      {pendingSeries && (
        <EpisodePicker
          item={pendingSeries}
          onClose={() => setPendingSeries(null)}
          onConfirm={(season, episode) => {
            setPendingSeries(null);
            fetchStream(pendingSeries, season, episode);
          }}
        />
      )}
    </div>
  );
}
