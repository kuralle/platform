import { desc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { createAuth } from "@kuralle/auth";
import { session as sessionTable } from "@kuralle/db/schema";
import type { ApiDb } from "../context";

export async function signUpWithCookieHeaders(db: ApiDb): Promise<{
  userId: string;
  requestHeaders: Headers;
  session: InferSelectModel<typeof sessionTable>;
}> {
  const auth = createAuth(db);
  const email = `su_${crypto.randomUUID().slice(0, 12)}@test.kuralle`;
  const raw = await auth.api.signUpEmail({
    body: { email, password: "TestPass123!", name: "SignUp" },
    headers: new Headers({ "Content-Type": "application/json" }),
    asResponse: true,
  });

  if (!(raw instanceof Response)) {
    throw new Error("signUpEmail: expected Response (use asResponse: true)");
  }
  if (!raw.ok) {
    const text = await raw.text();
    throw new Error(`signUpEmail failed: ${raw.status} ${text}`);
  }
  const body = (await raw.json()) as { user?: { id?: string } };
  const userId = body.user?.id;
  if (!userId) {
    throw new Error("signUpEmail: missing user id");
  }

  const h = raw.headers;
  const setCookies =
    "getSetCookie" in h && typeof h.getSetCookie === "function"
      ? h.getSetCookie()
      : h.get("set-cookie")
        ? [h.get("set-cookie")!]
        : [];
  const headers = new Headers();
  for (const line of setCookies) {
    const pair = line.split(";")[0]?.trim();
    if (pair && pair.includes("better-auth.session_token=")) {
      headers.append("cookie", pair);
    }
  }
  if (!headers.has("cookie")) {
    throw new Error("signUpEmail: no session cookie in Set-Cookie");
  }

  const [sess] = await db
    .select()
    .from(sessionTable)
    .where(eq(sessionTable.userId, userId))
    .orderBy(desc(sessionTable.createdAt))
    .limit(1);

  if (!sess) {
    throw new Error("signUpEmail: no session row");
  }

  return { userId, requestHeaders: headers, session: sess };
}
