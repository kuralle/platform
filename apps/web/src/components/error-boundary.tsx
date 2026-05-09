import { Button } from "@kuralle/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@kuralle/ui/components/empty";
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";

export function ErrorBoundaryFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const isDev = import.meta.env.DEV;

  return (
    <Empty className="mx-auto max-w-[640px] px-4 py-16">
      <EmptyHeader>
        <EmptyTitle className="text-2xl font-display">
          Something went wrong on this page.
        </EmptyTitle>
        <EmptyDescription className="text-sm">
          Try reloading this page, or go back to your home dashboard to keep working.
        </EmptyDescription>
      </EmptyHeader>
      {isDev ? (
        <details className="mt-4 w-full rounded-md border border-border bg-muted/40 p-3 text-left text-xs">
          <summary className="cursor-pointer font-medium">Technical details</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono">
            {error instanceof Error ? error.message : String(error)}
          </pre>
          {error instanceof Error && error.stack ? (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono opacity-80">
              {error.stack}
            </pre>
          ) : null}
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="lg"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Reload
        </Button>
        <Button size="lg" variant="ghost" nativeButton={false} render={<Link to="/home" />}>
          Go home
        </Button>
      </div>
    </Empty>
  );
}
