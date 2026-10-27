import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CLASSES, MODEL_REPUTATION } from '../../engine/cabins';
import { ratingOf } from '../../engine/reputation';
import type { ExperienceSums, Reputation } from '../../engine/state';
import { toDate } from '../../engine/time';
import { formatGameDate, formatNumber } from '../../i18n/format';
import { useSettings, type Language } from '../../settings/settings';
import { Sparkline } from './Dashboard';

const level = (score: number) => (score >= 62 ? 'normal' : score >= 52 ? 'caution' : 'warning');
const signedPoints = (language: Language, v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatNumber(language, Math.abs(v), 1)}`;

/**
 * What passengers think of the airline: brand reputation (with its trend), awareness, and each class's rating with the
 * reasons from last week's passengers (seat, aircraft age, value for money, crowding).
 */
export function ReputationPanel({ rep }: { rep: Reputation }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [hover, setHover] = useState<number | null>(null);
  const history = rep.history.slice(-26);
  const before = history.at(-2)?.score;
  const shown = hover !== null && history[hover] ? history[hover] : null;
  const parts = (e: ExperienceSums) => (['product', 'age', 'value', 'crowd'] as const).map((k) => e[k] / Math.max(1e-9, e.pax));
  const rated = CLASSES.filter((cls) => rep.classes[cls] !== undefined);

  return (
    <div className="reputation">
      <div className="kpi-hero">
        <div className="kpi kpi--hero">
          <span className="kpi__label">{t('reputation.score')}</span>
          <span className={`kpi__value text--${level(rep.score)}`}>{formatNumber(language, rep.score, 1)}</span>
          {shown ? (
            <span className="kpi__delta mono">
              {formatGameDate(language, toDate(shown.start), false)}: {formatNumber(language, shown.score, 1)}
            </span>
          ) : (
            before !== undefined && <span className="kpi__delta muted">{t('reputation.change', { value: signedPoints(language, rep.score - before) })}</span>
          )}
          {history.length >= 2 && <Sparkline values={history.map((h) => h.score)} hover={hover} onHover={setHover} />}
          <span className="kpi__hint">{t('reputation.scoreHint', { legacy: MODEL_REPUTATION.legacy, lowcost: MODEL_REPUTATION.lowcost })}</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">{t('reputation.awareness')}</span>
          <span className="kpi__value">{formatNumber(language, rep.awareness * 100)} %</span>
          <span className="meter" aria-hidden="true">
            <span className="meter__fill" style={{ width: `${rep.awareness * 100}%` }} />
          </span>
          <span className="kpi__hint">{t('reputation.awarenessHint')}</span>
        </div>
      </div>

      {rated.length > 0 ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('reputation.class')}</th>
                <th className="num">{t('reputation.rating')}</th>
                <th className="num">{t('reputation.lastWeek')}</th>
                <th className="num">{t('reputation.seat')}</th>
                <th className="num">{t('reputation.age')}</th>
                <th className="num">{t('reputation.value')}</th>
                <th className="num">{t('reputation.crowd')}</th>
              </tr>
            </thead>
            <tbody>
              {rated.map((cls) => {
                const e = rep.lastWeek[cls];
                const score = rep.classes[cls]!;
                return (
                  <tr key={cls}>
                    <td>
                      <span className={`cls-dot cls-dot--${cls}`} aria-hidden="true" /> {t(`cabin.class.${cls}`)}
                    </td>
                    <td className={`num mono text--${level(score)}`}>{formatNumber(language, score, 1)}</td>
                    <td className="num mono">{e && e.pax > 0 ? formatNumber(language, ratingOf(e), 1) : '—'}</td>
                    {(e && e.pax > 0 ? parts(e) : [null, null, null, null]).map((v, i) => (
                      <td key={i} className={`num mono ${v === null ? 'muted' : v >= 0.05 ? 'text--normal' : v <= -0.05 ? 'text--caution' : 'muted'}`}>
                        {v === null ? '—' : signedPoints(language, v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t('reputation.noRatings')}</p>
      )}
      <p className="muted small">{t('reputation.note')}</p>
    </div>
  );
}
