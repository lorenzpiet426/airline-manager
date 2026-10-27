import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toDate } from '../../engine/time';
import { resolve, signIn, signOutCloud, syncNow, useCloud } from '../../game/cloud';
import { formatGameDate, localeFor } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';

/** Cloud sync on the Saves screen: sign in with Google, status, conflicts to settle. */
export function CloudPanel() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const when = (ms: number) => new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  if (cloud.status === 'unavailable') {
    return (
      <Panel title={t('cloud.title')} code="SYNC">
        <p className="muted">{t('cloud.unavailable')}</p>
      </Panel>
    );
  }

  return (
    <Panel title={t('cloud.title')} code="SYNC">
      {!cloud.user ? (
        <>
          <p className="muted small">{t('cloud.intro')}</p>
          <button type="button" className="button button--primary" disabled={busy || cloud.status === 'starting'} onClick={() => void act(signIn)}>
            {t('cloud.signIn')}
          </button>
        </>
      ) : (
        <>
          <p>
            {t('cloud.signedInAs', { who: cloud.user.email ?? cloud.user.name ?? '' })}{' '}
            <span className={`chip chip--${cloud.status === 'error' ? 'warning' : cloud.status === 'syncing' ? 'planned' : 'normal'}`}>
              {t(`cloud.status.${cloud.status}`)}
            </span>
          </p>
          {cloud.lastSync && <p className="muted small">{t('cloud.lastSync', { when: when(cloud.lastSync) })}</p>}
          <p className="muted small">{t('cloud.auto')}</p>
          <div className="button-row">
            <button type="button" className="button" disabled={busy || cloud.status === 'syncing'} onClick={() => void act(syncNow)}>
              {t('cloud.syncNow')}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void act(signOutCloud)}>
              {t('cloud.signOut')}
            </button>
          </div>
        </>
      )}
      {cloud.error && <p className="notice notice--error small">{t('cloud.failed', { error: cloud.error })}</p>}
      {cloud.conflicts.map((c) => {
        const other = (keep: 'local' | 'cloud') =>
          t(keep === 'local' ? 'cloud.otherFromCloud' : 'cloud.otherFromDevice', { when: when(keep === 'local' ? c.cloud.savedAt : c.local.savedAt) });
        return (
          <div key={c.id} className="confirm">
            <p className="small">
              {t('cloud.conflict', {
                name: c.local.kind === 'copy' ? c.local.name : c.local.airlineName,
                here: `${formatGameDate(language, toDate(c.local.gameTime), false)} (${when(c.local.savedAt)})`,
                there: `${formatGameDate(language, toDate(c.cloud.gameTime), false)} (${when(c.cloud.savedAt)})`,
              })}
            </p>
            <div className="confirm__actions">
              <button type="button" className="button" disabled={busy} onClick={() => void act(() => resolve(c, 'local', other('local')))}>
                {t('cloud.keepHere')}
              </button>
              <button type="button" className="button button--primary" disabled={busy} onClick={() => void act(() => resolve(c, 'cloud', other('cloud')))}>
                {t('cloud.keepCloud')}
              </button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
