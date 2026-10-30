import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DISCLOSURE, listedById, MANDATORY_BID, MAX_WEEKLY_BUY, MERGE_MIN_STAKE, type ListedAirline } from '../../data/listedAirlines';
import type { CommandError } from '../../engine/commands';
import {
  acceptance,
  blockHolders,
  companyValue,
  controls,
  freeFloat,
  listedNow,
  marginNow,
  membersNow,
  minimumOfferPrice,
  offerFunds,
  ownershipCap,
  revenueNow,
  stateBlocks,
} from '../../engine/investments';
import type { Airline, GameState } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';
import { usePlayer } from '../game/usePlayer';
import { hrefFor, useRouteParam } from '../navigation';

/** Other airlines (Phase 10.5): the airline stock market, the player's stakes, takeover offers and mergers. */
export function InvestmentsScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const world = useEngineWorld();
  const selected = useRouteParam('id');
  if (!game || !airline || !world) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('invest.title')}</h1>
        <Panel title={t('invest.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
          <a href={hrefFor('new')} className="button button--primary">
            {t('ops.newGame')}
          </a>
        </Panel>
      </div>
    );
  }
  const x = selected ? listedById.get(selected) : undefined;
  return (
    <div className="screen">
      <h1 className="screen__title">{t('invest.title')}</h1>
      <div className="grid">
        {airline.equity?.bid && <BidPanel game={game} airline={airline} />}
        <HoldingsPanel game={game} world={world} airline={airline} />
        {x && <CompanyPanel key={x.id} game={game} world={world} airline={airline} x={x} />}
        <MarketPanel game={game} world={world} airline={airline} selected={selected} />
      </div>
    </div>
  );
}

function useFormat(game: GameState, airline: Airline) {
  const { language } = useSettings();
  const rate = (game.fx[airline.currency] ?? 1) / (game.fx.EUR ?? 1);
  return {
    eur: (v: number) => formatMoney(language, { amount: Math.round(v), currency: 'EUR' }),
    bn: (v: number) => `€${formatNumber(language, v / 1e9, 2)} bn`,
    book: (v: number) => formatMoney(language, { amount: Math.round(v), currency: airline.currency }),
    px: (v: number) => `€${formatNumber(language, v, v < 1 ? 4 : 2)}`,
    pct: (v: number, d = 1) => `${formatNumber(language, v * 100, d)} %`,
    rate,
    date: (time: number) => formatGameDate(language, toDate(time), false),
  };
}

const shareCount = (x: ListedAirline) => x.sharesM * 1e6;

function useRun() {
  const [error, setError] = useState<CommandError | null>(null);
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
    return r.ok;
  };
  return { error, run };
}

function ErrorNote({ error }: { error: CommandError | null }) {
  const { t } = useTranslation();
  return error ? <p className="notice notice--error">{t(`invest.err.${error}`, { defaultValue: t(`errors.${error}`) })}</p> : null;
}

