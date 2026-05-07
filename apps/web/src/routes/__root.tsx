import { Toaster } from "@kuralle/ui/components/sonner";
import { TooltipProvider } from "@kuralle/ui/components/tooltip";
import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { WorkspaceProvider } from "@/contexts/workspace";

import "../index.css";

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    meta: [
      { title: "Kuralle" },
      { name: "description", content: "Kuralle — operator-grade voice AI + unified inbox." },
    ],
    links: [{ rel: "icon", href: "/favicon.ico" }],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
        storageKey="kuralle-theme"
      >
        <TooltipProvider delay={150}>
          <Outlet />
          <Toaster richColors position="bottom-center" />
        </TooltipProvider>
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}

export function RootProviders({ children }: { children: React.ReactNode }) {
  // Wraps the app at main.tsx. Keeps __root focused on theme + tooltip + outlet.
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
