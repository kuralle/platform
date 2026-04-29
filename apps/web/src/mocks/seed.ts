/**
 * Seedable PRNG — same input, same output. Keeps mock fixtures deterministic
 * across reloads, which makes route snapshot tests stable.
 */
export function createRng(seed: number) {
  let state = seed >>> 0;
  return function rand() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function range(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function isoMinutesAgo(mins: number) {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

export function spark(rng: () => number, len = 14): number[] {
  const out: number[] = [];
  let v = 50 + rng() * 30;
  for (let i = 0; i < len; i++) {
    v = Math.max(5, Math.min(100, v + (rng() - 0.5) * 18));
    out.push(Math.round(v));
  }
  return out;
}
