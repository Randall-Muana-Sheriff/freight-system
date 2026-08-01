import { describe, it, expect } from 'vitest';
import { getVehicleIcon, VEHICLE_TYPE_LEGEND } from './mapIcons.js';

describe('getVehicleIcon', () => {
    it('returns a distinct icon per known vehicle type', () => {
        const van = getVehicleIcon('Light Van', 'normal');
        const truck = getVehicleIcon('Medium Truck', 'normal');
        const hauler = getVehicleIcon('Heavy Hauler', 'normal');
        expect(van.options.html).not.toEqual(truck.options.html);
        expect(truck.options.html).not.toEqual(hauler.options.html);
    });

    it('falls back to the default glyph for a custom/unrecognized vehicle type instead of throwing', () => {
        // vehicle_types.name is dispatcher-editable free text — a 4th type
        // an admin adds later must not crash the map.
        expect(() => getVehicleIcon('Refrigerated Container', 'normal')).not.toThrow();
        const custom = getVehicleIcon('Refrigerated Container', 'normal');
        const fallback = getVehicleIcon(undefined, 'normal');
        expect(custom.options.html).toEqual(fallback.options.html);
    });

    it('varies the marker by status (color) independently of vehicle type (shape)', () => {
        const normal = getVehicleIcon('Light Van', 'normal');
        const violator = getVehicleIcon('Light Van', 'violator');
        const stale = getVehicleIcon('Light Van', 'stale');
        expect(normal.options.html).not.toEqual(violator.options.html);
        expect(normal.options.html).not.toEqual(stale.options.html);
    });

    it('memoizes icons by (type, status) rather than rebuilding on every call', () => {
        const first = getVehicleIcon('Heavy Hauler', 'violator');
        const second = getVehicleIcon('Heavy Hauler', 'violator');
        expect(first).toBe(second);
    });

    it('exposes a legend covering exactly the known vehicle types', () => {
        const names = VEHICLE_TYPE_LEGEND.map((entry) => entry.name);
        expect(names).toEqual(expect.arrayContaining(['Light Van', 'Medium Truck', 'Heavy Hauler']));
    });
});
