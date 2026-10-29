import { Suspense, lazy } from 'react';
import type { Route } from '../navigation';
import { OpsScreen } from './OpsScreen';
import { SettingsScreen } from './SettingsScreen';
import { MoreScreen } from './MoreScreen';
import { FleetScreen } from './FleetScreen';
import { NewGameScreen } from './NewGameScreen';
import { NetworkScreen } from './NetworkScreen';
import { FinanceScreen } from './FinanceScreen';
import { AirlinesScreen } from './AirlinesScreen';
import { ManagementScreen } from './ManagementScreen';
import { SourcesScreen } from './SourcesScreen';
import { SavesScreen } from './SavesScreen';
import { LiveryScreen } from './LiveryScreen';
import { AircraftScreen } from './AircraftScreen';
import { HistoryScreen } from './HistoryScreen';

// The map code is big (MapLibre), so it is only downloaded when the map is first opened.
const MapScreen = lazy(() => import('./MapScreen'));

/** Shows the screen for the current route. Both layouts use this. */
export function ScreenView({ route, isWide }: { route: Route; isWide: boolean }) {
  switch (route) {
    case 'ops':
      return <OpsScreen />;
    case 'map':
      return (
        <Suspense fallback={<div className="screen" />}>
          <MapScreen />
        </Suspense>
      );
    case 'network':
      return <NetworkScreen />;
    case 'fleet':
      return <FleetScreen />;
    case 'new':
      return <NewGameScreen />;
    case 'finance':
      return <FinanceScreen />;
    case 'airlines':
      return <AirlinesScreen />;
    case 'management':
      return <ManagementScreen />;
    case 'saves':
      return <SavesScreen />;
    case 'livery':
      return <LiveryScreen />;
    case 'aircraft':
      return <AircraftScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'sources':
      return <SourcesScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'more':
      // "More" only exists on phones; on a computer everything is in the sidebar.
      return isWide ? <OpsScreen /> : <MoreScreen />;
  }
}
