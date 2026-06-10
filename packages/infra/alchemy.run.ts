import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { DurableObjectNamespace, Hyperdrive, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("kuralle");

// Cloudflare-edge connection pooling + caching in front of Neon. The worker
// and the MessagingDO prefer this binding (pg over TCP); local dev falls back
// to the direct neon-serverless driver.
export const hyperdrive = await Hyperdrive("db-hyperdrive", {
  origin: alchemy.secret.env.DATABASE_URL!,
});

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: alchemy.env.VITE_SERVER_URL!,
  },
});

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  bindings: {
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    // Meta sandbox credentials are optional until provided — WhatsApp ingress
    // is feature-gated (webhook verification fails closed without them).
    META_APP_ID: alchemy.env.META_APP_ID ?? "",
    META_APP_SECRET: alchemy.secret.env.META_APP_SECRET ?? alchemy.secret(""),
    META_SYSTEM_USER_TOKEN: alchemy.secret.env.META_SYSTEM_USER_TOKEN ?? alchemy.secret(""),
    META_VERIFY_TOKEN: alchemy.env.META_VERIFY_TOKEN ?? "",
    META_PHONE_NUMBER_ID: alchemy.env.META_PHONE_NUMBER_ID ?? "",
    // Set to the server worker URL after the first deploy (printed below).
    PUBLIC_BASE_URL: alchemy.env.PUBLIC_BASE_URL ?? "",
    OPENAI_API_KEY: alchemy.secret.env.OPENAI_API_KEY ?? alchemy.secret(""),
    HYPERDRIVE: hyperdrive,
    MESSAGING_DO: DurableObjectNamespace("messaging-do", {
      className: "MessagingDO",
      sqlite: true,
    }),
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
