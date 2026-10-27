import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlapBoard } from '../components/FlapBoard';
import { Panel } from '../components/Panel';
import { useSettings } from '../../settings/settings';
import { useResolvedTheme } from '../hooks/useApplyTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';

type Level = 'normal' | 'caution' | 'info';

/** Offline readiness = a service worker controls the page (it caches the game files). */
function useOfflineState(): 'ready' | 'pending' | 'unsupported' {
  const supported = 'serviceWorker' in navigator;
  const [ready, setReady] = useState(supported && !!navigator.serviceWorker.controller);
  useEffect(() => {
    if (!supported) return;
    const onChange = () => setReady(!!navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, [supported]);
  if (!supported) return 'unsupported';
  return ready ? 'ready' : 'pending';
}

export function OpsScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const theme = useResolvedTheme();
  const offline = useOfflineState();
  const installed = useMediaQuery('(display-mode: standalone)');
  const isWide = useMediaQuery('(min-width: 768px)');

  // Status lines use cockpit (ECAM) colours: green = normal, amber = caution, cyan = info.
  const checks: { label: string; value: string; level: Level }[] = [
    { label: t('ops.checkLanguage'), value: t(`lang.${settings.language}`), level: 'normal' },
    {
      label: t('ops.checkTheme'),
      value: theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight'),
      level: 'info',
    },
    {
      label: t('ops.checkOffline'),
      value: t(
        offline === 'ready'
          ? 'ops.offlineReady'
          : offline === 'pending'
            ? 'ops.offlinePending'
            : 'ops.offlineUnsupported',
      ),
      level: offline === 'ready' ? 'normal' : 'caution',
    },
    {
      label: t('ops.checkInstall'),
      value: installed ? t('ops.installed') : t('ops.notInstalled'),
      level: installed ? 'normal' : 'info',
    },
  ];

  return (
    <div className="screen">
      <h1 className="screen__title">{t('ops.title')}</h1>
      <FlapBoard lines={[t('ops.board'), 'VIE  LOWW  STBY']} width={isWide ? 20 : 17} />

      <div className="grid">
        <Panel title={t('ops.airlineTitle')} code="—">
          <p className="lead">{t('ops.noAirline')}</p>
          <p className="muted">{t('ops.noAirlineHint')}</p>
          <button type="button" className="button button--primary" disabled>
            {t('ops.newGame')}
          </button>
        </Panel>

        <Panel title={t('ops.checksTitle')} code="STS">
          <ul className="checklist">
            {checks.map((check) => (
              <li key={check.label} className="checklist__item">
                <span className={`dot dot--${check.level}`} aria-hidden="true" />
                <span className="checklist__label">{check.label}</span>
                <span className={`checklist__value text--${check.level}`}>{check.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
