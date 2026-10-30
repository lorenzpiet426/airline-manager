import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_ISSUE_SHARE } from '../../data/shares';
import type { CommandError } from '../../engine/commands';
import { fundamentalValue, inBlackout, ipoReady, playerShares, playerWealth } from '../../engine/shares';
import type { Airline, Equity, GameState } from '../../engine/state';
import { toDate } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { usePlayer } from '../game/usePlayer';
import { hrefFor } from '../navigation';

/** Shares (Phase 10.3): price, value, shareholders, the player's stake and wealth, and the airline's capital decisions. */
export function SharesScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  if (!game || !airline || !airline.equity) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('shares.title')}</h1>
        <Panel title={t('shares.title')}>
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
      <h1 className="screen__title">{t('shares.title')}</h1>
      <div className="grid">
        <PricePanel game={game} airline={airline} e={airline.equity} />
        <HoldersPanel airline={airline} e={airline.equity} />
        <YouPanel game={game} airline={airline} e={airline.equity} />
        <CapitalPanel game={game} airline={airline} e={airline.equity} />
      </div>
    </div>
  );
}

function useMoney(airline: Airline) {
  const { language } = useSettings();
  return {
    m: (v: number) => formatMoney(language, { amount: Math.round(v), currency: airline.currency }),
    px: (v: number) => `${formatNumber(language, v, 2)} ${airline.currency}`,
    n: (v: number, d = 0) => formatNumber(language, v, d),
  };
}

function PricePanel({ game, airline, e }: { game: GameState; airline: Airline; e: Equity }) {
  const { t } = useTranslation();
  const { m, px, n } = useMoney(airline);
  const hist = e.history.slice(-52);
  const first = hist[0]?.[1] ?? e.price;
  const change = first > 0 ? e.price / first - 1 : 0;
  const max = Math.max(...hist.map((h) => h[1]), e.price);
  const min = Math.min(...hist.map((h) => h[1]), e.price);
  const span = Math.max(1e-9, max - min);
  const mood = game.stocks?.mood ?? 1;
  return (
    <Panel title={t(e.listed ? 'shares.priceListed' : 'shares.priceUnlisted')} code="PX">
      <p>
        <span className="bignum mono">{px(e.price)}</span>{' '}
        <span className={`mono ${change >= 0 ? 'text--normal' : 'text--warning'}`}>
          {change >= 0 ? '▲' : '▼'} {n(Math.abs(change) * 100, 1)} %
        </span>{' '}
        <span className="small muted">{t('shares.overYear')}</span>
      </p>
      {hist.length > 1 && (
        <svg className="share-chart" viewBox="0 0 300 80" role="img" aria-label={t('shares.chart')}>
          <polyline points={hist.map(([, p], i) => `${(i / (hist.length - 1)) * 300},${75 - ((p - min) / span) * 70}`).join(' ')} />
        </svg>
      )}
      <dl className="facts facts--compact">
        <dt>{t('shares.marketValue')}</dt>
        <dd className="mono">{m(e.price * e.shares)}</dd>
        <dt>{t('shares.fundamental')}</dt>
        <dd className="mono">{px(fundamentalValue(game, airline) / e.shares)}</dd>
        <dt>{t('shares.mood')}</dt>
        <dd className={`mono ${mood < 0.9 ? 'text--caution' : mood > 1.1 ? 'text--normal' : ''}`}>{t(mood < 0.8 ? 'shares.moodBad' : mood < 0.95 ? 'shares.moodWeak' : mood > 1.1 ? 'shares.moodGood' : 'shares.moodNormal')}</dd>
        <dt>{t('shares.count')}</dt>
        <dd className="mono">{n(e.shares)}</dd>
      </dl>
      <p className="small muted">{t('shares.priceNote')}</p>
    </Panel>
  );
}

function HoldersPanel({ airline, e }: { airline: Airline; e: Equity }) {
  const { t } = useTranslation();
  const { n } = useMoney(airline);
  return (
    <Panel title={t('shares.holders')} code="OWN">
      <ul className="plain-list">
        {[...e.holders]
          .filter((h) => h.shares > 0)
          .sort((a, b) => b.shares - a.shares)
          .map((h) => (
            <li key={h.kind}>
              <span className="mono">{n((h.shares / e.shares) * 100, 1)} %</span> · {['state', 'group'].includes(h.kind) ? h.name : t(`shares.holder.${h.kind}`)}
            </li>
          ))}
      </ul>
      <p className="small muted">{t('shares.holdersNote')}</p>
    </Panel>
  );
}

