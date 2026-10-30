import { useTranslation } from 'react-i18next';
import { DISMISS_BELOW, HONEYMOON_MONTHS, WARNING_BELOW } from '../../data/board';
import { boardSeats, careerRecord, measure, playerControls } from '../../engine/board';
import { playerWealth } from '../../engine/shares';
import type { Airline, Board, BoardTarget, GameState, TargetKind } from '../../engine/state';
import { MINUTES_PER_DAY, toDate } from '../../engine/time';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';
import { usePlayer } from '../game/usePlayer';
import { hrefFor } from '../navigation';

/** Board (Phase 10.4): the owners' targets, the board's confidence in the CEO, reviews, members and the career. */
export function BoardScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  if (!game || !airline || !airline.board) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('directors.title')}</h1>
        <Panel title={t('directors.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
          <a href={hrefFor('new')} className="button button--primary">
            {t('ops.newGame')}
          </a>
        </Panel>
      </div>
    );
  }
  const board = airline.board;
  return (
    <div className="screen">
      <h1 className="screen__title">{t('directors.title')}</h1>
      <div className="grid">
        {board.dismissedAt !== undefined && <DismissedPanel game={game} airline={airline} board={board} />}
        <ConfidencePanel game={game} airline={airline} board={board} />
        <TargetsPanel game={game} airline={airline} board={board} />
        <ReviewsPanel board={board} />
        <MembersPanel airline={airline} />
        <CareerPanel game={game} airline={airline} />
      </div>
    </div>
  );
}

/** Value and goal of a target, formatted (percent or months of costs). */
function useTargetFormat() {
  const { language } = useSettings();
  return (kind: TargetKind, v: number) => {
    if (kind === 'cash') return `${formatNumber(language, v, 1)}`;
    const signed = kind === 'margin' || kind === 'sharePrice' || kind === 'jobs' || kind === 'destinations';
    return `${signed && v > 0 ? '+' : ''}${formatNumber(language, v * 100, 1)} %`;
  };
}

const nextReview = (time: number) => {
  const d = toDate(time);
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 1));
};

function DismissedPanel({ game, airline, board }: { game: GameState; airline: Airline; board: Board }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const job = game.career?.jobs.at(-1);
  const wealth = formatMoney(language, { amount: Math.round(game.career?.wealthEur ?? 0), currency: 'EUR' });
  return (
    <Panel title={t(job?.reason === 'bankrupt' ? 'directors.bankruptTitle' : 'directors.dismissedTitle')} code="!" className="panel--wide">
      <p className="text--warning">
        {t(job?.reason === 'bankrupt' ? 'directors.bankruptText' : 'directors.dismissedText', { name: airline.name, date: formatGameDate(language, toDate(board.dismissedAt!), false) })}
      </p>
      <p>{t('directors.leaveWith', { wealth })}</p>
      <a href={hrefFor('new', { career: '1' })} className="button button--primary">
        {t('directors.nextJob')}
      </a>
      <p className="small muted">{t('directors.oldGameKept')}</p>
    </Panel>
  );
}

function ConfidencePanel({ game, airline, board }: { game: GameState; airline: Airline; board: Board }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const c = board.confidence;
  const tone = c >= 50 ? 'text--normal' : c >= WARNING_BELOW ? 'text--caution' : 'text--warning';
  const honeymoon = game.time - board.since < HONEYMOON_MONTHS * 30.44 * MINUTES_PER_DAY;
  const status = board.dismissedAt !== undefined ? 'dismissed' : playerControls(airline) ? 'controls' : board.warnedAt !== undefined ? 'warned' : c < 50 ? 'doubts' : 'trust';
  return (
    <Panel title={t('directors.confidence')} code="CONF">
      <p>
        <span className={`bignum mono ${tone}`}>{formatNumber(language, c, 0)}</span> <span className="muted small">/ 100</span>
      </p>
      <span className="meter board-meter" role="img" aria-label={t('directors.confidence')}>
        <span className="meter__fill" style={{ width: `${c}%`, background: `var(--${c >= 50 ? 'green' : c >= WARNING_BELOW ? 'amber' : 'red'})` }} />
        <span className="board-meter__line" style={{ left: `${WARNING_BELOW}%` }} />
        <span className="board-meter__line" style={{ left: `${DISMISS_BELOW}%` }} />
      </span>
      <p className={status === 'trust' || status === 'controls' ? '' : tone}>{t(`directors.status.${status}`)}</p>
      <dl className="facts facts--compact">
        <dt>{t('directors.owners')}</dt>
        <dd>{t(`directors.owner.${board.owner}`)}</dd>
        <dt>{t('directors.since')}</dt>
        <dd>{formatGameDate(language, toDate(board.since), false)}</dd>
        {board.dismissedAt === undefined && (
          <>
            <dt>{t('directors.nextReview')}</dt>
            <dd>{formatGameDate(language, nextReview(game.time), false)}</dd>
          </>
        )}
      </dl>
      {honeymoon && board.dismissedAt === undefined && <p className="small text--info">{t('directors.honeymoon')}</p>}
      <p className="small muted">{t('directors.confidenceNote', { warning: WARNING_BELOW, dismiss: DISMISS_BELOW })}</p>
    </Panel>
  );
}

