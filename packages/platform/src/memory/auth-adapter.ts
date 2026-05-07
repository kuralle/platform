import type { AuthAdapter, ResolvedSession } from "../interface.js";

interface StoredSession {
  session: ResolvedSession;
  token?: string;
}

export class MemoryAuthAdapter implements AuthAdapter {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly tokens = new Map<string, { workspaceId: string; channelEndpointId: string }>();

  addSession(token: string, session: ResolvedSession): void {
    this.sessions.set(token, { session, token });
  }

  async resolveSession(req: Request): Promise<ResolvedSession | null> {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return null;
    const sessionToken = match[1]!;
    const stored = this.sessions.get(sessionToken);
    return stored ? stored.session : null;
  }

  async issueWidgetToken(opts: {
    workspaceId: string;
    channelEndpointId: string;
    ttlSeconds: number;
  }): Promise<string> {
    const payload = JSON.stringify({
      workspaceId: opts.workspaceId,
      channelEndpointId: opts.channelEndpointId,
      exp: Date.now() + opts.ttlSeconds * 1000,
    });
    const token = btoa(payload);
    this.tokens.set(token, {
      workspaceId: opts.workspaceId,
      channelEndpointId: opts.channelEndpointId,
    });
    return token;
  }

  async verifyWidgetToken(
    token: string,
  ): Promise<{ workspaceId: string; channelEndpointId: string } | null> {
    try {
      const payload = JSON.parse(atob(token)) as {
        workspaceId: string;
        channelEndpointId: string;
        exp: number;
      };
      if (Date.now() > payload.exp) return null;
      return {
        workspaceId: payload.workspaceId,
        channelEndpointId: payload.channelEndpointId,
      };
    } catch {
      return null;
    }
  }
}
