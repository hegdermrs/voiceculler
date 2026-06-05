import { useEffect, useState } from "react";
import { SetupScreen } from "./components/SetupScreen";
import { GalleryView } from "./components/GalleryView";
import { LoadingScreen } from "./components/LoadingScreen";
import { preloadKeywordSpotter } from "./voice/useKeywordSpotter";
import type { PhotoSource } from "./types";

export default function App() {
  const [source, setSource] = useState<PhotoSource | null>(null);
  const [ready, setReady] = useState(false);

  // Preload the on-device voice model before showing the app, so voice is
  // instant once the user starts. The model is vendored and fetched locally.
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
        <SetupScreen onStart={setSource} />
      )}
    </div>
  );
}