function TargetsPanel({ game, airline, board }: { game: GameState; airline: Airline; board: Board }) {
  const { t } = useTranslation();
  const fmt = useTargetFormat();
  const row = (target: BoardTarget) => {
    const value = measure(game, airline, board, target);
    const ok = value !== null && target.goal !== null && value >= target.goal;
    return (
      <tr key={target.kind}>
        <td>
          {t(`directors.target.${target.kind}`)}
          <span className="muted small"> · {Math.round(target.weight * 100)} %</span>
        </td>
        <td className="num mono">{target.goal === null ? <span className="muted">{t('directors.goalPending')}</span> : `≥ ${fmt(target.kind, target.goal)}`}</td>
        <td className={`num mono ${value === null || target.goal === null ? '' : ok ? 'text--normal' : 'text--caution'}`}>{value === null ? '—' : fmt(target.kind, value)}</td>
      </tr>
    );
  };
  return (
    <Panel title={t('directors.targetsTitle', { year: board.year })} code="TGT">
      <p className="small">{t(`directors.ownerWants.${board.owner}`)}</p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t('directors.targetCol')}</th>
              <th className="num">{t('directors.goal')}</th>
              <th className="num">{t('directors.now')}</th>
            </tr>
          </thead>
          <tbody>{board.targets.map(row)}</tbody>
        </table>
      </div>
      <p className="small muted">{t('directors.targetsNote')}</p>
    </Panel>
  );
}

function ReviewsPanel({ board }: { board: Board }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const n = (v: number) => `${v > 0 ? '+' : ''}${formatNumber(language, v, 1)}`;
  return (
    <Panel title={t('directors.reviews')} code="REV">
      {board.reviews.length === 0 && board.events.length === 0 ? (
        <p className="muted small">{t('directors.noReviews')}</p>
      ) : (
        <ul className="plain-list">
          {[...board.reviews].reverse().map((r) => (
            <li key={r.at}>
              <span className="mono">{formatGameDate(language, toDate(r.at), false)}</span> ·{' '}
              <span className={`mono ${r.delta >= 0 ? 'text--normal' : 'text--caution'}`}>{n(r.delta)}</span> → <span className="mono">{formatNumber(language, r.confidence, 0)}</span> ·{' '}
              <span className={r.outcome === 'warning' || r.outcome === 'dismissed' ? 'text--warning' : ''}>{t(`directors.outcome.${r.outcome}`)}</span>
              {r.crisis && <span className="chip">{t('directors.crisis')}</span>}
            </li>
          ))}
          {[...board.events].reverse().slice(0, 6).map((e) => (
            <li key={`${e.at}${e.kind}`} className="small muted">
              <span className="mono">{formatGameDate(language, toDate(e.at), false)}</span> · {t(`directors.event.${e.kind}`)} <span className="mono text--caution">{n(e.delta)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MembersPanel({ airline }: { airline: Airline }) {
  const { t } = useTranslation();
  const world = useEngineWorld();
  const country = world?.airportById.get(airline.hubId)?.country ?? '';
  const seats = boardSeats(airline, country);
  return (
    <Panel title={t('directors.members')} code="SB">
      <ul className="plain-list">
        {seats.map((s) => (
          <li key={s.kind}>
            <span className="mono">{s.seats}</span> · {['state', 'group'].includes(s.kind) ? s.name : t(`directors.seat.${s.kind}`)}
          </li>
        ))}
      </ul>
      <p className="small muted">{t('directors.membersNote')}</p>
    </Panel>
  );
}

function CareerPanel({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const jobs = game.career?.jobs ?? [];
  const record = careerRecord(game.career);
  const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(language, v * 100, 1)} %`);
  return (
    <Panel title={t('directors.career')} code="CEO">
      <dl className="facts facts--compact">
        <dt>{t('directors.wealth')}</dt>
        <dd className="mono">
          {game.dismissed !== undefined
            ? formatMoney(language, { amount: Math.round(game.career?.wealthEur ?? 0), currency: 'EUR' })
            : formatMoney(language, { amount: Math.round(playerWealth(airline.equity)), currency: airline.currency })}
        </dd>
        {jobs.length > 0 && (
          <>
            <dt>{t('directors.years')}</dt>
            <dd className="mono">{formatNumber(language, record.years, 1)}</dd>
            <dt>{t('directors.avgMargin')}</dt>
            <dd className="mono">{pct(record.margin)}</dd>
          </>
        )}
      </dl>
      {jobs.length === 0 ? (
        <p className="small muted">{t('directors.firstJob')}</p>
      ) : (
        <ul className="plain-list small">
          {jobs.map((j) => (
            <li key={j.from}>
              <strong>{j.airline}</strong> · {formatGameDate(language, toDate(j.from), false)} – {formatGameDate(language, toDate(j.to), false)} · {t('directors.marginShort', { value: pct(j.margin) })} · {t(`directors.reason.${j.reason}`)}
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">{t('directors.careerNote')}</p>
    </Panel>
  );
}
