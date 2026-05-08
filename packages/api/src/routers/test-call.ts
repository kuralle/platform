import type { Context } from "../context";

type ProcedureLike = {
  "~orpc": {
    handler: (opts: {
      input: unknown;
      context: Context;
    }) => Promise<unknown>;
  };
};

export async function callProcedure<T>(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<T> {
  const def = (procedure as ProcedureLike)["~orpc"];
  return def.handler({ input, context }) as Promise<T>;
}
