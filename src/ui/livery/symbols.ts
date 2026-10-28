// The logo symbol library (Phase 4.3): simple original shapes in a 100 × 100 box. `stroke` symbols are drawn as lines.
export interface LogoSymbol {
  d: string;
  stroke?: boolean;
}

/** A star polygon with `points` tips around the centre of the 100 × 100 box. */
function star(points: number, outer: number, inner: number, turn = -90): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((turn + (i * 180) / points) * Math.PI) / 180;
    parts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${parts.join(' L')} Z`;
}

export const SYMBOLS: Record<string, LogoSymbol> = {
  bird: { d: 'M6 62 C24 38 40 38 50 54 C60 38 76 38 94 62 C76 52 62 55 50 70 C38 55 24 52 6 62 Z' },
  swallow: { d: 'M8 28 L56 50 L92 38 L64 60 L82 92 L50 68 L28 82 L42 58 Z' },
  star: { d: star(5, 44, 18) },
  globe: { d: 'M50 8 a42 42 0 1 0 0.1 0 M8 50 H92 M14 30 H86 M14 70 H86 M50 8 C26 30 26 70 50 92 M50 8 C74 30 74 70 50 92', stroke: true },
  arrow: { d: 'M8 62 L58 62 L58 80 L94 50 L58 20 L58 38 L8 38 Z' },
  wave: { d: 'M4 40 C18 22 34 22 50 40 S82 58 96 40 M4 64 C18 46 34 46 50 64 S82 82 96 64', stroke: true },
  crown: { d: 'M12 80 L16 30 L35 52 L50 20 L65 52 L84 30 L88 80 Z' },
  sun: { d: star(12, 46, 30) },
  leaf: { d: 'M14 86 C14 42 44 14 88 12 C86 56 58 86 14 86 Z' },
  mountain: { d: 'M4 86 L38 28 L52 50 L66 34 L96 86 Z' },
  diamond: { d: 'M50 6 L90 50 L50 94 L10 50 Z' },
  wings: { d: 'M50 46 C40 30 20 26 4 30 C18 40 30 50 50 64 C70 50 82 40 96 30 C80 26 60 30 50 46 Z' },
};
