export interface AdapterLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

export const consoleAdapterLogger: AdapterLogger = {
  warn(message, meta) {
    if (meta) {
      console.warn(message, meta);
    } else {
      console.warn(message);
    }
  },
};

export function noopAdapterLogger(): AdapterLogger {
  return { warn: () => {} };
}
