import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { Db } from "@kuralle/db";
import { secrets } from "@kuralle/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { AgentConfigOpts } from "./agent-config.js";

type LanguageModel = ReturnType<AgentConfigOpts["resolveModel"]>;

type ConcreteLanguageModel = LanguageModel & {
  doGenerate: (options: unknown) => Promise<unknown>;
  doStream: (options: unknown) => Promise<unknown>;
};

export const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
};

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export interface ModelResolverEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

export class ModelResolutionError extends Error {
  readonly provider: string;
  readonly workspaceId: string;

  constructor(provider: string, workspaceId: string) {
    const display = PROVIDER_DISPLAY[provider.toLowerCase()] ?? provider;
    super(`No ${display} key configured for this workspace`);
    this.name = "ModelResolutionError";
    this.provider = provider;
    this.workspaceId = workspaceId;
  }
}

export function decodeSecretPlaintext(row: typeof secrets.$inferSelect): string | null {
  if (row.kmsKeyId !== "none") {
    return null;
  }
  const raw = row.ciphertext.toString("utf8");
  try {
    const parsed = JSON.parse(raw) as { apiKey?: string; key?: string; token?: string };
    return parsed.apiKey ?? parsed.key ?? parsed.token ?? raw;
  } catch {
    return raw;
  }
}

export async function resolveProviderApiKey(
  db: Db,
  env: ModelResolverEnv,
  workspaceId: string,
  provider: string,
): Promise<string> {
  const normalized = provider.toLowerCase();
  const candidateNames = PROVIDER_ENV_KEYS[normalized] ?? [
    `${normalized.toUpperCase()}_API_KEY`,
  ];

  for (const name of candidateNames) {
    const rows = await db
      .select()
      .from(secrets)
      .where(
        and(
          eq(secrets.workspaceId, workspaceId),
          eq(secrets.name, name),
          isNull(secrets.agentId),
        ),
      )
      .limit(1);
    const decoded = rows[0] ? decodeSecretPlaintext(rows[0]) : null;
    if (decoded) return decoded;
  }

  const envRecord = env as Record<string, string | undefined>;
  for (const name of candidateNames) {
    const fromEnv = envRecord[name];
    if (typeof fromEnv === "string" && fromEnv.length > 0) {
      return fromEnv;
    }
  }

  throw new ModelResolutionError(provider, workspaceId);
}

export function instantiateProviderModel(
  provider: string,
  modelName: string,
  apiKey: string,
): LanguageModel {
  switch (provider.toLowerCase()) {
    case "openai":
      return createOpenAI({ apiKey })(modelName);
    case "anthropic":
      return createAnthropic({ apiKey })(modelName);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelName);
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

function createLazyProviderModel(
  env: ModelResolverEnv,
  getWorkspaceId: () => string | null,
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  provider: string,
  modelName: string,
): LanguageModel {
  let resolved: ConcreteLanguageModel | null = null;

  async function getModel(): Promise<ConcreteLanguageModel> {
    if (resolved) return resolved;
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      throw new Error(
        `resolveModel called before workspace context was bound (provider=${provider})`,
      );
    }
    const apiKey = await withDb((db) =>
      resolveProviderApiKey(db, env, workspaceId, provider),
    );
    resolved = instantiateProviderModel(
      provider,
      modelName,
      apiKey,
    ) as ConcreteLanguageModel;
    return resolved;
  }

  return {
    specificationVersion: "v2",
    provider,
    modelId: modelName,
    supportedUrls: {},
    doGenerate: async (options) => (await getModel()).doGenerate(options),
    doStream: async (options) => (await getModel()).doStream(options),
  } as LanguageModel;
}

export interface WorkspaceModelResolverOpts {
  db: Db;
  env: ModelResolverEnv;
  workspaceId: string;
  override?: AgentConfigOpts["resolveModel"];
}

export function createWorkspaceModelResolver(
  opts: WorkspaceModelResolverOpts,
): AgentConfigOpts["resolveModel"] {
  if (opts.override) {
    return opts.override;
  }
  return (provider, modelName) =>
    createLazyProviderModel(
      opts.env,
      () => opts.workspaceId,
      async (fn) => fn(opts.db),
      provider,
      modelName,
    );
}

export interface LazyWorkspaceModelResolverOpts {
  env: ModelResolverEnv;
  getWorkspaceId: () => string | null;
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
  override?: AgentConfigOpts["resolveModel"];
}

export function createLazyWorkspaceModelResolver(
  opts: LazyWorkspaceModelResolverOpts,
): AgentConfigOpts["resolveModel"] {
  if (opts.override) {
    return opts.override;
  }
  return (provider, modelName) =>
    createLazyProviderModel(opts.env, opts.getWorkspaceId, opts.withDb, provider, modelName);
}
