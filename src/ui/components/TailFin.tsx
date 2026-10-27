import { useId } from 'react';

/** Your livery on an aircraft tail: main colour, a swept stripe in the second colour and your code. */
export function TailFin({
  primary,
  secondary,
  code,
  size = 64,
}: {
  primary: string;
  secondary: string;
  code?: string;
  size?: number;
}) {
  const clipId = useId();
  const fin = '16,96 58,8 84,8 96,96';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="tailfin" aria-hidden="true">
      <clipPath id={clipId}>
        <polygon points={fin} />
      </clipPath>
      <polygon points={fin} fill={primary} />
      <polygon points="0,100 34,100 100,34 100,4" fill={secondary} clipPath={`url(#${clipId})`} />
      {code && (
        <text x="70" y="88" textAnchor="middle" fontSize="18" fontWeight="700" fill={secondary} fontFamily="var(--font-mono)">
          {code}
        </text>
      )}
      <polygon points={fin} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
    </svg>
  );
}
