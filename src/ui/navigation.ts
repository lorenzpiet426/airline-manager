// Navigation with "hash" URLs like #/fleet. GitHub Pages only serves files, so this
// style of URL keeps working when you reload or open a link directly.
import { useSyncExternalStore } from 'react';
import type { IconName } from './components/Icon';

export type Route = 'ops' | 'map' | 'network' | 'fleet' | 'finance' | 'settings' | 'more';

export interface NavItem {
  route: Route;
  icon: IconName;
  labelKey: string;
}

const NAV: Record<Route, NavItem> = {
  ops: { route: 'ops', icon: 'ops', labelKey: 'nav.ops' },
  map: { route: 'map', icon: 'map', labelKey: 'nav.map' },
  network: { route: 'network', icon: 'network', labelKey: 'nav.network' },
  fleet: { route: 'fleet', icon: 'fleet', labelKey: 'nav.fleet' },
  finance: { route: 'finance', icon: 'finance', labelKey: 'nav.finance' },
  settings: { route: 'settings', icon: 'settings', labelKey: 'nav.settings' },
  more: { route: 'more', icon: 'more', labelKey: 'nav.more' },
};

/** Sidebar on computers and tablets. */
export const DESKTOP_NAV: NavItem[] = [NAV.ops, NAV.map, NAV.network, NAV.fleet, NAV.finance];
export const DESKTOP_NAV_BOTTOM: NavItem[] = [NAV.settings];

/** Bottom tab bar on phones (max. 5 tabs, thumb-friendly). */
export const MOBILE_TABS: NavItem[] = [NAV.ops, NAV.map, NAV.network, NAV.fleet, NAV.more];
/** Entries listed on the phone's "More" screen. */
export const MOBILE_MORE: NavItem[] = [NAV.finance, NAV.settings];

/** Routes reachable from the phone's "More" tab: the tab stays highlighted there. */
export const MORE_ROUTES: Route[] = ['more', ...MOBILE_MORE.map((item) => item.route)];

const ROUTES = Object.keys(NAV) as Route[];

function readRoute(): Route {
  const name = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(name as Route) ? (name as Route) : 'ops';
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute);
}

export function hrefFor(route: Route): string {
  return `#/${route}`;
}
