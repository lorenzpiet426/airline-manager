import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_PROGRAMME, POINT_VALUE_EUR, TIERS, type Tier } from '../../data/loyalty';
import type { CommandError } from '../../engine/commands';
import { loyaltyPull, programmeValue } from '../../engine/loyalty';
import { convert, money } from '../../engine/money';
import type { Airline, GameState, Loyalty } from '../../engine/state';
import { toDate } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { usePlayer } from '../game/usePlayer';
import { hrefFor } from '../navigation';

/** The frequent-flyer programme (Phase 9.4): start one, see members, tiers, points and costs, change its rules. */
export function LoyaltyScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  if (!game || !airline) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('loyalty.title')}</h1>
        <Panel title={t('loyalty.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
          <a href={hrefFor('new')} className="button button--primary">
            {t('ops.newGame')}
          </a>
        </Panel>
      </div>
    );
  }
  const p = airline.loyalty;
  return (
    <div className="screen">
      <h1 className="screen__title">{p ? p.name : t('loyalty.title')}</h1>
      {p ? (
        <>
          <Overview game={game} airline={airline} p={p} />
          {p.kind === 'own' ? <Rules airline={airline} p={p} /> : <PartnerRules airline={airline} p={p} />}
        </>
      ) : (
        <Start airline={airline} />
      )}
    </div>
  );
}

