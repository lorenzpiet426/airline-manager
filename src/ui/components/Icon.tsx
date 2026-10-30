// Small line icons drawn for this game (24×24 grid, colour follows the text colour).
export type IconName = 'ops' | 'map' | 'network' | 'fleet' | 'finance' | 'airlines' | 'saves' | 'sources' | 'settings' | 'more' | 'chevron' | 'types' | 'history' | 'people' | 'star' | 'shares';

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
  // Two tail fins: the world's airlines
  airlines: ['M3 20l5-14h4l-2 14z', 'M12 20l5-14h4l-2 14z'],
  // Stacked save cartridges (like a flight data recorder): saved games
  saves: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  // Open book: data sources and credits
  sources: ['M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5', 'M12 6c2-1.5 5-2 8-1.5V19c-3-.5-6 0-8 1.5', 'M12 6v14.5'],
  // Rising bar chart
  finance: ['M4 20h16', 'M7 16v-4', 'M12 16V8', 'M17 16V5'],
  // Gear
  settings: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M5.3 18.7l2.1-2.1', 'M16.6 7.4l2.1-2.1'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  // Airliner seen from the side: the aircraft encyclopedia
  types: ['M2.5 14.5c0-1.2 1-2 2.5-2h11l3.5-5.5h1.5l-1 5.5h.5a1 1 0 0 1 0 2.5H5c-1.5 0-2.5-.3-2.5-.5z', 'M9 14.5l2.5 4h2l-1-4'],
  // Clock turning back: world history
  history: ['M4 12a8 8 0 1 0 2.4-5.7', 'M3.5 3.5v3.8h3.8', 'M12 7.5V12l3 2'],
  shares: ['M4 19h16', 'M5 15l4-4 3 3 6-7', 'M15 7h3v3'],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  people: ['M9 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4', 'M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6', 'M16 4.8a3 3 0 0 1 0 5.9', 'M17.5 14.3c2.1.6 3.5 2.6 3.5 5.2'],
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
