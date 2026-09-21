import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { perfClientOptions } from "@/lib/perf/collector";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // This can happen in Server Components.
            // Middleware/auth refresh will handle cookies later.
          }
        },
      },
      // RUM-001: an empty object unless RUMBO_PERF=1, so the client is
      // unchanged in normal runs. See src/lib/perf/collector.ts.
      ...perfClientOptions(),
    }
  );
}