import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@kuralle/api/routers/index";

export type { AppRouter, AppRouterClient } from "@kuralle/api/routers/index";

export function createClient(opts: { baseUrl: string }): AppRouterClient {
  const link = new RPCLink({
    url: opts.baseUrl,
    fetch: (request, init) =>
      fetch(request, { ...init, credentials: "include" } as RequestInit),
  });

  return createORPCClient<AppRouterClient>(link);
}

export function createApi(client: AppRouterClient) {
  return createTanstackQueryUtils(client);
}

export type ApiUtils = ReturnType<typeof createApi>;
