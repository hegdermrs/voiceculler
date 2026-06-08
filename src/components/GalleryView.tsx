import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Decision, InputMode, PhotoSource } from "../types";
import { useCullingSession } from "../state/useCullingSession";
import { useKeyboardShortcuts } from "../state/useKeyboardShortcuts";
import { useKeywordSpotter } from "../voice/useKeywordSpotter";
import { TopBar } from "./TopBar";
import { PhotoStage } from "./PhotoStage";
import { Filmstrip } from "./Filmstrip";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { Tutorial } from "./Tutorial";

interface GalleryViewProps {
  source: PhotoSource;
  onExit: () => void;
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function GalleryView({ source, onExit }: GalleryViewProps) {
  const session = useCullingSession(source);
  const [flash, setFlash] = useState<{ decision: Decision; key: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("both");
  const flashCounter = useRef(0);

  const voiceEnabled = inputMode === "voice" || inputMode === "both";
  const keysEnabled = inputMode === "keys" || inputMode === "both";

  const triggerFlash = useCallback((decision: Decision) => {
    flashCounter.current += 1;
    setFlash({ decision, key: flashCounter.current });
  }, []);

  const decideRef = useRef(session.decide);
  useEffect(() => {
    decideRef.current = session.decide;
  });

  const handleDecision = useCallback(
    (decision: Decision) => {
      triggerFlash(decision);
      decideRef.current(decision);
    },
    [triggerFlash],
  );

  const voice = useKeywordSpotter({ onDetect: handleDecision });

  const handleExit = useCallback(() => {
    source.dispose();
    onExit();
  }, [source, onExit]);

  // Start/stop the mic to match the selected input mode.
  const voiceStartRef = useRef(voice.start);
  const voicePauseRef = useRef(voice.pause);
  useEffect(() => {
    voiceStartRef.current = voice.start;
    voicePauseRef.current = voice.pause;
  });
  useEffect(() => {
    if (voiceEnabled) void voiceStartRef.current();
    else void voicePauseRef.current();
  }, [voiceEnabled]);

  const shortcutHandlers = useMemo(
    () => ({
      onKeep: () => handleDecision("keep"),
      onReject: () => handleDecision("reject"),
      onUndo: () => session.undo(),
      onTogglePause: () => void voice.toggle(),
      onPrev: () => session.prev(),
      onNext: () => session.next(),
      onToggleHelp: () => setHelpOpen((o) => !o),
    }),
    [handleDecision, session, voice],
  );

  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="relative flex h-full flex-col">
      <TopBar
        folderName={source.name}
        counts={session.counts}
        voiceStatus={voice.status}
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        onShowHelp={() => setHelpOpen(true)}
        onShowTutorial={() => setTutorialOpen(true)}
      />

      {voice.status === "error" && (
        <div className="border-b border-amber-800/40 bg-amber-950/30 px-4 py-1.5 text-center text-xs text-amber-200">
          Voice unavailable — use keys or buttons.
        </div>
      )}
      {voice.status === "loading" && (
        <div className="border-b border-neutral-800 bg-neutral-900/40 px-4 py-1.5 text-center text-xs text-neutral-400">
          Loading voice model…
        </div>
      )}

      {session.isComplete ? (
        <CompleteScreen counts={session.counts} onExit={handleExit} />
      ) : (
        <>
          <PhotoStage
            current={session.current}
            flash={flash}
            showActions={keysEnabled}
            voiceActive={voiceEnabled}
            controls={{
              onKeep: () => handleDecision("keep"),
              onReject: () => handleDecision("reject"),
              onUndo: () => session.undo(),
              onPrev: () => session.prev(),
              onNext: () => session.next(),
              onBack: handleExit,
              canUndo: session.currentIndex > 0,
              canPrev: session.currentIndex > 0,
              canNext: session.currentIndex < session.states.length - 1,
            }}
          />
          <Filmstrip
            states={session.states}
            currentIndex={session.currentIndex}
            onJump={session.goTo}
            source={source}
          />
        </>
      )}

      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} isMac={IS_MAC} />
      <Tutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}

function CompleteScreen({
  counts,
  onExit,
}: {
  counts: { kept: number; rejected: number; total: number };
  onExit: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <h2 className="text-2xl font-semibold text-neutral-100">Done!</h2>
      <p className="text-neutral-400">
        Kept <span className="font-semibold text-keep">{counts.kept}</span>, rejected{" "}
        <span className="font-semibold text-reject">{counts.rejected}</span> of {counts.total}.
      </p>
      <button
        type="button"
        onClick={onExit}
        className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-700"
      >
        Start over
      </button>
    </div>
  );
}
