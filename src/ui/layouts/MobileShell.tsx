import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Clocks, GameClock } from '../components/StatusBar';
import { useGame } from '../../game/store';
import { MOBILE_TABS, MORE_ROUTES, hrefFor, type Route } from '../navigation';
import { CatchUpBanner } from '../game/AwayReport';

// Phone layout: compact header on top, content in the middle, tab bar at the bottom
// where your thumb reaches it. Respects the iPhone notch and home indicator (safe areas).
export function MobileShell({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useTranslation();
  const activeTab: Route = MORE_ROUTES.includes(route) ? 'more' : route;
  const game = useGame();

  return (
    <div className="mobile">
      <header className="mobile__header">
        <span className="brand__mark brand__mark--small">
          <Icon name="fleet" size={16} />
        </span>
        <span className="mobile__title">{t(`nav.${route}`)}</span>
        {game ? <GameClock compact /> : <Clocks compact />}
      </header>
      <main className="mobile__content">
        <CatchUpBanner />
        {children}
      </main>
      <nav className="tabbar" aria-label={t('nav.main')}>
        {MOBILE_TABS.map((item) => (
          <a
            key={item.route}
            href={hrefFor(item.route)}
            className="tabbar__tab"
            aria-current={item.route === activeTab ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            <span>{t(item.labelKey)}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
