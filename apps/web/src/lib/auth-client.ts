import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// Server-side better-auth config (packages/auth/src/create-kuralle-auth.ts)
// enables emailAndPassword + the organization plugin. The client must mirror
// the same plugin so `authClient.useSession()` returns the org-aware session
// shape (with `activeOrganizationId`).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL,
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
