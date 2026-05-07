import type { AuthAdapter, ResolvedSession } from "../interface.js";

const NOT_IMPLEMENTED = "not-implemented (s0 stub; lands in S3-S5)";

export class CloudflareAuthAdapter implements AuthAdapter {
  async resolveSession(_req: Request): Promise<ResolvedSession | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async issueWidgetToken(_opts: {
    workspaceId: string;
    channelEndpointId: string;
    ttlSeconds: number;
  }): Promise<string> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async verifyWidgetToken(
    _token: string,
  ): Promise<{ workspaceId: string; channelEndpointId: string } | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
