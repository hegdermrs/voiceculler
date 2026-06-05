import { useEffect } from "react";

interface ShortcutHandlers {
  onKeep: () => void;
  onReject: () => void;
  onUndo: () => void;
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleHelp: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handlers.onUndo();
        return;
      }

      switch (e.key) {
        case "k":
        case "K":
        case "ArrowRight":
        case "Enter":
          e.preventDefault();
          handlers.onKeep();
          break;
        case "j":
        case "J":
        case "ArrowLeft":
          e.preventDefault();
          handlers.onReject();
          break;
        case "z":
        case "Z":
          e.preventDefault();
          handlers.onUndo();
          break;
        case " ":
          e.preventDefault();
          handlers.onTogglePause();
          break;
        case "[":
          e.preventDefault();
          handlers.onPrev();
          break;
        case "]":
          e.preventDefault();
          handlers.onNext();
          break;
        case "?":
          e.preventDefault();
          handlers.onToggleHelp();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled]);
}
