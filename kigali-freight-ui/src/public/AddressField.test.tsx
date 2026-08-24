import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddressField } from './AddressField';
import { searchPlaces } from './publicApi';

vi.mock('./publicApi', () => ({ searchPlaces: vi.fn() }));
const mockedSearch = vi.mocked(searchPlaces);

const KIMIRONKO = { label: 'Kimironko Market, Gasabo', lat: -1.9448, lng: 30.1256, source: 'hint' as const };

beforeEach(() => {
    mockedSearch.mockReset().mockResolvedValue([KIMIRONKO]);
});

/** Renders the field with real state, the way the form holds it. */
function Harness({ onChange }: { onChange: (t: string, p: unknown) => void }) {
    const [value, setValue] = useState('');
    return (
        <AddressField
            label="Deliver to" placeholder="Kimironko Market, shop 14" className="field"
            value={value}
            onChange={(text, place) => { setValue(text); onChange(text, place); }}
        />
    );
}

describe('AddressField', () => {
    it('hands back coordinates when a place is chosen', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await user.type(screen.getByRole('combobox'), 'kimironko');
        await user.click(await screen.findByRole('option', { name: /Kimironko Market/ }));

        expect(onChange).toHaveBeenLastCalledWith('Kimironko Market, Gasabo', expect.objectContaining({
            lat: -1.9448, lng: 30.1256,
        }));
    });

    // The one way this could quietly send the wrong place: pin "Kimironko
    // Market", then amend the text to add a shop number. The pin would still
    // be the first one, and the customer would never know the price was
    // calculated to somewhere they had edited away from.
    it('abandons the pin the moment the text is edited', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await user.type(screen.getByRole('combobox'), 'kimironko');
        await user.click(await screen.findByRole('option', { name: /Kimironko Market/ }));
        expect(onChange).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ lat: -1.9448 }));

        await user.type(screen.getByRole('combobox'), ', shop 14');

        const [, place] = onChange.mock.calls.at(-1)!;
        expect(place, 'an edited address must not keep the old coordinates').toBeNull();
    });

    it('does not search on a fragment too short to mean anything', async () => {
        const user = userEvent.setup();
        render(<Harness onChange={vi.fn()} />);

        await user.type(screen.getByRole('combobox'), 'ki');
        await new Promise((r) => setTimeout(r, 400));

        expect(mockedSearch, 'two letters is every place in Rwanda').not.toHaveBeenCalled();
    });

    it('still lets someone book a place the geocoder has never heard of', async () => {
        mockedSearch.mockResolvedValue([]);
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await user.type(screen.getByRole('combobox'), 'behind the old petrol station');

        await waitFor(() => expect(mockedSearch).toHaveBeenCalled());
        expect(screen.queryByRole('listbox')).toBeNull();
        // Free text with no place attached is a valid booking, priced from
        // weight alone exactly as it was before any of this existed.
        expect(onChange).toHaveBeenLastCalledWith('behind the old petrol station', null);
    });

    it('survives a geocoder that is down', async () => {
        // searchPlaces swallows its own errors and returns [], so the field
        // must simply show nothing rather than take the form down.
        mockedSearch.mockResolvedValue([]);
        const user = userEvent.setup();
        render(<Harness onChange={vi.fn()} />);

        await user.type(screen.getByRole('combobox'), 'kimironko');
        await waitFor(() => expect(mockedSearch).toHaveBeenCalled());

        expect(screen.getByRole('combobox')).toHaveValue('kimironko');
    });

    // The existing test above covers a geocoder that fails politely. This one
    // covers it failing rudely, which is the case the component used to have
    // no answer for: the lookup was a floating promise, so a rejection became
    // an unhandled one — on a timer, 300ms after a keystroke, with no bearing
    // on where it would surface. searchPlaces catches its own errors today,
    // so this guards the day it stops.
    it('survives a geocoder that rejects rather than returning empty', async () => {
        mockedSearch.mockRejectedValue(new Error('geocoder exploded'));
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await user.type(screen.getByRole('combobox'), 'kimironko');
        await waitFor(() => expect(mockedSearch).toHaveBeenCalled());

        // Still typeable, no list, and the text the customer entered is intact
        // — a failed suggestion must never cost them what they wrote.
        expect(screen.getByRole('combobox')).toHaveValue('kimironko');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(onChange).toHaveBeenLastCalledWith('kimironko', null);
    });
});
