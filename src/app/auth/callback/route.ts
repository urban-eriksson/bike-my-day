import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PKCE callback for magic-link sign-in. Supabase redirects the user here with
 * `?code=...&next=...`. We exchange the code for a session (which sets the
 * auth cookies via the server client's setAll handler) and redirect onwards.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=missing_code`, origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, origin));
}
