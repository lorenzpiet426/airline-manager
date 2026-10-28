import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { AircraftTimeline } from '../components/AircraftTimeline';
import { TailFin } from '../components/TailFin';
import { useEngineWorld } from '../game/useEngineWorld';
import { pairsOfAircraft } from '../../engine/schedule';
import { usePlayer } from '../game/usePlayer';
import { getAircraftType, type AircraftCategory } from '../../data/aircraft';
import { aircraftHours } from '../../engine/commands';
import { WEEKLY_AVAILABLE_HOURS } from '../../engine/economics';
import { useWorld } from '../../data/world';
import type { CommandError } from '../../engine/commands';
import { convert } from '../../engine/money';
import type { Airline, GameState, LeaseOffer } from '../../engine/state';
import { MINUTES_PER_DAY, startOfDay, toDate, yearOf } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { hrefFor } from '../navigation';
import { CabinBar } from '../fleet/CabinBar';
import { CabinEditor } from '../fleet/CabinEditor';
import { cabinText } from '../fleet/cabinText';
import { inRefit } from '../../engine/schedule';
import { Ownership } from '../fleet/Ownership';
import { BuyUsed, OrderNew } from '../fleet/BuyAndOrder';
import { FleetSummary } from '../fleet/FleetSummary';

type Tab = 'fleet' | 'market' | 'buy' | 'order';
type Filter = 'all' | AircraftCategory;

export function FleetScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const fleetSize = game && airline ? Object.values(game.aircraft).filter((a) => a.airlineId === airline.id).length : 0;
  const [tab, setTab] = useState<Tab>(fleetSize ? 'fleet' : 'market');
  const world = useWorld();
  const hubRunway = airline ? world?.airportById.get(airline.hubId)?.longestRunwayM : undefined;

  if (!game || !airline) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('fleet.title')}</h1>
        <Panel title={t('fleet.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
          <a href={hrefFor('new')} className="button button--primary">
            {t('ops.newGame')}
          </a>
        </Panel>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="screen__title">{t('fleet.title')}</h1>
      <Segmented
        label={t('fleet.title')}
        value={tab}
        options={[
          { value: 'fleet', label: t('fleet.tabFleet', { count: fleetSize }) },
          { value: 'market', label: t('fleet.tabMarket', { count: game.market.offers.length }) },
          { value: 'buy', label: t('fleet.tabBuy', { count: game.market.sales.length }) },
          { value: 'order', label: t('fleet.tabOrder') },
        ]}
        onChange={setTab}
      />
      {tab === 'fleet' ? (
        <MyFleet game={game} airline={airline} onMarket={() => setTab('market')} />
      ) : tab === 'market' ? (
        <Market game={game} airline={airline} />
      ) : tab === 'buy' ? (
        <BuyUsed game={game} airline={airline} hubRunwayM={hubRunway} />
      ) : (
        <OrderNew game={game} airline={airline} />
      )}
    </div>
  );
}

