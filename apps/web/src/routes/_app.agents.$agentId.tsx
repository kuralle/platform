import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { EditorContext, useEditorReducer, type EditorAction } from "@/contexts/editor";
import { useAgent, useAgentAutoSave, useAgentPublish } from "@/hooks/api/agents";
import { useWorkspace } from "@/contexts/workspace";
import { PublishConfirmationModal } from "@/components/editor/publish-confirmation-modal";
import { Button } from "@kuralle/ui/components/button";

export const Route = createFileRoute("/_app/agents/$agentId")({
  component: AgentEditorLayout,
  beforeLoad: ({ params, location }) => {
    if (location.pathname === `/agents/${params.agentId}` || location.pathname === `/agents/${params.agentId}/`) {
      throw redirect({
        to: "/agents/$agentId/behavior",
        params: { agentId: params.agentId },
      });
    }
  },
});

function AgentEditorLayout() {
  const { agentId } = Route.useParams();
  const { workspace } = useWorkspace();
  const [state, dispatch] = useEditorReducer();
  const [publishOpen, setPublishOpen] = useState(false);

  const agentQuery = useAgent({ workspaceId: workspace.id, agentId });
  const autoSave = useAgentAutoSave();
  const publish = useAgentPublish();

  // Seed the reducer when the agent data loads
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && agentQuery.data?.activeVersion?.snapshot) {
      const ir = agentQuery.data.activeVersion.snapshot as Extract<EditorAction, { type: "set" }>["ir"];
      dispatch({ type: "set", ir });
      seeded.current = true;
    }
  }, [agentQuery.data?.activeVersion?.snapshot, dispatch]);

  // Reset seed ref when agentId changes
  useEffect(() => {
    seeded.current = false;
  }, [agentId]);

  const isDirty = state.ir !== state.original;

  // Auto-save: 30s debounced timer resets on every edit.
  // No debounce library — useEffect + setTimeout per brief.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (!isDirty || agentQuery.data == null) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      autoSave.mutate({
        workspaceId: workspace.id,
        agentId,
        ir: state.ir,
      });
    }, 30_000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [state.ir, isDirty, autoSave.mutate, workspace.id, agentId, agentQuery.data]);

  // Cancel auto-save timer when publish fires
  useEffect(() => {
    if (publish.isPending && autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
  }, [publish.isPending]);

  const handlePublish = useCallback(() => {
    publish.mutate({
      workspaceId: workspace.id,
      agentId,
      ir: state.ir,
    });
    setPublishOpen(false);
  }, [publish, workspace.id, agentId, state.ir]);

  // Derive sticky bar status text
  const stickyStatus = (() => {
    if (publish.isPending) return "Publishing";
    if (publish.isSuccess) return "Live";
    if (publish.isError) return "Failed";
    if (autoSave.isPending) return "Saving…";
    if (autoSave.isSuccess && !isDirty) return "Saved";
    return "Idle";
  })();

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      <div className="flex h-[calc(100svh-3.5rem)] flex-col">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
        <div className="sticky bottom-0 left-0 right-0 z-10 flex h-16 items-center justify-between border-t bg-card px-6">
          <span
            className={`text-[12px] ${
              stickyStatus === "Live" || stickyStatus === "Saved"
                ? "text-emerald-500"
                : stickyStatus === "Failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {stickyStatus === "Publishing" && "Publishing…"}
            {stickyStatus === "Live" && "Live"}
            {stickyStatus === "Failed" && "Failed — retry?"}
            {stickyStatus === "Saving…" && "Saving…"}
            {stickyStatus === "Saved" && "All changes saved."}
            {stickyStatus === "Idle" && (isDirty ? "Unsaved changes." : "All changes saved.")}
          </span>
          <div className="flex items-center gap-2">
            {publish.isError && (
              <Button variant="ghost" size="sm" onClick={handlePublish}>
                Retry
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={!isDirty || publish.isPending}
              onClick={() => dispatch({ type: "set", ir: state.original })}
            >
              Discard
            </Button>
            <Button
              disabled={publish.isPending}
              onClick={() => setPublishOpen(true)}
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </div>
      </div>
      <PublishConfirmationModal
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onConfirm={handlePublish}
        isPublishing={publish.isPending}
      />
    </EditorContext.Provider>
  );
}
