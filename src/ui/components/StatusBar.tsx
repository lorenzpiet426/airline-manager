import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Aviation runs on UTC ("Zulu"). The real clock is shown in UTC and local time. */
export function Clocks({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const now = useNow();
  const utc = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const local = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return (
    <div className="clocks">
      <span className="clock clock--utc" title={t('status.utc')}>
        {utc}
        {!compact && <span className="clock__secs">{pad(now.getUTCSeconds())}</span>}
        <span className="clock__z">Z</span>
      </span>
      {!compact && (
        <span className="clock clock--local">
          {local} <span className="clock__label">{t('status.local')}</span>
        </span>
      )}
    </div>
  );
}

/** Top bar: simulation date (once a game runs) and real clocks. */
export function StatusBar({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="statusbar">
      <div className="statusbar__sim">
        <span className="tag">{t('status.sim')}</span>
        <span className="statusbar__simtext">{t('status.noGame')}</span>
      </div>
      <Clocks compact={compact} />
    </div>
  );
}
