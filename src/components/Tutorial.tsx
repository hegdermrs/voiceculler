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
    title: "Cull photos",
    body: (
      <ul className="space-y-2 text-sm text-neutral-300">
        <li>
          Choose a <strong className="text-neutral-100">local folder</strong> and start culling.
        </li>
        <li>
          <Pill className="bg-keep/15 text-keep ring-keep/40">Yes</Pill> keep ·{" "}
          <Pill className="bg-reject/15 text-reject ring-reject/40">No</Pill> reject
        </li>
        <li>
          Or <Key>K</Key> keep · <Key>J</Key> reject · tap the on-screen buttons
        </li>
      </ul>
    ),
  },
  {
    title: "Controls",
    body: (
      <ul className="space-y-2 text-sm text-neutral-300">
        <li>
          Top-right toggle: <Key>Keys</Key> · <Key>Voice</Key> · <Key>Both</Key>
        </li>
        <li>
          <Key>Z</Key> undo · <Key>←</Key> <Key>→</Key> browse · <Key>?</Key> shortcuts
        </li>
        <li>
          Files move to <span className="text-keep">Kept</span> /{" "}
          <span className="text-reject">Rejected</span> subfolders
        </li>
      </ul>
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
    setIndex(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-neutral-100">{slide.title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        <div className="min-h-[5rem]">{slide.body}</div>

        <div className="mt-5 flex items-center justify-between">
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
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={close}
                className="rounded-lg bg-keep px-4 py-1.5 text-sm font-medium text-black hover:brightness-110"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="rounded-lg bg-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${className}`}
    >
      {children}
    </span>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs text-neutral-200">
      {children}
    </kbd>
  );
}
