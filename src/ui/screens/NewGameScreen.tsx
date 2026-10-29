import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { TailFin } from '../components/TailFin';
import { AirportSearch } from '../map/AirportSearch';
import { useWorld } from '../../data/world';
import { ECB_RATES } from '../../data/currencies';
import { currencyAt, ratesPerEurAt } from '../../data/fxHistory';
import { priceLevel } from '../../data/eras';
import { FIRST_START_YEAR, REAL_AIRLINES_FROM } from '../../engine/era';
import { screenWorld, useEngineWorldAt } from '../game/useEngineWorld';
import type { Airport } from '../../data/types';
import { CAPITAL_OPTIONS_EUR, startingCapital, type CommandError } from '../../engine/commands';
import type { Scheduling, TimeMode } from '../../engine/state';
import { startNewGame, useGame } from '../../game/store';
import { countryName, formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { hrefFor } from '../navigation';
import { fromDate } from '../../engine/time';

/** Colour pairs to start from; any colour can be picked afterwards. */
const LIVERY_PRESETS: [string, string][] = [
  ['#c8102e', '#ffffff'],
  ['#0b2a5b', '#f2b705'],
  ['#00857c', '#ffffff'],
  ['#4b1e78', '#ff8a00'],
  ['#111111', '#ffd400'],
  ['#e6edf7', '#1f6feb'],
];

const CAPITAL_KEYS = ['tight', 'standard', 'funded'] as const;
/** Quick choices for the start year (any year from 1970 can be typed). */
const YEAR_PRESETS = [1970, 1980, 1990, 2000, 2010] as const;

/** Suggested designators from the name: "Danube Air" → DA / DAN. */
function suggestCodes(name: string): { iata: string; icao: string } {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
  const letters = words.join('');
  const iata = words.length >= 2 ? words[0]![0]! + words[1]![0]! : letters.slice(0, 2);
  return { iata, icao: letters.slice(0, 3) };
}

export function NewGameScreen() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const base = useWorld();
  const existingGame = useGame();
  const [startYear, setStartYear] = useState(REAL_AIRLINES_FROM);
  const historical = startYear < REAL_AIRLINES_FROM;
  const startDate = new Date(Date.UTC(startYear, 0, 1));
  // The world of the start year: its airports (Kai Tak, Riem …) and exchange rates.
  const engine = useEngineWorldAt(historical ? startYear : undefined, startDate);
  const world = base && engine ? screenWorld(base, engine) : null;

  const [name, setName] = useState('');
  const [codes, setCodes] = useState({ iata: '', icao: '' });
  const [codesEdited, setCodesEdited] = useState(false);
  const [colors, setColors] = useState<[string, string]>(LIVERY_PRESETS[0]!);
  const [hubId, setHubId] = useState('LOWW');
  const [capitalEur, setCapitalEur] = useState<number>(CAPITAL_OPTIONS_EUR[1]);
  const [timeMode, setTimeMode] = useState<TimeMode>('realtime');
  const [scheduling, setScheduling] = useState<Scheduling>('simple');
  const [error, setError] = useState<CommandError | null>(null);
  const [busy, setBusy] = useState(false);

  const hub: Airport | undefined = world?.airportById.get(hubId);
  const currency = hub ? currencyAt(hub.country, historical ? startDate : new Date()) : 'EUR';
  const fx = historical && engine?.fxHistory ? ratesPerEurAt(engine.fxHistory, startDate) : ECB_RATES;
  const shownCurrency = fx[currency] ? currency : 'USD';
  const capitalOf = (eur: number) => startingCapital(fx, eur, shownCurrency, historical ? priceLevel(startYear) : 1);
  const mode: TimeMode = historical && timeMode === 'realclock' ? 'realtime' : timeMode;
  const { iata, icao } = codesEdited ? codes : suggestCodes(name);

  const found = async () => {
    setBusy(true);
    setError(null);
    const result = await startNewGame(
      {
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        startYear,
        // A real-clock game starts now; the others on 1 January.
        ...(mode === 'realclock' ? { startTime: fromDate(new Date()) } : {}),
        timeMode: mode,
        realism: 'realistic',
        scheduling,
      },
      {
        type: 'FoundAirline',
        payload: { name, iata, icao, primary: colors[0], secondary: colors[1], hubId, capitalEur, controller: 'human' },
      },
    );
    setBusy(false);
    if (result.ok) window.location.hash = hrefFor('ops');
    else setError(result.error);
  };

  return (
    <div className="screen screen--narrow newgame">
      <h1 className="screen__title">{t('newGame.title')}</h1>
      <p className="muted">{t('newGame.intro')}</p>

      <Panel title={t('newGame.era')} code="1">
        <div className="choices choices--years" role="radiogroup" aria-label={t('newGame.era')}>
          {[...YEAR_PRESETS, REAL_AIRLINES_FROM].map((y) => (
            <button key={y} type="button" role="radio" aria-checked={startYear === y} className="choice" onClick={() => setStartYear(y)}>
              <span className="choice__value mono">{y === REAL_AIRLINES_FROM ? t('newGame.today') : y}</span>
              <span className="muted small">{t(`newGame.eraHint.${y}`)}</span>
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field__label">{t('newGame.startYear')}</span>
          <input
            className="input mono"
            type="number"
            min={FIRST_START_YEAR}
            max={REAL_AIRLINES_FROM}
            value={startYear}
            onChange={(e) => {
              const y = Math.round(Number(e.target.value));
              if (y >= FIRST_START_YEAR && y <= REAL_AIRLINES_FROM) setStartYear(y);
            }}
          />
        </label>
        <p className="muted small">{historical ? t('newGame.historicalHint') : t('newGame.todayHint')}</p>
      </Panel>

      <Panel title={t('newGame.identity')} code="2">
        <div className="identity">
          <TailFin primary={colors[0]} secondary={colors[1]} code={iata || '··'} size={96} />
          <div className="identity__fields">
            <label className="field">
              <span className="field__label">{t('newGame.name')}</span>
              <input
                className="input"
                value={name}
                maxLength={40}
                placeholder={t('newGame.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field__label">{t('newGame.iata')}</span>
                <input
                  className="input mono"
                  value={iata}
                  maxLength={2}
                  autoCapitalize="characters"
                  onChange={(e) => {
                    setCodesEdited(true);
                    setCodes({ icao, iata: e.target.value.toUpperCase() });
                  }}
                />
              </label>
              <label className="field">
                <span className="field__label">{t('newGame.icao')}</span>
                <input
                  className="input mono"
                  value={icao}
                  maxLength={3}
                  autoCapitalize="characters"
                  onChange={(e) => {
                    setCodesEdited(true);
                    setCodes({ iata, icao: e.target.value.toUpperCase() });
                  }}
                />
              </label>
            </div>
            <p className="muted small">{t('newGame.codesHint')}</p>
          </div>
        </div>
        <span className="field__label">{t('newGame.livery')}</span>
        <div className="swatches">
          {LIVERY_PRESETS.map(([a, b]) => (
            <button
              key={a + b}
              type="button"
              className="swatch"
              aria-pressed={colors[0] === a && colors[1] === b}
              aria-label={`${a} / ${b}`}
              onClick={() => setColors([a, b])}
            >
              <TailFin primary={a} secondary={b} size={36} />
            </button>
          ))}
          <label className="colorpick">
            <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} />
            <span className="small">{t('newGame.colorMain')}</span>
          </label>
          <label className="colorpick">
            <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} />
            <span className="small">{t('newGame.colorSecond')}</span>
          </label>
        </div>
      </Panel>

      <Panel title={t('newGame.hub')} code="3">
        {hub ? (
          <div className="hubcard">
            <span className="hubcard__code mono">{hub.iata ?? hub.id}</span>
            <span className="hubcard__text">
              <span>{hub.name}</span>
              <span className="muted small">
                {hub.city} · {countryName(language, hub.country, hub.country)} · {t('newGame.longestRunway')}{' '}
                {formatNumber(language, hub.longestRunwayM)} m
              </span>
            </span>
          </div>
        ) : world ? (
          <p className="notice notice--error">{t('newGame.hubNotYet', { year: startYear })}</p>
        ) : (
          <p className="muted">{t('map.loading')}</p>
        )}
        {world && <AirportSearch world={world} onPick={(a) => setHubId(a.id)} />}
        <p className="muted small">{t('newGame.hubHint', { currency: shownCurrency })}</p>
      </Panel>

      <Panel title={t('newGame.capital')} code="4">
        <div className="choices" role="radiogroup" aria-label={t('newGame.capital')}>
          {CAPITAL_OPTIONS_EUR.map((eur, i) => (
            <button
              key={eur}
              type="button"
              role="radio"
              aria-checked={capitalEur === eur}
              className="choice"
              onClick={() => setCapitalEur(eur)}
            >
              <span className="choice__value mono">{formatMoney(language, capitalOf(eur))}</span>
              <span className="choice__title">{t(`newGame.capitalOption.${CAPITAL_KEYS[i]}`)}</span>
              <span className="muted small">{t(`newGame.capitalHint.${CAPITAL_KEYS[i]}`)}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={t('newGame.mode')} code="5">
        <span className="field__label">{t('newGame.timeMode')}</span>
        <Segmented
          label={t('newGame.timeMode')}
          value={mode}
          options={[
            { value: 'realtime', label: t('ops.mode.realtime') },
            { value: 'weekly', label: t('ops.mode.weekly') },
            // The real clock means "today": not for games in the past.
            ...(historical ? [] : [{ value: 'realclock' as const, label: t('ops.mode.realclock') }]),
          ]}
          onChange={setTimeMode}
        />
        <p className="muted small">{t(`ops.modeHint.${mode}`)}</p>
        <span className="field__label">{t('newGame.scheduling')}</span>
        <Segmented
          label={t('newGame.scheduling')}
          value={scheduling}
          options={[
            { value: 'simple', label: t('timetable.modeName.simple') },
            { value: 'detailed', label: t('timetable.modeName.detailed') },
          ]}
          onChange={setScheduling}
        />
        <p className="muted small">{t(`timetable.modeHint.${scheduling}`)}</p>
        <dl className="facts">
          <dt>{t('newGame.scenario')}</dt>
          <dd>{t('newGame.scenarioStartup')}</dd>
          <dt>{t('newGame.startDate')}</dt>
          <dd>{mode === 'realclock' ? t('newGame.startDateNow') : formatGameDate(language, startDate, false)}</dd>
          <dt>{t('newGame.competitors')}</dt>
          <dd>{historical ? t('newGame.competitorsModelled') : t('newGame.competitorsReal')}</dd>
          <dt>{t('newGame.realism')}</dt>
          <dd>{t('newGame.realismRealistic')}</dd>
        </dl>
        <p className="muted small">{t('newGame.laterHint')}</p>
      </Panel>

      {existingGame && <p className="notice notice--error">{t('newGame.replaceWarning')}</p>}
      {error && <p className="form-error text--warning">{t(`errors.${error}`)}</p>}
      <div className="newgame__actions">
        <a href={hrefFor('ops')} className="button">
          {t('common.cancel')}
        </a>
        <button type="button" className="button button--primary" disabled={busy || !hub} onClick={() => void found()}>
          {t('newGame.found')}
        </button>
      </div>
    </div>
  );
}