function MyFleet({ game, airline, onMarket }: { game: GameState; airline: Airline; onMarket: () => void }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const engineWorld = useEngineWorld();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const code = (id: string) => world?.airportById.get(id)?.iata ?? id;
  const fleet = Object.values(game.aircraft)
    .filter((a) => a.airlineId === airline.id)
    .sort((a, b) => a.deliveryAt - b.deliveryAt);

  if (!fleet.length) {
    return (
      <Panel title={t('fleet.tabFleet', { count: 0 })}>
        <p className="muted">{t('fleet.empty')}</p>
        <button type="button" className="button button--primary" onClick={onMarket}>
          {t('fleet.toMarket')}
        </button>
      </Panel>
    );
  }

  return (
    <>
    <FleetSummary game={game} airline={airline} />
    <ul className="cards">
      {fleet.map((aircraft) => {
        const type = getAircraftType(aircraft.typeId);
        const location = world?.airportById.get(aircraft.locationId);
        return (
          <li key={aircraft.id} className="card">
            <div className="card__head">
              <TailFin primary={airline.colors.primary} secondary={airline.colors.secondary} size={40} />
              <div className="card__title">
                <span className="card__reg mono">{aircraft.registration}</span>
                <span className="muted">
                  {type.name.startsWith(type.manufacturer) ? type.name : `${type.manufacturer} ${type.name}`}
                </span>
              </div>
              {aircraft.status === 'active' && inRefit(aircraft, game.time) ? (
                <span className="chip chip--caution">{t('fleet.inRefit', { date: formatGameDate(language, toDate(aircraft.refitUntil!), false) })}</span>
              ) : aircraft.status === 'active' ? (
                <span className="chip chip--normal">{t('fleet.atAirport', { airport: location?.iata ?? aircraft.locationId })}</span>
              ) : (
                <span className="chip chip--planned">
                  {t('fleet.deliveryOn', { date: formatGameDate(language, toDate(aircraft.deliveryAt), false) })}
                </span>
              )}
            </div>
            <CabinBar type={type} cabin={aircraft.cabin} compact />
            <dl className="facts facts--compact">
              <dt>{t('fleet.cabin')}</dt>
              <dd className="mono">{cabinText(aircraft.cabin)}</dd>
              <dt>{t('fleet.built')}</dt>
              <dd className="mono">
                {aircraft.builtYear}
                {aircraft.builtYear <= yearOf(game.time) && ` (${t('fleet.age', { count: yearOf(game.time) - aircraft.builtYear })})`}
              </dd>
              <dt>{t('fleet.hours')}</dt>
              <dd className="mono">
                {t('fleet.hoursValue', { used: Math.round(aircraftHours(game, aircraft.id)), max: WEEKLY_AVAILABLE_HOURS[type.category] })}
              </dd>
              <dt>{t('fleet.routesOf')}</dt>
              <dd className="mono">
                {[...new Set(pairsOfAircraft(game, aircraft.id).map((p) => game.routes[p.routeId]?.destinationId ?? ''))]
                  .filter(Boolean)
                  .map(code)
                  .join(' · ') || t('fleet.noRoutes')}
              </dd>
            </dl>
            <Ownership game={game} airline={airline} aircraft={aircraft} />
            <div className="button-row">
              <button
                type="button"
                className="button button--small"
                aria-expanded={editing === aircraft.id}
                disabled={inRefit(aircraft, game.time)}
                onClick={() => setEditing(editing === aircraft.id ? null : aircraft.id)}
              >
                {t('cabin.edit')}
              </button>
              {engineWorld && pairsOfAircraft(game, aircraft.id).length > 0 && (
                <button type="button" className="button button--small" aria-expanded={open === aircraft.id} onClick={() => setOpen(open === aircraft.id ? null : aircraft.id)}>
                  {open === aircraft.id ? t('timeline.hide') : t('timeline.show')}
                </button>
              )}
            </div>
            {editing === aircraft.id && <CabinEditor game={game} airline={airline} aircraft={aircraft} onDone={() => setEditing(null)} />}
            {engineWorld && open === aircraft.id && <AircraftTimeline game={game} world={engineWorld} aircraftId={aircraft.id} code={code} />}
          </li>
        );
      })}
    </ul>
    </>
  );
}

function Market({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ aircraftId: string } | { error: CommandError } | null>(null);
  const world = useWorld();
  const hub = world?.airportById.get(airline.hubId);

  const offers = useMemo(
    () =>
      game.market.offers
        .filter((o) => filter === 'all' || getAircraftType(o.typeId).category === filter)
        .sort((a, b) => a.monthlyRent.amount - b.monthlyRent.amount),
    [game.market.offers, filter],
  );

  const lease = async (offer: LeaseOffer) => {
    const result = await sendCommand({ type: 'LeaseAircraft', airlineId: airline.id, payload: { offerId: offer.id } });
    setConfirming(null);
    setNotice(result.ok ? { aircraftId: result.id ?? '' } : { error: result.error });
  };

  const leased = notice && 'aircraftId' in notice ? game.aircraft[notice.aircraftId] : undefined;

  return (
    <>
      <p className="muted">{t('fleet.marketIntro')}</p>
      <Segmented
        label={t('fleet.filter')}
        value={filter}
        options={(['all', 'turboprop', 'regional', 'narrowbody', 'widebody'] as const).map((value) => ({
          value,
          label: t(`fleet.category.${value}`),
        }))}
        onChange={setFilter}
      />
      {leased && (
        <p className="notice notice--ok">
          {t('fleet.leased', { type: getAircraftType(leased.typeId).name, registration: leased.registration })}
        </p>
      )}
      {notice && 'error' in notice && <p className="notice notice--error">{t(`errors.${notice.error}`)}</p>}
      <ul className="cards">
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            game={game}
            airline={airline}
            hubRunwayM={hub?.longestRunwayM}
            hubCode={hub?.iata ?? airline.hubId}
            confirming={confirming === offer.id}
            onAsk={() => {
              setNotice(null);
              setConfirming(offer.id);
            }}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void lease(offer)}
          />
        ))}
      </ul>
    </>
  );
}

