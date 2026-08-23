import { describe, it, expect } from 'vitest';
import { straightLineKm } from './straightLineKm';

// The real hub coordinates, read out of the hubs table, and the distances
// PostGIS reports between them. Not typed from memory — the first draft of
// this test used approximate coordinates and failed by 340 metres, which is
// exactly the kind of near-miss that gets "fixed" by loosening the
// tolerance until it passes.
const NYABUGOGO = { lat: -1.939800, lng: 30.043500 };  // KGL-NYB
const KIMIRONKO = { lat: -1.944800, lng: 30.125600 };  // KGL-KMR
const GIKONDO   = { lat: -1.978800, lng: 30.084000 };  // KGL-GKD

describe('straightLineKm', () => {
    it('agrees with PostGIS on the routes we actually price', () => {
        // ST_Distance over geography, in km, to three decimals.
        expect(straightLineKm(NYABUGOGO, KIMIRONKO)).toBeCloseTo(9.151, 1);
        expect(straightLineKm(KIMIRONKO, GIKONDO)).toBeCloseTo(5.963, 1);
        expect(straightLineKm(NYABUGOGO, GIKONDO)).toBeCloseTo(6.237, 1);
    });

    it('holds up over the long runs, where the money is', () => {
        // Kigali to Rubavu, which the rate card prices at ~231,000 RWF.
        // The road distance is ~157km; straight line is ~93.
        const rubavu = { lat: -1.6777, lng: 29.2595 };
        expect(straightLineKm(GIKONDO, rubavu)).toBeGreaterThan(85);
        expect(straightLineKm(GIKONDO, rubavu)).toBeLessThan(100);
    });

    it('is zero for a point against itself, and never negative', () => {
        expect(straightLineKm(GIKONDO, GIKONDO)).toBe(0);
        expect(straightLineKm(KIMIRONKO, NYABUGOGO)).toBeGreaterThan(0);
    });

    it('does not care which way round the two points are given', () => {
        expect(straightLineKm(NYABUGOGO, KIMIRONKO))
            .toBeCloseTo(straightLineKm(KIMIRONKO, NYABUGOGO), 10);
    });

    it('returns a straight line, not a road distance', () => {
        // The server multiplies by road_distance_factor itself. If this ever
        // starts returning ~14.6 for Nyabugogo-Kimironko, someone has helpfully
        // applied the factor here too and every quote is 60% high.
        expect(straightLineKm(NYABUGOGO, KIMIRONKO)).toBeLessThan(10);
    });
});
