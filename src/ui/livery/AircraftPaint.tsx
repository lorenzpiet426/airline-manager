import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommandError } from '../../engine/commands';
import { inOldLivery, liveryOf, repaintQuote } from '../../engine/livery';
import { convert, money } from '../../engine/money';
import type { Aircraft, Airline, GameState } from '../../engine/state';
import { sendCommand } from '../../game/store';
import { formatMoney } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { AircraftSide } from './AircraftSide';

/** The tail of an aircraft in the livery it wears (for card heads and lists). */
export function AircraftTail({ airline, aircraft, size = 40 }: { airline: Airline; aircraft: Aircraft; size?: number }) {
  return (
    <span className="tailfin" style={{ width: size, height: size, display: 'inline-block' }}>
      <AircraftSide livery={liveryOf(airline, aircraft)} typeId={aircraft.typeId} crop="tail" className="fleet-tail" />
    </span>
  );
}

/** The aircraft in its livery, and the repaint choices when it still wears an older one. */
export function AircraftPaint({ game, airline, aircraft }: { game: GameState; airline: Airline; aircraft: Aircraft }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  // Already in the paint shop: the chip on the card says until when.
  const old = inOldLivery(airline, aircraft) && (aircraft.paintUntil ?? 0) <= game.time;
  const q = repaintQuote(aircraft);
  const price = formatMoney(language, convert(money(q.usd, 'USD'), airline.currency, game.fx));
  const send = async (atCheck: boolean) => {
    const r = await sendCommand({ type: 'Repaint', airlineId: airline.id, payload: { aircraftId: aircraft.id, atCheck } });
    setAsking(false);
    setError(r.ok ? null : r.error);
  };
  return (
    <div className="aircraft-paint">
      <AircraftSide livery={liveryOf(airline, aircraft)} typeId={aircraft.typeId} className="fleet-side" />
      {old && (
        <div className="aircraft-paint__old">
          <span className="chip chip--caution">{t('livery.oldLivery')}</span>
          {aircraft.repaintAtCheck ? (
            <span className="small muted">{t('livery.repaintPlanned')}</span>
          ) : asking ? (
            <div className="confirm">
              <p className="small">{t('livery.repaintAsk', { price, days: q.days })}</p>
              <div className="confirm__actions">
                <button type="button" className="button" onClick={() => setAsking(false)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="button button--primary" onClick={() => void send(false)}>
                  {t('livery.repaint')}
                </button>
              </div>
            </div>
          ) : (
            <div className="button-row">
              <button type="button" className="button button--small" onClick={() => setAsking(true)}>
                {t('livery.repaintNow', { price, days: q.days })}
              </button>
              <button type="button" className="button button--small" onClick={() => void send(true)}>
                {t('livery.repaintAtCheck')}
              </button>
            </div>
          )}
          {error && <p className="notice notice--error small">{t(`errors.${error}`)}</p>}
        </div>
      )}
    </div>
  );
}
