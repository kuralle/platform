import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useMonthlyReceipt(input: {
  workspaceId: string;
  year: number;
  month: number;
}) {
  return useQuery({
    ...$api.receipts.getMonthly.queryOptions({ input }),
    enabled: !!input.workspaceId,
  });
}
