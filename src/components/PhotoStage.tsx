import type { ReactNode } from "react";
import type { Decision, PhotoState } from "../types";

interface FlashState {
  decision: Decision;
  key: number;
}

interface StageControls {
  onKeep: () => void;
  onReject: () => void;
  onUndo: () => void;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  canUndo: boolean;
  canPrev: boolean;
  canNext: boolean;
}

interface PhotoStageProps {
  current: PhotoState | undefined;
  flash: FlashState | null;
  controls: StageControls;
  /** Show the on-screen Keep/Reject/Undo buttons. */
  showActions: boolean;
  /** Show the "Yes/No" voice hint. */
  voiceActive: boolean;
}

export function PhotoStage({ current, flash, controls, showActions, voiceActive }: PhotoStageProps) {
  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-600">
        <p className="text-lg">All photos sorted.</p>
      </div>
    );
  }

  const src = current.fullSrc || current.photo.thumbnailLink;

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-stage">
      {src ? (
        <img
          key={current.photo.id}
          src={src}
          alt={current.photo.name}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-600">
          Loading…
        </div>
      )}

      {/* Back to source chooser */}
      <button
        type="button"
        onClick={controls.onBack}
        title="Back to start"
        className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs text-neutral-200 backdrop-blur transition hover:bg-black/70"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Filename */}
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 max-w-[60%] truncate rounded-full bg-black/50 px-3 py-1 text-xs text-neutral-300 backdrop-blur">
        {current.photo.name}
      </div>

      {/* Prev / Next navigation */}
      <EdgeButton
        side="left"
        title="Previous (←)"
        onClick={controls.onPrev}
        disabled={!controls.canPrev}
      >
        <Chevron className="h-7 w-7 rotate-180" />
      </EdgeButton>
      <EdgeButton
        side="right"
        title="Next (→)"
        onClick={controls.onNext}
        disabled={!controls.canNext}
      >
        <Chevron className="h-7 w-7" />
      </EdgeButton>

      {/* Primary action bar. Keep/Reject follow the input mode, but Undo is
          always available so you can change your mind in any mode. */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4">
        {showActions && (
          <ActionButton
            title="Reject (J)"
            onClick={controls.onReject}
            className="bg-reject/15 text-reject ring-2 ring-reject/40 hover:bg-reject/25"
          >
            <Cross className="h-7 w-7" />
          </ActionButton>
        )}

        <ActionButton
          title="Undo / go back (Z)"
          onClick={controls.onUndo}
          disabled={!controls.canUndo}
          className="h-12 w-12 bg-black/60 text-neutral-100 ring-1 ring-neutral-600 hover:bg-black/80"
        >
          <Undo className="h-5 w-5" />
        </ActionButton>

        {showActions && (
          <ActionButton
            title="Keep (K)"
            onClick={controls.onKeep}
            className="bg-keep/15 text-keep ring-2 ring-keep/40 hover:bg-keep/25"
          >
            <Check className="h-7 w-7" />
          </ActionButton>
        )}
      </div>

      {/* Voice hint */}
      {voiceActive && (
        <div className="pointer-events-none absolute bottom-5 left-3 rounded-full bg-black/50 px-3 py-1 text-xs backdrop-blur">
          <span className="text-keep">"Yes"</span>
          <span className="text-neutral-500"> keep · </span>
          <span className="text-reject">"No"</span>
          <span className="text-neutral-500"> reject</span>
        </div>
      )}

      {flash && (
        <div
          key={flash.key}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div
            className={`animate-flash-in rounded-2xl px-10 py-6 text-5xl font-black uppercase tracking-wider ${
              flash.decision === "keep"
                ? "bg-keep/20 text-keep ring-4 ring-keep/40"
                : "bg-reject/20 text-reject ring-4 ring-reject/40"
            }`}
          >
            {flash.decision === "keep" ? "Keep" : "Reject"}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  title,
  disabled,
  className = "",
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-16 w-16 items-center justify-center rounded-full backdrop-blur transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

function EdgeButton({
  side,
  onClick,
  title,
  disabled,
  children,
}: {
  side: "left" | "right";
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`absolute top-1/2 -translate-y-1/2 ${
        side === "left" ? "left-2" : "right-2"
      } flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-neutral-200 backdrop-blur transition hover:bg-black/70 disabled:opacity-20 disabled:hover:bg-black/40`}
    >
      {children}
    </button>
  );
}

function iconProps(className?: string) {
  return {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function Check({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Cross({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Undo({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ArrowLeft({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}