function OfferCard({
  offer,
  game,
  airline,
  hubRunwayM,
  hubCode,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  offer: LeaseOffer;
  game: GameState;
  airline: Airline;
  hubRunwayM: number | undefined;
  hubCode: string;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const type = getAircraftType(offer.typeId);
  const age = yearOf(game.time) - offer.builtYear;
  const rentLocal = convert(offer.monthlyRent, airline.currency, game.fx);
  const depositLocal = convert(offer.deposit, airline.currency, game.fx);
  const deliveryDate = toDate(startOfDay(game.time) + offer.deliveryDays * MINUTES_PER_DAY);
  const shortRunway = hubRunwayM !== undefined && hubRunwayM < type.takeoffM;
  const cannotPay = airline.cash.amount < depositLocal.amount;
  const showLocal = airline.currency !== offer.monthlyRent.currency;

  return (
    <li className="card">
      <div className="card__head">
        <div className="card__title">
          <span className="card__type">{type.name}</span>
          <span className="muted">
            {type.manufacturer} · <span className="mono">{type.icao}</span> · {t(`fleet.category.${type.category}`)}
          </span>
        </div>
        <span className="card__price mono">
          <span>
            {formatMoney(language, offer.monthlyRent)}
            <span className="muted small"> {t('fleet.perMonth')}</span>
          </span>
          {showLocal && <span className="card__local muted small">≈ {formatMoney(language, rentLocal)}</span>}
        </span>
      </div>
      <CabinBar type={type} cabin={offer.cabin} compact />
      <dl className="facts facts--compact">
        <dt>{t('fleet.built')}</dt>
        <dd className="mono">
          {offer.builtYear} ({t('fleet.age', { count: age })})
        </dd>
        <dt>{t('fleet.cabin')}</dt>
        <dd className="mono">{cabinText(offer.cabin)}</dd>
        <dt>{t('fleet.range')}</dt>
        <dd className="mono">{formatNumber(language, type.rangeKm)} km</dd>
        <dt>{t('fleet.takeoff')}</dt>
        <dd className={`mono ${shortRunway ? 'text--caution' : ''}`}>{formatNumber(language, type.takeoffM)} m</dd>
        <dt>{t('fleet.term')}</dt>
        <dd className="mono">{t('fleet.years', { count: offer.termMonths / 12 })}</dd>
        <dt>{t('fleet.delivery')}</dt>
        <dd className="mono">{formatGameDate(language, deliveryDate, false)}</dd>
        <dt>{t('fleet.lessor')}</dt>
        <dd>{offer.lessor}</dd>
      </dl>
      {shortRunway && (
        <p className="small text--caution">
          {t('fleet.runwayWarning', { hub: hubCode, runway: formatNumber(language, hubRunwayM ?? 0), needed: formatNumber(language, type.takeoffM) })}
        </p>
      )}
      {confirming ? (
        <div className="confirm">
          <p className="small">
            {t('fleet.confirmText', {
              deposit: formatMoney(language, depositLocal, false),
              rent: formatMoney(language, offer.monthlyRent),
              date: formatGameDate(language, deliveryDate, false),
              count: offer.termMonths / 12,
            })}
          </p>
          <div className="confirm__actions">
            <button type="button" className="button" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="button" className="button button--primary" onClick={onConfirm}>
              {t('fleet.sign')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button" disabled={cannotPay} onClick={onAsk} title={cannotPay ? t('errors.insufficientCash') : undefined}>
          {cannotPay ? t('errors.insufficientCash') : t('fleet.lease')}
        </button>
      )}
    </li>
  );
}
