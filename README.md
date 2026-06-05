# Voice Photo Culler

A browser-based photo culling app for a **local folder** or **Google Drive**.
Pull up a folder of photos, then say **"Yes"** (keep) or **"No"** (reject) out
loud — each decision instantly advances to the next photo and sorts the file
into your chosen output folders. Recognition runs **entirely on-device and
offline** using the open-source TensorFlow.js Speech Commands model (vendored
locally), so there is no network round-trip for voice and effectively zero lag —
and no API key.

## Two sources

- **Local folder (fastest):** uses the browser's File System Access API to read
  and move files directly on your machine — nothing is uploaded. Requires a
  Chromium browser (**Chrome or Edge**, on Windows/macOS/Linux). Kept/rejected
  files are moved into subfolders of the folder you pick.
- **Google Drive:** connect a Drive folder and sort photos into Drive subfolders
  (needs a Google OAuth client ID; see below).

Works in any modern browser on macOS, Windows, or Linux. The layout and shortcuts
are tuned for a MacBook (trackpad-friendly, `⌘` aware) but degrade cleanly
everywhere.

## How it works

- **Voice = on-device keyword spotting.** This is not full speech-to-text — it
  listens for a small built-in vocabulary and we only act on two words: "Yes"
  (keep) and "No" (reject). The model runs locally via WebGL; no audio leaves
  your machine. The built-in words are speaker-independent (trained on ~50k
  samples), so there's nothing to train or record.
- **Zero perceived lag.** On detection the UI advances *optimistically* and the
  actual Google Drive move runs in a **background queue** with retry/backoff, so
  you never wait on the network. Each thumbnail shows its move status (pending /
  done / failed).
- **Reversible.** "Keep"/"Reject" move files between folders rather than
  deleting; `Undo` puts a photo back.

## UI

- **Center stage**: the current photo, large and centered on a near-black
  background, with a green **Keep** / red **Reject** flash on each decision.
- **Bottom filmstrip**: scrollable thumbnails; the current one is highlighted and
  auto-centered. Decided photos get a check/x badge. Click any thumbnail to jump.
- **Top bar**: folder name, live counts, mic indicator, and manual
  Keep/Reject/Undo buttons.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `K` / `→` / `Enter` | Keep & advance |
| `J` / `←` | Reject & advance |
| `Z` / `⌘Z` / `Ctrl+Z` | Undo last decision |
| `Space` | Pause / resume listening |
| `[` / `]` | Previous / next photo (no decision) |
| `?` | Toggle shortcuts help |

## Setup

### 1. Install

```bash
npm install
```

### 2. Credentials (only for Google Drive mode)

**Local-folder mode needs no credentials at all** — skip this step.

For Drive mode, copy `.env.example` to `.env` and fill in:

- `VITE_GOOGLE_CLIENT_ID` — a Google OAuth 2.0 **Web** client ID.
  - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
    enable the **Google Drive API**, create an OAuth client, and add
    `http://localhost:5173` to **Authorized JavaScript origins**.

Voice needs **no key and no internet** — the TensorFlow.js Speech Commands model
is vendored into `public/speech-model/` and runs entirely on-device.

### 3. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Using it

Pick a source on the start screen:

- **Local folder:** set the Kept/Rejected subfolder names, click *Choose folder
  & start*, and grant access to the folder. Files are moved locally and
  instantly.
- **Google Drive:** connect, choose the input folder, choose output folders
  (*Auto* creates `Kept`/`Rejected` inside the input), then *Start culling*.

Then **say "Yes" (keep) / "No" (reject)**, or use the buttons/keyboard.

## Tuning detection

Detection tuning lives in [`src/voice/useKeywordSpotter.ts`](src/voice/useKeywordSpotter.ts):

- `PROB_THRESHOLD` — raise to reduce false triggers, lower to catch more.
- `SUPPRESSION_MS` — debounce window so one utterance fires once.
- `OVERLAP_FACTOR` — lower = lower latency (more frequent inference).

Want the literal words "keep"/"reject" instead of yes/no? The library supports
in-browser transfer learning; you'd record a few samples per word and train a
small custom model. Not enabled by default because the built-in yes/no is more
robust with zero setup.

## Project structure

```
src/
  sources/      PhotoSource impls: localSource.ts (File System Access API),
                driveSource.ts (Drive). The gallery is source-agnostic.
  drive/        auth.ts (Google OAuth), driveApi.ts (list/move/folders/blobs)
  voice/        useKeywordSpotter.ts (on-device TF.js keyword spotting)
  state/        useCullingSession.ts (queue/undo/prefetch), useKeyboardShortcuts.ts
  components/   SetupScreen, FolderPicker, GalleryView, PhotoStage, Filmstrip,
                TopBar, MicIndicator, ShortcutsOverlay
```

## Notes

- Requires HTTPS or `localhost` (browser mic + Google Identity Services).
- Uses the full `drive` OAuth scope because moving pre-existing files needs write
  access beyond `drive.file`.
- Deploy the static `dist/` to any host (Vercel, Netlify, GitHub Pages); add your
  deployed origin to the Google OAuth client.
