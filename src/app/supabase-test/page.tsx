import { createClient } from "@/lib/supabase/server";

export default async function SupabaseTestPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("connection_tests")
    .select("id, message, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">Supabase Test</h1>

      <p className="mt-2 text-muted-foreground">
        Testing connection between Next.js and Supabase.
      </p>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-300 p-4 text-red-600">
          <p className="font-semibold">Connection failed</p>
          <p>{error.message}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border p-4">
          <p className="font-semibold">Connection successful</p>

          <pre className="mt-4 overflow-auto rounded bg-muted p-4 text-sm">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}