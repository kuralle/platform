import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useHealthCheck() {
  return useQuery({
    ...$api.healthCheck.queryOptions(),
    refetchInterval: 30_000,
  });
}
