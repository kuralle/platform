import type { Context } from "@kuralle/api/context";
import type { TestDb } from "@kuralle/core/test-utils";
import type { KvStore } from "@kuralle/platform/interface";

const DEFAULT_ENV: Context["env"] = {
  META_APP_ID: "",
  META_APP_SECRET: "",
  META_SYSTEM_USER_TOKEN: "",
  META_VERIFY_TOKEN: "",
  META_PHONE_NUMBER_ID: "",
  PUBLIC_BASE_URL: "http://localhost:3000",
};

export function makeTestContext(
  db: TestDb,
  kvStore: KvStore,
  userId: string,
  env: Partial<Context["env"]> = {},
): Context {
  return {
    auth: null,
    session: {
      user: {
        id: userId,
        name: "Test User",
        email: `${userId}@test.local`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
        systemRole: "user",
      },
      session: {
        id: `sess_${userId}`,
        token: "test-token",
        userId,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    db,
    kvStore,
    env: { ...DEFAULT_ENV, ...env },
    requestHeaders: new Headers(),
  };
}
