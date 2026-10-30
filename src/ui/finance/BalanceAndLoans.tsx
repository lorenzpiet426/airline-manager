import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { policyRate } from '../../data/rates';
import { balanceSheet, creditView, INSOLVENCY_DAYS, loanOffers, SPREAD, type LoanOffer } from '../../engine/debt';
import type { CommandError } from '../../engine/commands';
import { aircraftMarketValueUsd } from '../../engine/fleet';
import { convert, money } from '../../engine/money';
import type { Airline, GameState } from '../../engine/state';
import { MINUTES_PER_DAY, toDate } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';

/**
 * Balance sheet, credit rating, loans and bonds (Phase 10.1): what the airline owns and owes, how lenders see it, what
 * it can borrow and at what interest, its loans with early repayment, and selling owned aircraft to a lessor.
 */
export function BalanceAndLoans({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [error, setError] = useState<CommandError | null>(null);
  const m = (amount: number) => formatMoney(language, { amount: Math.round(amount), currency: airline.currency });
  const pct = (v: number) => `${formatNumber(language, v, 2)} %`;
  const b = balanceSheet(game, airline);
  const view = creditView(game, airline);
  const offers = loanOffers(game, airline);
  const base = policyRate(airline.currency, toDate(game.time));
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
    return r.ok;
  };
  const owned = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id && a.owned && a.status === 'active');
  const pledged = new Set((airline.loans ?? []).map((l) => l.aircraftId).filter(Boolean));

  return (
    <div className="grid">
      {(airline.bankruptAt || airline.cashNegativeSince) && (
        <Panel title={t('debt.troubleTitle')} code="!" className="panel--wide">
          <p className="text--warning">
            {airline.bankruptAt
              ? t('debt.bankrupt')
              : t('debt.negative', { count: Math.max(0, INSOLVENCY_DAYS - Math.floor((game.time - airline.cashNegativeSince!) / MINUTES_PER_DAY)) })}
          </p>
        </Panel>
      )}
      <Panel title={t('debt.balanceTitle')} code="BS">
        <dl className="facts">
          <dt>{t('debt.cash')}</dt>
          <dd className="mono">{m(Math.max(0, b.cash))}</dd>
          <dt>{t('debt.aircraft')}</dt>
          <dd className="mono">{m(b.aircraft)}</dd>
          <dt>{t('debt.prepayments')}</dt>
          <dd className="mono">{m(b.prepayments)}</dd>
          <dt>{t('debt.deposits')}</dt>
          <dd className="mono">{m(b.deposits)}</dd>
          <dt>{t('debt.other')}</dt>
          <dd className="mono">{m(b.other)}</dd>
          {b.collateral > 0 && (
            <>
              <dt>{t('debt.collateral')}</dt>
              <dd className="mono">{m(b.collateral)}</dd>
            </>
          )}
          {b.investments > 0 && (
            <>
              <dt>{t('debt.investments')}</dt>
              <dd className="mono">{m(b.investments)}</dd>
            </>
          )}
          {b.hedges > 0 && (
            <>
              <dt>{t('debt.hedgesAsset')}</dt>
              <dd className="mono">{m(b.hedges)}</dd>
            </>
          )}
          <dt>
            <strong>{t('debt.assets')}</strong>
          </dt>
          <dd className="mono">
            <strong>{m(b.totalAssets)}</strong>
          </dd>
          <dt>{t('debt.loans')}</dt>
          <dd className="mono">{m(b.loans)}</dd>
          <dt>{t('debt.leases')}</dt>
          <dd className="mono">{m(b.leases)}</dd>
          {b.loyalty > 0 && (
            <>
              <dt>{t('debt.loyalty')}</dt>
              <dd className="mono">{m(b.loyalty)}</dd>
            </>
          )}
          {b.hedges < 0 && (
            <>
              <dt>{t('debt.hedgesLiability')}</dt>
              <dd className="mono text--warning">{m(-b.hedges)}</dd>
            </>
          )}
          {b.cash < 0 && (
            <>
              <dt>{t('debt.overdraft')}</dt>
              <dd className="mono text--warning">{m(-b.cash)}</dd>
            </>
          )}
          <dt>
            <strong>{t('debt.equity')}</strong>
          </dt>
          <dd className={`mono ${b.equity < 0 ? 'text--warning' : 'text--normal'}`}>
            <strong>{m(b.equity)}</strong>
          </dd>
        </dl>
        <p className="small muted">{t('debt.balanceNote')}</p>
      </Panel>

      <Panel title={t('debt.ratingTitle')} code={view.rating}>
        <p>
          <span className={`bignum mono ${['AAA', 'AA', 'A', 'BBB'].includes(view.rating) ? 'text--normal' : 'text--caution'}`}>{view.rating}</span>{' '}
          <span className="small muted">{t(['AAA', 'AA', 'A', 'BBB'].includes(view.rating) ? 'debt.investmentGrade' : 'debt.speculative')}</span>
        </p>
        <dl className="facts facts--compact">
          <dt>{t('debt.leverage')}</dt>
          <dd className="mono">{view.leverage === null ? '—' : t('debt.years', { value: formatNumber(language, view.leverage, 1) })}</dd>
          <dt>{t('debt.liquidity')}</dt>
          <dd className="mono">{pct(view.liquidity * 100)}</dd>
          <dt>{t('debt.margin')}</dt>
          <dd className="mono">{view.margin === null ? '—' : pct(view.margin * 100)}</dd>
          <dt>{t('debt.baseRate')}</dt>
          <dd className="mono">{pct(base)}</dd>
          <dt>{t('debt.spread')}</dt>
          <dd className="mono">+{pct(SPREAD[view.rating])}</dd>
        </dl>
        <p className="small muted">{t('debt.ratingNote')}</p>
      </Panel>

      <Panel title={t('debt.loansTitle')} code="DEBT" className="panel--wide">
        {(airline.loans ?? []).length === 0 ? (
          <p className="muted small">{t('debt.noLoans')}</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('debt.kind')}</th>
                  <th className="num">{t('debt.outstanding')}</th>
                  <th className="num">{t('debt.rate')}</th>
                  <th>{t('debt.until')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {airline.loans!.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {t(`debt.kinds.${l.kind}`)}
                      {l.aircraftId && <span className="muted small"> · {game.aircraft[l.aircraftId]?.registration}</span>}
                    </td>
                    <td className="num mono">{m(l.outstanding)}</td>
                    <td className="num mono">{pct(l.rate)}</td>
                    <td className="small">{formatGameDate(language, toDate(l.endAt), false)}</td>
                    <td>
                      {l.kind !== 'bond' && (
                        <button type="button" className="button button--small" onClick={() => void run({ type: 'RepayLoan', airlineId: airline.id, payload: { loanId: l.id } })}>
                          {t('debt.repay')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">{t('debt.loansNote')}</p>
        {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
      </Panel>

      <Panel title={t('debt.borrowTitle')} code="LOAN" className="panel--wide">
        <p className="small muted">{t('debt.borrowIntro')}</p>
        {offers
          .filter((o) => o.kind !== 'aircraft')
          .map((o) => (
            <OfferForm key={o.kind} offer={o} airline={airline} m={m} pct={pct} onDone={setError} />
          ))}
        {owned.length > 0 && <span className="field__label">{t('debt.aircraftTitle')}</span>}
        <ul className="plain-list">
          {owned.map((a) => {
            const offer = offers.find((o) => o.kind === 'aircraft' && o.aircraftId === a.id);
            const value = convert(money(aircraftMarketValueUsd(a, game.time), 'USD'), airline.currency, game.fx).amount;
            return (
              <li key={a.id} className="notice">
                <p>
                  <strong className="mono">{a.registration}</strong> · {t('debt.marketValue', { value: m(value) })}
                  {pledged.has(a.id) && <span className="chip chip--caution">{t('debt.pledged')}</span>}
                </p>
                {offer && <OfferForm offer={offer} airline={airline} m={m} pct={pct} onDone={setError} />}
                {!pledged.has(a.id) && (
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() => window.confirm(t('debt.slbConfirm', { registration: a.registration })) && void run({ type: 'SaleLeaseback', airlineId: airline.id, payload: { aircraftId: a.id } })}
                  >
                    {t('debt.slb')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function OfferForm({ offer, airline, m, pct, onDone }: { offer: LoanOffer; airline: Airline; m: (v: number) => string; pct: (v: number) => string; onDone: (e: CommandError | null) => void }) {
  const { t } = useTranslation();
  const [years, setYears] = useState(offer.years[Math.min(1, offer.years.length - 1)]!);
  const [amount, setAmount] = useState(Math.round(Math.min(offer.max, Math.max(offer.min, offer.max / 2)) / 100_000) * 100_000);
  if (offer.refusal) {
    return (
      <p className="small">
        <strong>{t(`debt.kinds.${offer.kind}`)}</strong>: <span className="muted">{t(`debt.refusal.${offer.refusal}`)}</span>
      </p>
    );
  }
  const take = async () => {
    const r = await sendCommand({ type: 'TakeLoan', airlineId: airline.id, payload: { kind: offer.kind, amount, years, ...(offer.aircraftId ? { aircraftId: offer.aircraftId } : {}) } });
    onDone(r.ok ? null : r.error);
  };
  return (
    <div className="loan-offer">
      {offer.kind !== 'aircraft' && <span className="field__label">{t(`debt.kinds.${offer.kind}`)}</span>}
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('debt.amount', { min: m(offer.min), max: m(offer.max) })}</span>
          <input className="input mono" type="number" min={offer.min} max={offer.max} step={100_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <label className="field">
          <span className="field__label">{t('debt.term')}</span>
          <select className="input" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {offer.years.map((y) => (
              <option key={y} value={y}>
                {t('debt.yearsAt', { count: y, rate: pct(offer.rate(y)) })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small muted">{t(offer.kind === 'bond' ? 'debt.bondNote' : 'debt.monthly', { value: m((amount * offer.rate(years)) / 100 / 12) })}</p>
      <button type="button" className="button button--primary button--small" onClick={() => void take()}>
        {t(`debt.take.${offer.kind}`)}
      </button>
    </div>
  );
}
