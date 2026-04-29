import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@kuralle/ui/components/card";
import { cn } from "@kuralle/ui/lib/utils";
import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";

/**
 * AI Elements `workflow` primitives — `Node`, `NodeHeader`, `NodeTitle`,
 * `NodeDescription`, `NodeContent`, `NodeFooter`, `NodeAction`.
 *
 * Source: github.com/vercel/ai-elements (packages/elements/src/node.tsx).
 */

export type NodeProps = ComponentProps<typeof Card> & {
  handles: { target: boolean; source: boolean };
};

export const Node = ({ handles, className, ...props }: NodeProps) => (
  <Card
    className={cn(
      "node-container relative size-full h-auto w-[260px] gap-0 rounded-md p-0 shadow-sm",
      className,
    )}
    {...props}
  >
    {handles.target && <Handle position={Position.Left} type="target" />}
    {handles.source && <Handle position={Position.Right} type="source" />}
    {props.children}
  </Card>
);

export type NodeHeaderProps = ComponentProps<typeof CardHeader>;
export const NodeHeader = ({ className, ...props }: NodeHeaderProps) => (
  <CardHeader className={cn("gap-0.5 rounded-t-md border-b bg-muted p-3", className)} {...props} />
);

export const NodeTitle = (props: ComponentProps<typeof CardTitle>) => <CardTitle {...props} />;
export const NodeDescription = (props: ComponentProps<typeof CardDescription>) => <CardDescription {...props} />;
export const NodeAction = (props: ComponentProps<typeof CardAction>) => <CardAction {...props} />;

export const NodeContent = ({ className, ...props }: ComponentProps<typeof CardContent>) => (
  <CardContent className={cn("p-3", className)} {...props} />
);

export const NodeFooter = ({ className, ...props }: ComponentProps<typeof CardFooter>) => (
  <CardFooter className={cn("rounded-b-md border-t bg-muted p-3", className)} {...props} />
);
