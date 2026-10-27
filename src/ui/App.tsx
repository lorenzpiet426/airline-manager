import { useMediaQuery } from './hooks/useMediaQuery';
import { useApplyTheme } from './hooks/useApplyTheme';
import { useRoute } from './navigation';
import { DesktopShell } from './layouts/DesktopShell';
import { MobileShell } from './layouts/MobileShell';
import { ScreenView } from './screens/ScreenView';

// Picks a layout built for the device: a console with a sidebar on computers/tablets,
// a bottom tab bar on phones. Both show the same screens.
export function App() {
  useApplyTheme();
  const isWide = useMediaQuery('(min-width: 768px)');
  const route = useRoute();
  const screen = <ScreenView route={route} isWide={isWide} />;

  return isWide ? (
    <DesktopShell route={route}>{screen}</DesktopShell>
  ) : (
    <MobileShell route={route}>{screen}</MobileShell>
  );
}