function YouPanel({ game, airline, e }: { game: GameState; airline: Airline; e: Equity }) {
  const { t } = useTranslation();
  const { m, n } = useMoney(airline);
  const [count, setCount] = useState(1000);
  const [error, setError] = useState<CommandError | null>(null);
  const mine = playerShares(e);
  const blackout = inBlackout(game.time);
  const trade = async (shares: number) => {
    const r = await sendCommand({ type: 'TradeOwnShares', airlineId: airline.id, payload: { shares } });
    setError(r.ok ? null : r.error);
  };
  return (
    <Panel title={t('shares.you')} code="CEO">
      <dl className="facts facts--compact">
        <dt>{t('shares.yourShares')}</dt>
        <dd className="mono">
          {n(mine)} · {n((mine / e.shares) * 100, 2)} %
        </dd>
        <dt>{t('shares.yourSharesValue')}</dt>
        <dd className="mono">{m(mine * e.price)}</dd>
        <dt>{t('shares.yourCash')}</dt>
        <dd className="mono">{m(e.playerCash)}</dd>
        <dt>
          <strong>{t('shares.wealth')}</strong>
        </dt>
        <dd className="mono">
          <strong>{m(playerWealth(e))}</strong>
        </dd>
      </dl>
      <p className="small muted">{t('shares.payNote')}</p>
      {e.listed && (
        <>
          <div className="field-row">
            <label className="field">
              <span className="field__label">{t('shares.tradeCount')}</span>
              <input className="input mono" type="number" min={1} step={100} value={count} onChange={(ev) => setCount(Math.max(1, Math.round(Number(ev.target.value))))} />
            </label>
          </div>
          <div className="toolbar-row">
            <button type="button" className="button" disabled={blackout} onClick={() => void trade(count)}>
              {t('shares.buy')}
            </button>
            <button type="button" className="button" disabled={blackout} onClick={() => void trade(-count)}>
              {t('shares.sell')}
            </button>
          </div>
          {blackout && <p className="small text--caution">{t('shares.blackout')}</p>}
        </>
      )}
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}

function CapitalPanel({ game, airline, e }: { game: GameState; airline: Airline; e: Equity }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { m, n } = useMoney(airline);
  const [ipo, setIpo] = useState(25);
  const [issue, setIssue] = useState(10);
  const [back, setBack] = useState(5);
  const [dividend, setDividend] = useState(Math.max(0, Math.round(airline.cash.amount * 0.02)));
  const [error, setError] = useState<CommandError | null>(null);
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
  };
  const ready = ipoReady(game, airline);
  return (
    <Panel title={t('shares.capital')} code="CAP" className="panel--wide">
      {!e.listed ? (
        <>
          <p className="small">{ready ? t(`shares.ipoNot.${ready}`) : t('shares.ipoReady')}</p>
          {!ready && (
            <>
              <label className="field">
                <span className="field__label">{t('shares.ipoShare')}</span>
                <input className="input mono" type="number" min={10} max={40} value={ipo} onChange={(ev) => setIpo(Number(ev.target.value))} />
              </label>
              <p className="small muted">{t('shares.ipoQuote', { amount: m(((e.shares * ipo) / (100 - ipo)) * e.price * 0.9 * 0.96) })}</p>
              <button type="button" className="button button--primary" onClick={() => window.confirm(t('shares.ipoConfirm')) && void run({ type: 'GoPublic', airlineId: airline.id, payload: { share: ipo / 100 } })}>
                {t('shares.ipo')}
              </button>
            </>
          )}
        </>
      ) : (
        <div className="field-row capital-row">
          <div className="field">
            <span className="field__label">{t('shares.issue')}</span>
            <input className="input mono" type="number" min={1} max={MAX_ISSUE_SHARE * 100} value={issue} onChange={(ev) => setIssue(Number(ev.target.value))} />
            <span className="small muted">{t('shares.issueQuote', { amount: m(e.shares * (issue / 100) * e.price * 0.95 * 0.97) })}</span>
            <button type="button" className="button" onClick={() => void run({ type: 'IssueShares', airlineId: airline.id, payload: { share: issue / 100 } })}>
              {t('shares.issueButton')}
            </button>
          </div>
          <div className="field">
            <span className="field__label">{t('shares.buyback')}</span>
            <input className="input mono" type="number" min={1} max={MAX_ISSUE_SHARE * 100} value={back} onChange={(ev) => setBack(Number(ev.target.value))} />
            <span className="small muted">{t('shares.buybackQuote', { amount: m(e.shares * (back / 100) * e.price * 1.02) })}</span>
            <button type="button" className="button" onClick={() => void run({ type: 'BuyBack', airlineId: airline.id, payload: { share: back / 100 } })}>
              {t('shares.buybackButton')}
            </button>
          </div>
        </div>
      )}
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('shares.dividend')}</span>
          <input className="input mono" type="number" min={0} step={100_000} value={dividend} onChange={(ev) => setDividend(Number(ev.target.value))} />
        </label>
        <div className="field">
          <span className="field__label">&nbsp;</span>
          <button type="button" className="button" onClick={() => void run({ type: 'PayDividend', airlineId: airline.id, payload: { total: dividend } })}>
            {t('shares.dividendButton', { perShare: n(dividend / e.shares, 2) })}
          </button>
        </div>
      </div>
      {e.dividends.length > 0 && (
        <p className="small muted">
          {t('shares.lastDividends')}{' '}
          {e.dividends
            .slice(-4)
            .map((d) => `${formatGameDate(language, toDate(d.at), false)}: ${m(d.total)}`)
            .join(' · ')}
        </p>
      )}
      <p className="small muted">{t('shares.capitalNote')}</p>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}
