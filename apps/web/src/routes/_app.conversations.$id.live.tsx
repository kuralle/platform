import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Radio } from "lucide-react";

export const Route = createFileRoute("/_app/conversations/$id/live")({
  component: LiveSupervisorRoute,
});

function LiveSupervisorRoute() {
  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-rows-[auto_1fr] bg-background text-foreground">
      <div className="border-b border-border bg-background px-6 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Link to="/conversations" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft size={12} /> Conversations
          </Link>
          <span>/</span>
          <span>Live console</span>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6">
        <Alert className="border-primary/20 bg-primary/5">
          <Radio />
          <AlertTitle>Live console — launching in Sprint 4</AlertTitle>
          <AlertDescription>
            Real-time transcript, intervene, supervisor whisper, and barge-in are wired in the
            voice runtime. Track progress in the{" "}
            <a href="#" className="underline underline-offset-2 hover:text-primary">
              Sprint 4 plan
            </a>.
          </AlertDescription>
        </Alert>

        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p className="text-[14px]">No live data yet — this is a Sprint&nbsp;4 surface.</p>
        </div>
      </div>
    </div>
  );
}
