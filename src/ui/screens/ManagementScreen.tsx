import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEPARTMENTS, type Delegation, type Department } from '../../data/managers';
import type { CommandError } from '../../engine/commands';
import { leaseRentFactor, recruitingFactor, reliabilityFactor, salaryUsdNow } from '../../engine/managers';
import { convert, money } from '../../engine/money';
import type { Airline, GameState, Manager, Proposal } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import type { UnionGroup } from '../../data/unions';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { unionName } from '../fleet/Unions';
import { useEngineWorld } from '../game/useEngineWorld';
import { usePlayer } from '../game/usePlayer';
import { hrefFor } from '../navigation';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Money helpers in the airline's book currency. */
function useMoney(game: GameState, airline: Airline) {
  const { language } = useSettings();
  const fmt = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx), false);
  return { fmt, signed: (usd: number) => (usd >= 0 ? '+' : '') + fmt(usd) };
}

/** A proposal or decision in words. */
function useProposalText() {
  const { t } = useTranslation();
  const { language } = useSettings();
  return (p: Proposal, fmt: (usd: number) => string) => {
    const q = p.params;
    if (p.kind === 'wageOffer') {
      return t('mgmt.proposal.wageOffer', {
        union: unionName(t, String(q.country), q.group as UnionGroup),
        group: t(`unions.group.${q.group}`),
        offer: `${formatNumber(language, Number(q.offer), 1)} %`,
        demand: `${formatNumber(language, Number(q.demand), 1)} %`,
      });
    }
    if (p.kind === 'buildHangar') return t('mgmt.proposal.buildHangar', { size: t(`mgmt.size.${q.size}`), cost: fmt(Number(q.usd)) });
    return t(`mgmt.proposal.${p.kind}`, { ...q, count: Number(q.weeks ?? q.frequency ?? 0) });
  };
}

/** Management (Phase 8.3): heads of department, how far they may decide, their proposals and their track record. */
export function ManagementScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const world = useEngineWorld();
  if (!game || !airline || !world || !airline.mgmt) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('mgmt.title')}</h1>
        <Panel title={t('mgmt.title')}>
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
      <h1 className="screen__title">{t('mgmt.title')}</h1>
      <Inbox game={game} airline={airline} />
      {DEPARTMENTS.map((dept) => (
        <DepartmentPanel key={dept} game={game} world={world} airline={airline} dept={dept} />
      ))}
      <TrackRecord game={game} airline={airline} />
    </div>
  );
}

