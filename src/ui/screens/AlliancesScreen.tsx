import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CODESHARE_ANNUAL_USD, CODESHARE_SETUP_USD, OWN_ALLIANCE_FOUND_USD, REAL_ALLIANCES, REQUIREMENTS, type RealAlliance } from '../../data/allianceRules';
import { priceLevelAt } from '../../engine/era';
import {
  allianceById,
  allianceChecks,
  allianceMembers,
  annualFeeUsd,
  codeshareRefusal,
  joinFeeUsd,
  membershipOf,
  ownAllianceRefusal,
  realAllianceOf,
  sizeOf,
  type Check,
} from '../../engine/alliances';
import { stationsOf } from '../../engine/bases';
import type { CommandError } from '../../engine/commands';
import type { Airline, GameState } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';
import { usePlayer } from '../game/usePlayer';
import { hrefFor } from '../navigation';

/** Alliances and codeshares (Phase 11.1). */
export function AlliancesScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const world = useEngineWorld();
  if (!game || !airline || !world) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('alliance.title')}</h1>
        <Panel title={t('alliance.title')}>
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
      <h1 className="screen__title">{t('alliance.title')}</h1>
      <div className="grid">
        <StatusPanel game={game} world={world} airline={airline} />
        {REAL_ALLIANCES.map((a) => (
          <AlliancePanel key={a.id} game={game} world={world} airline={airline} alliance={a} />
        ))}
        <OwnAlliancePanel game={game} world={world} airline={airline} />
        <CodesharePanel game={game} world={world} airline={airline} />
      </div>
    </div>
  );
}

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
  return error ? <p className="notice notice--error">{t(`alliance.err.${error}`, { defaultValue: t(`errors.${error}`) })}</p> : null;
}

function useMoney(game: GameState, airline: Airline) {
  const { language } = useSettings();
  return (usd: number) => formatMoney(language, { amount: Math.round((usd * (game.fx[airline.currency] ?? 1)) / (game.fx.USD ?? 1)), currency: airline.currency });
}

