import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { WorkspaceProvider } from "./contexts/workspace";
import { ApiProvider } from "./providers/api-provider";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
    return <WorkspaceProvider>{children}</WorkspaceProvider>;
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ApiProvider>
      <RouterProvider router={router} />
    </ApiProvider>,
  );
}
