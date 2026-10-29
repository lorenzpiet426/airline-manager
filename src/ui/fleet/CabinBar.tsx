import { useTranslation } from 'react-i18next';
import type { AircraftType } from '../../data/aircraft';
import { cabinLengthIn, CLASS_DIVIDER_IN, rowsOf, usedLengthIn } from '../../engine/cabins';
import type { CabinLayout } from '../../engine/state';

/**
 * The cabin from nose (left) to tail as a bar: each class takes the length of its rows, the free length is hatched.
 * Too long a layout runs into a red overflow.
 */
export function CabinBar({ type, cabin, compact }: { type: AircraftType; cabin: CabinLayout; compact?: boolean }) {
  const { t } = useTranslation();
  const length = cabinLengthIn(type);
  const used = usedLengthIn(type, cabin);
  const scale = Math.max(length, used);
  const label = cabin.map((s) => `${t(`cabin.class.${s.cls}`)} ${s.seats}`).join(', ');
  return (
    <div className={`cabin-bar${compact ? ' cabin-bar--compact' : ''}`} role="img" aria-label={t('cabin.barLabel', { layout: label })}>
      {cabin.map((s, i) => {
        const inches = rowsOf(type, s) * s.pitch + (i > 0 && cabin[i - 1]!.product !== 'euro' ? CLASS_DIVIDER_IN : 0);
        return (
          <span key={s.cls} className={`cabin-bar__part cls-bg--${s.cls}`} style={{ width: `${(inches / scale) * 100}%` }} title={`${t(`cabin.class.${s.cls}`)} · ${s.seats} · ${s.pitch}″`}>
            {!compact && inches / scale > 0.07 && (
              <span className="cabin-bar__text mono">
                {s.cls}
                {s.seats}
              </span>
            )}
          </span>
        );
      })}
      {used < length && <span className="cabin-bar__free" style={{ width: `${((length - used) / scale) * 100}%` }} />}
      {used > length && <span className="cabin-bar__over" style={{ left: `${(length / scale) * 100}%` }} />}
    </div>
  );
}
