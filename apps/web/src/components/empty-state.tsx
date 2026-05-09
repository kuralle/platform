import { Button } from "@kuralle/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@kuralle/ui/components/empty";
import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

type To = ComponentProps<typeof Link>["to"];

interface Action {
  label: string;
  onClick?: () => void;
  to?: To;
  href?: string;
}

interface EmptyStateProps {
  title: string;
  description: string;
  primaryAction: Action;
  secondaryAction?: Action;
  icon?: ReactNode;
}

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  icon,
}: EmptyStateProps) {
  return (
    <Empty className="mx-auto max-w-[640px] py-16">
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle className="text-2xl font-display">{title}</EmptyTitle>
        <EmptyDescription className="text-sm">{description}</EmptyDescription>
      </EmptyHeader>
      <div className="flex items-center gap-2">
        <ActionButton action={primaryAction} />
        {secondaryAction && (
          <ActionButton action={secondaryAction} variant="ghost" />
        )}
      </div>
    </Empty>
  );
}

function ActionButton({
  action,
  variant = "default",
}: {
  action: Action;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  if (action.to) {
    return (
      <Button
        size="lg"
        variant={variant}
        nativeButton={false}
        render={<Link to={action.to} />}
      >
        {action.label}
      </Button>
    );
  }
  if (action.href) {
    return (
      <Button
        size="lg"
        variant={variant}
        nativeButton={false}
        render={<a href={action.href} target="_blank" rel="noopener noreferrer" />}
      >
        {action.label}
      </Button>
    );
  }
  return (
    <Button size="lg" variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
