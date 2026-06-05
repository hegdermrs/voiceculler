import type { InputMode } from "../types";
import type { VoiceStatus } from "../voice/useKeywordSpotter";
import { MicIndicator } from "./MicIndicator";

interface TopBarProps {
  folderName: string;
  counts: { kept: number; rejected: number; remaining: number; total: number };
  voiceStatus: VoiceStatus;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onShowHelp: () => void;
  onShowTutorial: () => void;
}

export function TopBar({
  folderName,
  counts,
  voiceStatus,
  inputMode,
  onInputModeChange,
  onShowHelp,
  onShowTutorial,
}: TopBarProps) {
  const voiceActive = inputMode === "voice" || inputMode === "both";
  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-900 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm font-medium text-neutral-200" title={folderName}>
          {folderName}
        </span>
        <div className="hidden items-center gap-2 text-xs sm:flex">
          <Count label="Kept" value={counts.kept} className="text-keep" />
          <Count label="Rejected" value={counts.rejected} className="text-reject" />
          <Count label="Left" value={counts.remaining} className="text-neutral-300" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <InputModeToggle mode={inputMode} onChange={onInputModeChange} />
        {voiceActive && <MicIndicator status={voiceStatus} />}
        <button
          type="button"
          onClick={onShowTutorial}
          title="Tutorial"
          className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 ring-1 ring-neutral-800 hover:bg-neutral-800"
        >
          Tutorial
        </button>
        <button
          type="button"
          onClick={onShowHelp}
          title="Keyboard shortcuts (?)"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800 hover:bg-neutral-800"
        >
          ?
        </button>
      </div>
    </header>
  );
}

const MODES: { value: InputMode; label: string; title: string }[] = [
  { value: "keys", label: "Keys", title: "On-screen buttons only" },
  { value: "voice", label: "Voice", title: "Voice only" },
  { value: "both", label: "Both", title: "Buttons and voice" },
];

function InputModeToggle({
  mode,
  onChange,
}: {
  mode: InputMode;
  onChange: (mode: InputMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Input mode"
      className="flex items-center rounded-full bg-neutral-900 p-0.5 ring-1 ring-neutral-800"
    >
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            title={m.title}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              active
                ? "bg-neutral-200 text-neutral-900"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function Count({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 ring-1 ring-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </span>
  );
}
