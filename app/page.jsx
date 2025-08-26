"use client";

import { useState } from "react";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";

export default function Page() {
  const [model, setModel] = useState("Gemini 1.5 Pro");

  // Inspector state
  const [active, setActive] = useState(false);
  const [activeContext, setActiveContext] = useState(null);

  const handleActivate = (ctx) => {
    setActive(true);
    setActiveContext(ctx);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <LeftStack onActivate={handleActivate} />
        <main className="min-h-[60vh]">
          <Chat model={model} />
        </main>
        <RightPanel active={active} activeContext={activeContext} />
      </div>

    </div>
  );
}
