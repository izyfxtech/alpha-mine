import "@testing-library/jest-dom/vitest";

// Pure logic suites (e.g. the P&L engine) opt into `@vitest-environment node`, where there is no window.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  // jsdom has no layout engine and no ResizeObserver. Like a browser, report once as soon as an element is watched.
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      queueMicrotask(() => this.callback([], this as unknown as ResizeObserver));
    }
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = TestResizeObserver;
}
