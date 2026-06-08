import { useRef, useState } from "react";
import { Tutorial } from "./Tutorial";
import { isConfigured, signIn } from "../drive/auth";
import { findOrCreateFolder, listImages, type DriveFolder } from "../drive/driveApi";
import { FolderPicker } from "./FolderPicker";
import { DriveSource } from "../sources/driveSource";
import {
  buildPreviewCache,
  prepareLocalSource,
  isFileSystemAccessSupported,
  openImageFolder,
  type PickedFolder,
  type PrebuiltPreviewCache,
  type PrepareProgress,
} from "../sources/localSource";
import type { PhotoSource } from "../types";

interface SetupScreenProps {
  onStart: (source: PhotoSource) => void;
  onPreparing?: (progress: PrepareProgress | null, photoCount: number) => void;
}

type Mode = "choose" | "local" | "drive";

const TUTORIAL_SEEN_KEY = "vpc.tutorialSeen";

export function SetupScreen({ onStart, onPreparing }: SetupScreenProps) {
  const [mode, setMode] = useState<Mode>("choose");
  // Auto-show the tutorial the first time the app is opened (lazy-read so we
  // don't trigger an extra render via an effect).
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(TUTORIAL_SEEN_KEY);
    } catch {
      return false;
    }
  });

  const closeTutorial = () => {
    setTutorialOpen(false);
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-50">Voice Photo Culler</h1>
          <p className="mt-2 text-xs text-neutral-500">
            <span className="text-keep">Yes</span>
            <span className="mx-1.5 text-neutral-700">·</span>
            <span className="text-reject">No</span>
          </p>
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="mt-3 text-xs text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
          >
            How it works
          </button>
        </header>

        <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/60 p-5 shadow-xl shadow-black/20">
          {mode === "choose" && <SourceChooser onPick={setMode} />}
          {mode === "local" && (
            <LocalSetup
              onStart={onStart}
              onPreparing={onPreparing}
              onBack={() => setMode("choose")}
            />
          )}
          {mode === "drive" && <DriveSetup onStart={onStart} onBack={() => setMode("choose")} />}
        </div>
      </div>

      <Tutorial open={tutorialOpen} onClose={closeTutorial} />
    </div>
  );
}

