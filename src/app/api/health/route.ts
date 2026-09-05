import { NextResponse } from "next/server";

/**
 * Liveness only: has this process finished booting and can it render a route?
 *
 * Deliberately touches nothing external. `scripts/deploy.sh` polls this to
 * decide whether a release came up, and the box shares a t3.micro with two
 * other apps — a health check that talked to Supabase would fail the deploy
 * (and, with a restart loop, thrash the neighbours) whenever the database had
 * a blip, which is exactly when we least want to be redeploying.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
