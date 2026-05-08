import { and, eq, isNull, desc } from "drizzle-orm";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { RepoDb } from "./types.js";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { WorkspaceScopeViolation } from "../errors.js";

type SchemaTables = ExtractTablesWithRelations<typeof schema>;
type ChannelTx =
  | PgTransaction<NeonHttpQueryResultHKT, typeof schema, SchemaTables>
  | PgTransaction<NodePgQueryResultHKT, typeof schema, SchemaTables>;

export interface Channel {
  id: string;
  workspaceId: string;
  channelKind: string;
  provider: string;
  displayName: string;
  status: string;
  credentialsSecretId: string | null;
  config: unknown;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface ChannelInsert {
  id: string;
  channelKind: string;
  provider: string;
  displayName: string;
  status?: string;
  credentialsSecretId?: string;
  config?: unknown;
  capabilities?: string[];
}

export interface ChannelUpdate {
  displayName?: string;
  status?: string;
  config?: unknown;
  capabilities?: string[];
}

export interface Endpoint {
  id: string;
  workspaceId: string;
  connectionId: string;
  channelKind: string;
  identifier: string;
  displayName: string | null;
  attachedAgentId: string | null;
  attachedAgentVersionId: string | null;
  routingRulesId: string | null;
  publicWebhookUrl: string | null;
  publicStreamUrl: string | null;
  metadata: unknown;
  createdAt: Date;
  releasedAt: Date | null;
}

export interface EndpointInsert {
  id: string;
  connectionId: string;
  channelKind: string;
  identifier: string;
  displayName?: string | null;
  attachedAgentId?: string | null;
  attachedAgentVersionId?: string | null;
  routingRulesId?: string | null;
  publicWebhookUrl?: string | null;
  publicStreamUrl?: string | null;
  metadata?: unknown;
}

export interface EndpointUpdate {
  displayName?: string | null;
  attachedAgentId?: string | null;
  attachedAgentVersionId?: string | null;
  routingRulesId?: string | null;
  publicWebhookUrl?: string | null;
  publicStreamUrl?: string | null;
  metadata?: unknown;
}

function toDomain(
  row: typeof schema.channelConnections.$inferSelect,
): Channel {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelKind: row.channelKind,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    credentialsSecretId: row.credentialsSecretId,
    config: row.config,
    capabilities: row.capabilities ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toEndpointDomain(
  row: typeof schema.channelEndpoints.$inferSelect,
): Endpoint {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    connectionId: row.connectionId,
    channelKind: row.channelKind,
    identifier: row.identifier,
    displayName: row.displayName,
    attachedAgentId: row.attachedAgentId,
    attachedAgentVersionId: row.attachedAgentVersionId,
    routingRulesId: row.routingRulesId,
    publicWebhookUrl: row.publicWebhookUrl,
    publicStreamUrl: row.publicStreamUrl,
    metadata: row.metadata,
    createdAt: row.createdAt,
    releasedAt: row.releasedAt,
  };
}

function cacheKey(workspaceId: string, id: string): string {
  return `repo:channel:${workspaceId}:${id}`;
}

function endpointCacheKey(workspaceId: string, id: string): string {
  return `repo:channel_endpoint:${workspaceId}:${id}`;
}

export class ChannelRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<Channel | null> {
    return this.kv.getOrCompute(cacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.channelConnections)
        .where(
          and(
            eq(schema.channelConnections.id, id),
            eq(schema.channelConnections.workspaceId, this.workspaceId),
            isNull(schema.channelConnections.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation("channel", row.id, this.workspaceId, row.workspaceId);
      }
      return toDomain(row);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Channel[]> {
    const limit = opts?.limit ?? 50;
    const rows = await this.db
      .select()
      .from(schema.channelConnections)
      .where(
        and(
          eq(schema.channelConnections.workspaceId, this.workspaceId),
          isNull(schema.channelConnections.deletedAt),
        ),
      )
      .orderBy(desc(schema.channelConnections.updatedAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async findManyByWorkspaceFiltered(opts?: {
    kind?: string;
    cursor?: string;
    limit?: number;
  }): Promise<Channel[]> {
    const limit = opts?.limit ?? 50;
    const conditions = [
      eq(schema.channelConnections.workspaceId, this.workspaceId),
      isNull(schema.channelConnections.deletedAt),
    ];
    if (opts?.kind) {
      conditions.push(eq(schema.channelConnections.channelKind, opts.kind));
    }
    const rows = await this.db
      .select()
      .from(schema.channelConnections)
      .where(and(...conditions))
      .orderBy(desc(schema.channelConnections.updatedAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async insert(input: ChannelInsert): Promise<Channel> {
    const [row] = await this.db
      .insert(schema.channelConnections)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        channelKind: input.channelKind,
        provider: input.provider,
        displayName: input.displayName,
        status: input.status ?? "connected",
        credentialsSecretId: input.credentialsSecretId ?? null,
        config: (input.config ?? {}) as Record<string, unknown>,
        capabilities: input.capabilities ?? [],
      })
      .returning();

    if (!row) throw new Error("ChannelRepository.insert: no row returned");
    await this.kv.delete(cacheKey(this.workspaceId, row.id));
    return toDomain(row);
  }

  async update(id: string, patch: ChannelUpdate): Promise<Channel> {
    const [row] = await this.db
      .update(schema.channelConnections)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.channelConnections.id, id),
          eq(schema.channelConnections.workspaceId, this.workspaceId),
        ),
      )
      .returning();

    if (!row) throw new Error("ChannelRepository.update: no row returned");

    await this.kv.delete(cacheKey(this.workspaceId, id));
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(schema.channelConnections)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.channelConnections.id, id),
          eq(schema.channelConnections.workspaceId, this.workspaceId),
        ),
      );

    await this.kv.delete(cacheKey(this.workspaceId, id));
  }

