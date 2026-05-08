export const env = {
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "012345678901234567890123456789012345678901234567890",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
};
