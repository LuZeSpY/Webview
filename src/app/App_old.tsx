import React, { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Search, Play, Pause, Volume2, VolumeX, Maximize2, Star, Clock, X, Film, Tv } from "lucide-react";

const MOCK_CATALOG = [
  {
    id: 1,
    title: "Dune: Part Two",
    type: "film",
    year: 2024,
    rating: 8.5,
    duration: "2h 46m",
    genre: ["Science-Fiction", "Épopée"],
    thumb: "https://images.unsplash.com/photo-1608889335941-32ac5f2041b9?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=1280&h=720&fit=crop&auto=format",
    description: "Paul Atréides s'unit à Chani et aux Fremen pour mener la guerre sainte contre ceux qui ont détruit sa famille.",
  },
  {
    id: 2,
    title: "Oppenheimer",
    type: "film",
    year: 2023,
    rating: 8.3,
    duration: "3h 00m",
    genre: ["Drame", "Histoire"],
    thumb: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1280&h=720&fit=crop&auto=format",
    description: "L'histoire du physicien J. Robert Oppenheimer et de son rôle dans le développement de la bombe atomique.",
  },
  {
    id: 3,
    title: "The Bear",
    type: "série",
    year: 2022,
    rating: 8.7,
    duration: "30 min / ép.",
    genre: ["Drame", "Comédie"],
    thumb: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1280&h=720&fit=crop&auto=format",
    description: "Un chef cuisinier new-yorkais retourne dans sa ville natale de Chicago pour gérer le restaurant familial.",
  },
  {
    id: 4,
    title: "Shogun",
    type: "série",
    year: 2024,
    rating: 8.9,
    duration: "60 min / ép.",
    genre: ["Historique", "Action"],
    thumb: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1280&h=720&fit=crop&auto=format",
    description: "Un navigateur anglais échoue au Japon féodal et devient impliqué dans une guerre de pouvoir pour le titre de Shogun.",
  },
  {
    id: 5,
    title: "Poor Things",
    type: "film",
    year: 2023,
    rating: 8.0,
    duration: "2h 21m",
    genre: ["Fantastique", "Comédie"],
    thumb: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=1280&h=720&fit=crop&auto=format",
    description: "L'incroyable aventure de Bella Baxter, une jeune femme ramenée à la vie par un chirurgien brillant.",
  },
  {
    id: 6,
    title: "Fallout",
    type: "série",
    year: 2024,
    rating: 8.5,
    duration: "60 min / ép.",
    genre: ["Science-Fiction", "Action"],
    thumb: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280&h=720&fit=crop&auto=format",
    description: "Dans un Los Angeles post-apocalyptique, une jeune femme sort d'un abri souterrain après 200 ans.",
  },
  {
    id: 7,
    title: "Alien: Romulus",
    type: "film",
    year: 2024,
    rating: 7.3,
    duration: "1h 59m",
    genre: ["Horreur", "Science-Fiction"],
    thumb: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1280&h=720&fit=crop&auto=format",
    description: "Un groupe de jeunes explorateurs de l'espace découvre une station spatiale abandonnée remplie de terreur.",
  },
  {
    id: 8,
    title: "The Penguin",
    type: "série",
    year: 2024,
    rating: 8.6,
    duration: "55 min / ép.",
    genre: ["Crime", "Drame"],
    thumb: "https://images.unsplash.com/photo-1483058712412-4245e9b90334?w=400&h=600&fit=crop&auto=format",
    backdrop: "https://images.unsplash.com/photo-1494059980473-813e73ee784b?w=1280&h=720&fit=crop&auto=format",
    description: "Oz Cobb gravit les échelons du crime organisé à Gotham City après la mort du Pingouin.",
  },
];

type MediaItem = typeof MOCK_CATALOG[0];

// ─── Tooltip reprenant le contenu exact de l'info strip ───────────────────────

const TOOLTIP_WIDTH = 272;

