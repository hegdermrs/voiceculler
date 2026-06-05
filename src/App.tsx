import { useState } from "react";
import { SetupScreen } from "./components/SetupScreen";
import { GalleryView } from "./components/GalleryView";
import type { PhotoSource } from "./types";

export default function App() {
  const [source, setSource] = useState<PhotoSource | null>(null);

  return (
    <div className="h-full w-full bg-stage text-neutral-200">
      {source ? (
        <GalleryView source={source} onExit={() => setSource(null)} />
      ) : (
        <SetupScreen onStart={setSource} />
      )}
    </div>
  );
}
