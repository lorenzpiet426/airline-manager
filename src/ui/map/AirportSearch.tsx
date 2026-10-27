import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchAirports, type World } from '../../data/world';
import type { Airport } from '../../data/types';

/** Search box: type a code (VIE, LOWW), a city or an airport name. */
export function AirportSearch({ world, onPick }: { world: World; onPick: (airport: Airport) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchAirports(world, query), [world, query]);

  const pick = (airport: Airport) => {
    onPick(airport);
    setQuery('');
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="airport-search">
      <input
        type="search"
        className="airport-search__input"
        placeholder={t('map.searchPlaceholder')}
        aria-label={t('map.searchPlaceholder')}
        value={query}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
          else if (e.key === 'Enter' && results[active]) pick(results[active]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query.trim().length >= 2 && (
        <ul className="airport-search__results" role="listbox">
          {results.length === 0 && <li className="airport-search__empty">{t('map.noResults')}</li>}
          {results.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === active}>
              <button type="button" className="airport-search__result" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)}>
                <span className="mono airport-search__code">{a.iata ?? a.icao ?? a.id}</span>
                <span className="airport-search__name">
                  {a.name}
                  <span className="muted"> · {a.city}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