function InfoTooltip({ item, anchorRect }: { item: MediaItem; anchorRect: DOMRect }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const [ready, setReady] = useState(false);

  // Mesure la hauteur réelle après le premier paint, avant que l'utilisateur la voit
  useLayoutEffect(() => {
    if (containerRef.current) {
      setTooltipHeight(containerRef.current.offsetHeight);
      setReady(true);
    }
  }, []);

  const left = anchorRect.left - TOOLTIP_WIDTH - 10;

  // Hors-écran tant qu'on n'a pas la hauteur réelle, puis parfaitement centré
  const top = ready
    ? Math.max(8, Math.min(
        anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2,
        window.innerHeight - tooltipHeight - 8
      ))
    : -9999;

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top,
        left,
        width: TOOLTIP_WIDTH,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {/* Flèche pointant vers le centre de l'item */}
      <div
        style={{
          position: "absolute",
          right: -6,
          // quand ready : top est calé, la flèche pointe au centre de l'item = centre du tooltip
          top: ready
            ? Math.min(Math.max(anchorRect.top + anchorRect.height / 2 - top - 6, 12), tooltipHeight - 20)
            : "50%",
          width: 0,
          height: 0,
          borderTop: "6px solid transparent",
          borderBottom: "6px solid transparent",
          borderLeft: "6px solid rgba(255,255,255,0.06)",
        }}
      />

      <div
        style={{
          background: "rgba(13,13,20,0.97)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4)",
          backdropFilter: "blur(16px)",
          // animation d'apparition légère
          animation: "tooltipIn 120ms ease-out forwards",
        }}
      >
        {/* Corps — miroir exact du info strip */}
        <div style={{ padding: "0 14px 14px" }}>
          {/* Badges type + genres */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <span
              style={{
                background: "rgba(226,201,126,0.12)",
                color: "var(--primary)",
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              {item.type}
            </span>
            {item.genre.map((g, i) => (
              <span
                key={g}
                style={{
                  color: "var(--muted-foreground, #6b6b80)",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                }}
              >
                {i > 0 && <span style={{ marginRight: 4 }}>·</span>}
                {g}
              </span>
            ))}
          </div>

          {/* Titre */}
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--foreground, #f0f0f5)",
              margin: "0 0 6px",
              lineHeight: 1.25,
            }}
          >
            {item.title}
          </h2>

          {/* Description */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11.5,
              color: "rgba(240,240,245,0.6)",
              lineHeight: 1.55,
              margin: "0 0 12px",
              // max 3 lignes
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.description}
          </p>

          {/* Méta : rating · durée · année — miroir du coin top-right du info strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              paddingTop: 10,
            }}
          >
            {/* Rating */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Star size={11} fill="currentColor" style={{ color: "var(--primary, #e2c97e)", flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                  color: "var(--primary, #e2c97e)",
                }}
              >
                {item.rating}
              </span>
            </div>

            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>|</span>

            {/* Durée */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} style={{ color: "var(--muted-foreground, #6b6b80)", flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  color: "var(--muted-foreground, #6b6b80)",
                }}
              >
                {item.duration}
              </span>
            </div>

            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>|</span>

            {/* Année */}
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                color: "var(--muted-foreground, #6b6b80)",
              }}
            >
              {item.year}
            </span>
          </div>
        </div>
      </div>

      {/* keyframe injectée une seule fois */}
      <style>{`
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateX(6px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0)   scale(1);    }
        }
      `}</style>
    </div>,
    document.body
  );
}

// ─── Video Player ──────────────────────────────────────────────────────────────

function VideoPlayer({ item }: { item: MediaItem }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(18);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setProgress(pct);
  };

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
      <img
        src={item.backdrop}
        alt={item.title}
        className="w-full h-full object-cover transition-opacity duration-500"
        style={{ opacity: playing ? 0.3 : 0.7 }}
      />

      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, #09090e 0%, transparent 50%, rgba(9,9,14,0.4) 100%)" }}
      />

      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => setPlaying(true)}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
            style={{
              background: "rgba(226,201,126,0.15)",
              border: "1.5px solid rgba(226,201,126,0.5)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Play size={26} className="ml-1" fill="var(--primary)" style={{ color: "var(--primary)" }} />
          </button>
        </div>
      )}

      {playing && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <button
            onClick={() => setPlaying(false)}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(9,9,14,0.5)", backdropFilter: "blur(8px)" }}
          >
            <Pause size={24} fill="var(--foreground)" style={{ color: "var(--foreground)" }} />
          </button>
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 px-5 pb-4 pt-10"
        style={{ background: "linear-gradient(to top, rgba(9,9,14,0.95) 0%, transparent 100%)" }}
      >
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="w-full h-1 rounded-full cursor-pointer mb-3 group"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <div
            className="h-full rounded-full relative"
            style={{ width: `${progress}%`, background: "var(--primary)" }}
          >
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "var(--primary)", marginRight: "-6px" }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setPlaying(!playing)} className="text-foreground/80 hover:text-foreground transition-colors">
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button onClick={() => setMuted(!muted)} className="text-foreground/80 hover:text-foreground transition-colors">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
              {Math.floor(progress * 0.01 * 146)}m · {item.duration}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded border border-border text-muted-foreground"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}
            >
              HD
            </span>
            <button className="text-foreground/80 hover:text-foreground transition-colors">
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Search Result avec tooltip ───────────────────────────────────────────────

