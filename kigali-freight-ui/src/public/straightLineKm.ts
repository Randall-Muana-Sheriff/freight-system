// The straight-line distance between two points, in kilometres.
//
// This exists so the booking form can price a job properly. Without a
// distance the server has nothing to work with and every quote falls to the
// minimum fare — which is why the form used to show 15,000 RWF for a 50kg
// parcel and a 800kg pallet alike, both of them 35-48% under what the job
// actually costs.
//
// STRAIGHT LINE, NOT ROAD DISTANCE. The server multiplies by its own
// road_distance_factor (1.6 at the time of writing) to turn this into a
// road figure. Passing an already-road distance would have it multiplied a
// second time and quote roughly 60% too much — the same class of error as
// the old minimum-fare problem, just in the other direction and harder to
// notice, because an overcharge looks like a plausible price.
export function straightLineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
): number {
    const EARTH_RADIUS_KM = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    // Haversine rather than equirectangular. Kigali is small enough that the
    // cheaper approximation would agree to within metres, but the same rate
    // card prices Kigali to Rubavu at 157km, and the error grows with
    // distance — so the long runs, where the money is, are the ones the
    // shortcut would get wrong.
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
