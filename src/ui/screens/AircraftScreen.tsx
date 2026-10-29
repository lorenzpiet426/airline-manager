import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AIRCRAFT_TYPES, isFreighter, isInService, listPriceUsd, PRICE_YEAR, type AircraftCategory, type AircraftType } from '../../data/aircraft';
import { orderBlock } from '../../data/factory';
import { currentLivery, defaultLivery } from '../../engine/livery';
import { money } from '../../engine/money';
import { yearOf } from '../../engine/time';
import { formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { usePlayer } from '../game/usePlayer';
import { AircraftSide } from '../livery/AircraftSide';
import { hrefFor, useRouteParam } from '../navigation';

// The aircraft encyclopedia (Phase 4.4): every type in the database, today's and historical, with its specs, side view
// and a timeline of when it was built and flown. Historical types can be flown in games starting in their years (Phase 5.3).

type Category = 'all' | AircraftCategory;
type Status = 'all' | 'flying' | 'retired';
const CATEGORIES: Category[] = ['all', 'turboprop', 'regional', 'narrowbody', 'widebody'];
const DECADES = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
/** The timeline's years. */
const SPAN = [1930, 2035] as const;

const NEUTRAL = { ...defaultLivery({ primary: '#1f6feb', secondary: '#ffffff' }, '', ''), logo: { kind: 'none' as const }, titles: null };

const normalise = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A type's life on a 1930–2035 timeline: production (solid) and service (thin line). */
function Timeline({ type, now, large = false }: { type: AircraftType; now: number; large?: boolean }) {
  const { t } = useTranslation();
  const x = (year: number) => ((Math.min(SPAN[1], Math.max(SPAN[0], year)) - SPAN[0]) / (SPAN[1] - SPAN[0])) * 100;
  const end = type.retired ?? now;
  const builtEnd = type.built[1] ?? now;
  const h = large ? 28 : 12;
  return (
    <svg
      viewBox={`0 0 100 ${h}`}
      preserveAspectRatio="none"
      className={`type-timeline ${large ? 'type-timeline--large' : ''}`}
      role="img"
      aria-label={t('types.timelineLabel', { from: type.eis, to: type.retired ?? t('types.today'), builtFrom: type.built[0], builtTo: type.built[1] ?? t('types.today') })}
    >
      {large &&
        DECADES.map((d) => (
          <line key={d} x1={x(d)} x2={x(d)} y1={0} y2={h} className="type-timeline__grid" vectorEffect="non-scaling-stroke" />
        ))}
      <line x1={x(type.eis)} x2={x(end)} y1={h / 2} y2={h / 2} className={`type-timeline__service ${type.retired ? 'type-timeline__service--retired' : ''}`} vectorEffect="non-scaling-stroke" />
      <rect x={x(type.built[0])} y={h / 2 - (large ? 5 : 3)} width={Math.max(0.6, x(builtEnd) - x(type.built[0]))} height={large ? 10 : 6} rx={1} className="type-timeline__built" />
      <line x1={x(now)} x2={x(now)} y1={0} y2={h} className="type-timeline__now" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AircraftScreen() {
  const id = useRouteParam('id');
  const type = id ? AIRCRAFT_TYPES.find((x) => x.id === id) : undefined;
  return type ? <TypeDetail type={type} /> : <TypeList />;
}

function TypeList() {
  const { t } = useTranslation();
  const { game } = usePlayer();
  const now = game ? yearOf(game.time) : PRICE_YEAR + 1;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [status, setStatus] = useState<Status>('all');
  const [decade, setDecade] = useState<number | null>(null);
  const [freighters, setFreighters] = useState(false);

  const types = useMemo(() => {
    const q = normalise(query.trim());
    return AIRCRAFT_TYPES.filter(
      (x) =>
        (freighters || !isFreighter(x)) &&
        (category === 'all' || x.category === category) &&
        (status === 'all' || (status === 'flying' ? isInService(x, now) : !isInService(x, now))) &&
        (decade === null || (x.eis >= decade && x.eis < decade + 10)) &&
        (!q || normalise(`${x.manufacturer} ${x.name} ${x.icao}`).includes(q)),
    ).sort((a, b) => a.eis - b.eis || a.name.localeCompare(b.name));
  }, [query, category, status, decade, freighters, now]);

  return (
    <div className="screen">
      <h1 className="screen__title">{t('types.title')}</h1>
      <p className="muted">{t('types.intro')}</p>
      <div className="types__filters">
        <input type="search" className="input" placeholder={t('types.search')} aria-label={t('types.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Segmented label={t('fleet.filter')} value={category} options={CATEGORIES.map((v) => ({ value: v, label: t(`fleet.category.${v}`) }))} onChange={setCategory} />
        <Segmented
          label={t('types.status')}
          value={status}
          options={(['all', 'flying', 'retired'] as const).map((v) => ({ value: v, label: t(`types.statusOpt.${v}`) }))}
          onChange={setStatus}
        />
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('types.decade')}</span>
            <select className="input" value={decade ?? ''} onChange={(e) => setDecade(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('types.allDecades')}</option>
              {DECADES.map((d) => (
                <option key={d} value={d}>
                  {t('types.decadeOpt', { decade: d })}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={freighters} onChange={(e) => setFreighters(e.target.checked)} /> {t('types.freighters')}
          </label>
        </div>
      </div>

      <Panel title={t('types.count', { count: types.length })} code={`${SPAN[0]}–${SPAN[1]}`}>
        <p className="small muted">{t('types.legend')}</p>
        <ul className="type-list">
          {types.map((x) => (
            <li key={x.id}>
              <a href={hrefFor('aircraft', { id: x.id })} className="type-row">
                <span className="type-row__name">
                  <strong>{x.name.startsWith(x.manufacturer) ? x.name : `${x.manufacturer} ${x.name}`}</strong>
                  <span className="muted small mono">
                    {x.icao} · {x.eis}–{x.retired ?? ''} · {x.propulsion === 'piston' ? t('types.piston') : t(`fleet.category.${x.category}`)}
                    {isFreighter(x) && ` · ${t('types.freighter')}`}
                  </span>
                </span>
                <Timeline type={x} now={now} />
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function TypeDetail({ type }: { type: AircraftType }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { game, airline } = usePlayer();
  const now = game ? yearOf(game.time) : PRICE_YEAR + 1;
  const livery = airline ? currentLivery(airline) : NEUTRAL;
  const flying = isInService(type, now);
  const block = orderBlock(type, now);
  const priceYear = type.priceYear ?? PRICE_YEAR;
  const usd = (v: number) => formatMoney(language, money(v, 'USD'));
  const facts: [string, string][] = [
    [t('types.manufacturer'), type.manufacturer],
    [t('types.engines'), type.engines],
    [t('types.firstService'), String(type.eis)],
    [t('types.built'), `${type.built[0]}–${type.built[1] ?? t('types.today')}`],
    [t('types.lastPassengers'), type.retired ? String(type.retired) : t('types.stillFlying')],
    [t('types.seats'), isFreighter(type) ? t('types.payload', { t: type.payloadT }) : t('types.seatsValue', { typical: type.seats.typical, max: type.seats.max })],
    [t('fleet.range'), `${formatNumber(language, type.rangeKm)} km`],
    [t('types.cruise'), `${formatNumber(language, type.cruiseKmh)} km/h`],
    [t('types.mtow'), `${formatNumber(language, type.mtowKg / 1000, 1)} t`],
    [t('fleet.takeoff'), `${formatNumber(language, type.takeoffM)} m`],
    [t('types.etops'), type.etopsMin >= 420 ? t('types.etopsMulti') : type.etopsMin ? t('types.etopsMin', { min: type.etopsMin }) : t('types.etopsNone')],
    [t('types.fuel'), `${formatNumber(language, type.fuelKgPerHour)} kg/h`],
    [t('fleet.listPrice'), t('types.priceThen', { price: usd(type.listPriceUsdM * 1e6), year: priceYear })],
  ];
  if (priceYear !== now) facts.push([t('types.priceNow', { year: Math.min(now, PRICE_YEAR + 1) }), usd(listPriceUsd(type, now))]);

  return (
    <div className="screen">
      <a href={hrefFor('aircraft')} className="muted small">
        ← {t('types.back')}
      </a>
      <h1 className="screen__title">{type.name.startsWith(type.manufacturer) ? type.name : `${type.manufacturer} ${type.name}`}</h1>
      <div className="type-detail">
        <AircraftSide livery={livery} typeId={type.id} className="livery__side" title={t('livery.previewLabel', { type: type.name })} />
        <div className="chip-row">
          <span className={`chip ${flying ? 'chip--normal' : 'chip--planned'}`}>{flying ? t('types.statusOpt.flying') : type.eis > now ? t('types.future') : t('types.statusOpt.retired')}</span>
          {type.propulsion === 'piston' && <span className="chip">{t('types.piston')}</span>}
          {isFreighter(type) && <span className="chip">{t('types.freighter')}</span>}
        </div>
        <Panel title={t('types.timeline')} code={`${type.eis}`}>
          <Timeline type={type} now={now} large />
          <p className="small muted">{t('types.legend')}</p>
        </Panel>
        <Panel title={t('types.specs')} code={type.icao}>
          <dl className="facts">
            {facts.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd className="mono">{v}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="small muted">{t('types.priceNote')}</p>
        </Panel>
        <Panel title={t('types.inGame')}>
          <p>
            {!block
              ? t('types.orderable')
              : flying && !isFreighter(type)
                ? t('types.marketOnly')
                : isFreighter(type)
                  ? t('types.freighterLater')
                  : t('types.historical')}
          </p>
          <p className="small muted">{t('types.source')}</p>
        </Panel>
      </div>
    </div>
  );
}
