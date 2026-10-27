import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { endWeek, setSpeed, useGame, useSpeed } from '../../game/store';
import { SPEEDS, type Speed } from '../../worker/protocol';

const SPEED_KEYS: Record<Speed, string> = {
  0: 'sim.pause',
  1: 'sim.speed1',
  10: 'sim.speed2',
  60: 'sim.speed3',
  1440: 'sim.speed4',
};
const SPEED_SYMBOLS: Record<Speed, string> = { 0: 'II', 1: '▶', 10: '▶▶', 60: '▶▶▶', 1440: '▶▶▶▶' };

/** Real-time mode: pause and four speeds. Turn-based mode: an "End week" button. Real clock: a LIVE sign. */
export function SimControls() {
  const { t } = useTranslation();
  const game = useGame();
  const speed = useSpeed();
  const [busy, setBusy] = useState(false);
  if (!game) return null;

  if (game.options.timeMode === 'realclock') {
    return (
      <span className="sim-live" title={t('sim.liveHint')}>
        <span className="dot dot--normal" aria-hidden="true" /> {t('sim.live')}
      </span>
    );
  }

  if (game.options.timeMode === 'weekly') {
    return (
      <button
        type="button"
        className="button button--primary sim-endweek"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await endWeek();
          setBusy(false);
        }}
      >
        {t('sim.endWeek')}
      </button>
    );
  }

  return (
    <div className="simcontrols" role="radiogroup" aria-label={t('sim.speed')}>
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === speed}
          className={`simcontrols__button${s === 0 ? ' simcontrols__button--pause' : ''}`}
          title={t(SPEED_KEYS[s])}
          aria-label={t(SPEED_KEYS[s])}
          onClick={() => void setSpeed(s)}
        >
          {SPEED_SYMBOLS[s]}
        </button>
      ))}
    </div>
  );
}
