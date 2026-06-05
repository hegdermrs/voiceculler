import { useCallback, useEffect, useRef, useState } from "react";
import type * as SC from "@tensorflow-models/speech-commands";
import type { Decision } from "../types";

// We use the built-in 18-word Speech Commands model and only act on two of its
// words: "yes" (= keep) and "no" (= reject). The base model is trained on ~50k
// examples across many speakers, so it is robust and needs no per-user training.
const KEEP_WORD = "yes";
const REJECT_WORD = "no";

// Local copies of the TF.js Speech Commands model (vendored into /public) so
// voice works fully offline with no CDN fetch. See README "Tuning detection".
const MODEL_JSON = "/speech-model/18w/model.json";
const METADATA_JSON = "/speech-model/18w/metadata.json";

// Edge-detection thresholds. The model scores a rolling ~1s of audio, so a
// single word appears above threshold across several overlapping windows. We
// fire once when the score RISES past FIRE_THRESHOLD, then refuse to fire again
// until it FALLS below REARM_THRESHOLD (the word ended / brief silence). This
// gives exactly one decision per word while still allowing rapid distinct words.
const FIRE_THRESHOLD = 0.85;
const REARM_THRESHOLD = 0.4;
// Higher overlapFactor = more frequent inference windows = snappier detection
// of both the rising edge and the silence that re-arms it.
const OVERLAP_FACTOR = 0.75;
// Tiny floor between fires to absorb score jitter at the threshold.
const MIN_GAP_MS = 250;

export type VoiceStatus = "idle" | "loading" | "listening" | "paused" | "error";

interface UseKeywordSpotterOptions {
  onDetect: (decision: Decision) => void;
}

// Lazy-load TF.js + the model only when voice is first started, so the initial
// app bundle stays small for users who only use the buttons/keyboard.
let scModulePromise: Promise<typeof SC> | null = null;
async function loadSpeechCommands(): Promise<typeof SC> {
  if (!scModulePromise) {
    scModulePromise = (async () => {
      await import("@tensorflow/tfjs");
      return import("@tensorflow-models/speech-commands");
    })();
  }
  return scModulePromise;
}

// --- Module-level singletons -------------------------------------------------
// React StrictMode (dev) mounts components twice, and since starting voice is
// async, a naive per-hook recognizer can race into TWO live microphone
// listeners — making one spoken word fire 2-3 decisions. Keeping the recognizer,
// the listen registration, and the cooldown at module scope guarantees exactly
// one listener and one shared "one-utterance-one-decision" cooldown no matter
// how many times the component mounts.
let sharedRecognizer: SC.SpeechCommandRecognizer | null = null;
let recognizerPromise: Promise<SC.SpeechCommandRecognizer> | null = null;
let isRegistered = false;
let lastFireAt = 0;
// Edge-detection gate: true when ready to fire (score has fallen since the last
// fire), false while a word is still "held" above the re-arm threshold.
let armed = true;
// The currently-mounted hook instance that should receive detections.
let activeOnDetect: ((decision: Decision) => void) | null = null;

/**
 * Loads TensorFlow.js and the speech model ahead of time (no microphone
 * access), so voice is instant once the user starts culling. Safe to call
 * repeatedly — the work is memoized. Resolves true on success, false if the
 * model fails to load (the app still works via buttons/keyboard).
 */
export async function preloadKeywordSpotter(): Promise<boolean> {
  try {
    await getRecognizer();
    return true;
  } catch {
    return false;
  }
}

async function getRecognizer(): Promise<SC.SpeechCommandRecognizer> {
  if (sharedRecognizer) return sharedRecognizer;
  if (!recognizerPromise) {
    recognizerPromise = (async () => {
      const sc = await loadSpeechCommands();
      // The library requires absolute http(s) URLs for the metadata file (it
      // won't resolve root-relative paths), so resolve against the page origin.
      const modelUrl = new URL(MODEL_JSON, window.location.href).href;
      const metadataUrl = new URL(METADATA_JSON, window.location.href).href;
      // vocabulary arg omitted (undefined) since we pass explicit local URLs.
      const r = sc.create("BROWSER_FFT", undefined, modelUrl, metadataUrl);
      await r.ensureModelLoaded();
      sharedRecognizer = r;
      return r;
    })();
  }
  return recognizerPromise;
}

async function ensureListening(): Promise<void> {
  const recognizer = await getRecognizer();
  if (isRegistered || recognizer.isListening()) {
    isRegistered = true;
    return;
  }
  const words = recognizer.wordLabels();
  const keepIdx = words.indexOf(KEEP_WORD);
  const rejectIdx = words.indexOf(REJECT_WORD);

  // Start armed so the first word fires immediately.
  armed = true;
  lastFireAt = 0;

  await recognizer.listen(
    async (result) => {
      const scores = result.scores as Float32Array;
      const keepScore = keepIdx >= 0 ? scores[keepIdx] : 0;
      const rejectScore = rejectIdx >= 0 ? scores[rejectIdx] : 0;
      const best = Math.max(keepScore, rejectScore);

      // Re-arm once the word has clearly ended (score fell back down).
      if (best < REARM_THRESHOLD) {
        armed = true;
        return;
      }

      // Only fire on the rising edge of a new word, with a small jitter floor.
      const now = Date.now();
      if (!armed || best < FIRE_THRESHOLD || now - lastFireAt < MIN_GAP_MS) return;

      armed = false;
      lastFireAt = now;
      activeOnDetect?.(keepScore >= rejectScore ? "keep" : "reject");
    },
    {
      // Fire the callback on every window (including noise/unknown) so we can
      // observe the score rising and falling for clean edge detection.
      probabilityThreshold: 0,
      invokeCallbackOnNoiseAndUnknown: true,
      overlapFactor: OVERLAP_FACTOR,
    },
  );
  isRegistered = true;
}

async function stopListeningShared(): Promise<void> {
  if (sharedRecognizer && sharedRecognizer.isListening()) {
    await sharedRecognizer.stopListening();
  }
  isRegistered = false;
}

export function useKeywordSpotter({ onDetect }: UseKeywordSpotterOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  const start = useCallback(async () => {
    // Route detections to this (the live) hook instance.
    activeOnDetect = (decision) => onDetectRef.current(decision);
    if (sharedRecognizer && isRegistered) {
      setStatus("listening");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      await ensureListening();
      setStatus("listening");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const pause = useCallback(async () => {
    await stopListeningShared();
    setStatus("paused");
  }, []);

  const resume = useCallback(async () => {
    await start();
  }, [start]);

  const toggle = useCallback(async () => {
    if (status === "listening") await pause();
    else await resume();
  }, [status, pause, resume]);

  useEffect(() => {
    return () => {
      // Detach this instance and stop the shared mic on unmount. If StrictMode
      // immediately remounts, the next start() re-registers using the already
      // loaded recognizer (fast, no reload).
      activeOnDetect = null;
      stopListeningShared().catch(() => {});
    };
  }, []);

  return { status, error, start, pause, resume, toggle };
}