function StatusPanel({ game, world, airline }: { game: GameState; world: EngineWorld; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { error, run } = useRun();
  const m = membershipOf(game, world, airline);
  const name = m ? (m.alliance === 'own' ? (airline.ownAlliance?.name ?? '') : (allianceById(m.alliance)?.name ?? m.alliance)) : '';
  const date = (time?: number) => (time === undefined ? '' : formatGameDate(language, toDate(time), false));
  return (
    <Panel title={t('alliance.statusTitle')} code="ALLY" className="panel--wide">
      <p className="small muted">{t('alliance.intro')}</p>
      {!m ? (
        <p>{t('alliance.none')}</p>
      ) : (
        <>
          <p>
            <strong>{name}</strong> · {t(`alliance.status.${m.historic ? 'historic' : m.status}`, { date: date(m.readyAt) })}
          </p>
          {m.status === 'rejected' && m.reasons && (
            <p className="small text--caution">
              {t('alliance.rejectedBecause')} {m.reasons.map((r) => t(`alliance.check.${r}`, REQUIREMENTS)).join(' · ')}
            </p>
          )}
          {m.status === 'invited' && (
            <button type="button" className="button button--primary" onClick={() => window.confirm(t('alliance.acceptConfirm')) && void run({ type: 'AcceptAlliance', airlineId: airline.id, payload: {} })}>
              {t('alliance.accept')}
            </button>
          )}
          {(m.status === 'member' || m.status === 'joining') && !m.historic && m.alliance !== 'own' && (
            <button type="button" className="button" onClick={() => window.confirm(t('alliance.leaveConfirm')) && void run({ type: 'LeaveAlliance', airlineId: airline.id, payload: {} })}>
              {t('alliance.leave')}
            </button>
          )}
        </>
      )}
      <p className="small">{t('alliance.partnersNow', { count: airline.partners?.length ?? 0 })}</p>
      <ErrorNote error={error} />
    </Panel>
  );
}

function AlliancePanel({ game, world, airline, alliance }: { game: GameState; world: EngineWorld; airline: Airline; alliance: RealAlliance }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const usd = useMoney(game, airline);
  const { error, run } = useRun();
  const founded = toDate(game.time).toISOString().slice(0, 10) >= alliance.founded;
  const members = allianceMembers(game, world, alliance);
  const { checks, sponsor, hubMember } = allianceChecks(game, world, airline, alliance);
  const size = sizeOf(game, airline);
  const rep = game.reputation[airline.id]?.score ?? 0;
  const value: Record<Check, string> = {
    size: formatNumber(language, size.aircraft),
    destinations: formatNumber(language, size.destinations),
    departures: formatNumber(language, size.departures),
    reputation: formatNumber(language, rep, 0),
    loyalty: airline.loyalty ? airline.loyalty.name : '—',
    hubFree: hubMember ?? '',
    sponsor: sponsor ?? '—',
  };
  const m = membershipOf(game, world, airline);
  return (
    <Panel title={alliance.name} code={alliance.id.slice(0, 4).toUpperCase()}>
      {!founded ? (
        <p className="small muted">{t('alliance.notFounded', { date: formatGameDate(language, new Date(alliance.founded), false) })}</p>
      ) : (
        <>
          <p className="small">
            {t('alliance.members', { count: members.length })}{' '}
            <span className="muted">
              {members
                .slice(0, 12)
                .map((id) => world.realAirlines?.byId.get(id)?.name ?? id)
                .join(', ')}
              {members.length > 12 ? ' …' : ''}
            </span>
          </p>
          <ul className="plain-list small">
            {(Object.keys(checks) as Check[]).map((k) => (
              <li key={k} className={checks[k] ? 'text--normal' : 'text--caution'}>
                {checks[k] ? '✓' : '✗'} {t(`alliance.check.${k}`, REQUIREMENTS)} <span className="muted">{value[k]}</span>
              </li>
            ))}
          </ul>
          <p className="small muted">{t('alliance.fees', { join: usd(joinFeeUsd(game, airline)), annual: usd(annualFeeUsd(game, airline)) })}</p>
          {!m && (
            <button type="button" className="button button--primary" onClick={() => void run({ type: 'ApplyAlliance', airlineId: airline.id, payload: { alliance: alliance.id } })}>
              {t('alliance.apply')}
            </button>
          )}
          {m?.status === 'rejected' && (
            <button type="button" className="button" onClick={() => void run({ type: 'ApplyAlliance', airlineId: airline.id, payload: { alliance: alliance.id } })}>
              {t('alliance.apply')}
            </button>
          )}
        </>
      )}
      <ErrorNote error={error} />
    </Panel>
  );
}

/** Real airlines flying to one of the player's stations (most flights first), with what they would say. */
function useCandidates(game: GameState, world: EngineWorld, airline: Airline) {
  return useMemo(() => {
    const stations = new Set(stationsOf(airline));
    const real = world.realAirlines;
    if (!real) return [];
    const weekly = new Map<string, number>();
    for (const r of real.byId.values()) {
      if (r.id === airline.realId) continue;
      let n = 0;
      for (const x of real.routesOf(r.id)) if (stations.has(x.a) || stations.has(x.b)) n += (x.weeklyAB ?? 3) + (x.weeklyBA ?? 3);
      if (n > 0) weekly.set(r.id, n);
    }
    return [...weekly]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([id, n]) => ({ r: real.byId.get(id)!, weekly: n }));
    // Recomputed when the network or partners change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, airline.id, airline.partners?.join(','), Object.keys(game.routes).length]);
}

function OwnAlliancePanel({ game, world, airline }: { game: GameState; world: EngineWorld; airline: Airline }) {
  const { t } = useTranslation();
  const usd = useMoney(game, airline);
  const { error, run } = useRun();
  const [name, setName] = useState('');
  const own = airline.ownAlliance;
  const candidates = useCandidates(game, world, airline);
  const m = membershipOf(game, world, airline);
  return (
    <Panel title={t('alliance.ownTitle')} code="OWN" className="panel--wide">
      <p className="small muted">{t('alliance.ownIntro')}</p>
      {!own ? (
        m && m.status !== 'rejected' ? (
          <p className="small muted">{t('alliance.ownNotWhileMember')}</p>
        ) : (
          <div className="field-row">
            <label className="field">
              <span className="field__label">{t('alliance.ownName')}</span>
              <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="field">
              <span className="field__label">&nbsp;</span>
              <button type="button" className="button button--primary" onClick={() => void run({ type: 'FoundAlliance', airlineId: airline.id, payload: { name } })}>
                {t('alliance.found', { amount: usd(OWN_ALLIANCE_FOUND_USD * priceLevelAt(game.time)) })}
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          <p>
            <strong>{own.name}</strong> · {t('alliance.members', { count: own.members.length })}
          </p>
          <ul className="plain-list small">
            {own.members.map((x) => (
              <li key={x.id} className="toolbar-row">
                <span>{world.realAirlines?.byId.get(x.id)?.name ?? x.id}</span>
                <button type="button" className="button button--small" onClick={() => void run({ type: 'RemoveFromAlliance', airlineId: airline.id, payload: { partnerId: x.id } })}>
                  {t('alliance.remove')}
                </button>
              </li>
            ))}
          </ul>
          <span className="field__label">{t('alliance.inviteTitle')}</span>
          <CandidateTable
            candidates={candidates}
            world={world}
            game={game}
            refusal={(id) => ownAllianceRefusal(game, world, airline, id)}
            action={t('alliance.invite')}
            onAct={(id) => void run({ type: 'InviteToAlliance', airlineId: airline.id, payload: { partnerId: id } })}
          />
        </>
      )}
      <ErrorNote error={error} />
    </Panel>
  );
}

function CodesharePanel({ game, world, airline }: { game: GameState; world: EngineWorld; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const usd = useMoney(game, airline);
  const { error, run } = useRun();
  const candidates = useCandidates(game, world, airline);
  return (
    <Panel title={t('alliance.codeshareTitle')} code="CS" className="panel--wide">
      <p className="small muted">{t('alliance.codeshareIntro', { setup: usd(CODESHARE_SETUP_USD * priceLevelAt(game.time)), annual: usd(CODESHARE_ANNUAL_USD * priceLevelAt(game.time)) })}</p>
      {(airline.codeshares ?? []).length > 0 && (
        <ul className="plain-list small">
          {airline.codeshares!.map((c) => (
            <li key={c.partnerId} className="toolbar-row">
              <span>
                {world.realAirlines?.byId.get(c.partnerId)?.name ?? c.partnerId} <span className="muted">· {t('alliance.since', { date: formatGameDate(language, toDate(c.since), false) })}</span>
              </span>
              <button type="button" className="button button--small" onClick={() => void run({ type: 'EndCodeshare', airlineId: airline.id, payload: { partnerId: c.partnerId } })}>
                {t('alliance.end')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="field__label">{t('alliance.candidatesTitle')}</span>
      <CandidateTable
        candidates={candidates.filter((c) => !airline.codeshares?.some((x) => x.partnerId === c.r.id))}
        world={world}
        game={game}
        refusal={(id) => codeshareRefusal(game, world, airline, id)}
        action={t('alliance.sign')}
        onAct={(id) => void run({ type: 'SignCodeshare', airlineId: airline.id, payload: { partnerId: id } })}
      />
      <ErrorNote error={error} />
    </Panel>
  );
}

function CandidateTable({
  candidates,
  world,
  game,
  refusal,
  action,
  onAct,
}: {
  candidates: { r: NonNullable<ReturnType<NonNullable<EngineWorld['realAirlines']>['byId']['get']>>; weekly: number }[];
  world: EngineWorld;
  game: GameState;
  refusal: (id: string) => string | null;
  action: string;
  onAct: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { language } = useSettings();
  if (!candidates.length) return <p className="small muted">{t('alliance.noCandidates')}</p>;
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>{t('alliance.airline')}</th>
            <th>{t('alliance.allianceCol')}</th>
            <th className="num">{t('alliance.weekly')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {candidates.map(({ r, weekly }) => {
            const no = refusal(r.id);
            const ally = realAllianceOf(game, world, r.id);
            return (
              <tr key={r.id}>
                <td>
                  {r.name} <span className="muted small">{world.airportById.get(r.hubs[0] ?? '')?.iata ?? ''}</span>
                </td>
                <td className="small">{ally ? allianceById(ally)!.name : '—'}</td>
                <td className="num mono">{formatNumber(language, Math.round(weekly))}</td>
                <td>
                  {no ? (
                    <span className="small muted">{t(`alliance.err.${no}`)}</span>
                  ) : (
                    <button type="button" className="button button--small" onClick={() => onAct(r.id)}>
                      {action}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
