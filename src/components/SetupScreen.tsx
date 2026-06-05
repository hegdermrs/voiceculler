import { useState } from "react";
import { Tutorial } from "./Tutorial";
import { isConfigured, signIn } from "../drive/auth";
import { findOrCreateFolder, listImages, type DriveFolder } from "../drive/driveApi";
import { FolderPicker } from "./FolderPicker";
import { DriveSource } from "../sources/driveSource";
import {
  createLocalSource,
  isFileSystemAccessSupported,
  openImageFolder,
  type PickedFolder,
} from "../sources/localSource";
import type { PhotoSource } from "../types";

interface SetupScreenProps {
  onStart: (source: PhotoSource) => void;
}

type Mode = "choose" | "local" | "drive";

const TUTORIAL_SEEN_KEY = "vpc.tutorialSeen";

export function SetupScreen({ onStart }: SetupScreenProps) {
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
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-neutral-100">Voice Photo Culler</h1>
          <p className="text-sm text-neutral-500">
            Say <span className="text-keep">"Yes"</span> to keep or{" "}
            <span className="text-reject">"No"</span> to reject — sort your photos hands-free.
          </p>
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-neutral-300 ring-1 ring-neutral-800 hover:bg-neutral-800"
          >
            How it works
          </button>
        </header>

        {mode === "choose" && <SourceChooser onPick={setMode} />}
        {mode === "local" && <LocalSetup onStart={onStart} onBack={() => setMode("choose")} />}
        {mode === "drive" && <DriveSetup onStart={onStart} onBack={() => setMode("choose")} />}
      </div>

      <Tutorial open={tutorialOpen} onClose={closeTutorial} />
    </div>
  );
}

function SourceChooser({ onPick }: { onPick: (m: Mode) => void }) {
  const localOk = isFileSystemAccessSupported();
  return (
    <div>
      <button
        type="button"
        onClick={() => onPick("local")}
        disabled={!localOk}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-left transition hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-neutral-100">Local folder</span>
          <span className="rounded-full bg-keep/15 px-2 py-0.5 text-xs font-medium text-keep">
            Fastest
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Cull photos straight from a folder on this computer. Nothing is uploaded.
          {!localOk && " (Requires Chrome or Edge.)"}
        </p>
      </button>

      <div className="flex items-center gap-4 py-4" aria-hidden="true">
        <span className="h-px flex-1 bg-neutral-800" />
        <span className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
          or
        </span>
        <span className="h-px flex-1 bg-neutral-800" />
      </div>

      <div
        aria-disabled="true"
        title="Coming soon"
        className="w-full cursor-not-allowed rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-left opacity-50"
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-neutral-100">Google Drive</span>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">
            Coming soon
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Connect a Drive folder and sort photos into Drive subfolders.
        </p>
      </div>
    </div>
  );
}

function LocalSetup({
  onStart,
  onBack,
}: {
  onStart: (source: PhotoSource) => void;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [keptName, setKeptName] = useState("Kept");
  const [rejectedName, setRejectedName] = useState("Rejected");
  const [choosing, setChoosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChoose = async () => {
    setError(null);
    setChoosing(true);
    try {
      const result = await openImageFolder();
      if (result.entries.length === 0) {
        setError("No images found in that folder. Pick another one.");
        setPicked(null);
        return;
      }
      setPicked(result);
    } catch (e) {
      // The user cancelling the picker throws an AbortError; ignore it.
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
      const source = await createLocalSource(picked, kept, rejected);
      onStart(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />

      {error && <ErrorBox message={error} />}

      <Step n={1} title="Choose photo folder" done={Boolean(picked)}>
        <p className="mb-3 text-sm text-neutral-500">
          Pick a folder on this computer. You'll be asked to grant read/write access. Nothing is
          uploaded. JPEG, PNG, WebP and camera RAW (CR2, CR3, NEF, ARW, RAF, DNG…) are supported.
        </p>
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-neutral-900 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-neutral-200">{picked.dir.name}</p>
              <p className="text-xs text-neutral-500">{picked.entries.length} photos</p>
            </div>
            <button
              type="button"
              onClick={handleChoose}
              disabled={choosing}
              className="shrink-0 rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleChoose}
            disabled={choosing}
            className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
          >
            {choosing ? "Opening…" : "Choose folder"}
          </button>
        )}
      </Step>

      <Step n={2} title="Output subfolder names" done={Boolean(picked)} disabled={!picked}>
        <p className="mb-3 text-sm text-neutral-500">
          Kept and rejected photos move into these subfolders inside the chosen folder. They're
          created automatically if they don't exist.
        </p>
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
        disabled={!picked || starting}
        className="w-full rounded-md bg-keep px-4 py-3 text-base font-semibold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {starting ? "Starting…" : "Start culling"}
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
      className="text-sm text-neutral-500 hover:text-neutral-300"
    >
      ← Back
    </button>
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
        className="mt-1 w-full rounded bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
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
    <section
      className={`rounded-lg border p-4 transition ${
        disabled
          ? "border-neutral-900 bg-neutral-950/40 opacity-50"
          : "border-neutral-800 bg-neutral-900/40"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            done ? "bg-keep text-black" : "bg-neutral-800 text-neutral-300"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
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