  async findEndpointById(id: string): Promise<Endpoint | null> {
    return this.kv.getOrCompute(endpointCacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.channelEndpoints)
        .where(
          and(
            eq(schema.channelEndpoints.id, id),
            eq(schema.channelEndpoints.workspaceId, this.workspaceId),
            isNull(schema.channelEndpoints.releasedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation("channel_endpoint", row.id, this.workspaceId, row.workspaceId);
      }
      return toEndpointDomain(row);
    }, { ttlSeconds: 60 });
  }

  async findEndpointsByConnection(connectionId: string): Promise<Endpoint[]> {
    const rows = await this.db
      .select()
      .from(schema.channelEndpoints)
      .where(
        and(
          eq(schema.channelEndpoints.connectionId, connectionId),
          eq(schema.channelEndpoints.workspaceId, this.workspaceId),
          isNull(schema.channelEndpoints.releasedAt),
        ),
      )
      .orderBy(desc(schema.channelEndpoints.createdAt));

    return rows.map(toEndpointDomain);
  }

  async findEndpointsByKind(kind: string): Promise<Endpoint[]> {
    const rows = await this.db
      .select()
      .from(schema.channelEndpoints)
      .where(
        and(
          eq(schema.channelEndpoints.channelKind, kind),
          eq(schema.channelEndpoints.workspaceId, this.workspaceId),
          isNull(schema.channelEndpoints.releasedAt),
        ),
      )
      .orderBy(desc(schema.channelEndpoints.createdAt));

    return rows.map(toEndpointDomain);
  }

  async insertEndpoint(input: EndpointInsert): Promise<Endpoint> {
    const [row] = await this.db
      .insert(schema.channelEndpoints)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        connectionId: input.connectionId,
        channelKind: input.channelKind,
        identifier: input.identifier,
        displayName: input.displayName ?? null,
        attachedAgentId: input.attachedAgentId ?? null,
        attachedAgentVersionId: input.attachedAgentVersionId ?? null,
        routingRulesId: input.routingRulesId ?? null,
        publicWebhookUrl: input.publicWebhookUrl ?? null,
        publicStreamUrl: input.publicStreamUrl ?? null,
        metadata: (input.metadata ?? null) as Record<string, unknown> | null,
      })
      .returning();

