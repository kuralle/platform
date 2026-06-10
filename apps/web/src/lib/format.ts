/** Currency formatter — every $ value flows through this so we hit Receipt Gold. */
const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CURRENCY_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DASH = "—";

export function formatUsd(n: number | null | undefined, options?: { precise?: boolean }): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return options?.precise ? CURRENCY_PRECISE.format(n) : CURRENCY.format(n);
}

const PCT = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return PCT.format(n);
}

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompact(n: number) {
  return COMPACT.format(n);
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Resolve a turn's display timestamp from createdAt or unix-epoch timestampSec. */
export function turnCreatedAtIso(turn: {
  createdAt?: unknown;
  timestampSec?: unknown;
}): string {
  if (turn.createdAt instanceof Date) {
    return turn.createdAt.toISOString();
  }
  if (typeof turn.createdAt === "string" && turn.createdAt.length > 0) {
    return turn.createdAt;
  }
  if (typeof turn.timestampSec === "number" && turn.timestampSec > 0) {
    return new Date(turn.timestampSec * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function formatRelative(iso: string | null | undefined): string {
  if (iso == null) return DASH;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
