"use client";
import Header from "app/components/Header";
import LeftStack from app"/components/LeftStack";
import RightPanel from "app/components/RightPanel";
import Chat from "app/components/Chat";
import DraggableModelButton from "app/components/DraggableModelButton";


export default function Page() {
  const [active, setActive] = useState("Commands");
  const [model, setModel] = useState("GPT-4o mini");
  const [openModelMenuTick, setOpenModelMenuTick] = useState(0);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header model={model} onOpenModelMenu={() => setOpenModelMenuTick((n) => n + 1)} />

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <LeftStack active={active} setActive={setActive} />
        <main className="min-h-[60vh]">
          <Chat model={model} />
        </main>
        <RightPanel active={active} />
      </div>

      <DraggableModelButton model={model} setModel={setModel} openFromHeader={openModelMenuTick} />
    </div>
  );
}