function Inbox({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { fmt, signed } = useMoney(game, airline);
  const text = useProposalText();
  const [error, setError] = useState<CommandError | null>(null);
  const proposals = [...airline.mgmt!.proposals].sort((a, b) => b.at - a.at);
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
  };
  return (
    <Panel title={t('mgmt.inbox', { count: proposals.length })} code="INBOX">
      <p className="muted small">{t('mgmt.inboxIntro')}</p>
      {proposals.length === 0 && <p className="muted">{t('mgmt.inboxEmpty')}</p>}
      <ul className="plain-list">
        {proposals.map((p) => (
          <li key={p.id} className="notice">
            <p className="small muted">
              {t(`mgmt.dept.${p.dept}`)} · {airline.mgmt!.heads[p.dept]?.name ?? ''} · {formatGameDate(language, toDate(p.at), false)}
            </p>
            <p>{text(p, fmt)}</p>
            {p.forecastUsd !== null && <p className="small mono">{t('mgmt.expected', { value: signed(p.forecastUsd) })}</p>}
            {p.advice ? (
              <div className="toolbar-row">
                <span className="small muted">{t('mgmt.adviceOnly')}</span>
                <button type="button" className="button button--small" onClick={() => void run({ type: 'DeclineProposal', airlineId: airline.id, payload: { id: p.id } })}>
                  {t('mgmt.dismiss')}
                </button>
              </div>
            ) : (
              <div className="toolbar-row">
                <button type="button" className="button button--primary button--small" onClick={() => void run({ type: 'ApproveProposal', airlineId: airline.id, payload: { id: p.id } })}>
                  {t('mgmt.approve')}
                </button>
                <button type="button" className="button button--small" onClick={() => void run({ type: 'DeclineProposal', airlineId: airline.id, payload: { id: p.id } })}>
                  {t('mgmt.decline')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="notice notice--error">{t(`errors.${error}`, { defaultValue: t('mgmt.notPossible') })}</p>}
    </Panel>
  );
}

function ManagerCard({ m, salary, extra }: { m: Manager; salary: string; extra?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="notice">
      <p>
        <strong>{m.name}</strong> <span className="mono text--caution" aria-label={t('mgmt.skillLabel', { count: m.skill })}>{stars(m.skill)}</span>
      </p>
      <p className="small muted">
        {t('mgmt.experience', { count: m.experience })}
        {m.specialty && ` · ${t(`mgmt.spec.${m.specialty}`)}`} · {t('mgmt.salary', { value: salary })}
      </p>
      {extra}
    </div>
  );
}

function DepartmentPanel({ game, world, airline, dept }: { game: GameState; world: EngineWorld; airline: Airline; dept: Department }) {
  const { t } = useTranslation();
  const { fmt } = useMoney(game, airline);
  const [error, setError] = useState<CommandError | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);
  const mg = airline.mgmt!;
  const head = mg.heads[dept];
  const candidates = mg.candidates.filter((c) => c.dept === dept);
  const salary = (m: Manager) => fmt(salaryUsdNow(world, airline, m, game.time));
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
    return r.ok;
  };
  const pct = (f: number) => `${f < 1 ? '−' : '+'}${Math.round(Math.abs(1 - f) * 100)} %`;
  const effect =
    head && dept === 'maintenance'
      ? t('mgmt.effect.maintenance', { value: pct(reliabilityFactor(airline, false)) })
      : head && dept === 'hr'
        ? t('mgmt.effect.hr', { value: pct(recruitingFactor(airline)) })
        : head && dept === 'fleet'
          ? t('mgmt.effect.fleet', { value: pct(leaseRentFactor(airline)) })
          : null;

  return (
    <Panel title={t(`mgmt.dept.${dept}`)} code={dept.slice(0, 4).toUpperCase()}>
      <p className="muted small">{t(`mgmt.does.${dept}`)}</p>
      {head ? (
        <ManagerCard
          m={head}
          salary={salary(head)}
          extra={
            <>
              {effect && <p className="small text--normal">{effect}</p>}
              <button type="button" className="button button--small" onClick={() => void run({ type: 'FireManager', airlineId: airline.id, payload: { dept } })}>
                {t('mgmt.fire')}
              </button>
            </>
          }
        />
      ) : (
        <p className="small">{dept === 'hr' ? t('mgmt.noHeadHr') : t('mgmt.noHead')}</p>
      )}
      <span className="field__label">{t('mgmt.delegation')}</span>
      <Segmented<Delegation>
        label={t('mgmt.delegation')}
        value={mg.delegation[dept]}
        options={(['advise', 'approve', 'auto'] as const).map((v) => ({ value: v, label: t(`mgmt.level.${v}`) }))}
        onChange={(level) => void run({ type: 'SetDelegation', airlineId: airline.id, payload: { dept, level } })}
      />
      <p className="small muted">{t(`mgmt.levelNote.${mg.delegation[dept]}`)}</p>
      <button type="button" className="button button--small" onClick={() => setShowCandidates(!showCandidates)}>
        {showCandidates ? t('mgmt.hideCandidates') : t('mgmt.showCandidates', { count: candidates.length })}
      </button>
      {showCandidates && (
        <>
          <p className="small muted">{t('mgmt.candidatesNote')}</p>
          {candidates.map((c) => (
            <ManagerCard
              key={c.id}
              m={c}
              salary={salary(c)}
              extra={
                <button type="button" className="button button--primary button--small" onClick={() => void run({ type: 'HireManager', airlineId: airline.id, payload: { candidateId: c.id } })}>
                  {head ? t('mgmt.replace') : t('mgmt.hire')}
                </button>
              }
            />
          ))}
        </>
      )}
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}

function TrackRecord({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { fmt, signed } = useMoney(game, airline);
  const text = useProposalText();
  const decisions = [...airline.mgmt!.decisions].reverse().slice(0, 25);
  return (
    <Panel title={t('mgmt.record')} code="LOG">
      <p className="muted small">{t('mgmt.recordIntro')}</p>
      {decisions.length === 0 && <p className="muted">{t('mgmt.recordEmpty')}</p>}
      <ul className="plain-list">
        {decisions.map((d) => (
          <li key={d.id} className="small">
            <span className="muted">
              {formatGameDate(language, toDate(d.decidedAt), false)} · {t(`mgmt.dept.${d.dept}`)} · {t(`mgmt.by.${d.by}`)}
            </span>
            <br />
            {text(d, fmt)}
            {d.forecastUsd !== null && (
              <>
                <br />
                <span className="mono">
                  {t('mgmt.expected', { value: signed(d.forecastUsd) })} ·{' '}
                  {game.time >= d.revealAt && d.actualUsd !== null ? (
                    <span className={d.actualUsd >= 0 ? 'text--normal' : 'text--warning'}>{t('mgmt.actual', { value: signed(d.actualUsd) })}</span>
                  ) : (
                    <span className="muted">{t('mgmt.actualLater', { date: formatGameDate(language, toDate(d.revealAt), false) })}</span>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
