/**
 * Initial bearing along a great-circle path from `start` to `end`,
 * expressed as compass degrees [0, 360) measured clockwise from true north.
 *
 *   bearing 0   → end is due North of start
 *   bearing 90  → end is due East
 *   bearing 180 → due South
 *   bearing 270 → due West
 *
 * Standard formula (Movable Type's "Calculate distance, bearing"):
 *   θ = atan2(sin(Δλ)·cos(φ₂),
 *             cos(φ₁)·sin(φ₂) − sin(φ₁)·cos(φ₂)·cos(Δλ))
 * with φ = latitude, λ = longitude (both in radians).
 *
 * For commute-scale legs (kilometers) the great-circle answer is
 * essentially identical to the rhumb-line bearing, so we don't bother
 * with the distinction.
 */
export type LatLon = { lat: number; lon: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function bearing(start: LatLon, end: LatLon): number {
  const φ1 = toRad(start.lat);
  const φ2 = toRad(end.lat);
  const Δλ = toRad(end.lon - start.lon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}
