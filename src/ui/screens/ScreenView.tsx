import type { Route } from '../navigation';
import { OpsScreen } from './OpsScreen';
import { MapScreen } from './MapScreen';
import { ComingSoonScreen } from './ComingSoonScreen';
import { SettingsScreen } from './SettingsScreen';
import { MoreScreen } from './MoreScreen';

/** Shows the screen for the current route. Both layouts use this. */
export function ScreenView({ route, isWide }: { route: Route; isWide: boolean }) {
  switch (route) {
    case 'ops':
      return <OpsScreen />;
    case 'map':
      return <MapScreen />;
    case 'network':
      return <ComingSoonScreen route="network" phase="1.4" />;
    case 'fleet':
      return <ComingSoonScreen route="fleet" phase="1.3" />;
    case 'finance':
      return <ComingSoonScreen route="finance" phase="1.4" />;
    case 'settings':
      return <SettingsScreen />;
    case 'more':
      // "More" only exists on phones; on a computer everything is in the sidebar.
      return isWide ? <OpsScreen /> : <MoreScreen />;
  }
}
