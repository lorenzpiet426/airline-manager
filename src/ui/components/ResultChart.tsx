import { useEffect, useRef, useState } from 'react';

export interface ChartPeriod {
  key: string;
  /** Full name, e.g. "April 2026". */
  label: string;
  /** Axis label, e.g. "Apr". */
  short: string;
  /** The running period (not finished yet): drawn lighter. */
  partial: boolean;
}

/** How many periods fit; older ones are reached by scrolling the chart sideways. */
const BAR_W = 22;
const GAP = 6;
const H = 160;
const AXIS_H = 18;
const LEFT = 64;

/**
 * Result per period as bars around a zero line: green = profit, red = loss (sign also in the
 * tooltip and the detail below, so colour is never the only cue). Click a bar to see that period.
 */
export function ResultChart({
  periods,
  selectedKey,
  onSelect,
  format,
  ariaLabel,
  soFar,
}: {
  periods: (ChartPeriod & { value: number })[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  format: (value: number) => string;
  ariaLabel: string;
  soFar: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Start at the newest period; only jump again when a period is added, not on every clock tick.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [periods.length]);
  if (!periods.length) return null;

  const max = Math.max(0, ...periods.map((p) => p.value));
  const min = Math.min(0, ...periods.map((p) => p.value));
  const span = max - min || 1;
  const plotH = H - AXIS_H - 8;
  const y = (v: number) => 4 + ((max - v) / span) * plotH;
  const zero = y(0);
  const width = LEFT + periods.length * (BAR_W + GAP) + GAP;
  const hovered = periods.find((p) => p.key === hover);
  // Show every n-th axis label so they never collide.
  const every = Math.ceil(periods.length / 12);

  return (
    <div className="chart">
      <div className="chart__scroll" ref={scroller}>
        <svg width={width} height={H} role="img" aria-label={ariaLabel} className="chart__svg">
          {/* Recessive axis: zero line and the two extreme values */}
          <line x1={LEFT - 4} x2={width} y1={zero} y2={zero} className="chart__zero" />
          {max > 0 && (
            <text x={LEFT - 8} y={y(max) + 4} className="chart__tick" textAnchor="end">
              {format(max)}
            </text>
          )}
          {min < 0 && (
            <text x={LEFT - 8} y={y(min)} className="chart__tick" textAnchor="end">
              {format(min)}
            </text>
          )}
          <text x={LEFT - 8} y={zero + 4} className="chart__tick" textAnchor="end">
            0
          </text>
          {periods.map((p, i) => {
            const x = LEFT + GAP + i * (BAR_W + GAP);
            const top = Math.min(y(p.value), zero);
            const h = Math.max(2, Math.abs(y(p.value) - zero));
            const selected = p.key === selectedKey;
            return (
              <g
                key={p.key}
                className="chart__bar"
                onClick={() => onSelect(p.key)}
                onMouseEnter={() => setHover(p.key)}
                onMouseLeave={() => setHover(null)}
              >
                {/* Hit area larger than the bar */}
                <rect x={x - GAP / 2} y={0} width={BAR_W + GAP} height={H} fill="transparent" />
                <rect
                  x={x}
                  y={top}
                  width={BAR_W}
                  height={h}
                  rx={3}
                  className={`${p.value >= 0 ? 'chart__profit' : 'chart__loss'}${p.partial ? ' chart__partial' : ''}${selected ? ' chart__selected' : ''}`}
                >
                  <title>{`${p.label}: ${p.value >= 0 ? '+' : ''}${format(p.value)}`}</title>
                </rect>
                {i % every === 0 || selected ? (
                  <text x={x + BAR_W / 2} y={H - 4} textAnchor="middle" className={`chart__label${selected ? ' chart__label--selected' : ''}`}>
                    {p.short}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="chart__readout mono" aria-live="polite">
        {hovered ? `${hovered.label}: ${hovered.value >= 0 ? '+' : ''}${format(hovered.value)}${hovered.partial ? ` · ${soFar}` : ''}` : ' '}
      </p>
    </div>
  );
}
