import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** Mutable mock router state shared with tests. */
export const navigation = {
  pathname: "/",
  push: vi.fn((href: string) => {
    navigation.pathname = href;
  }),
};

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

/** Controls whether the troubleshooter's embedded studio is shown (wide screens). */
export const media = { wide: false };

// Node-environment suites (e.g. the photo pipeline) have no window.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: media.wide,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

afterEach(() => {
  cleanup();
  // Sessions persist in sessionStorage; never let one test's session leak into the next.
  if (typeof window !== "undefined") window.sessionStorage.clear();
  navigation.pathname = "/";
  navigation.push.mockClear();
  media.wide = false;
});
