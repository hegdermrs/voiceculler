import { useState } from "react";

interface TutorialProps {
  open: boolean;
  onClose: () => void;
}

interface Slide {
  title: string;
  body: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: "Welcome 👋",
    body: (
      <p>
        This app helps you <strong className="text-neutral-100">cull photos fast</strong> — keep the
        good ones, reject the rest — using your voice, on-screen buttons, or the keyboard. Everything
        runs on your computer; nothing is uploaded.
      </p>
    ),
  },
  {
    title: "1. Pick your photos",
    body: (
      <div className="space-y-2">
        <p>
          Choose <strong className="text-neutral-100">Local folder</strong> and select a folder on
          your computer. You'll grant read/write access so the app can sort files into subfolders.
        </p>
        <p className="text-neutral-400">
          Works with JPEG, PNG, WebP and camera <strong className="text-neutral-200">RAW</strong>{" "}
          (CR2, CR3, NEF, ARW, RAF, DNG…). For RAW, the embedded preview is shown for speed.
        </p>
      </div>
    ),
  },
  {
    title: "2. Keep or reject",
    body: (
      <div className="space-y-3">
        <p>For each photo, make a decision and it auto-advances to the next:</p>
        <div className="flex flex-wrap gap-2">
          <Pill className="bg-keep/15 text-keep ring-keep/40">Say "Yes" → Keep</Pill>
          <Pill className="bg-reject/15 text-reject ring-reject/40">Say "No" → Reject</Pill>
        </div>
        <p className="text-neutral-400">
          Or tap the green ✓ / red ✕ buttons on the photo, or press{" "}
          <Key>K</Key> (keep) and <Key>J</Key> (reject).
        </p>
      </div>
    ),
  },
  {
    title: "3. Choose how you drive it",
    body: (
      <div className="space-y-2">
        <p>
          Use the toggle in the top-right to pick your input style:
        </p>
        <ul className="space-y-1.5 text-neutral-300">
          <li>
            <Pill className="bg-neutral-800 text-neutral-200 ring-neutral-700">Keys</Pill> — on-screen
            buttons only (mic off).
          </li>
          <li>
            <Pill className="bg-neutral-800 text-neutral-200 ring-neutral-700">Voice</Pill> —
            hands-free; buttons hidden.
          </li>
          <li>
            <Pill className="bg-neutral-800 text-neutral-200 ring-neutral-700">Both</Pill> — voice and
            buttons together.
          </li>
        </ul>
        <p className="text-neutral-400">The keyboard always works in every mode.</p>
      </div>
    ),
  },
  {
    title: "4. Changed your mind?",
    body: (
      <div className="space-y-2">
        <p>
          Hit the <strong className="text-neutral-100">Undo</strong> button (the ↩ circle at the
          bottom of the photo) or press <Key>Z</Key>. It moves the file back and returns you to that
          photo so you can re-decide.
        </p>
        <p className="text-neutral-400">
          Use the side arrows or <Key>←</Key> / <Key>→</Key> to look back through earlier photos. A
          decided photo is locked until you undo it.
        </p>
      </div>
    ),
  },
  {
    title: "5. Where photos go",
    body: (
      <div className="space-y-2">
        <p>
          Kept and rejected photos are moved into{" "}
          <strong className="text-keep">Kept</strong> and{" "}
          <strong className="text-reject">Rejected</strong> subfolders inside your chosen folder
          (created automatically). You can rename these before you start.
        </p>
        <p className="text-neutral-400">
          Nothing is deleted — rejected photos are just moved aside, and Undo brings them back.
        </p>
      </div>
    ),
  },
];

export function Tutorial({ open, onClose }: TutorialProps) {
  const [index, setIndex] = useState(0);
  if (!open) return null;

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const close = () => {
    onClose();
    // Reset for next time it opens.
    setIndex(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-neutral-100">{slide.title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close tutorial"
            className="text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        <div className="min-h-[7rem] text-sm leading-relaxed text-neutral-300">{slide.body}</div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-neutral-200" : "w-1.5 bg-neutral-700"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={close}
                className="rounded-md bg-keep/20 px-4 py-1.5 text-sm font-medium text-keep ring-1 ring-keep/40 hover:bg-keep/30"
              >
                Got it
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="rounded-md bg-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${className}`}
    >
      {children}
    </span>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200">
      {children}
    </kbd>
  );
}
