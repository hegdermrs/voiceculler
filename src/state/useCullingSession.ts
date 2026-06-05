import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Decision, PhotoSource, PhotoState } from "../types";

const PREFETCH_AHEAD = 4;
const KEEP_BEHIND = 2;
const MAX_RETRIES = 4;

interface MoveJob {
  photoId: string;
  decision: Decision;
  direction: "apply" | "revert";
  attempt: number;
}

interface HistoryEntry {
  index: number;
  decision: Decision;
}

export interface CullingSession {
  states: PhotoState[];
  currentIndex: number;
  current: PhotoState | undefined;
  counts: { kept: number; rejected: number; remaining: number; total: number };
  decide: (decision: Decision) => void;
  undo: () => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  isComplete: boolean;
}

export function useCullingSession(source: PhotoSource): CullingSession {
  const [states, setStates] = useState<PhotoState[]>(() =>
    source.photos.map((photo) => ({ photo })),
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  const historyRef = useRef<HistoryEntry[]>([]);
  const queueRef = useRef<MoveJob[]>([]);
  const drainingRef = useRef(false);
  const blobCacheRef = useRef<Map<string, string>>(new Map());

  const statesRef = useRef(states);
  statesRef.current = states;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  const updateState = useCallback((photoId: string, patch: Partial<PhotoState>) => {
    setStates((prev) =>
      prev.map((s) => (s.photo.id === photoId ? { ...s, ...patch } : s)),
    );
  }, []);

  // Background move queue: drains sequentially with retry/backoff.
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    while (queueRef.current.length > 0) {
      const job = queueRef.current[0];
      try {
        if (job.direction === "apply") await source.apply(job.photoId, job.decision);
        else await source.revert(job.photoId, job.decision);
        updateState(job.photoId, {
          moveStatus: job.direction === "apply" ? "done" : undefined,
        });
        queueRef.current.shift();
      } catch (err) {
        if (job.attempt + 1 >= MAX_RETRIES) {
          updateState(job.photoId, { moveStatus: "failed" });
          queueRef.current.shift();
          console.error("Move failed permanently for", job.photoId, err);
        } else {
          job.attempt += 1;
          await new Promise((r) => setTimeout(r, 2 ** job.attempt * 400));
        }
      }
    }
    drainingRef.current = false;
  }, [source, updateState]);

  const enqueue = useCallback(
    (job: MoveJob) => {
      queueRef.current.push(job);
      void drainQueue();
    },
    [drainQueue],
  );

  const decide = useCallback(
    (decision: Decision) => {
      const idx = indexRef.current;
      const target = statesRef.current[idx];
      if (!target || target.decision) return;

      updateState(target.photo.id, { decision, moveStatus: "pending" });
      enqueue({ photoId: target.photo.id, decision, direction: "apply", attempt: 0 });
      historyRef.current.push({ index: idx, decision });

      setCurrentIndex(Math.min(idx + 1, source.photos.length));
    },
    [enqueue, updateState, source.photos.length],
  );

  const undo = useCallback(() => {
    const last = historyRef.current.pop();
    if (!last) return;
    const target = statesRef.current[last.index];
    if (!target) return;

    updateState(target.photo.id, { decision: undefined, moveStatus: "pending" });
    enqueue({
      photoId: target.photo.id,
      decision: last.decision,
      direction: "revert",
      attempt: 0,
    });
    setCurrentIndex(last.index);
  }, [enqueue, updateState]);

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index <= source.photos.length) setCurrentIndex(index);
    },
    [source.photos.length],
  );

  const next = useCallback(
    () => setCurrentIndex((i) => Math.min(i + 1, source.photos.length)),
    [source.photos.length],
  );
  const prev = useCallback(() => setCurrentIndex((i) => Math.max(0, i - 1)), []);

  // Prefetch full-resolution images near the cursor; revoke far ones to bound
  // memory (important for large local folders).
  useEffect(() => {
    const lo = Math.max(0, currentIndex - KEEP_BEHIND);
    const hi = currentIndex + PREFETCH_AHEAD;
    for (let i = lo; i <= hi && i < states.length; i++) {
      const s = states[i];
      if (s.fullSrc || blobCacheRef.current.has(s.photo.id)) continue;
      blobCacheRef.current.set(s.photo.id, "");
      source
        .getFullImage(s.photo.id)
        .then((url) => {
          blobCacheRef.current.set(s.photo.id, url);
          updateState(s.photo.id, { fullSrc: url });
        })
        .catch((err) => {
          blobCacheRef.current.delete(s.photo.id);
          console.warn("Prefetch failed for", s.photo.id, err);
        });
    }

    // Revoke and clear images outside the window.
    for (let i = 0; i < states.length; i++) {
      if (i >= lo && i <= hi) continue;
      const s = states[i];
      if (!s.fullSrc) continue;
      URL.revokeObjectURL(s.fullSrc);
      blobCacheRef.current.delete(s.photo.id);
      updateState(s.photo.id, { fullSrc: undefined });
    }
  }, [currentIndex, states, source, updateState]);

  // Revoke remaining object URLs on unmount.
  useEffect(() => {
    const cache = blobCacheRef.current;
    return () => {
      for (const url of cache.values()) if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const counts = useMemo(() => {
    let kept = 0;
    let rejected = 0;
    for (const s of states) {
      if (s.decision === "keep") kept += 1;
      else if (s.decision === "reject") rejected += 1;
    }
    return {
      kept,
      rejected,
      remaining: states.length - kept - rejected,
      total: states.length,
    };
  }, [states]);

  return {
    states,
    currentIndex,
    current: states[currentIndex],
    counts,
    decide,
    undo,
    goTo,
    next,
    prev,
    isComplete: currentIndex >= states.length && states.length > 0,
  };
}
