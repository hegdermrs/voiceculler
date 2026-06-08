/** True when running inside the Tauri desktop shell (not a normal browser tab). */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
