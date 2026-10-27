import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { StatusBar } from '../components/StatusBar';
import { DESKTOP_NAV, DESKTOP_NAV_BOTTOM, hrefFor, type NavItem, type Route } from '../navigation';

// Computer / tablet layout: an ops console with a navigation rail on the left
// (icon-only on narrow screens, see CSS), a status bar on top and the screen in the middle.
export function DesktopShell({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useTranslation();
  const link = (item: NavItem) => (
    <a
      key={item.route}
      href={hrefFor(item.route)}
      className="rail__link"
      aria-current={item.route === route ? 'page' : undefined}
      title={t(item.labelKey)}
    >
      <Icon name={item.icon} />
      <span className="rail__label">{t(item.labelKey)}</span>
    </a>
  );

  return (
    <div className="desktop">
      <nav className="rail" aria-label={t('nav.main')}>
        <div className="brand">
          <span className="brand__mark">
            <Icon name="fleet" size={20} />
          </span>
          <span className="brand__text">
            <span className="brand__name">{t('app.name')}</span>
            <span className="brand__tagline">{t('app.tagline')}</span>
          </span>
        </div>
        <div className="rail__group">{DESKTOP_NAV.map(link)}</div>
        <div className="rail__group rail__group--bottom">{DESKTOP_NAV_BOTTOM.map(link)}</div>
      </nav>
      <div className="desktop__main">
        <StatusBar />
        <main className="desktop__content">{children}</main>
      </div>
    </div>
  );
}