    if (!row) throw new Error("ChannelRepository.insertEndpoint: no row returned");
    await this.kv.delete(endpointCacheKey(this.workspaceId, row.id));
    return toEndpointDomain(row);
  }

  async softDeleteEndpoint(id: string): Promise<void> {
    await this.db
      .update(schema.channelEndpoints)
      .set({ releasedAt: new Date() })
      .where(
        and(
          eq(schema.channelEndpoints.id, id),
          eq(schema.channelEndpoints.workspaceId, this.workspaceId),
        ),
      );

    await this.kv.delete(endpointCacheKey(this.workspaceId, id));
  }

  /**
   * Transactional connect: insert a `secrets` row holding Meta credentials,
   * then insert the `channel_connections` row referencing it. The router
   * does not see drizzle-orm or `@kuralle/db/schema` directly per the
   * forbidden-import lint rule.
   */
  async connectWithCredentials(opts: {
    connectionId: string;
    displayName: string;
    provider: string;
    channelKind: string;
    capabilities: string[];
    status?: string;
    credentials: {
      secretId: string;
      name: string;
      ciphertext: Buffer;
      kmsKeyId: string;
      scope: string;
    };
  }): Promise<Channel> {
    let resultRow: typeof schema.channelConnections.$inferSelect | null = null;

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.secrets).values({
        id: opts.credentials.secretId,
        workspaceId: this.workspaceId,
        name: opts.credentials.name,
        ciphertext: opts.credentials.ciphertext,
        kmsKeyId: opts.credentials.kmsKeyId,
        scope: opts.credentials.scope,
      });

      const [row] = await tx
        .insert(schema.channelConnections)
        .values({
          id: opts.connectionId,
          workspaceId: this.workspaceId,
          channelKind: opts.channelKind,
          provider: opts.provider,
          displayName: opts.displayName,
          status: opts.status ?? "connected",
          credentialsSecretId: opts.credentials.secretId,
          config: {},
          capabilities: opts.capabilities,
        })
        .returning();
      resultRow = row ?? null;
    });

    if (!resultRow) {
      throw new Error("ChannelRepository.connectWithCredentials: no row returned");
    }
    await this.kv.delete(cacheKey(this.workspaceId, (resultRow as typeof schema.channelConnections.$inferSelect).id));
    return toDomain(resultRow);
  }

  /**
   * Transactional endpoint attach: insert the endpoint row and run a
   * provider-side-effect callback (e.g., Meta `subscribeApp`) inside the
   * same transaction. If the callback throws, the row insert rolls back.
   *
   * Mirrors the `AgentRepository.publishVersion` callback shape.
   */
  async attachEndpoint(opts: {
    endpoint: EndpointInsert;
    onAttached: (tx: ChannelTx) => Promise<void>;
  }): Promise<Endpoint> {
    let resultRow: typeof schema.channelEndpoints.$inferSelect | null = null;

    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.channelEndpoints)
        .values({
          id: opts.endpoint.id,
          workspaceId: this.workspaceId,
          connectionId: opts.endpoint.connectionId,
          channelKind: opts.endpoint.channelKind,
          identifier: opts.endpoint.identifier,
          displayName: opts.endpoint.displayName ?? null,
          attachedAgentId: opts.endpoint.attachedAgentId ?? null,
          attachedAgentVersionId: opts.endpoint.attachedAgentVersionId ?? null,
          routingRulesId: opts.endpoint.routingRulesId ?? null,
          publicWebhookUrl: opts.endpoint.publicWebhookUrl ?? null,
          publicStreamUrl: opts.endpoint.publicStreamUrl ?? null,
          metadata: (opts.endpoint.metadata ?? null) as Record<string, unknown> | null,
        })
        .returning();
      resultRow = row ?? null;

      await opts.onAttached(tx as ChannelTx);
    });

    if (!resultRow) {
      throw new Error("ChannelRepository.attachEndpoint: no row returned");
    }
    await this.kv.delete(endpointCacheKey(this.workspaceId, (resultRow as typeof schema.channelEndpoints.$inferSelect).id));
    return toEndpointDomain(resultRow);
  }

  /**
   * Transactional endpoint detach: soft-delete the endpoint and run a
   * provider-side-effect callback (e.g., Meta `unsubscribeApp`) inside
   * the same transaction. Idempotent — if `releasedAt` is already set,
   * the callback is skipped and `{ status: 'already_released' }` returns.
   *
   * The lookup bypasses `findEndpointById` so already-released rows are
   * still discoverable (the cached findById filters on `isNull(releasedAt)`).
   * The callback receives the `Endpoint` so callers can address external
   * providers by identifier without a second lookup.
   */
  async detachEndpoint(opts: {
    endpointId: string;
    onDetached: (tx: ChannelTx, endpoint: Endpoint) => Promise<void>;
  }): Promise<
    | { status: "released"; endpoint: Endpoint }
    | { status: "already_released"; endpoint: Endpoint }
    | { status: "not_found" }
  > {
    const rows = await this.db
      .select()
      .from(schema.channelEndpoints)
      .where(
        and(
          eq(schema.channelEndpoints.id, opts.endpointId),
          eq(schema.channelEndpoints.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return { status: "not_found" };
    const row = rows[0]!;
    if (row.workspaceId !== this.workspaceId) {
      throw new WorkspaceScopeViolation(
        "channel_endpoint",
        row.id,
        this.workspaceId,
        row.workspaceId,
      );
    }
    const endpoint = toEndpointDomain(row);
    if (endpoint.releasedAt) {
      return { status: "already_released", endpoint };
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.channelEndpoints)
        .set({ releasedAt: new Date() })
        .where(
          and(
            eq(schema.channelEndpoints.id, opts.endpointId),
            eq(schema.channelEndpoints.workspaceId, this.workspaceId),
          ),
        );
      await opts.onDetached(tx as ChannelTx, endpoint);
    });

    await this.kv.delete(endpointCacheKey(this.workspaceId, opts.endpointId));
    return { status: "released", endpoint };
  }
}
