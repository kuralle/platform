import { AsyncLocalStorage } from "node:async_hooks";

type RequestLogStore = { requestId: string };

const requestContext = new AsyncLocalStorage<RequestLogStore>();

export function runWithRequestLog<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return requestContext.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function logServerError(message: string, extra?: Record<string, unknown>): void {
  const requestId = getRequestId();
  console.error(
    JSON.stringify({
      level: "error",
      requestId: requestId ?? null,
      message,
      ...extra,
      ts: new Date().toISOString(),
    }),
  );
}

export function logServerHttp(line: string, ...rest: string[]): void {
  const requestId = getRequestId();
  console.log(
    JSON.stringify({
      level: "http",
      requestId: requestId ?? null,
      message: line,
      rest,
      ts: new Date().toISOString(),
    }),
  );
}