function Start({ airline }: { airline: Airline }) {
  const { t } = useTranslation();
  const [name, setName] = useState(`${airline.name} Miles`.slice(0, 30));
  const [error, setError] = useState<CommandError | null>(null);
  return (
    <Panel title={t('loyalty.startTitle')} code="FFP">
      <p className="muted small">{t('loyalty.intro')}</p>
      <label className="field">
        <span className="field__label">{t('loyalty.name')}</span>
        <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        type="button"
        className="button button--primary"
        onClick={() => void sendCommand({ type: 'StartLoyalty', airlineId: airline.id, payload: { name } }).then((r) => setError(r.ok ? null : r.error))}
      >
        {t('loyalty.start')}
      </button>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}

function Overview({ game, airline, p }: { game: GameState; airline: Airline; p: Loyalty }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const eur = (v: number) => formatMoney(language, convert(money(v, 'EUR'), airline.currency, game.fx), false);
  const n = (v: number) => formatNumber(language, Math.round(v));
  const pct = (v: number) => `${formatNumber(language, v * 100, 1)} %`;
  const w = p.weeks.at(-1);
  const pull = loyaltyPull(game, airline);
  return (
    <Panel title={t(p.kind === 'own' ? 'loyalty.own' : 'loyalty.partner', { name: p.name })} code="FFP">
      <dl className="facts">
        <dt>{t('loyalty.since')}</dt>
        <dd>{formatGameDate(language, toDate(p.startedAt), false)}</dd>
        <dt>{t('loyalty.memberShare')}</dt>
        <dd className="mono">{pct(p.memberShare)}</dd>
        <dt>{t('loyalty.value')}</dt>
        <dd className="mono">{pct(programmeValue(game, airline))}</dd>
        {pull && (
          <>
            <dt>{t('loyalty.pull')}</dt>
            <dd className="mono">{t('loyalty.pullValue', { business: pct(pull.business - 1), leisure: pct(pull.leisure - 1) })}</dd>
          </>
        )}
        {w ? (
          <>
            <dt>{t('loyalty.members')}</dt>
            <dd className="mono">{n(w.members)}</dd>
            {TIERS.map((tier) => (
              <FactRow key={tier} label={`· ${t(`loyalty.tier.${tier}`)}`} value={n(w.tiers[tier])} />
            ))}
            {p.kind === 'own' && (
              <>
                <dt>{t('loyalty.points')}</dt>
                <dd className="mono">
                  {n(p.points)} · {t('loyalty.liability', { value: eur(p.points * POINT_VALUE_EUR) })}
                </dd>
              </>
            )}
            <dt>{t('loyalty.lastWeek')}</dt>
            <dd className="small">
              {t(p.kind === 'own' ? 'loyalty.weekOwn' : 'loyalty.weekPartner', {
                earned: n(w.earned),
                redeemed: n(w.redeemed),
                expired: n(w.expired),
                awards: n(w.awards),
              })}
            </dd>
            <dt>{t('loyalty.cost')}</dt>
            <dd className={`mono ${w.costEur > 0 ? 'text--caution' : 'text--normal'}`}>{eur(w.costEur)}</dd>
          </>
        ) : (
          <>
            <dt>{t('loyalty.members')}</dt>
            <dd className="muted small">{t('loyalty.firstWeek')}</dd>
          </>
        )}
      </dl>
      <p className="small muted">{t(p.kind === 'own' ? 'loyalty.howOwn' : 'loyalty.howPartner')}</p>
    </Panel>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd className="mono muted">{value}</dd>
    </>
  );
}

function Rules({ airline, p }: { airline: Airline; p: Loyalty }) {
  const { t } = useTranslation();
  const [name, setName] = useState(p.name);
  const [earn, setEarn] = useState(p.earn);
  const [thresholds, setThresholds] = useState<Record<Tier, number>>({ ...p.thresholds });
  const [award, setAward] = useState(Math.round(p.awardShare * 100));
  const [expiry, setExpiry] = useState(p.expiryMonths);
  const [error, setError] = useState<CommandError | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const r = await sendCommand({ type: 'SetLoyalty', airlineId: airline.id, payload: { name, earn, thresholds, awardShare: award / 100, expiryMonths: expiry } });
    setError(r.ok ? null : r.error);
    setSaved(r.ok);
  };
  const close = async () => {
    if (!window.confirm(t('loyalty.closeConfirm'))) return;
    const r = await sendCommand({ type: 'LeaveLoyalty', airlineId: airline.id, payload: {} });
    setError(r.ok ? null : r.error);
  };
  return (
    <Panel title={t('loyalty.rules')} code="RULES">
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('loyalty.name')}</span>
          <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('loyalty.earn')}</span>
          <input className="input mono" type="number" min={1} max={10} step={0.5} value={earn} onChange={(e) => setEarn(Number(e.target.value))} />
        </label>
        {TIERS.map((tier) => (
          <label key={tier} className="field">
            <span className="field__label">{t('loyalty.threshold', { tier: t(`loyalty.tier.${tier}`) })}</span>
            <input className="input mono" type="number" min={200} max={50000} step={100} value={thresholds[tier]} onChange={(e) => setThresholds({ ...thresholds, [tier]: Number(e.target.value) })} />
          </label>
        ))}
        <label className="field">
          <span className="field__label">{t('loyalty.awardShare')}</span>
          <input className="input mono" type="number" min={0} max={15} step={1} value={award} onChange={(e) => setAward(Number(e.target.value))} />
        </label>
        <label className="field">
          <span className="field__label">{t('loyalty.expiry')}</span>
          <input className="input mono" type="number" min={0} max={60} step={6} value={expiry} onChange={(e) => setExpiry(Math.round(Number(e.target.value)))} />
        </label>
      </div>
      <p className="small muted">{t('loyalty.rulesNote', { earn: DEFAULT_PROGRAMME.earn })}</p>
      <div className="toolbar-row">
        <button type="button" className="button button--primary" onClick={() => void save()}>
          {t('loyalty.save')}
        </button>
        {saved && <span className="small text--normal">{t('loyalty.saved')}</span>}
        <button type="button" className="button" onClick={() => void close()}>
          {t('loyalty.close')}
        </button>
      </div>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}

function PartnerRules({ airline, p }: { airline: Airline; p: Loyalty }) {
  const { t } = useTranslation();
  const [error, setError] = useState<CommandError | null>(null);
  const leave = async () => {
    if (!window.confirm(t('loyalty.leaveConfirm', { name: p.name }))) return;
    const r = await sendCommand({ type: 'LeaveLoyalty', airlineId: airline.id, payload: {} });
    setError(r.ok ? null : r.error);
  };
  return (
    <Panel title={t('loyalty.rules')} code="RULES">
      <p className="small">{t('loyalty.partnerRules', { name: p.name })}</p>
      <button type="button" className="button" onClick={() => void leave()}>
        {t('loyalty.leave', { name: p.name })}
      </button>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </Panel>
  );
}
