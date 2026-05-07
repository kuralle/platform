import type { AuthAdapter, ResolvedSession } from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

export class NodeAuthAdapter implements AuthAdapter {
  async resolveSession(_req: Request): Promise<ResolvedSession | null> { throw new Error(NI); }
  async issueWidgetToken(_o: { workspaceId: string; channelEndpointId: string; ttlSeconds: number }): Promise<string> { throw new Error(NI); }
  async verifyWidgetToken(_t: string): Promise<{ workspaceId: string; channelEndpointId: string } | null> { throw new Error(NI); }
}
