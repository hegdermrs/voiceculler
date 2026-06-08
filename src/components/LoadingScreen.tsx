interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Loading voice model…" }: LoadingScreenProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-stage">
      <span className="text-xl font-semibold tracking-tight text-neutral-100">Voice Photo Culler</span>
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-800 border-t-neutral-300" />
      <p className="text-sm text-neutral-500">{message}</p>
    </div>
  );
}
