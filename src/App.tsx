import { useEffect, useState } from "react";
import { SetupScreen } from "./components/SetupScreen";
import { GalleryView } from "./components/GalleryView";
import { LoadingScreen } from "./components/LoadingScreen";
import { PrepareScreen } from "./components/PrepareScreen";
import { preloadKeywordSpotter } from "./voice/useKeywordSpotter";
import type { PrepareProgress } from "./sources/localSource";
import type { PhotoSource } from "./types";

export default function App() {
  const [source, setSource] = useState<PhotoSource | null>(null);
  const [ready, setReady] = useState(false);
  const [prepare, setPrepare] = useState<{
    progress: PrepareProgress;
    photoCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    preloadKeywordSpotter().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full w-full bg-stage text-neutral-200">
      {!ready ? (
        <LoadingScreen />
      ) : source ? (
        <GalleryView source={source} onExit={() => setSource(null)} />
      ) : (
        <div className="relative h-full w-full">
          <SetupScreen
            onStart={setSource}
            onPreparing={(progress, photoCount) => {
              if (progress) setPrepare({ progress, photoCount });
              else setPrepare(null);
            }}
          />
          {prepare && (
            <div className="absolute inset-0 z-50 bg-stage">
              <PrepareScreen progress={prepare.progress} photoCount={prepare.photoCount} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
