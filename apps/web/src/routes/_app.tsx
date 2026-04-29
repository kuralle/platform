import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { LeftRail } from "@/components/shell/leftrail";
import { Topbar } from "@/components/shell/topbar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const [, setCmdSeed] = useState(0);
  function bump() {
    // Force a re-mount of the CommandPalette so its internal `open` state opens.
    // The palette listens to ⌘K too, so this is just for the click affordance.
    setCmdSeed((s) => s + 1);
    // Dispatch a synthetic Cmd-K so CommandPalette toggles open via its keydown listener.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }
  return (
    <div className="grid h-svh grid-cols-[auto_1fr] grid-rows-[auto_1fr] bg-background">
      <header className="col-span-2">
        <Topbar onCommandOpen={bump} />
      </header>
      <LeftRail />
      <main className="overflow-auto">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
