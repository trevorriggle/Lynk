"use client";

import { useState } from "react";
import Header from "./components/Header";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";

export default function Page() {
  const [active, setActive] = useState("Context Files");
  const [model, setModel] = useState("Gemini 1.5 Pro");
  const [openModelMenuTick, setOpenModelMenuTick] = useState(0);

  // Right panel state (UI only for now)
  const [panelTitle, setPanelTitle] = useState("Context Files");
  const [panelSummary] = useState("");
  const [panelState] = useState("Inactive");

  function handleLeftSelect(x) {
    setActive(x);
    setPanelTitle(x);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header model={model} onOpenModelMenu={() => setOpenModelMenuTick((n) => n + 1)} />

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <LeftStack active={active} setActive={handleLeftSelect} />
        <main className="min-h-[60vh]">
          <Chat model={model} />
        </main>
        <RightPanel panelTitle={panelTitle} panelSummary={panelSummary} state={panelState} />
      </div>

      <DraggableModelButton model={model} setModel={setModel} openFromHeader={openModelMenuTick} />
    </div>
  );
}
