import type { PrepareProgress } from "../sources/localSource";

interface PrepareScreenProps {
  progress: PrepareProgress;
  photoCount: number;
}

export function PrepareScreen({ progress, photoCount }: PrepareScreenProps) {
  const { phase, done, total, currentName, sidecarHits, extracted, skippedCache } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;

  const title =
    phase === "preparing" ? "Building preview cache…" : "Loading previews into memory…";

  const subtitle =
    phase === "preparing"
      ? total === 0
        ? "All previews ready (sidecars or cache)."
        : "Extracting embedded JPEGs from RAW files once — culling will be instant after this."
      : "Warming up so every photo appears with zero wait.";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-stage p-6 text-neutral-200">
      <div className="w-full max-w-md space-y-4 text-center">
        <h2 className="text-xl font-semibold text-neutral-100">{title}</h2>
        <p className="text-sm text-neutral-400">{subtitle}</p>

        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-keep transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {done} / {total || photoCount} {phase === "preparing" && total === 0 ? "" : `(${pct}%)`}
          </p>
          {currentName && (
            <p className="truncate text-xs text-neutral-600" title={currentName}>
              {currentName}
            </p>
          )}
        </div>

        {(sidecarHits > 0 || extracted > 0 || skippedCache > 0) && phase === "preparing" && (
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {sidecarHits > 0 && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-neutral-400">
                {sidecarHits} sidecar JPEG{sidecarHits !== 1 ? "s" : ""}
              </span>
            )}
            {extracted > 0 && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-neutral-400">
                {extracted} extracted
              </span>
            )}
            {skippedCache > 0 && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-neutral-400">
                {skippedCache} from cache
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
