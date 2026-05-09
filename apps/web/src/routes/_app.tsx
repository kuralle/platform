import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@kuralle/ui/components/sheet";
import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { LeftRail } from "@/components/shell/leftrail";
import { Topbar } from "@/components/shell/topbar";
import { getSession } from "@/lib/auth-client";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, setCmdSeed] = useState(0);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function bump() {
    setCmdSeed((s) => s + 1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <div className="grid h-svh grid-cols-1 md:grid-cols-[auto_1fr] grid-rows-[auto_1fr] bg-background">
      <header className="col-span-1 md:col-span-2">
        <Topbar onCommandOpen={bump} onMobileMenuToggle={() => setMobileMenuOpen(true)} />
      </header>
      <div className="hidden md:block">
        <LeftRail />
      </div>
      <main className="overflow-auto">
        <Suspense fallback={<div className="grid h-full place-items-center p-8 text-muted-foreground">Loading…</div>}>
          <Outlet />
        </Suspense>
      </main>
      <CommandPalette />

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <LeftRail />
        </SheetContent>
      </Sheet>
    </div>
  );
}
