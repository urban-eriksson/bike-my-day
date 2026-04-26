/**
 * Decompose a wind vector into headwind and crosswind components relative to
 * a bike leg's direction of travel.
 *
 * Conventions (matching meteorological norms):
 *   - `legBearingDeg` is where the rider is heading, in compass degrees
 *     [0, 360), measured clockwise from true north (0 = N, 90 = E, …).
 *   - `windFromDeg` is the meteorological wind direction — the direction
 *     the wind is *blowing FROM*. Open-Meteo's `wind_direction_10m`
 *     follows this convention.
 *   - `windSpeed` is non-negative magnitude in any unit; the returned
 *     components are in the same unit.
 *
 * Returned signs:
 *   - `headwind` > 0  → resisting forward motion (you fight it).
 *   - `headwind` < 0  → tailwind (it pushes you).
 *   - `crosswind`     → signed component perpendicular to travel; positive
 *                        means wind comes from the rider's left
 *                        (i.e. blowing toward their right side); negative
 *                        means wind comes from the rider's right.
 *                        Magnitude is what matters most for "how gusty
 *                        does this feel" — keep the sign for completeness.
 *
 * Math:
 *   Let α = (windFromDeg − legBearingDeg) be the angle of the wind source
 *   relative to the direction of travel. Then:
 *     headwind  =  windSpeed · cos(α)
 *     crosswind = -windSpeed · sin(α)
 *   When α = 0 the wind is blowing straight at the rider (pure headwind).
 *   When α = 180 the wind is at their back (pure tailwind, headwind < 0).
 *   When α = 90  the wind comes from straight ahead-right of the rider's
 *   heading source-side, i.e. from the rider's *right* — by our sign
 *   convention that is a negative crosswind.
 */
export type WindComponents = {
  headwind: number;
  crosswind: number;
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function windComponents(
  legBearingDeg: number,
  windFromDeg: number,
  windSpeed: number,
): WindComponents {
  const α = toRad(windFromDeg - legBearingDeg);
  return {
    headwind: windSpeed * Math.cos(α),
    crosswind: -windSpeed * Math.sin(α),
  };
}
