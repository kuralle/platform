import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("kuralle");

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
    META_APP_ID: alchemy.env.META_APP_ID!,
    META_APP_SECRET: alchemy.secret.env.META_APP_SECRET!,
    META_SYSTEM_USER_TOKEN: alchemy.secret.env.META_SYSTEM_USER_TOKEN!,
    META_VERIFY_TOKEN: alchemy.env.META_VERIFY_TOKEN!,
    META_PHONE_NUMBER_ID: alchemy.env.META_PHONE_NUMBER_ID!,
    PUBLIC_BASE_URL: alchemy.env.PUBLIC_BASE_URL!,
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
