import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useOnboardingState(input: { workspaceId: string }) {
  return useQuery({
    ...$api.onboarding.get.queryOptions({ input }),
  });
}

export function useAdvanceOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.onboarding.advance.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.onboarding.get.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.onboarding.complete.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.onboarding.get.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}
