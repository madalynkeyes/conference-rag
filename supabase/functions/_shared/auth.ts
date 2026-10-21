// Manual auth check. We deploy with --no-verify-jwt (see the course's auth note),
// so each function verifies the logged-in user itself.
import { createClient, type User } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./cors.ts";

// Returns the logged-in user, or a 401 Response if the request isn't authenticated.
export async function requireAuth(req: Request): Promise<User | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  // SUPABASE_URL and SUPABASE_ANON_KEY are provided to Edge Functions automatically.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Ask Supabase Auth who this token belongs to (fails for anon key / expired tokens).
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }
  return data.user;
}
