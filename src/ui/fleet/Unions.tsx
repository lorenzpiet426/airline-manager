import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { strikeCulture, UNION_NAMES, type UnionGroup } from '../../data/unions';
import type { CommandError } from '../../engine/commands';
import type { Agreement, Airline, GameState } from '../../engine/state';
import { toDate } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { countryName, formatGameDate, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';

/** Name of the union of a group in a country (real names where known). */
export function unionName(t: (key: string) => string, country: string, group: UnionGroup): string {
  const names = UNION_NAMES[country];
  return names ? names[group === 'pilots' ? 0 : 1] : t(`unions.generic.${group}`);
}

const moodKey = (mood: number) => (mood >= 0.3 ? 'content' : mood > -0.2 ? 'neutral' : mood > -0.5 ? 'unhappy' : 'angry');

/**
 * Collective agreements with the crews' unions (Phase 8.2): pay level, how long the agreement runs (peace obligation),
 * the crews' mood, wage talks with offers, mediation, and strikes announced.
 */
export function UnionsPanel({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const agreements = Object.entries(airline.labour ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!agreements.length) return null;
  return (
    <Panel title={t('unions.title')} code="UNION">
      <p className="muted small">{t('unions.intro')}</p>
      {agreements.map(([key, a]) => (
        <AgreementCard key={key} game={game} airline={airline} agreementKey={key} a={a} />
      ))}
    </Panel>
  );
}

function AgreementCard({ game, airline, agreementKey, a }: { game: GameState; airline: Airline; agreementKey: string; a: Agreement }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [offer, setOffer] = useState<string>('');
  const [error, setError] = useState<CommandError | null>(null);
  const pct = (x: number) => `${formatNumber(language, x * 100, 1)} %`;
  const date = (time: number) => formatGameDate(language, toDate(time), false);
  const talks = a.talks;
  const culture = strikeCulture(a.country, toDate(game.time).getUTCFullYear());
  const strikes = a.strikes.filter((s) => s.until > game.time).sort((x, y) => x.from - y.from);
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
    return r.ok;
  };
  const base = { airlineId: airline.id, payload: { key: agreementKey } };
  const status = strikes.some((s) => s.from <= game.time)
    ? { cls: 'chip--warning', text: t('unions.status.striking') }
    : strikes.length
      ? { cls: 'chip--warning', text: t('unions.status.strikeComing') }
      : talks?.mediationUntil !== undefined
        ? { cls: 'chip--caution', text: t('unions.status.mediation') }
        : talks && game.time >= a.until
          ? { cls: 'chip--warning', text: t('unions.status.dispute') }
          : talks
            ? { cls: 'chip--caution', text: t('unions.status.talks') }
            : { cls: 'chip--normal', text: t('unions.status.peace') };

  return (
    <div className="notice">
      <p>
        <strong>{unionName(t, a.country, a.group)}</strong> · {t(`unions.group.${a.group}`)} · {countryName(language, a.country, a.country)}{' '}
        <span className={`chip ${status.cls}`}>{status.text}</span>
      </p>
      <dl className="facts facts--compact">
        <dt>{t('unions.pay')}</dt>
        <dd className="mono">{pct(a.pay)}</dd>
        <dt>{t('unions.until')}</dt>
        <dd>{date(a.until)}</dd>
        <dt>{t('unions.mood')}</dt>
        <dd>{t(`unions.moods.${moodKey(a.mood)}`)}</dd>
        <dt>{t('unions.culture')}</dt>
        <dd className="small">{t('unions.cultureValue', { notice: culture.noticeDays, level: t(`unions.militancy.${culture.militancy >= 0.9 ? 'high' : culture.militancy >= 0.4 ? 'medium' : 'low'}`) })}</dd>
      </dl>
      {strikes.map((s, i) => (
        <p key={i} className="small text--warning">
          {t(s.warning ? 'unions.warningStrike' : 'unions.strike', { from: date(s.from), count: Math.round((s.until - s.from) / 1440) })}
        </p>
      ))}
      {talks && (
        <>
          <dl className="facts facts--compact">
            <dt>{t('unions.demand')}</dt>
            <dd className="mono">{t('unions.perYear', { value: pct(talks.demand) })}</dd>
            <dt>{t('unions.inflation')}</dt>
            <dd className="mono">{pct(talks.inflation)}</dd>
            {talks.offer !== undefined && (
              <>
                <dt>{t('unions.yourOffer')}</dt>
                <dd className="mono">{t('unions.perYear', { value: pct(talks.offer) })}</dd>
              </>
            )}
            <dt>{t('unions.round')}</dt>
            <dd className="mono">{talks.round + 1}</dd>
          </dl>
          {talks.proposal !== undefined ? (
            <>
              <p className="small">{t('unions.proposal', { value: pct(talks.proposal), date: date(talks.proposalUntil ?? game.time) })}</p>
              <div className="toolbar-row">
                <button type="button" className="button button--primary" onClick={() => void run({ type: 'AnswerProposal', ...base, payload: { key: agreementKey, accept: true } })}>
                  {t('unions.acceptProposal')}
                </button>
                <button type="button" className="button" onClick={() => void run({ type: 'AnswerProposal', ...base, payload: { key: agreementKey, accept: false } })}>
                  {t('unions.rejectProposal')}
                </button>
              </div>
            </>
          ) : talks.mediationUntil !== undefined ? (
            <p className="small muted">{t('unions.mediating', { date: date(talks.mediationUntil) })}</p>
          ) : (
            <>
              {game.time < talks.nextRound ? (
                <p className="small muted">{t('unions.nextRound', { date: date(talks.nextRound) })}</p>
              ) : (
                <div className="field-row">
                  <label className="field">
                    <span className="field__label">{t('unions.offerLabel')}</span>
                    <input className="input mono" type="number" min={0} max={25} step={0.1} value={offer} placeholder={formatNumber(language, talks.inflation * 100, 1)} onChange={(e) => setOffer(e.target.value)} />
                  </label>
                  <div className="field">
                    <span className="field__label">&nbsp;</span>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={offer === '' || !Number.isFinite(Number(offer))}
                      onClick={() => void run({ type: 'OfferWage', ...base, payload: { key: agreementKey, raise: Number(offer) / 100 } }).then((ok) => ok && setOffer(''))}
                    >
                      {t('unions.makeOffer')}
                    </button>
                  </div>
                </div>
              )}
              <div className="toolbar-row">
                <button type="button" className="button" onClick={() => void run({ type: 'AcceptDemand', ...base })}>
                  {t('unions.acceptDemand', { value: pct(talks.demand) })}
                </button>
                {talks.round > 0 && (
                  <button type="button" className="button" onClick={() => void run({ type: 'CallMediation', ...base })}>
                    {t('unions.callMediation')}
                  </button>
                )}
              </div>
              <p className="small muted">{t('unions.talksNote')}</p>
            </>
          )}
        </>
      )}
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </div>
  );
}
