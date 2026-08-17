import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { Search } from 'lucide-react';
import { geocodeSearch, type GeocodeResult } from '../../utils/api';
import { applyPickedLocation, type PickHandlers } from './applyPickedLocation';

interface LocationSearchControlProps {
  jwtToken: string;
  pickHandlers: PickHandlers;
}

// A text-search alternative to clicking the map — selecting a result pans
// there and, if a pick-a-location mode is currently active, feeds it into
// that same flow exactly as a click would (via applyPickedLocation).
export default function LocationSearchControl({ jwtToken, pickHandlers }: LocationSearchControlProps) {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const found = await geocodeSearch(trimmed, jwtToken);
          setResults(found);
          setOpen(true);
        } catch (err) {
          console.error('Address search failed:', (err as Error).message);
        } finally {
          setSearching(false);
        }
      })();
    }, 400); // debounce — also keeps well under Nominatim's 1 req/sec proxy limit
    return () => clearTimeout(handle);
  }, [query, jwtToken]);

  const handleSelect = (result: GeocodeResult) => {
    map.flyTo([result.lat, result.lng], 15);
    applyPickedLocation(result.lat, result.lng, pickHandlers);
    setQuery(result.label);
    setOpen(false);
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-[22rem] max-w-[70vw]">
      <div className="relative">
        <Search size={13} strokeWidth={2.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search an address or place..."
          className="w-full bg-panel/95 border border-line/20 rounded-md pl-7 pr-8 py-1.5 text-data text-paper placeholder-steel/60 font-mono focus:outline-none focus:border-route shadow-lg"
        />
        {searching && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-micro text-steel font-mono">...</div>}
        {open && results.length > 0 && (
          <div className="absolute mt-1 w-full bg-panel border border-line/20 rounded-md shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                className="block w-full text-left px-3 py-1.5 text-data text-steel hover:bg-ink/60 hover:text-paper font-mono border-b border-line/10 last:border-b-0 truncate"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
