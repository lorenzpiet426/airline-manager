import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlapBoard } from '../components/FlapBoard';
import { Panel } from '../components/Panel';
import { TailFin } from '../components/TailFin';
import { SimControls } from '../components/SimControls';
import { GameClock } from '../components/StatusBar';
import { Dashboard } from '../game/Dashboard';
import { MessageLog } from '../game/MessageLog';
import { usePlayer } from '../game/usePlayer';
import { useBooting } from '../../game/store';
import { useWorld } from '../../data/world';
import { useSettings } from '../../settings/settings';
import { formatMoney } from '../../i18n/format';
import { useResolvedTheme } from '../hooks/useApplyTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { hrefFor } from '../navigation';

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
  const booting = useBooting();
  const { game, airline } = usePlayer();
  const world = useWorld();

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

  const statusPanel = (
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
  );

  if (!game || !airline) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('ops.title')}</h1>
        <FlapBoard lines={[t('ops.board'), 'VIE  LOWW  STBY']} width={isWide ? 20 : 17} />
        <div className="grid">
          <Panel title={t('ops.airlineTitle')} code="—">
            <p className="lead">{t('ops.noAirline')}</p>
            <p className="muted">{t('ops.noAirlineHint')}</p>
            <a href={hrefFor('new')} className={`button button--primary${booting ? ' button--disabled' : ''}`}>
              {t('ops.newGame')}
            </a>
          </Panel>
          {statusPanel}
        </div>
      </div>
    );
  }

  const hub = world?.airportById.get(airline.hubId);
  const hubCode = hub?.iata ?? airline.hubId;
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id);
  const active = fleet.filter((a) => a.status === 'active').length;
  const delivering = fleet.length - active;
  const negative = airline.cash.amount < 0;

  return (
    <div className="screen">
      <h1 className="screen__title">{t('ops.title')}</h1>
      <FlapBoard
        lines={[airline.name.toUpperCase().slice(0, isWide ? 20 : 17), `${airline.icao}  ${hubCode}  OPS`]}
        width={isWide ? 20 : 17}
      />

      <div className="grid">
        <Panel title={t('dashboard.title')} code="KPI" className="panel--wide">
          <Dashboard game={game} airline={airline} />
        </Panel>

        <Panel title={t('ops.airlineTitle')} code={`${airline.iata} / ${airline.icao}`}>
          <div className="airline-card">
            <TailFin primary={airline.colors.primary} secondary={airline.colors.secondary} code={airline.iata} size={72} />
            <div className="airline-card__text">
              <span className="airline-card__name">{airline.name}</span>
              <span className="muted">
                {t('ops.hub')}: <span className="mono">{hubCode}</span> {hub ? `· ${hub.city}` : ''}
              </span>
            </div>
          </div>
          <dl className="facts">
            <dt>{t('ops.cash')}</dt>
            <dd className={`mono ${negative ? 'text--warning' : 'text--normal'}`}>{formatMoney(settings.language, airline.cash, false)}</dd>
            <dt>{t('ops.fleet')}</dt>
            <dd>
              {t('ops.fleetCount', { active, delivering })}
            </dd>
          </dl>
          <a href={hrefFor('fleet')} className="button button--primary">
            {fleet.length ? t('ops.toFleet') : t('ops.leaseFirst')}
          </a>
        </Panel>

        <Panel title={t('ops.clockTitle')} code={t(`ops.mode.${game.options.timeMode}`)}>
          <GameClock />
          <SimControls />
          <p className="muted small">{t(`ops.modeHint.${game.options.timeMode}`)}</p>
        </Panel>

        <Panel title={t('ops.messagesTitle')} code="ACARS" className="panel--wide">
          <MessageLog messages={game.messages.filter((m) => m.airlineId === airline.id)} world={world} />
        </Panel>

        <Panel title={t('ops.newsTitle')} code="NEWS" className="panel--wide">
          <MessageLog messages={game.messages.filter((m) => m.airlineId === null)} world={world} limit={12} />
        </Panel>

        {statusPanel}
      </div>
    </div>
  );
}
