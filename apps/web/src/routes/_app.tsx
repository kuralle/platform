import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { LeftRail } from "@/components/shell/leftrail";
import { Topbar } from "@/components/shell/topbar";
import { getSession } from "@/lib/auth-client";

// Auth gate for everything under `/_app/*`. better-auth + TanStack Router
// recommend `beforeLoad` on a pathless layout route — that's exactly what
// `_app` is. Source: better-auth v1.5.5 docs (Context7) — Tanstack route
// integration § "Protecting Multiple Routes with a Layout Route".
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session.data) {
      throw redirect({
        to: "/auth/sign-in",
        search: { redirect: location.href },
      });
    }
    return { user: session.data.user, session: session.data.session };
  },
  component: AppLayout,
});

function AppLayout() {
  const [, setCmdSeed] = useState(0);
  function bump() {
    setCmdSeed((s) => s + 1);
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
