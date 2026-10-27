// Geography on a sphere: aircraft fly great circles (the shortest path over the Earth),
// which is why a flight from Vienna to New York crosses Ireland and not the Azores.

const R_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in km (haversine formula). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point a fraction `f` (0…1) of the way along the great circle from a to b. */
export function intermediatePoint(a: LatLon, b: LatLon, f: number): LatLon {
  const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
  const δ = distanceKm(a, b) / R_KM;
  if (δ < 1e-9) return { ...a };
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: deg(Math.atan2(y, x)) };
}

/** Initial course from a to b in degrees (0 = north, 90 = east). */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Points along the great circle (for drawing route lines and for ETOPS checks). */
export function greatCirclePoints(a: LatLon, b: LatLon, stepKm = 100): LatLon[] {
  const n = Math.max(2, Math.ceil(distanceKm(a, b) / stepKm));
  return Array.from({ length: n + 1 }, (_, i) => intermediatePoint(a, b, i / n));
}
