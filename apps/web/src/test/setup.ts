import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Stub `matchMedia` for next-themes / shadcn primitives that read it during
// jsdom-based tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  // @ts-expect-error — assigning a minimal stub.
  window.matchMedia = (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// ResizeObserver stub for components like WaveformPlayer.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error — install on window.
if (typeof window !== "undefined" && !window.ResizeObserver) window.ResizeObserver = ResizeObserverStub;