function BidPanel({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const f = useFormat(game, airline);
  const { error, run } = useRun();
  const bid = airline.equity!.bid!;
  return (
    <Panel title={t('invest.bidTitle')} code="BID" className="panel--wide">
      <p className="text--caution">{t('invest.bidText', { bidder: bid.bidder, price: f.book(bid.price), date: f.date(bid.until) })}</p>
      <p className="small muted">{t('invest.bidNote')}</p>
      <label className="check">
        <input type="checkbox" checked={bid.tender} onChange={(e) => void run({ type: 'AnswerBid', airlineId: airline.id, payload: { tender: e.target.checked } })} />
        <span>{t('invest.tender')}</span>
      </label>
      <ErrorNote error={error} />
    </Panel>
  );
}

function HoldingsPanel({ game, world, airline }: { game: GameState; world: EngineWorld; airline: Airline }) {
  const { t } = useTranslation();
  const f = useFormat(game, airline);
  const entries = Object.entries(airline.holdings ?? {});
  const bid = airline.takeover;
  return (
    <Panel title={t('invest.holdingsTitle')} code="STK" className="panel--wide">
      <p className="small muted">{t('invest.holdingsIntro')}</p>
      {bid && (
        <p className="notice">
          {t(bid.stage === 'offer' ? 'invest.offerRunning' : bid.phase2 ? 'invest.reviewPhase2' : 'invest.reviewRunning', {
            company: listedById.get(bid.listedId)?.name ?? bid.listedId,
            date: f.date(bid.until),
            price: f.px(bid.price),
            share: f.pct(bid.accepted ?? 0, 0),
            routes: bid.overlaps?.length ?? 0,
          })}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="muted">{t('invest.noHoldings')}</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('invest.company')}</th>
                <th className="num">{t('invest.stake')}</th>
                <th className="num">{t('invest.value')}</th>
                <th className="num">{t('invest.cost')}</th>
                <th>{t('invest.status')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([id, h]) => {
                const x = listedById.get(id);
                if (!x) return null;
                const ls = game.stocks?.listed?.[id];
                const price = ls?.ownedBy === airline.id ? (companyValue(game, world, x) / shareCount(x)) * (game.stocks?.mood ?? 1) : (ls?.price ?? 0);
                const value = h.share * shareCount(x) * price * f.rate;
                const status = h.merged?.length ? 'merged' : h.share > 0.5 ? 'subsidiary' : h.share >= 0.2 ? 'big' : 'stake';
                return (
                  <tr key={id}>
                    <td>
                      <a href={hrefFor('investments', { id })}>{x.name}</a>
                    </td>
                    <td className="num mono">{f.pct(h.share)}</td>
                    <td className="num mono">{f.book(value)}</td>
                    <td className={`num mono ${value >= h.cost ? 'text--normal' : 'text--caution'}`}>{f.book(h.cost)}</td>
                    <td className="small">{t(`invest.state.${status}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function MarketPanel({ game, world, airline, selected }: { game: GameState; world: EngineWorld; airline: Airline; selected: string | null }) {
  const { t } = useTranslation();
  const f = useFormat(game, airline);
  const list = listedNow(game, world).sort((a, b) => companyValue(game, world, b) - companyValue(game, world, a));
  const owned = Object.entries(game.stocks?.listed ?? {}).filter(([, s]) => s.ownedBy);
  return (
    <Panel title={t('invest.marketTitle')} code="MKT" className="panel--wide">
      <p className="small muted">{t('invest.marketIntro')}</p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t('invest.company')}</th>
              <th className="num">{t('invest.marketValue')}</th>
              <th className="num">{t('invest.price')}</th>
              <th className="num">{t('invest.change')}</th>
              <th className="num">{t('invest.yours')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const ls = game.stocks?.listed?.[x.id];
              const price = ls?.price ?? companyValue(game, world, x) / shareCount(x);
              const first = ls?.history.slice(-52)[0]?.[1];
              const change = first ? price / first - 1 : null;
              const mine = airline.holdings?.[x.id]?.share ?? 0;
              return (
                <tr key={x.id} className={selected === x.id ? 'text--info' : ''}>
                  <td>
                    <a href={hrefFor('investments', { id: x.id })}>{x.name}</a> <span className="muted small">{x.country}</span>
                  </td>
                  <td className="num mono">{f.bn(price * shareCount(x))}</td>
                  <td className="num mono">{f.px(price)}</td>
                  <td className={`num mono ${change === null ? '' : change >= 0 ? 'text--normal' : 'text--warning'}`}>{change === null ? '—' : `${change >= 0 ? '+' : ''}${f.pct(change)}`}</td>
                  <td className="num mono">{mine ? f.pct(mine) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {owned.length > 0 && (
        <p className="small muted">
          {t('invest.takenOver')}{' '}
          {owned.map(([id, s]) => `${listedById.get(id)?.name ?? id} → ${listedById.get(s.ownedBy!)?.name ?? (s.ownedBy === airline.id ? airline.name : s.ownedBy)}`).join(' · ')}
        </p>
      )}
    </Panel>
  );
}

function CompanyPanel({ game, world, airline, x }: { game: GameState; world: EngineWorld; airline: Airline; x: ListedAirline }) {
  const { t } = useTranslation();
  const f = useFormat(game, airline);
  const { error, run } = useRun();
  const [trade, setTrade] = useState(1);
  const [premium, setPremium] = useState(35);
  const [minAcc, setMinAcc] = useState(0.5);
  const h = airline.holdings?.[x.id];
  const ls = game.stocks?.listed?.[x.id];
  const listed = listedNow(game, world).some((y) => y.id === x.id);
  const price = ls?.price ?? companyValue(game, world, x) / shareCount(x);
  const members = membersNow(game, world, x);
  const cap = ownershipCap(game, world, airline, x);
  const minOffer = minimumOfferPrice(game, world, airline, x);
  const offerPrice = Math.max(minOffer, price) * (1 + premium / 100);
  const expected = (h?.share ?? 0) + acceptance(game, world, x, airline, offerPrice);
  const blocks = blockHolders(x, game.time);
  const nextDisclosure = DISCLOSURE.find((d) => d > (h?.share ?? 0) + 1e-9);
  return (
    <Panel title={x.name} code={x.id.slice(0, 4)} className="panel--wide">
      <p className="small">
        {members.map((m) => m.name).join(' · ')} <span className="muted">· {x.country}</span>
      </p>
      <dl className="facts facts--compact">
        <dt>{t('invest.revenue')}</dt>
        <dd className="mono">{f.bn(revenueNow(game, world, x))}</dd>
        <dt>{t('invest.margin')}</dt>
        <dd className="mono">{f.pct(marginNow(game, world, x))}</dd>
        <dt>{t('invest.marketValue')}</dt>
        <dd className="mono">
          {f.bn(price * shareCount(x))} · {f.px(price)}
        </dd>
        <dt>{t('invest.float')}</dt>
        <dd className="mono">{f.pct(freeFloat(game, x, airline))}</dd>
        <dt>{t('invest.yourStake')}</dt>
        <dd className="mono">{f.pct(h?.share ?? 0)}</dd>
        <dt>{t('invest.yourLimit')}</dt>
        <dd className="mono">{cap >= 1 ? t('invest.noLimit') : f.pct(cap, 0)}</dd>
      </dl>
      {blocks.length > 0 && (
        <>
          <span className="field__label">{t('invest.blockHolders')}</span>
          <ul className="plain-list small">
            {blocks.map((b) => (
              <li key={b.name}>
                <span className="mono">{f.pct(b.share)}</span> · {b.name} <span className="muted">({t(`invest.kind.${b.kind}`)})</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {listed ? (
        <>
          <span className="field__label">{t('invest.tradeTitle')}</span>
          <p className="small muted">{t('invest.tradeNote', { week: f.pct(MAX_WEEKLY_BUY, 0), bid: f.pct(MANDATORY_BID, 0), next: nextDisclosure ? f.pct(nextDisclosure, 0) : '—' })}</p>
          <div className="field-row">
            <label className="field">
              <span className="field__label">{t('invest.tradeShare')}</span>
              <input className="input mono" type="number" min={0.1} max={30} step={0.1} value={trade} onChange={(e) => setTrade(Math.max(0.1, Number(e.target.value)))} />
              <span className="small muted">{t('invest.tradeCost', { amount: f.book(trade / 100 * shareCount(x) * price * f.rate) })}</span>
            </label>
          </div>
          <div className="toolbar-row">
            <button type="button" className="button button--primary" onClick={() => void run({ type: 'TradeStake', airlineId: airline.id, payload: { listedId: x.id, share: trade / 100 } })}>
              {t('invest.buy')}
            </button>
            <button type="button" className="button" disabled={!h?.share} onClick={() => void run({ type: 'TradeStake', airlineId: airline.id, payload: { listedId: x.id, share: -Math.min(trade / 100, h?.share ?? 0) } })}>
              {t('invest.sell')}
            </button>
          </div>

          <span className="field__label">{t('invest.offerTitle')}</span>
          {stateBlocks(x, game.time) ? (
            <p className="small text--caution">{t('invest.stateBlocks')}</p>
          ) : (
            <>
              <p className="small muted">{t('invest.offerNote')}</p>
              <div className="field-row">
                <label className="field">
                  <span className="field__label">{t('invest.premium')}</span>
                  <input className="input mono" type="number" min={0} max={150} step={5} value={premium} onChange={(e) => setPremium(Math.max(0, Number(e.target.value)))} />
                </label>
                <label className="field">
                  <span className="field__label">{t('invest.minAcceptance')}</span>
                  <select className="input" value={minAcc} onChange={(e) => setMinAcc(Number(e.target.value))}>
                    {[0.5, 0.75, 0.9].map((v) => (
                      <option key={v} value={v}>
                        {f.pct(v, 0)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="small mono">
                {t('invest.offerQuote', { price: f.px(offerPrice), funds: f.book(offerFunds(game, x, airline, offerPrice)), expected: f.pct(Math.min(cap, expected), 0) })}
              </p>
              <button
                type="button"
                className="button button--primary"
                disabled={!!airline.takeover}
                onClick={() => window.confirm(t('invest.offerConfirm', { company: x.name })) && void run({ type: 'OfferTakeover', airlineId: airline.id, payload: { listedId: x.id, price: offerPrice, minAcceptance: minAcc } })}
              >
                {t('invest.offerButton')}
              </button>
            </>
          )}
        </>
      ) : (
        <p className="small muted">{t('invest.notListedNow')}</p>
      )}

      {controls(airline, x.id) && (
        <>
          <span className="field__label">{t('invest.membersTitle')}</span>
          <p className="small muted">{t('invest.membersNote', { min: f.pct(MERGE_MIN_STAKE, 0) })}</p>
          <ul className="plain-list">
            {members.map((m) => {
              const merged = h?.merged?.includes(m.id) || game.ai.airlines[m.id]?.status === 'player';
              return (
                <li key={m.id} className="toolbar-row">
                  <span>
                    {m.name} <span className="muted small">{world.airportById.get(m.hubs[0] ?? '')?.iata ?? ''}</span>
                  </span>
                  {merged ? (
                    <span className="chip">{t('invest.state.merged')}</span>
                  ) : (
                    <button
                      type="button"
                      className="button button--small"
                      disabled={(h?.share ?? 0) < MERGE_MIN_STAKE}
                      onClick={() => window.confirm(t('invest.mergeConfirm', { airline: m.name })) && void run({ type: 'MergeAirline', airlineId: airline.id, payload: { listedId: x.id, memberId: m.id } })}
                    >
                      {t('invest.merge')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <ErrorNote error={error} />
    </Panel>
  );
}
