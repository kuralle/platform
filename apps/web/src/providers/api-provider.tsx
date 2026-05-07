import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { createApi, createClient } from "@kuralle/api-client";
import type { ApiUtils } from "@kuralle/api-client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: true,
    },
  },
});

const baseUrl = `${import.meta.env.VITE_SERVER_URL}/rpc`;
const client = createClient({ baseUrl });
export const $api: ApiUtils = createApi(client);

export function ApiProvider({ children }: { children: ReactNode }) {
  const [qc] = useState(() => queryClient);

  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
