import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Fresh client per request — never share/cache across requests. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies can't be set here.
            // Session refresh is handled by proxy.ts instead.
          }
        },
      },
    }
  );
}
