import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // RUM-005: how long the client Router Cache may reuse a page it already
    // rendered before asking the server again. Every page here is dynamic, so
    // without this each revisit re-renders on the server (~400 ms, 26 queries
    // for the Dashboard). 30 s — the shortest `static` Next accepts — for both
    // kinds, so a prefetched tab is never fresher-looking than it is.
    //
    // Safe because every write is a Server Action that calls `revalidatePath`,
    // which purges this cache in the tab that wrote (pinned by
    // tests/cache/server-action-invalidation.test.ts). The trade-off, accepted
    // 2026-09-25: a change made on ANOTHER device or by another household
    // member can take up to 30 s to show in a tab that already has the page.
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },
  // HH-4 (S15): an invite link carries its token in the path, so the page
  // never hands its URL on as a referrer and never gets indexed.
  async headers() {
    return [
      {
        source: "/invite/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
