import { cn } from "@kuralle/ui/lib/utils";
import { Panel as PanelPrimitive } from "@xyflow/react";
import type { ComponentProps } from "react";

export const Panel = ({ className, ...props }: ComponentProps<typeof PanelPrimitive>) => (
  <PanelPrimitive
    className={cn("m-4 overflow-hidden rounded-md border bg-card p-1 shadow-sm", className)}
    {...props}
  />
);
