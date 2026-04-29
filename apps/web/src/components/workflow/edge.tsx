import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  getSimpleBezierPath,
  type InternalNode,
  type Node,
  Position,
  useInternalNode,
} from "@xyflow/react";

/**
 * AI Elements `workflow` edges — `Edge.Animated` paints a moving dot along a
 * bezier path; `Edge.Temporary` renders a dashed preview line.
 * Source: github.com/vercel/ai-elements (packages/elements/src/edge.tsx).
 */

const Temporary = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps) => {
  const [edgePath] = getSimpleBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });

  return (
    <BaseEdge
      className="stroke-1 stroke-ring"
      id={id}
      path={edgePath}
      style={{ strokeDasharray: "5, 5" }}
    />
  );
};

const handleCoords = (node: InternalNode<Node>, position: Position) => {
  const handleType = position === Position.Left ? "target" : "source";
  const handle = node.internals.handleBounds?.[handleType]?.find((h) => h.position === position);
  if (!handle) return [0, 0] as const;
  let offsetX = handle.width / 2;
  let offsetY = handle.height / 2;
  if (position === Position.Left) offsetX = 0;
  if (position === Position.Right) offsetX = handle.width;
  if (position === Position.Top) offsetY = 0;
  if (position === Position.Bottom) offsetY = handle.height;
  return [
    node.internals.positionAbsolute.x + handle.x + offsetX,
    node.internals.positionAbsolute.y + handle.y + offsetY,
  ] as const;
};

const Animated = ({ id, source, target, markerEnd, style }: EdgeProps) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const [sx, sy] = handleCoords(sourceNode, Position.Right);
  const [tx, ty] = handleCoords(targetNode, Position.Left);
  const [edgePath] = getBezierPath({
    sourcePosition: Position.Right,
    sourceX: sx,
    sourceY: sy,
    targetPosition: Position.Left,
    targetX: tx,
    targetY: ty,
  });

  return (
    <>
      <BaseEdge id={id} markerEnd={markerEnd} path={edgePath} style={style} />
      <circle fill="var(--primary)" r="4">
        <animateMotion dur="2.5s" path={edgePath} repeatCount="indefinite" />
      </circle>
    </>
  );
};

export const Edge = { Animated, Temporary };
