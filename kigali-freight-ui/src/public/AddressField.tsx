// An address box that can hand back coordinates.
//
// The booking form used to take two lines of free text, and somebody in
// dispatch later turned each of them into a place on a map. That cost more
// than the typing: with no coordinates the quote has no distance, so every
// price fell to the minimum fare and read 15 to 48 per cent under what the
// job actually cost. The customer is the one person who knows which gate
// they mean, and this is where we ask them.
//
// Free text still works. Someone on a bad connection, or naming a place the
// geocoder has never heard of, types it out and books exactly as before —
// the booking arrives unplaced, priced from weight, and a dispatcher pins
// it. That is the old behaviour, kept as the floor rather than the norm.
import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type PlaceSuggestion } from './publicApi';

interface Props {
    label: string;
    placeholder: string;
    value: string;
    /** Text always; the place only when one was chosen from the list. */
    onChange: (text: string, place: PlaceSuggestion | null) => void;
    className: string;
}

export function AddressField({ label, placeholder, value, onChange, className }: Props) {
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    // Set when the customer picks, cleared the moment they type again. A
    // suggestion picked and then edited is the one way this could quietly
    // send the wrong coordinates: "Kimironko Market" pinned, amended to
    // "Kimironko Market, shop 14", and the pin still says the first one.
    // Editing is treated as abandoning the pin.
    const [chosen, setChosen] = useState<PlaceSuggestion | null>(null);
    const wrap = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const query = value.trim();
        // Two characters is not a search, it is every place in Rwanda.
        if (chosen || query.length < 3) { setSuggestions([]); return; }

        const controller = new AbortController();
        // Debounced because this is a keystroke away from a rate-limited
        // endpoint that sometimes reaches a third party.
        const timer = setTimeout(() => {
            void searchPlaces(query, controller.signal)
                .then((found) => {
                    setSuggestions(found);
                    setActive(-1);
                })
                .catch(() => {
                    // Suggestions are an enhancement — the customer can always
                    // type the address out in full — so a failed lookup leaves
                    // the field alone rather than throwing an error over
                    // something they are in the middle of typing.
                    //
                    // searchPlaces swallows its own failures today, so this
                    // catch is unreachable in production. It is here because
                    // relying on a callee's internals to stop your promise
                    // floating is how an unhandled rejection appears the
                    // moment that callee changes — and this one fires on
                    // every keystroke.
                    if (controller.signal.aborted) return;
                    setSuggestions([]);
                });
        }, 300);

        return () => { controller.abort(); clearTimeout(timer); };
    }, [value, chosen]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent) => {
            if (!wrap.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        return () => document.removeEventListener('mousedown', onPointer);
    }, [open]);

    const pick = (place: PlaceSuggestion) => {
        setChosen(place);
        setSuggestions([]);
        setOpen(false);
        onChange(place.label, place);
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (!open || suggestions.length === 0) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((at) => Math.min(suggestions.length - 1, Math.max(0, at + step)));
        } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            pick(suggestions[active]);
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };

    const listId = `places-${label.replace(/\s+/g, '-').toLowerCase()}`;
    const showing = open && suggestions.length > 0;

    return (
        <div ref={wrap} className="relative block">
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">{label}</span>
                <input
                    className={className}
                    value={value}
                    placeholder={placeholder}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showing}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    onKeyDown={onKeyDown}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => {
                        setChosen(null);
                        setOpen(true);
                        onChange(e.target.value, null);
                    }}
                />
            </label>

            {showing && (
                <ul id={listId} role="listbox"
                    className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-pub-onpaper/15 bg-pub-paper shadow-xl">
                    {suggestions.map((place, index) => (
                        // The option IS the interactive element. It was a
                        // <button> nested inside the <li role="option">,
                        // which is both non-standard — an option should not
                        // wrap a control — and a real defect: a click landing
                        // on the option rather than the button did nothing,
                        // because events bubble up and the handler was below.
                        <li
                            key={`${place.label}-${place.lat}-${place.lng}`}
                            role="option"
                            aria-selected={index === active}
                            // onMouseDown, not onClick: the input's blur fires
                            // first on a click and would close the list out
                            // from under the pointer.
                            onMouseDown={(e) => { e.preventDefault(); pick(place); }}
                            onMouseEnter={() => setActive(index)}
                            className={`cursor-pointer px-4 py-2.5 text-left text-[15px] transition-colors ${
                                index === active ? 'bg-pub-laterite text-pub-onink' : 'text-pub-onpaper hover:bg-pub-onpaper/5'
                            }`}>
                            {place.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
