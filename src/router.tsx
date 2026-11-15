import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Short global stale time with no focus refetch: switching tabs or windows must not re-download
  // data. The heavy journal queries set a longer stale time (see JOURNAL_DATA_OPTIONS), and every
  // write invalidates exactly what it changed (see invalidateData).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
