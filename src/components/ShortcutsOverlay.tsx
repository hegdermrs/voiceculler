interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
  isMac: boolean;
}

const ROWS: { keys: string[]; action: string }[] = [
  { keys: ["K", "→", "Enter"], action: "Keep & advance" },
  { keys: ["J", "←"], action: "Reject & advance" },
  { keys: ["Z", "⌘/Ctrl+Z"], action: "Undo last decision" },
  { keys: ["Space"], action: "Pause / resume listening" },
  { keys: ["[", "]"], action: "Previous / next photo" },
  { keys: ["?"], action: "Toggle this help" },
];

export function ShortcutsOverlay({ open, onClose, isMac }: ShortcutsOverlayProps) {
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-2">
          {ROWS.map((row) => (
            <li key={row.action} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-400">{row.action}</span>
              <span className="flex gap-1">
                {row.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-200"
                  >
                    {k.replace("⌘/Ctrl", isMac ? "⌘" : "Ctrl")}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-neutral-500">
          Voice: <span className="text-keep">Yes</span> / <span className="text-reject">No</span>
        </p>
      </div>
    </div>
  );
}
