import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LADDER, MAX_MONTHS, NO_POLICY, type HedgePolicy } from '../../data/hedging';
import type { CommandError } from '../../engine/commands';
import { callPremium, exposure, forwardFuel, forwardFx, market, monthKey } from '../../engine/hedging';
import type { Airline, GameState, HedgeContract } from '../../engine/state';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';

type Kind = HedgeContract['kind'];

/** Fuel and currency hedging (Phase 10.2): market, policy, what is hedged, results, collateral, single deals. */
export function HedgingPanel({ game, airline }: { game: GameState; airline: Airline }) {
  const world = useEngineWorld();
  if (!world) return null;
  return <HedgingView game={game} world={world} airline={airline} />;
}

function HedgingView({ game, world, airline }: { game: GameState; world: EngineWorld; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const h = airline.hedging;
  const mk = market(game, world, airline);
  const e = exposure(game, world, airline);
  const usdBooks = airline.currency === 'USD';
  const m = (v: number) => formatMoney(language, { amount: Math.round(v), currency: airline.currency });
  const n = (v: number, d = 0) => formatNumber(language, v, d);
  const pct = (v: number) => `${formatNumber(language, v * 100)} %`;
  const contracts = h?.contracts ?? [];
  const now = game.time;
  const period = (i: number) => {
    const [a, b] = LADDER[i]!;
    const months = new Set(Array.from({ length: b - a + 1 }, (_, k) => monthKey(now, a + k)));
    const fuel = contracts.filter((c) => months.has(c.month) && c.kind !== 'fxForward');
    const fx = contracts.filter((c) => months.has(c.month) && c.kind === 'fxForward');
    const sum = (xs: HedgeContract[]) => xs.reduce((s, c) => s + c.amount, 0);
    const avg = (xs: HedgeContract[]) => (sum(xs) ? xs.reduce((s, c) => s + c.amount * c.price, 0) / sum(xs) : 0);
    return { a, b, fuelShare: e.gallons ? sum(fuel) / (e.gallons * months.size) : 0, fuelPrice: avg(fuel), fxShare: e.usd ? sum(fx) / (e.usd * months.size) : 0, fxPrice: avg(fx) };
  };
  return (
    <div className="grid">
      <Panel title={t('hedge.marketTitle')} code="MKT">
        <dl className="facts facts--compact">
          <dt>{t('hedge.fuelSpot')}</dt>
          <dd className="mono">${n(mk.fuel, 2)}</dd>
          <dt>{t('hedge.fuelAverage')}</dt>
          <dd className="mono">${n(mk.average, 2)}</dd>
          <dt>{t('hedge.fuelForward')}</dt>
          <dd className="mono small">{[3, 6, 12, 24].map((k) => `${k}: $${n(forwardFuel(mk.fuel, mk.average, k), 2)}`).join(' · ')}</dd>
          {!usdBooks && (
            <>
              <dt>{t('hedge.fxSpot', { currency: airline.currency })}</dt>
              <dd className="mono">{n(mk.fx, 4)}</dd>
              <dt>{t('hedge.fxForward')}</dt>
              <dd className="mono small">{[3, 12, 24].map((k) => `${k}: ${n(forwardFx(mk.fx, mk.rateBook, mk.rateUsd, k), 4)}`).join(' · ')}</dd>
            </>
          )}
          <dt>{t('hedge.exposure')}</dt>
          <dd className="mono small">{t(usdBooks ? 'hedge.exposureFuel' : 'hedge.exposureBoth', { gallons: n(e.gallons), usd: n(e.usd) })}</dd>
        </dl>
        <p className="small muted">{t('hedge.marketNote')}</p>
      </Panel>

      <Panel title={t('hedge.statusTitle')} code="HEDGE">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('hedge.months')}</th>
                <th className="num">{t('hedge.fuelHedged')}</th>
                {!usdBooks && <th className="num">{t('hedge.fxHedged')}</th>}
              </tr>
            </thead>
            <tbody>
              {LADDER.map((_, i) => {
                const p = period(i);
                return (
                  <tr key={i}>
                    <td className="mono">
                      {p.a}–{p.b}
                    </td>
                    <td className="num mono">
                      {pct(p.fuelShare)} {p.fuelPrice > 0 && <span className="muted">· ${n(p.fuelPrice, 2)}</span>}
                    </td>
                    {!usdBooks && (
                      <td className="num mono">
                        {pct(p.fxShare)} {p.fxPrice > 0 && <span className="muted">· {n(p.fxPrice, 4)}</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="facts facts--compact">
          <dt>{t('hedge.value')}</dt>
          <dd className={`mono ${(h?.value ?? 0) < 0 ? 'text--warning' : 'text--normal'}`}>{m(h?.value ?? 0)}</dd>
          <dt>{t('hedge.collateral')}</dt>
          <dd className={`mono ${(h?.collateral ?? 0) > 0 ? 'text--caution' : ''}`}>{m(h?.collateral ?? 0)}</dd>
        </dl>
        {(h?.settled.length ?? 0) > 0 && (
          <>
            <span className="field__label">{t('hedge.settledTitle')}</span>
            <ul className="plain-list small">
              {[...h!.settled]
                .reverse()
                .slice(0, 6)
                .map((s) => (
                  <li key={s.month}>
                    <span className="mono">{s.month}</span> · {t('hedge.settledRow', { fuel: m(s.fuel), fx: m(s.fx), premiums: m(s.premiums) })} ·{' '}
                    <strong className={s.fuel + s.fx - s.premiums >= 0 ? 'text--normal' : 'text--warning'}>{m(s.fuel + s.fx - s.premiums)}</strong>
                  </li>
                ))}
            </ul>
          </>
        )}
        <p className="small muted">{t('hedge.statusNote')}</p>
      </Panel>

      <PolicyForm airline={airline} usdBooks={usdBooks} />
      <DealForm game={game} world={world} airline={airline} usdBooks={usdBooks} />
    </div>
  );
}

function PolicyForm({ airline, usdBooks }: { airline: Airline; usdBooks: boolean }) {
  const { t } = useTranslation();
  const start = airline.hedging?.policy ?? NO_POLICY;
  const [fuel, setFuel] = useState(start.fuel.map((x) => Math.round(x * 100)));
  const [fx, setFx] = useState(start.fx.map((x) => Math.round(x * 100)));
  const [options, setOptions] = useState(Math.round(start.optionShare * 100));
  const [strike, setStrike] = useState(Math.round(start.strikeOffset * 100));
  const [error, setError] = useState<CommandError | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const policy: HedgePolicy = {
      fuel: fuel.map((x) => x / 100) as HedgePolicy['fuel'],
      fx: (usdBooks ? [0, 0, 0] : fx.map((x) => x / 100)) as HedgePolicy['fx'],
      optionShare: options / 100,
      strikeOffset: strike / 100,
    };
    const r = await sendCommand({ type: 'SetHedgePolicy', airlineId: airline.id, payload: { policy } });
    setError(r.ok ? null : r.error);
    setSaved(r.ok);
  };
  const row = (values: number[], set: (v: number[]) => void, label: string) => (
    <div className="field-row hedge-row">
      {LADDER.map(([a, b], i) => (
        <label key={i} className="field">
          <span className="field__label">{t('hedge.periodShare', { what: label, from: a, to: b })}</span>
          <input className="input mono" type="number" min={0} max={100} step={5} value={values[i]} onChange={(e) => set(values.map((x, j) => (j === i ? Number(e.target.value) : x)))} />
        </label>
      ))}
    </div>
  );
  return (
    <Panel title={t('hedge.policyTitle')} code="POLICY">
      <p className="small muted">{t('hedge.policyIntro')}</p>
      {row(fuel, setFuel, t('hedge.fuel'))}
      {!usdBooks && row(fx, setFx, t('hedge.dollars'))}
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('hedge.optionShare')}</span>
          <input className="input mono" type="number" min={0} max={100} step={10} value={options} onChange={(e) => setOptions(Number(e.target.value))} />
        </label>
        <label className="field">
          <span className="field__label">{t('hedge.strike')}</span>
          <input className="input mono" type="number" min={0} max={50} step={5} value={strike} onChange={(e) => setStrike(Number(e.target.value))} />
        </label>
      </div>
      <div className="toolbar-row">
        <button type="button" className="button button--primary" onClick={() => void save()}>
          {t('hedge.savePolicy')}
        </button>
        {saved && <span className="small text--normal">{t('hedge.saved')}</span>}
      </div>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}

function DealForm({ game, world, airline, usdBooks }: { game: GameState; world: EngineWorld; airline: Airline; usdBooks: boolean }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [kind, setKind] = useState<Kind>('fuelSwap');
  const [ahead, setAhead] = useState(6);
  const [amount, setAmount] = useState(100_000);
  const [error, setError] = useState<CommandError | null>(null);
  const mk = market(game, world, airline);
  const fwd = forwardFuel(mk.fuel, mk.average, ahead);
  const strike = fwd * (1 + (airline.hedging?.policy.strikeOffset ?? 0.1));
  const quote =
    kind === 'fxForward'
      ? t('hedge.quoteFx', { rate: formatNumber(language, forwardFx(mk.fx, mk.rateBook, mk.rateUsd, ahead), 4), currency: airline.currency })
      : kind === 'fuelSwap'
        ? t('hedge.quoteSwap', { price: formatNumber(language, fwd * 1.01, 2) })
        : t('hedge.quoteCall', {
            strike: formatNumber(language, strike, 2),
            premium: formatMoney(language, { amount: Math.round(callPremium(fwd, strike, ahead, mk.rateUsd) * 1.1 * amount * mk.fx), currency: airline.currency }),
          });
  const deal = async () => {
    const r = await sendCommand({ type: 'HedgeDeal', airlineId: airline.id, payload: { kind, monthsAhead: ahead, amount } });
    setError(r.ok ? null : r.error);
  };
  return (
    <Panel title={t('hedge.dealTitle')} code="DEAL">
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('hedge.kind')}</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(['fuelSwap', 'fuelCall', ...(usdBooks ? [] : ['fxForward'])] as Kind[]).map((k) => (
              <option key={k} value={k}>
                {t(`hedge.kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('hedge.ahead')}</span>
          <input className="input mono" type="number" min={1} max={MAX_MONTHS} value={ahead} onChange={(e) => setAhead(Math.max(1, Math.min(MAX_MONTHS, Math.round(Number(e.target.value)))))} />
        </label>
        <label className="field">
          <span className="field__label">{kind === 'fxForward' ? t('hedge.amountUsd') : t('hedge.amountGallons')}</span>
          <input className="input mono" type="number" min={1000} step={10000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
      </div>
      <p className="small muted">{quote}</p>
      <button type="button" className="button button--primary" onClick={() => void deal()}>
        {t('hedge.deal')}
      </button>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}
