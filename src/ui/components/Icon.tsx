// Small line icons drawn for this game (24×24 grid, colour follows the text colour).
export type IconName = 'ops' | 'map' | 'network' | 'fleet' | 'finance' | 'settings' | 'more' | 'chevron';

const PATHS: Record<IconName, string[]> = {
  // Radar scope
  ops: ['M12 3a9 9 0 1 0 9 9', 'M12 7a5 5 0 1 0 5 5', 'M12 12l6.5-6.5', 'M12 12h.01'],
  // Globe with meridian and parallels
  map: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3.5 9h17', 'M3.5 15h17', 'M12 3c-3 3.5-3 14.5 0 18', 'M12 3c3 3.5 3 14.5 0 18'],
  // Hub and spokes
  network: [
    'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    'M3 5.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M17 5.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M3 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M17 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M6.6 7l3.4 3.3',
    'M17.4 7L14 10.3',
    'M6.6 17L10 13.7',
    'M17.4 17L14 13.7',
  ],
  // Aircraft seen from above
  fleet: ['M12 2.5c.9 0 1.5 1 1.5 2.3v5l7.5 4.4v2l-7.5-2.3v4.5l2.3 1.7v1.4L12 20.6l-3.8.9v-1.4l2.3-1.7v-4.5L3 16.2v-2l7.5-4.4v-5c0-1.3.6-2.3 1.5-2.3z'],
  // Rising bar chart
  finance: ['M4 20h16', 'M7 16v-4', 'M12 16V8', 'M17 16V5'],
  // Gear
  settings: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M5.3 18.7l2.1-2.1', 'M16.6 7.4l2.1-2.1'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  chevron: ['M9 6l6 6-6 6'],
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
