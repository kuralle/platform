import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/agents/$agentId")({
  component: () => <Outlet />,
  beforeLoad: ({ params, location }) => {
    if (location.pathname === `/agents/${params.agentId}` || location.pathname === `/agents/${params.agentId}/`) {
      throw redirect({
        to: "/agents/$agentId/behavior",
        params: { agentId: params.agentId },
      });
    }
  },
});
