import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

async function loadAt(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return router;
}

// The root route renders a full <html> shell, which cannot be mounted inside a
// jsdom container, so these tests check route resolution rather than painted DOM.
describe("App routing", () => {
  it("resolves the index route", async () => {
    const router = await loadAt("/");
    expect(router.state.status).toBe("idle");
    expect(router.state.matches.length).toBeGreaterThan(0);
  });

  it("resolves the auth route", async () => {
    const router = await loadAt("/auth");
    expect(router.state.location.pathname).toBe("/auth");
  });

  it("falls through to the root not-found handler for unknown paths", async () => {
    const router = await loadAt("/this-route-does-not-exist");
    expect(router.state.matches.map((m) => m.routeId)).toEqual(["__root__"]);
  });
});
