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

// Only fire when the model is confident, and ignore noise/unknown.
const PROB_THRESHOLD = 0.8;
// Native suppression window in the library (kept short for rapid fire).
const SUPPRESSION_MS = 200;
// Higher overlapFactor = lower latency (more frequent inference windows), so a
// quick word is picked up fast. The shared cooldown below prevents one word
// from firing twice across consecutive windows.
const OVERLAP_FACTOR = 0.75;
// Cooldown after a fired decision: long enough that a single ~0.3s word can't
// re-trigger on its trailing window, short enough to allow rapid distinct
// words (~2 per second). This is the main rapid-fire knob.
const COOLDOWN_MS = 450;

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
// The currently-mounted hook instance that should receive detections.
let activeOnDetect: ((decision: Decision) => void) | null = null;

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

  await recognizer.listen(
    async (result) => {
      const scores = result.scores as Float32Array;
      const keepScore = keepIdx >= 0 ? scores[keepIdx] : 0;
      const rejectScore = rejectIdx >= 0 ? scores[rejectIdx] : 0;
      if (keepScore < PROB_THRESHOLD && rejectScore < PROB_THRESHOLD) return;

      // One-utterance-one-decision: a single word spans several overlapping
      // windows, so ignore anything within the shared cooldown.
      const now = Date.now();
      if (now - lastFireAt < COOLDOWN_MS) return;
      lastFireAt = now;

      activeOnDetect?.(keepScore >= rejectScore ? "keep" : "reject");
    },
    {
      probabilityThreshold: PROB_THRESHOLD,
      invokeCallbackOnNoiseAndUnknown: false,
      overlapFactor: OVERLAP_FACTOR,
      suppressionTimeMillis: SUPPRESSION_MS,
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
