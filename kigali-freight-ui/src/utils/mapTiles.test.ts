import { describe, it, expect } from 'vitest';
import { cartoTileUrl } from './mapTiles';

describe('cartoTileUrl', () => {
    it('uses the original dark_all host path with ?key=', () => {
        expect(cartoTileUrl('dark_all', 'cb1_test_key')).toBe(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_test_key',
        );
    });

    it('uses dark_nolabels for the kiosk wall display', () => {
        expect(cartoTileUrl('dark_nolabels', 'cb1_test_key')).toBe(
            'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=cb1_test_key',
        );
    });

    it('percent-encodes the key so a value with reserved characters stays one query param', () => {
        expect(cartoTileUrl('dark_all', 'a+b')).toBe(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=a%2Bb',
        );
    });
});
