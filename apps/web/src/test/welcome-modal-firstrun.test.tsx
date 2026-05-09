import { afterEach, describe, expect, it } from "vitest";

// Pure logic test of the first-run detection. The actual hook is inlined in
// _app.home.tsx; this test mirrors its decision tree so the rule is locked
// down regardless of how the home route imports it.
//
// Rule: a user whose `user.createdAt` is within 5 minutes AND who has not
// stored a `kuralle.welcomeSeen.<userId>` flag should see the welcome modal.

const FIRST_RUN_WINDOW_MS = 5 * 60 * 1000;
function welcomeStorageKey(userId: string | undefined): string | null {
  return userId ? `kuralle.welcomeSeen.${userId}` : null;
}
function shouldShowWelcomeOnMount(
  userId: string | undefined,
  userCreatedAt: string | Date | undefined,
): boolean {
  if (!userId || !userCreatedAt) return false;
  const created = new Date(userCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  if (Date.now() - created > FIRST_RUN_WINDOW_MS) return false;
  if (typeof window === "undefined") return false;
  const key = welcomeStorageKey(userId);
  return key ? window.localStorage.getItem(key) !== "1" : false;
}

const USER_ID = "u_test_123";
const KEY = `kuralle.welcomeSeen.${USER_ID}`;

afterEach(() => {
  window.localStorage.clear();
});

describe("first-run detection (CX-fix-2)", () => {
  it("returns true for fresh signup (created 1s ago, not dismissed)", () => {
    const created = new Date(Date.now() - 1_000).toISOString();
    expect(shouldShowWelcomeOnMount(USER_ID, created)).toBe(true);
  });

  it("returns false when dismissal flag is set in localStorage", () => {
    window.localStorage.setItem(KEY, "1");
    const created = new Date(Date.now() - 1_000).toISOString();
    expect(shouldShowWelcomeOnMount(USER_ID, created)).toBe(false);
  });

  it("returns false for user older than 5 minutes (first-run window expired)", () => {
    const created = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    expect(shouldShowWelcomeOnMount(USER_ID, created)).toBe(false);
  });

  it("returns false when userId is missing", () => {
    const created = new Date(Date.now() - 1_000).toISOString();
    expect(shouldShowWelcomeOnMount(undefined, created)).toBe(false);
  });

  it("returns false when userCreatedAt is missing", () => {
    expect(shouldShowWelcomeOnMount(USER_ID, undefined)).toBe(false);
  });

  it("returns false when userCreatedAt is unparseable", () => {
    expect(shouldShowWelcomeOnMount(USER_ID, "not-a-date")).toBe(false);
  });

  it("dismissal is per-user (one user's dismissal does not affect another)", () => {
    window.localStorage.setItem(`kuralle.welcomeSeen.u_other`, "1");
    const created = new Date(Date.now() - 1_000).toISOString();
    expect(shouldShowWelcomeOnMount(USER_ID, created)).toBe(true);
  });

  it("accepts Date object as createdAt (better-auth may return either)", () => {
    const created = new Date(Date.now() - 1_000);
    expect(shouldShowWelcomeOnMount(USER_ID, created)).toBe(true);
  });
});
