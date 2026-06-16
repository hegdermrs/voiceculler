import type { PrepareProgress } from "../sources/localSource";

interface PrepareScreenProps {
  progress: PrepareProgress;
  photoCount: number;
}

export function PrepareScreen({ progress, photoCount }: PrepareScreenProps) {
  const { phase, done, total, currentName } = progress;
  const count = total || photoCount;
  const pct = count > 0 ? Math.round((done / count) * 100) : 100;
  const title = phase === "preparing" ? "Preparing previews" : "Loading into memory";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-stage p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
          <p className="mt-1 text-sm tabular-nums text-neutral-500">
            {done} / {count}
          </p>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-keep transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {currentName && (
          <p className="truncate text-center text-xs text-neutral-600" title={currentName}>
            {currentName}
          </p>
        )}
      </div>
    </div>
  );
}
