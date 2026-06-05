interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Loading voice model…" }: LoadingScreenProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-stage text-neutral-200">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-neutral-100">Voice Photo Culler</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-200" />
        <p className="text-sm text-neutral-400">{message}</p>
      </div>

      <p className="max-w-xs text-center text-xs text-neutral-600">
        Preparing on-device voice recognition. Nothing is uploaded — this runs entirely in your
        browser.
      </p>
    </div>
  );
}
