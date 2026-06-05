import type { VoiceStatus } from "../voice/useKeywordSpotter";

interface MicIndicatorProps {
  status: VoiceStatus;
  onClick?: () => void;
}

export function MicIndicator({ status, onClick }: MicIndicatorProps) {
  const listening = status === "listening";
  const color =
    status === "listening"
      ? "text-keep"
      : status === "error"
        ? "text-reject"
        : "text-neutral-400";

  const label: Record<VoiceStatus, string> = {
    idle: "Mic off",
    loading: "Loading…",
    listening: "Listening",
    paused: "Paused",
    error: "Mic error",
  };

  const content = (
    <>
      <span className="relative flex h-3 w-3 items-center justify-center">
        {listening && (
          <span className="absolute inline-flex h-3 w-3 rounded-full bg-keep/60 animate-pulse-ring" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            listening ? "bg-keep" : status === "error" ? "bg-reject" : "bg-neutral-600"
          }`}
        />
      </span>
      <span className={color}>{label[status]}</span>
    </>
  );

  const classes =
    "flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1.5 text-sm ring-1 ring-neutral-800";

  if (!onClick) {
    return (
      <div className={classes} title="Voice status">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Toggle listening (Space)"
      className={`${classes} hover:bg-neutral-800`}
    >
      {content}
    </button>
  );
}
