/** Static newsfeed shown on the Home page (Blog / YouTube tabs). Edit this list to publish new items. */
export interface FeedItem { date: string; title: string; by: string; url: string }
export const NEWSFEED: { blog: FeedItem[]; youtube: FeedItem[] } = {
  blog: [
    { date: "2025-02-21", title: "New: Advanced Graph Tables & Performance Ratios", by: "Rolf", url: "#" },
    { date: "2025-02-17", title: "The Ultimate Guide to the 10 Most Important Trading Metrics", by: "Rolf", url: "#" },
    { date: "2025-02-10", title: "How to Journal a Losing Streak Without Tilting", by: "Rolf", url: "#" },
    { date: "2025-02-03", title: "Setting Up Custom Statistics That Actually Matter", by: "Rolf", url: "#" },
  ],
  youtube: [
    { date: "2025-02-19", title: "Feature Tour: Journal, Analytics & Chart Lab", by: "Rolf", url: "#" },
    { date: "2025-02-12", title: "Exit Analysis Explained in 10 Minutes", by: "Rolf", url: "#" },
    { date: "2025-02-05", title: "Backtesting Journal Workflow", by: "Rolf", url: "#" },
  ],
};