function SourceChooser({ onPick }: { onPick: (m: Mode) => void }) {
  const localOk = isFileSystemAccessSupported();
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onPick("local")}
        disabled={!localOk}
        className="group flex w-full items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3.5 text-left transition hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300 group-hover:bg-neutral-700">
          <FolderIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-medium text-neutral-100">Local folder</span>
            <span className="rounded bg-keep/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-keep">
              Recommended
            </span>
          </span>
          {!localOk && (
            <span className="mt-0.5 block text-xs text-neutral-500">Chrome or Edge required</span>
          )}
        </span>
        <ChevronIcon />
      </button>

      <div
        aria-disabled="true"
        title="Coming soon"
        className="flex w-full cursor-not-allowed items-center gap-4 rounded-xl border border-neutral-800/60 bg-neutral-900/20 px-4 py-3.5 opacity-40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-500">
          <CloudIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-medium text-neutral-300">Google Drive</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Soon
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function LocalSetup({
  onStart,
  onPreparing,
  onBack,
}: {
  onStart: (source: PhotoSource) => void;
  onPreparing?: (progress: PrepareProgress | null, photoCount: number) => void;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [keptName, setKeptName] = useState("Kept");
  const [rejectedName, setRejectedName] = useState("Rejected");
  const [choosing, setChoosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgPrep, setBgPrep] = useState<PrepareProgress | null>(null);
  const prepPromiseRef = useRef<Promise<PrebuiltPreviewCache> | null>(null);
  const prepFolderRef = useRef<PickedFolder | null>(null);

  const photoCount = picked?.entries.length ?? 0;
  const rawCount = picked?.rawCount ?? 0;
  const sidecarCount = picked?.sidecarCount ?? 0;

  const startBackgroundPrep = (folder: PickedFolder) => {
    prepFolderRef.current = folder;
    const rawsToBuild = folder.rawCount - folder.sidecarCount;
    if (rawsToBuild <= 0) {
      prepPromiseRef.current = Promise.resolve({
        previewHandles: new Map(
          folder.entries
            .filter((e) => e.sidecarHandle)
            .map((e) => [e.name, e.sidecarHandle!] as const),
        ),
        extracted: 0,
        skippedCache: 0,
      });
      setBgPrep(null);
      return;
    }

    setBgPrep({
      phase: "preparing",
      done: 0,
      total: rawsToBuild,
      sidecarHits: folder.sidecarCount,
      extracted: 0,
      skippedCache: 0,
    });

    prepPromiseRef.current = buildPreviewCache(folder, (progress) => {
      if (prepFolderRef.current === folder) setBgPrep(progress);
    }).then((result) => {
      if (prepFolderRef.current === folder) setBgPrep(null);
      return result;
    });
  };

  const handleChoose = async () => {
    setError(null);
    setChoosing(true);
    prepPromiseRef.current = null;
    prepFolderRef.current = null;
    setBgPrep(null);
    try {
      const result = await openImageFolder();
      if (result.entries.length === 0) {
        setError("No images found in that folder. Pick another one.");
        setPicked(null);
        return;
      }
      setPicked(result);
      startBackgroundPrep(result);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChoosing(false);
    }
  };

  const handleStart = async () => {
    if (!picked) return;
    const kept = keptName.trim();
    const rejected = rejectedName.trim();
    if (!kept || !rejected) {
      setError("Folder names cannot be empty.");
      return;
    }
    if (kept === rejected) {
      setError("Kept and Rejected folders must be different.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const prebuilt = prepPromiseRef.current
        ? await prepPromiseRef.current
        : await buildPreviewCache(picked, (progress) => {
            onPreparing?.(progress, picked.entries.length);
          });

      const source = await prepareLocalSource(
        picked,
        kept,
        rejected,
        (progress) => {
          onPreparing?.(progress, picked.entries.length);
        },
        prebuilt,
      );
      onPreparing?.(null, 0);
      onStart(source);
    } catch (e) {
      onPreparing?.(null, 0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />

      {error && <ErrorBox message={error} />}

      <Step n={1} title="Photo folder" done={Boolean(picked)}>
        {picked ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2.5 ring-1 ring-neutral-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-100">{picked.dir.name}</p>
                <p className="text-xs tabular-nums text-neutral-500">
                  {photoCount} files
                  {rawCount > 0 && ` · ${rawCount} RAW`}
                  {sidecarCount > 0 && ` · ${sidecarCount} sidecar`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleChoose}
                disabled={choosing || Boolean(bgPrep)}
                className="shrink-0 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
              >
                Change
              </button>
            </div>
            {bgPrep && (
              <PrepBar done={bgPrep.done} total={bgPrep.total} label="Preparing RAW previews" />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleChoose}
            disabled={choosing}
            className="w-full rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
          >
            {choosing ? "Opening…" : "Choose folder"}
          </button>
        )}
      </Step>

      <Step n={2} title="Output folders" done={Boolean(picked)} disabled={!picked}>
        <div className="grid grid-cols-2 gap-3">
          <NameField label="Kept" accent="keep" value={keptName} onChange={setKeptName} />
          <NameField
            label="Rejected"
            accent="reject"
            value={rejectedName}
            onChange={setRejectedName}
          />
        </div>
      </Step>

      <button
        type="button"
        onClick={handleStart}
        disabled={!picked || starting || Boolean(bgPrep)}
        className="w-full rounded-xl bg-keep py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {starting ? "Starting…" : bgPrep ? "Preparing…" : "Start culling"}
      </button>
    </div>
  );
}

type Picking = "input" | "kept" | "rejected" | null;

function DriveSetup({
  onStart,
  onBack,
}: {
  onStart: (source: PhotoSource) => void;
  onBack: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState<DriveFolder | null>(null);
  const [kept, setKept] = useState<DriveFolder | null>(null);
  const [rejected, setRejected] = useState<DriveFolder | null>(null);
  const [picking, setPicking] = useState<Picking>(null);

  const [loading, setLoading] = useState(false);

  const envMissing = !isConfigured();

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await signIn();
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  };

  const handlePick = (folder: DriveFolder) => {
    if (picking === "input") {
      setInput(folder);
      setKept(null);
      setRejected(null);
    } else if (picking === "kept") {
      setKept(folder);
    } else if (picking === "rejected") {
      setRejected(folder);
    }
    setPicking(null);
  };

  const useDefaultOutputs = async () => {
    if (!input) return;
    setLoading(true);
    setError(null);
    try {
      const [k, r] = await Promise.all([
        findOrCreateFolder("Kept", input.id),
        findOrCreateFolder("Rejected", input.id),
      ]);
      setKept(k);
      setRejected(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!input || !kept || !rejected) return;
    setLoading(true);
    setError(null);
    try {
      const photos = await listImages(input.id);
      if (photos.length === 0) {
        setError("No images found in the selected input folder.");
        return;
      }
      const source = new DriveSource(
        { sourceId: input.id, sourceName: input.name, keptId: kept.id, rejectedId: rejected.id },
        photos,
      );
      onStart(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const ready = Boolean(input && kept && rejected);

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />

      {envMissing && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-sm text-amber-200">
          Missing Google credentials. Copy <code>.env.example</code> to <code>.env</code> and set{" "}
          <code>VITE_GOOGLE_CLIENT_ID</code>, then restart the dev server.
        </div>
      )}

      {error && <ErrorBox message={error} />}

      <Step n={1} title="Connect Google Drive" done={connected}>
        {connected ? (
          <p className="text-sm text-neutral-400">Connected.</p>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting || envMissing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {connecting ? "Connecting…" : "Connect Google Drive"}
          </button>
        )}
      </Step>

      <Step n={2} title="Choose input folder" done={Boolean(input)} disabled={!connected}>
        <FolderRow
          label="Input"
          folder={input}
          onPick={() => setPicking(picking === "input" ? null : "input")}
          active={picking === "input"}
          disabled={!connected}
        />
        {picking === "input" && <FolderPicker onSelect={handlePick} selectLabel="Use as input" />}
      </Step>

      <Step n={3} title="Choose output folders" done={Boolean(kept && rejected)} disabled={!input}>
        <div className="space-y-3">
          <button
            type="button"
            onClick={useDefaultOutputs}
            disabled={!input || loading}
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
          >
            Auto: create "Kept" &amp; "Rejected" inside input
          </button>

          <FolderRow
            label="Kept"
            folder={kept}
            accent="keep"
            onPick={() => setPicking(picking === "kept" ? null : "kept")}
            active={picking === "kept"}
            disabled={!input}
          />
          {picking === "kept" && <FolderPicker onSelect={handlePick} selectLabel="Use for Kept" />}

          <FolderRow
            label="Rejected"
            folder={rejected}
            accent="reject"
            onPick={() => setPicking(picking === "rejected" ? null : "rejected")}
            active={picking === "rejected"}
            disabled={!input}
          />
          {picking === "rejected" && (
            <FolderPicker onSelect={handlePick} selectLabel="Use for Rejected" />
          )}
        </div>
      </Step>

      <button
        type="button"
        onClick={handleStart}
        disabled={!ready || loading}
        className="w-full rounded-md bg-keep px-4 py-3 text-base font-semibold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {loading ? "Loading photos…" : "Start culling"}
      </button>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
    >
      ← Back
    </button>
  );
}

function PrepBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full bg-keep/80 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M17.5 19H9a5 5 0 1 1 1.3-9.8A6 6 0 0 1 19 10.5a3.5 3.5 0 0 1 0 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-neutral-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
      {message}
    </div>
  );
}

function NameField({
  label,
  accent,
  value,
  onChange,
}: {
  label: string;
  accent: "keep" | "reject";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span
        className={`text-xs font-medium uppercase tracking-wide ${
          accent === "keep" ? "text-keep" : "text-reject"
        }`}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg bg-neutral-900 px-2.5 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
      />
    </label>
  );
}

function Step({
  n,
  title,
  done,
  disabled,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={disabled ? "opacity-40" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            done ? "bg-keep text-black" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      </div>
      <div className={disabled ? "pointer-events-none" : ""}>{children}</div>
    </section>
  );
}

function FolderRow({
  label,
  folder,
  onPick,
  active,
  disabled,
  accent,
}: {
  label: string;
  folder: DriveFolder | null;
  onPick: () => void;
  active: boolean;
  disabled?: boolean;
  accent?: "keep" | "reject";
}) {
  const accentClass =
    accent === "keep" ? "text-keep" : accent === "reject" ? "text-reject" : "text-neutral-300";
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-neutral-900 px-3 py-2">
      <div className="min-w-0">
        <span className={`text-xs font-medium uppercase tracking-wide ${accentClass}`}>{label}</span>
        <p className="truncate text-sm text-neutral-200">
          {folder ? folder.name : <span className="text-neutral-600">Not selected</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="shrink-0 rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
      >
        {active ? "Close" : folder ? "Change" : "Browse"}
      </button>
    </div>
  );
}
