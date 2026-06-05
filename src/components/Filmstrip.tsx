import { useEffect, useRef, useState } from "react";
import type { PhotoSource, PhotoState } from "../types";

interface FilmstripProps {
  states: PhotoState[];
  currentIndex: number;
  onJump: (index: number) => void;
  source: PhotoSource;
}

export function Filmstrip({ states, currentIndex, onJump, source }: FilmstripProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = itemRefs.current[currentIndex];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIndex]);

  return (
    <div className="filmstrip-scroll flex items-center gap-2 overflow-x-auto border-t border-neutral-900 bg-neutral-950/80 px-4 py-3">
      {states.map((s, i) => {
        const isCurrent = i === currentIndex;
        const decided = s.decision;
        return (
          <button
            key={s.photo.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            onClick={() => onJump(i)}
            className={`relative shrink-0 overflow-hidden rounded-md transition-all duration-200 ${
              isCurrent ? "h-20 w-20 ring-2 ring-white" : "h-14 w-14 opacity-60 hover:opacity-90"
            } ${decided ? "opacity-40" : ""}`}
            title={s.photo.name}
          >
            <Thumb id={s.photo.id} source={source} />

            {decided && (
              <span
                className={`absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-black ${
                  decided === "keep" ? "bg-keep" : "bg-reject"
                }`}
              >
                {decided === "keep" ? "✓" : "✕"}
              </span>
            )}

            {s.moveStatus === "pending" && (
              <span className="absolute bottom-0.5 left-0.5 h-2 w-2 rounded-full bg-amber-400" />
            )}
            {s.moveStatus === "failed" && (
              <span className="absolute bottom-0.5 left-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// Module-level cache so thumbnails survive re-renders and scrolling.
const thumbCache = new Map<string, string>();

function Thumb({ id, source }: { id: string; source: PhotoSource }) {
  const [src, setSrc] = useState<string | undefined>(() => thumbCache.get(id));

  useEffect(() => {
    // Already cached (also covered by the lazy initial state) — nothing to load.
    if (thumbCache.has(id)) return;
    let cancelled = false;
    source
      .getThumb(id)
      .then((url) => {
        thumbCache.set(id, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (!src) return <div className="h-full w-full animate-pulse bg-neutral-800" />;
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
    />
  );
}