function SearchResult({ item, onSelect }: { item: MediaItem; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setHovered(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        onClick={onSelect}
        className="w-full flex items-center gap-2.5 p-2 rounded text-left transition-colors hover:bg-secondary focus:outline-none"
      >
        <img src={item.thumb} alt={item.title} className="w-8 h-11 object-cover rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-foreground truncate" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px" }}>
            {item.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.type === "film" ? (
              <Film size={10} className="text-muted-foreground flex-shrink-0" />
            ) : (
              <Tv size={10} className="text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              {item.type} · {item.year}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Star size={9} fill="currentColor" style={{ color: "var(--primary)" }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "var(--primary)" }}>
              {item.rating}
            </span>
            <span className="text-muted-foreground mx-1" style={{ fontSize: "10px" }}>·</span>
            <Clock size={9} className="text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              {item.duration}
            </span>
          </div>
        </div>
      </button>

      {hovered && anchorRect && <InfoTooltip item={item} anchorRect={anchorRect} />}
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState("");
  const [activeItem, setActiveItem] = useState<MediaItem>(MOCK_CATALOG[0]);
  const [filter, setFilter] = useState<"tous" | "film" | "série">("tous");

  const filtered = MOCK_CATALOG.filter((m) => {
    const matchQuery =
      m.title.toLowerCase().includes(query.toLowerCase()) ||
      m.genre.some((g) => g.toLowerCase().includes(query.toLowerCase()));
    const matchFilter = filter === "tous" || m.type === filter;
    return matchQuery && matchFilter;
  });

  return (
    <div
      className="h-screen w-full flex flex-col overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif", background: "var(--background)" }}
    >
      {/* topbar */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0"
        style={{ background: "rgba(9,9,14,0.92)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: "var(--primary)" }}
          >
            <Play size={10} fill="#09090e" className="ml-0.5" style={{ color: "#09090e" }} />
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", letterSpacing: "0.06em", color: "var(--foreground)" }}>
            WEBVIEW
          </span>
        </div>

        <div className="flex items-center gap-1">
          {(["tous", "film", "série"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded transition-all capitalize focus:outline-none"
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "11px",
                letterSpacing: "0.08em",
                background: filter === f ? "var(--primary)" : "transparent",
                color: filter === f ? "#09090e" : "var(--muted-foreground)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* left column */}
        <div className="flex flex-col flex-1 min-w-1 overflow-hidden">

          <div style={{ maxHeight: "45vh" }} className="flex-shrink-0">
            <VideoPlayer item={activeItem} />
          </div>

          {/* info strip */}
          <div className="flex-1 px-6 py-5 overflow-hidden" style={{ background: "var(--card)" }}>
            <div className="flex items-start gap-6 h-full">
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded"
                    style={{
                      background: "rgba(226,201,126,0.12)",
                      color: "var(--primary)",
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {activeItem.type}
                  </span>
                  {activeItem.genre.map((g, i) => (
                    <span key={g} className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
                      {i > 0 && <span className="mr-1">·</span>}{g}
                    </span>
                  ))}
                </div>
                <h1 className="text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {activeItem.title}
                </h1>
                <p className="text-foreground/70 leading-relaxed" style={{ fontSize: "13px" }}>
                  {activeItem.description}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <Star size={12} fill="currentColor" style={{ color: "var(--primary)" }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--primary)" }}>
                    {activeItem.rating}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock size={11} className="text-muted-foreground" />
                  <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                    {activeItem.duration}
                  </span>
                </div>
                <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                  {activeItem.year}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* right panel — search */}
        <div
          className="w-64 flex flex-col border-l border-border flex-shrink-0 overflow-hidden"
          style={{ background: "var(--card)" }}
        >
          <div className="p-3 border-b border-border flex-shrink-0">
            <span className="text-muted-foreground block mb-3" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "0.1em" }}>
              RECHERCHE
            </span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Titre, genre…"
                className="w-full pl-9 pr-8 py-2 rounded border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                style={{
                  background: "var(--secondary)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "13px",
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Film size={20} className="text-muted-foreground/40" />
                <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                  Aucun résultat
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map((item) => (
                  <SearchResult key={item.id} item={item} onSelect={() => setActiveItem(item)} />
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border flex-shrink-0">
            <span className="text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              {filtered.length} titre{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}