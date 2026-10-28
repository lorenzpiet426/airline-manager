import { useId, type PointerEventHandler, type Ref } from 'react';
import { getAircraftType, type AircraftType } from '../../data/aircraft';
import { FRAME } from '../../engine/livery';
import type { Livery, LiveryFont, PaintSlot } from '../../engine/state';
import { SYMBOLS } from './symbols';

// A side view of an aircraft in a livery (Phase 4.3). Every type is drawn in the same 1000 × 320 frame from a few
// numbers (fuselage height, engines under the wing / at the rear / propellers, T-tail, four engines, 747 hump), so
// patterns, logos and freehand drawings fit every aircraft. Not to scale between types: each fills the frame.

interface Shape {
  /** Fuselage height in frame units. */
  h: number;
  /** Where the nose starts (small aircraft are shorter). */
  nose: number;
  engines: 'wing' | 'rear' | 'prop' | 'noseProp';
  quad: boolean;
  tTail: boolean;
  highWing: boolean;
  deck: 'single' | 'hump' | 'double';
}

const REAR = new Set(['CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'E145', 'E135', 'F100', 'AJ27', 'B712', 'MD82']);
const QUAD = new Set(['A343', 'A346', 'A388', 'B744', 'B748', 'RJ1H']);
const T_TAIL = new Set([...REAR, 'RJ1H', 'AT45', 'AT46', 'AT75', 'AT76', 'DH8A', 'DH8B', 'DH8C', 'DH8D', 'E120', 'B190', 'BE20', 'D328']);
const LOW_WING_PROPS = new Set(['SF34', 'SB20', 'E120', 'JS41', 'JS32', 'B190', 'SW4', 'BE20', 'C402']);
const NOSE_PROP = new Set(['C208', 'PC12']);
/** Fuselage height for types much shorter or longer than their category's typical one. */
const HEIGHT: Record<string, number> = {
  A318: 100, A319: 92, A19N: 92, B737: 90, B37M: 90, BCS1: 92, B733: 92, B732: 96,
  A321: 74, A21N: 74, 'A21N-XLR': 74, B739: 74, B3XM: 72, B752: 66, B753: 60, MD82: 66,
  B78X: 66, A346: 58, B77W: 62, B779: 60, B773: 62, A35K: 66, B764: 66, A388: 104, B744: 72, B748: 66,
  CRJ9: 66, CRJX: 62, E195: 70, E295: 68, E145: 66, DH8D: 66, AT76: 72,
};

export function shapeOf(type: AircraftType): Shape {
  const id = type.id.replace(/-F$/, '');
  const base = { turboprop: 80, regional: 76, narrowbody: 84, widebody: 76 }[type.category];
  const prop = type.category === 'turboprop';
  return {
    h: HEIGHT[id] ?? base,
    nose: prop ? 70 : type.category === 'regional' ? 55 : 40,
    engines: NOSE_PROP.has(id) ? 'noseProp' : prop ? 'prop' : REAR.has(id) ? 'rear' : 'wing',
    quad: QUAD.has(id),
    tTail: T_TAIL.has(id),
    highWing: (prop && !LOW_WING_PROPS.has(id) && !NOSE_PROP.has(id)) || id === 'RJ1H',
    deck: id === 'B744' || id === 'B748' ? 'hump' : id === 'A388' ? 'double' : 'single',
  };
}

const CY = 205;
const WHITE = '#f5f7fa';
const DARK = '#2b2f36';

const FONTS: Record<LiveryFont, { family: string; weight: number; style?: string; spacing?: string }> = {
  sans: { family: 'IBM Plex Sans, system-ui, sans-serif', weight: 600 },
  bold: { family: 'IBM Plex Sans, system-ui, sans-serif', weight: 700 },
  italic: { family: 'IBM Plex Sans, system-ui, sans-serif', weight: 700, style: 'italic' },
  serif: { family: 'Georgia, "Times New Roman", serif', weight: 700 },
  mono: { family: 'IBM Plex Mono, ui-monospace, monospace', weight: 600 },
  wide: { family: 'IBM Plex Sans, system-ui, sans-serif', weight: 500, spacing: '0.25em' },
};
export const fontStyle = (font: LiveryFont) => FONTS[font];

export const slotColor = (l: Livery, slot: PaintSlot): string =>
  slot === 'p' ? l.colors[0] : slot === 's' ? l.colors[1] : slot === 'a' ? l.colors[2] : slot === 'w' ? WHITE : DARK;

/** All geometry of one aircraft shape in the frame. */
export function geometry(s: Shape) {
  const { h, nose: n } = s;
  const top = CY - h / 2;
  const bot = CY + h / 2;
  const hump = s.deck === 'hump' ? 0.42 * h : 0;
  const upper =
    hump > 0
      ? `C ${n} ${top + 0.1 * h} ${n + 0.5 * h} ${top - hump} ${n + 1.4 * h} ${top - hump} L ${n + 3.3 * h} ${top - hump} C ${n + 3.9 * h} ${top - hump} ${n + 4.2 * h} ${top} ${n + 4.8 * h} ${top}`
      : `C ${n} ${top + 0.25 * h} ${n + 0.5 * h} ${top} ${n + 1.4 * h} ${top}`;
  const fuselage =
    `M ${n} ${CY + 0.12 * h} ${upper} L 760 ${top} C 830 ${top} 880 ${top + 0.08 * h} 928 ${top + 0.26 * h} ` +
    `L 932 ${top + 0.4 * h} C 880 ${top + 0.52 * h} 800 ${bot} 700 ${bot} L ${n + 1.2 * h} ${bot} ` +
    `C ${n + 0.4 * h} ${bot} ${n} ${CY + 0.38 * h} ${n} ${CY + 0.12 * h} Z`;
  const tipY = 22;
  const tail = `M 690 ${top + 4} L 828 ${tipY} L 892 ${tipY} L 926 ${top + 0.3 * h} Z`;
  const tailBox = { x: 690, y: tipY, w: 240, hgt: top + 4 - tipY };
  // The logo sits in the middle of the fin, between its leading and trailing edges at that height.
  const logoY = tipY + (top - tipY) * 0.5;
  const leading = 690 + ((828 - 690) * (top + 4 - logoY)) / (top + 4 - tipY);
  const trailing = 892 + ((926 - 892) * (logoY - tipY)) / (top + 0.3 * h - tipY);
  const logo = { x: (leading + trailing) / 2, y: logoY, size: Math.min(90, (trailing - leading) * 0.62, (top - tipY) * 0.5) };
  const stab = s.tTail
    ? `M 800 ${tipY + 4} L 958 ${tipY - 6} L 966 ${tipY + 6} L 806 ${tipY + 14} Z`
    : `M 790 ${CY - 0.12 * h} L 958 ${CY - 0.32 * h} L 968 ${CY - 0.22 * h} L 812 ${CY - 0.02 * h} Z`;
  return { top, bot, h, n, hump, fuselage, tail, tailBox, logo, stab };
}

type Geo = ReturnType<typeof geometry>;

function Engines({ s, g, color }: { s: Shape; g: Geo; color: string }) {
  const { h, top, bot } = g;
  if (s.engines === 'noseProp') {
    return <rect x={g.n - 8} y={CY - 0.45 * h} width={6} height={0.9 * h} rx={3} fill={DARK} opacity={0.45} />;
  }
  if (s.engines === 'prop') {
    const y = s.highWing ? top - 0.05 * h : CY + 0.1 * h;
    return (
      <g>
        <rect x={330} y={y - 0.16 * h} width={150} height={0.34 * h} rx={0.15 * h} fill={color} stroke={DARK} strokeOpacity={0.35} strokeWidth={2} />
        <rect x={318} y={y - 0.6 * h} width={7} height={1.2 * h} rx={3.5} fill={DARK} opacity={0.4} />
      </g>
    );
  }
  if (s.engines === 'rear') {
    return (
      <g>
        <rect x={650} y={top - 0.18 * h} width={150} height={0.42 * h} rx={0.2 * h} fill={color} stroke={DARK} strokeOpacity={0.35} strokeWidth={2} />
        <rect x={650} y={top - 0.14 * h} width={14} height={0.34 * h} rx={6} fill={DARK} opacity={0.65} />
      </g>
    );
  }
  const pod = (x: number, y: number, w: number, k: number) => (
    <g key={x}>
      <rect x={x} y={y} width={w} height={0.5 * h * k} rx={0.24 * h * k} fill={color} stroke={DARK} strokeOpacity={0.35} strokeWidth={2} />
      <rect x={x} y={y + 0.05 * h * k} width={0.14 * w} height={0.4 * h * k} rx={6} fill={DARK} opacity={0.6} />
    </g>
  );
  return <g>{s.quad ? [pod(410, bot - 0.12 * h, 130, 0.85), pod(300, bot - 0.02 * h, 150, 1)] : [pod(330, bot - 0.08 * h, 160, 1)]}</g>;
}

function Wing({ s, g }: { s: Shape; g: Geo }) {
  if (s.engines === 'noseProp' || s.highWing) {
    const y = g.top + 2;
    return <path d={`M 290 ${y} L 610 ${y - 8} L 660 ${y + 2} L 310 ${y + 12} Z`} fill={DARK} opacity={0.35} />;
  }
  const y = g.bot - 4;
  return <path d={`M 280 ${y - 2} L 620 ${y - 14} L 680 ${y - 4} L 320 ${y + 10} Z`} fill={DARK} opacity={0.35} />;
}

/** The fuselage pattern, drawn inside the fuselage outline. */
function FuselagePaint({ l, g }: { l: Livery; g: Geo }) {
  const c = slotColor(l, l.fuselageColor);
  const { h, top, bot } = g;
  switch (l.fuselage) {
    case 'plain':
      return null;
    case 'cheatline':
      return (
        <g>
          <rect x={0} y={CY - 0.17 * h} width={1000} height={0.19 * h} fill={c} />
          <rect x={0} y={CY + 0.04 * h} width={1000} height={0.04 * h} fill={l.colors[2]} />
        </g>
      );
    case 'belly':
      return <path d={`M 0 ${CY + 0.14 * h} L 640 ${CY + 0.14 * h} C 760 ${CY + 0.14 * h} 860 ${top + 0.3 * h} 960 ${top + 0.1 * h} L 1000 ${bot + 40} L 0 ${bot + 40} Z`} fill={c} />;
    case 'twoTone':
      return <rect x={0} y={0} width={1000} height={CY - 0.04 * h} fill={c} />;
    case 'sweep':
      return <path d={`M 360 ${bot + 30} C 600 ${bot} 700 ${CY} 760 ${top - 60} L 1000 ${top - 60} L 1000 ${bot + 40} Z`} fill={c} />;
    case 'nose':
      return <path d={`M 0 0 L ${g.n + 2.6 * h} 0 L ${g.n + 1.5 * h} 330 L 0 330 Z`} fill={c} />;
    case 'stripes':
      return (
        <g fill="none" strokeWidth={0.06 * h}>
          {[l.colors[0], l.colors[1], l.colors[2]].map((color, i) => {
            const y = CY + 0.2 * h + i * 0.1 * h;
            return <path key={i} d={`M 0 ${y} L 600 ${y} C 740 ${y} 820 ${top + 0.1 * h + i * 0.1 * h} 940 ${top - 0.3 * h + i * 0.1 * h}`} stroke={color} />;
          })}
        </g>
      );
    case 'full':
      return <rect x={0} y={0} width={1000} height={330} fill={c} />;
  }
}

/** The tail pattern, drawn inside the tail outline. */
function TailPaint({ l, g, gradientId }: { l: Livery; g: Geo; gradientId: string }) {
  const [p, s, a] = l.colors;
  const { x, y, w, hgt } = g.tailBox;
  const bottom = y + hgt;
  switch (l.tail) {
    case 'solid':
      return <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={p} />;
    case 'split':
      return (
        <g>
          <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={p} />
          <path d={`M ${x} ${bottom + 10} L ${x + w} ${bottom + 10} L ${x + w} ${y + hgt * 0.15} Z`} fill={s} />
        </g>
      );
    case 'stripes':
      return (
        <g>
          {[p, s, a].map((color, i) => (
            <rect key={i} x={x} y={y - 10 + ((hgt + 20) * i) / 3} width={w} height={(hgt + 20) / 3 + 1} fill={color} />
          ))}
        </g>
      );
    case 'chevron':
      return (
        <g>
          <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={p} />
          <path d={`M ${x + 10} ${bottom + 10} L ${x + w * 0.62} ${y + hgt * 0.25} L ${x + w + 60} ${bottom + 10}`} fill="none" stroke={s} strokeWidth={hgt * 0.16} />
        </g>
      );
    case 'band':
      return (
        <g>
          <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={p} />
          <rect x={x + w * 0.66} y={y - 10} width={w * 0.14} height={hgt + 20} fill={s} />
        </g>
      );
    case 'sweep':
      return (
        <g>
          <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={p} />
          <path d={`M ${x} ${bottom + 10} C ${x + w * 0.45} ${bottom} ${x + w * 0.75} ${y + hgt * 0.5} ${x + w * 0.9} ${y - 10} L ${x + w + 10} ${y - 10} L ${x + w + 10} ${bottom + 10} Z`} fill={s} />
        </g>
      );
    case 'disc':
      return (
        <g>
          <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={WHITE} />
          <circle cx={g.logo.x} cy={g.logo.y} r={g.logo.size * 0.62} fill={p} />
        </g>
      );
    case 'gradient':
      return (
        <g>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={p} />
              <stop offset="1" stopColor={s} />
            </linearGradient>
          </defs>
          <rect x={x} y={y - 10} width={w} height={hgt + 20} fill={`url(#${gradientId})`} />
        </g>
      );
  }
}

function Logo({ l, g }: { l: Livery; g: Geo }) {
  const { x, y, size } = g.logo;
  const logo = l.logo;
  if (logo.kind === 'symbol') {
    const sym = SYMBOLS[logo.symbol];
    if (!sym) return null;
    const color = slotColor(l, logo.color);
    return (
      <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})`}>
        <path d={sym.d} fill={sym.stroke ? 'none' : color} stroke={sym.stroke ? color : 'none'} strokeWidth={sym.stroke ? 7 : 0} strokeLinecap="round" />
      </g>
    );
  }
  if (logo.kind === 'letters' && logo.text) {
    const f = FONTS[logo.font];
    const fontSize = (size * 1.05) / Math.max(1.4, logo.text.length * 0.62);
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={f.family}
        fontWeight={f.weight}
        fontStyle={f.style}
        letterSpacing={f.spacing}
        fontSize={fontSize}
        fill={slotColor(l, logo.color)}
      >
        {logo.text}
      </text>
    );
  }
  if (logo.kind === 'image') {
    return <image href={logo.image} x={x - size / 2} y={y - size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />;
  }
  return null;
}

function Titles({ l, g }: { l: Livery; g: Geo }) {
  const t = l.titles;
  if (!t || !t.text) return null;
  const f = FONTS[t.font];
  const size = g.h * { s: 0.17, m: 0.23, l: 0.3 }[t.size];
  const x = t.position === 'front' ? g.n + 1.9 * g.h + (g.hump ? 1.4 * g.h : 0) : 470;
  return (
    <text
      x={x}
      y={g.top + 0.31 * g.h - size / 2}
      textAnchor={t.position === 'front' ? 'start' : 'middle'}
      dominantBaseline="central"
      fontFamily={f.family}
      fontWeight={f.weight}
      fontStyle={f.style}
      letterSpacing={f.spacing}
      fontSize={size}
      fill={slotColor(l, t.color)}
    >
      {t.text}
    </text>
  );
}

function Windows({ s, g }: { s: Shape; g: Geo }) {
  const { h, n } = g;
  const y = CY - 0.12 * h;
  const step = Math.max(12, 0.24 * h);
  const size = Math.max(5, 0.09 * h);
  const row = (from: number, to: number, at: number) => {
    const xs: number[] = [];
    for (let x = from; x < to; x += step) xs.push(x);
    return xs.map((x) => <rect key={`${x}-${at}`} x={x} y={at} width={size} height={size * 1.3} rx={size / 2} />);
  };
  return (
    <g fill={DARK} opacity={0.75}>
      {row(n + 1.7 * h, 735, s.deck === 'double' ? CY + 0.08 * h : y)}
      {s.deck === 'double' && row(n + 1.9 * h, 700, CY - 0.3 * h)}
      {s.deck === 'hump' && row(n + 1.6 * h, n + 3.3 * h, g.top - 0.25 * h)}
      <path d={`M ${n + 0.3 * h} ${g.top + 0.32 * h - g.hump} L ${n + 0.62 * h} ${g.top + 0.16 * h - g.hump} L ${n + 0.95 * h} ${g.top + 0.14 * h - g.hump} L ${n + 0.92 * h} ${g.top + 0.32 * h - g.hump} Z`} />
    </g>
  );
}

const BASE = { w: WHITE, grey: '#c8ced6', p: '' } as const;

export interface AircraftSideProps {
  livery: Livery;
  typeId: string;
  /** Show only the tail (for small fins in lists). */
  crop?: 'tail';
  className?: string;
  title?: string;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: PointerEventHandler<SVGSVGElement>;
  onPointerMove?: PointerEventHandler<SVGSVGElement>;
  onPointerUp?: PointerEventHandler<SVGSVGElement>;
}

export function AircraftSide({ livery: l, typeId, crop, className, title, svgRef, ...pointer }: AircraftSideProps) {
  const id = useId().replace(/:/g, '');
  const s = shapeOf(getAircraftType(typeId));
  const g = geometry(s);
  const engines = slotColor(l, l.engines);
  const base = l.base === 'p' ? l.colors[0] : l.base === 'metal' ? `url(#${id}m)` : BASE[l.base];
  const viewBox = crop === 'tail' ? `676 6 280 ${g.top + 14 - 6}` : `0 0 ${FRAME.width} ${FRAME.height}`;
  return (
    <svg ref={svgRef} viewBox={viewBox} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} {...pointer}>
      <defs>
        <clipPath id={`${id}f`}>
          <path d={g.fuselage} />
        </clipPath>
        <clipPath id={`${id}t`}>
          <path d={g.tail} />
        </clipPath>
        <clipPath id={`${id}a`}>
          <path d={g.fuselage} />
          <path d={g.tail} />
        </clipPath>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e8ec" />
          <stop offset="0.5" stopColor="#b9c1ca" />
          <stop offset="1" stopColor="#8d96a1" />
        </linearGradient>
      </defs>
      <path d={g.stab} fill={slotColor(l, l.tail === 'disc' ? 'w' : 'p')} stroke={DARK} strokeOpacity={0.35} strokeWidth={2} />
      <path d={g.tail} fill={l.colors[0]} />
      <g clipPath={`url(#${id}t)`}>
        <TailPaint l={l} g={g} gradientId={`${id}g`} />
        <Logo l={l} g={g} />
      </g>
      <path d={g.fuselage} fill={base} />
      <g clipPath={`url(#${id}f)`}>
        <FuselagePaint l={l} g={g} />
        <Windows s={s} g={g} />
        <Titles l={l} g={g} />
      </g>
      <g clipPath={`url(#${id}a)`}>
        {l.drawing.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.points.join(' ')}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
      <path d={g.fuselage} fill="none" stroke={DARK} strokeOpacity={0.4} strokeWidth={2} />
      <path d={g.tail} fill="none" stroke={DARK} strokeOpacity={0.4} strokeWidth={2} />
      {crop !== 'tail' && <Wing s={s} g={g} />}
      {crop !== 'tail' && <Engines s={s} g={g} color={engines} />}
    </svg>
  );
}
