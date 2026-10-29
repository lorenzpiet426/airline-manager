import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import {
  CABIN_TRAINING_USD,
  CABIN_TRAINING_WEEKS,
  HIRE_WEEKS,
  SEVERANCE_MONTHS,
  TYPE_RATING_USD,
  TYPE_RATING_WEEKS,
  UPGRADE_USD,
  UPGRADE_WEEKS,
} from '../../data/crews';
import { eraLevels, fractionalYearOf } from '../../data/eras';
import { stationsOf } from '../../engine/bases';
import type { CommandError } from '../../engine/commands';
import { crewNeeds, crewPayPerDayUsd, crewShortages, crewTotals, hiringQuota, type StationNeed } from '../../engine/crews';
import { priceLevelAt } from '../../engine/era';
import { convert, money } from '../../engine/money';
import type { Airline, CrewRole, GameState, StationCrew } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';

/** Readable names of the licence families (aircraft names, not translated). */
const FAMILY_NAMES: Record<string, string> = {
  A320: 'A320', B737NG: '737 NG/MAX', B737CL: '737 Classic', B737OLD: '737-100/200', A330: 'A330/A340/A350', B757: '757/767',
  B787: '787', B777: '777', B747: '747', EJET: 'E-Jet', E2: 'E-Jet E2', ERJ: 'ERJ', CRJ: 'CRJ', ATR: 'ATR', DASH8: 'Dash 8',
  DC9: 'DC-9/MD-80', F100: 'Fokker', A220: 'A220',
};
const familyName = (family: string): string => {
  if (FAMILY_NAMES[family]) return FAMILY_NAMES[family];
  try {
    return getAircraftType(family).name;
  } catch {
    return family;
  }
};

type Action = 'hire' | 'upgrade' | 'rating' | 'release';
const PAY_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.3];

/**
 * Crews (Phase 8.1): pilots per licence family and cabin crew at each station, what the timetable needs, people in
 * training, the job market, pay, and the HR department's automatic planning.
 */
export function CrewTab({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useEngineWorld();
  const [error, setError] = useState<CommandError | null>(null);
  if (!world) return null;
  const needs = crewNeeds(game, airline.id, world);
  const shortages = crewShortages(game, world, airline.id);
  const totals = crewTotals(airline);
  const costLevel = eraLevels(fractionalYearOf(toDate(game.time))).costs;
  const book = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx), false);
  const yearly = crewPayPerDayUsd(game, world, airline) * 365 * costLevel;
  const auto = airline.crew?.auto ?? true;
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
    return r.ok;
  };

  return (
    <>
      <Panel title={t('crew.title')} code="CREW">
        <p className="muted small">{t('crew.intro')}</p>
        <dl className="facts facts--compact">
          <dt>{t('crew.pilots')}</dt>
          <dd className="mono">{formatNumber(language, totals.pilots)}</dd>
          <dt>{t('crew.cabin')}</dt>
          <dd className="mono">{formatNumber(language, totals.cabin)}</dd>
          <dt>{t('crew.inTraining')}</dt>
          <dd className="mono">{formatNumber(language, totals.training)}</dd>
          <dt>{t('crew.salaries')}</dt>
          <dd className="mono">{t('crew.perYear', { amount: book(yearly) })}</dd>
        </dl>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => void run({ type: 'SetCrewAuto', airlineId: airline.id, payload: { auto: e.target.checked } })} />
          <span>{t('crew.auto')}</span>
        </label>
        <p className="muted small">{auto ? t('crew.autoOn') : t('crew.autoOff')}</p>
        {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
      </Panel>
      {stationsOf(airline).map((station) => (
        <StationPanel
          key={station}
          game={game}
          world={world}
          airline={airline}
          station={station}
          need={needs.get(station)}
          shortages={shortages}
          book={book}
          run={run}
        />
      ))}
    </>
  );
}

