import { useEffect, useState } from "react";
import { createFolder, listFolders, type DriveFolder } from "../drive/driveApi";

interface Crumb {
  id: string;
  name: string;
}

interface FolderPickerProps {
  /** Called when the user confirms a folder selection. */
  onSelect: (folder: DriveFolder) => void;
  /** Allow creating a new subfolder in the current location. */
  allowCreate?: boolean;
  selectLabel?: string;
}

export function FolderPicker({ onSelect, allowCreate = true, selectLabel = "Use this folder" }: FolderPickerProps) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const currentId = crumbs[crumbs.length - 1].id;
  const currentName = crumbs[crumbs.length - 1].name;

  useEffect(() => {
    let cancelled = false;
    // Intentional data-fetch pattern: show the loading state immediately, then
    // populate results when the Drive request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    listFolders(currentId)
      .then((f) => {
        if (!cancelled) setFolders(f);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  const openFolder = (folder: DriveFolder) => {
    setCrumbs((c) => [...c, folder]);
  };

  const goToCrumb = (index: number) => {
    setCrumbs((c) => c.slice(0, index + 1));
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const folder = await createFolder(name, currentId);
      setNewName("");
      setFolders((f) => [...f, folder].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-950">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800 px-3 py-2 text-sm text-neutral-400">
        {crumbs.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-neutral-600">/</span>}
            <button
              type="button"
              onClick={() => goToCrumb(i)}
              className={`rounded px-1 hover:text-neutral-100 ${
                i === crumbs.length - 1 ? "text-neutral-100" : ""
              }`}
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>

      <div className="h-56 overflow-y-auto px-2 py-2">
        {loading && <p className="px-2 py-3 text-sm text-neutral-500">Loading folders…</p>}
        {error && <p className="px-2 py-3 text-sm text-reject">{error}</p>}
        {!loading && !error && folders.length === 0 && (
          <p className="px-2 py-3 text-sm text-neutral-500">No subfolders here.</p>
        )}
        <ul className="space-y-0.5">
          {folders.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onDoubleClick={() => openFolder(f)}
                onClick={() => openFolder(f)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              >
                <FolderIcon />
                <span className="truncate">{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {allowCreate && (
        <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New folder name…"
            className="min-w-0 flex-1 rounded bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-2">
        <span className="truncate text-xs text-neutral-500">
          Selected: <span className="text-neutral-300">{currentName}</span>
        </span>
        <button
          type="button"
          onClick={() => onSelect({ id: currentId, name: currentName })}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          {selectLabel}
        </button>
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-amber-400">
      <path
        d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}
