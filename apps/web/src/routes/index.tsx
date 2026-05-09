import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "@/lib/auth-client";

// `/` checks the session and routes accordingly:
//   - authed   → /home (which still passes through `_app`'s guard)
//   - unauthed → /auth/sign-in directly (skips a redundant `_app` bounce)
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.data) {
      throw redirect({ to: "/auth/sign-in" });
    }
    throw redirect({ to: "/home", search: { welcome: false } });
  },
});