function StationPanel({
  game,
  world,
  airline,
  station,
  need,
  shortages,
  book,
  run,
}: {
  game: GameState;
  world: EngineWorld;
  airline: Airline;
  station: string;
  need: StationNeed | undefined;
  shortages: Map<string, number>;
  book: (usd: number) => string;
  run: (command: Parameters<typeof sendCommand>[0]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const s: StationCrew = airline.crew?.stations[station] ?? { pilots: {}, cabin: 0, pay: 1, pipeline: [] };
  const families = [...new Set([...(need ? need.pilots.keys() : []), ...Object.keys(s.pilots)])].sort();
  const quota = hiringQuota(game, world, airline, station);
  const code = world.airportById.get(station)?.iata ?? station;
  const coming = (role: CrewRole, family: string | null) => s.pipeline.filter((b) => b.role === role && b.family === family).reduce((n, b) => n + b.count, 0);
  const level = priceLevelAt(game.time);

  const [action, setAction] = useState<Action>('hire');
  const [role, setRole] = useState<CrewRole>('firstOfficer');
  const [family, setFamily] = useState<string>(families[0] ?? 'A320');
  const [from, setFrom] = useState<string>('');
  const [count, setCount] = useState(1);
  const fromFamilies = families.filter((f) => f !== family);
  const fromFamily = fromFamilies.includes(from) ? from : fromFamilies[0];
  const pilotRole = role === 'cabin' ? 'firstOfficer' : role;
  const shownRole: CrewRole = action === 'upgrade' ? 'captain' : action === 'rating' ? pilotRole : role;

  const cell = (have: number, needed: number | undefined, training: number) => (
    <td className="num mono">
      <span className={needed !== undefined && have < needed ? 'text--caution' : undefined}>{formatNumber(language, have)}</span>
      {needed !== undefined && <span className="muted"> / {formatNumber(language, needed)}</span>}
      {training > 0 && <span className="muted small"> +{training}</span>}
    </td>
  );

  const submit = () => {
    const base = { airlineId: airline.id };
    if (action === 'hire') return run({ type: 'HireCrew', ...base, payload: { station, role, family: role === 'cabin' ? null : family, count } });
    if (action === 'release') return run({ type: 'ReleaseCrew', ...base, payload: { station, role, family: role === 'cabin' ? null : family, count } });
    if (action === 'upgrade') return run({ type: 'TrainCrew', ...base, payload: { station, kind: 'upgrade', family, count } });
    if (!fromFamily) return Promise.resolve(false);
    return run({ type: 'TrainCrew', ...base, payload: { station, kind: 'rating', family, count, from: { family: fromFamily, role: pilotRole } } });
  };
  const quote =
    action === 'hire'
      ? role === 'cabin'
        ? t('crew.quoteHireCabin', { weeks: HIRE_WEEKS + CABIN_TRAINING_WEEKS, cost: book(count * CABIN_TRAINING_USD * level) })
        : t('crew.quoteHire', { weeks: HIRE_WEEKS, more: HIRE_WEEKS + TYPE_RATING_WEEKS, cost: book(TYPE_RATING_USD * level) })
      : action === 'upgrade'
        ? t('crew.quoteUpgrade', { weeks: UPGRADE_WEEKS, cost: book(count * UPGRADE_USD * level) })
        : action === 'rating'
          ? t('crew.quoteRating', { weeks: TYPE_RATING_WEEKS, cost: book(count * TYPE_RATING_USD * level) })
          : t('crew.quoteRelease', { months: SEVERANCE_MONTHS });

  return (
    <Panel title={t('crew.station', { code, kind: station === airline.hubId ? t('bases.hub') : t('bases.base') })} code="STN">
      {families.length === 0 && !need?.cabin && !s.cabin ? (
        <p className="muted small">{t('crew.noNeed')}</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('crew.family')}</th>
                <th className="num">{t('crew.captains')}</th>
                <th className="num">{t('crew.firstOfficers')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {families.map((f) => {
                const have = s.pilots[f] ?? { captains: 0, firstOfficers: 0 };
                const n = need?.pilots.get(f);
                const short = shortages.get(`${station}|${f}`) ?? 0;
                return (
                  <tr key={f}>
                    <td>{t('crew.familyName', { name: familyName(f) })}</td>
                    {cell(have.captains, n?.captains, coming('captain', f))}
                    {cell(have.firstOfficers, n?.firstOfficers, coming('firstOfficer', f))}
                    <td>{short > 0 && <span className="chip chip--warning">{t('crew.short', { percent: Math.ceil(short * 100) })}</span>}</td>
                  </tr>
                );
              })}
              <tr>
                <td>{t('crew.cabin')}</td>
                {cell(s.cabin, need?.cabin, coming('cabin', null))}
                <td />
                <td />
              </tr>
            </tbody>
          </table>
          <p className="muted small">{t('crew.tableNote')}</p>
        </div>
      )}

      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('crew.pay')}</span>
          <select className="input" value={s.pay} onChange={(e) => void run({ type: 'SetCrewPay', airlineId: airline.id, payload: { station, pay: Number(e.target.value) } })}>
            {PAY_STEPS.map((p) => (
              <option key={p} value={p}>
                {t('crew.payOption', { percent: Math.round(p * 100) })}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field__label">{t('crew.market')}</span>
          <span className="small">{t('crew.quota', { pilots: quota.pilots, captains: Math.min(quota.pilots, quota.captains), rated: Math.min(quota.pilots, quota.rated), cabin: quota.cabin })}</span>
        </div>
      </div>

      <span className="field__label">{t('crew.actions')}</span>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('crew.action')}</span>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value as Action)}>
            {(['hire', 'upgrade', 'rating', 'release'] as const).map((a) => (
              <option key={a} value={a}>
                {t(`crew.act.${a}`)}
              </option>
            ))}
          </select>
        </label>
        {action !== 'upgrade' && (
          <label className="field">
            <span className="field__label">{t('crew.role')}</span>
            <select className="input" value={action === 'rating' ? pilotRole : role} onChange={(e) => setRole(e.target.value as CrewRole)}>
              {(action === 'rating' ? (['captain', 'firstOfficer'] as const) : (['captain', 'firstOfficer', 'cabin'] as const)).map((r) => (
                <option key={r} value={r}>
                  {t(`crew.roles.${r}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {(shownRole !== 'cabin' || action === 'upgrade') && (
          <label className="field">
            <span className="field__label">{action === 'rating' ? t('crew.toFamily') : t('crew.family')}</span>
            <select className="input" value={family} onChange={(e) => setFamily(e.target.value)}>
              {(families.length ? families : ['A320']).map((f) => (
                <option key={f} value={f}>
                  {familyName(f)}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === 'rating' && (
          <label className="field">
            <span className="field__label">{t('crew.fromFamily')}</span>
            <select className="input" value={fromFamily ?? ''} onChange={(e) => setFrom(e.target.value)} disabled={!fromFamilies.length}>
              {fromFamilies.map((f) => (
                <option key={f} value={f}>
                  {familyName(f)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field__label">{t('crew.count')}</span>
          <input className="input mono" type="number" min={1} max={500} value={count} onChange={(e) => setCount(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
        </label>
      </div>
      <p className="small muted">{quote}</p>
      <button type="button" className="button button--primary" disabled={action === 'rating' && !fromFamily} onClick={() => void submit()}>
        {t(`crew.do.${action}`)}
      </button>

      {s.pipeline.length > 0 && (
        <>
          <span className="field__label">{t('crew.pipeline')}</span>
          <ul className="plain-list small">
            {[...s.pipeline]
              .sort((a, b) => a.readyAt - b.readyAt)
              .map((b, i) => (
                <li key={i}>
                  <span className="mono">{b.count}</span> {t(`crew.roles.${b.role}`)}
                  {b.family ? ` · ${familyName(b.family)}` : ''} · {t(`crew.source.${b.source}`)} ·{' '}
                  {t('crew.readyOn', { date: formatGameDate(language, toDate(b.readyAt), false) })}
                </li>
              ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
