import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Dipakai di server component, server action, dan route handler.
// Otomatis membawa sesi login admin (kalau ada) lewat cookie,
// sehingga query akan tunduk ke RLS role `authenticated`.
export function createClient() {
  const cookieStore = cookies();

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
            // dipanggil dari server component (bukan action) -> abaikan,
            // middleware yang akan refresh sesi
          }
        },
      },
    }
  );
}
