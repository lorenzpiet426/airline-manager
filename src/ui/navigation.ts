// Navigation with "hash" URLs like #/fleet. GitHub Pages only serves files, so this
// style of URL keeps working when you reload or open a link directly.
import { useSyncExternalStore } from 'react';
import type { IconName } from './components/Icon';

export type Route = 'ops' | 'map' | 'network' | 'fleet' | 'finance' | 'airlines' | 'saves' | 'sources' | 'settings' | 'more' | 'new' | 'livery' | 'aircraft';

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
  airlines: { route: 'airlines', icon: 'airlines', labelKey: 'nav.airlines' },
  aircraft: { route: 'aircraft', icon: 'types', labelKey: 'nav.aircraft' },
  saves: { route: 'saves', icon: 'saves', labelKey: 'nav.saves' },
  sources: { route: 'sources', icon: 'sources', labelKey: 'nav.sources' },
  settings: { route: 'settings', icon: 'settings', labelKey: 'nav.settings' },
  more: { route: 'more', icon: 'more', labelKey: 'nav.more' },
  // The new-game wizard: reached from the Ops screen, not listed in the navigation.
  new: { route: 'new', icon: 'ops', labelKey: 'nav.new' },
  // The livery designer: reached from the Fleet and Ops screens.
  livery: { route: 'livery', icon: 'fleet', labelKey: 'nav.livery' },
};

/** Sidebar on computers and tablets. */
export const DESKTOP_NAV: NavItem[] = [NAV.ops, NAV.map, NAV.network, NAV.fleet, NAV.finance, NAV.airlines, NAV.aircraft];
export const DESKTOP_NAV_BOTTOM: NavItem[] = [NAV.saves, NAV.sources, NAV.settings];

/** Bottom tab bar on phones (max. 5 tabs, thumb-friendly). */
export const MOBILE_TABS: NavItem[] = [NAV.ops, NAV.map, NAV.network, NAV.fleet, NAV.more];
/** Entries listed on the phone's "More" screen. */
export const MOBILE_MORE: NavItem[] = [NAV.finance, NAV.airlines, NAV.aircraft, NAV.saves, NAV.sources, NAV.settings];

/** Routes reachable from the phone's "More" tab: the tab stays highlighted there. */
export const MORE_ROUTES: Route[] = ['more', ...MOBILE_MORE.map((item) => item.route)];

const ROUTES = Object.keys(NAV) as Route[];

function readRoute(): Route {
  const name = window.location.hash.replace(/^#\/?/, '').split('?')[0]!;
  return ROUTES.includes(name as Route) ? (name as Route) : 'ops';
}

/** A parameter of the current address, e.g. "id" in #/airlines?id=AUA. */
function readParam(name: string): string | null {
  const query = window.location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
}

export function useRouteParam(name: string): string | null {
  return useSyncExternalStore(subscribe, () => readParam(name));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute);
}

export function hrefFor(route: Route, params?: Record<string, string>): string {
  return params ? `#/${route}?${new URLSearchParams(params)}` : `#/${route}`;
}
