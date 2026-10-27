import type { CabinLayout } from '../../engine/state';

/** "J20 Y150 · 30″": seats per class front to back, then the economy pitch (like airline seat maps). */
export function cabinText(cabin: CabinLayout): string {
  const y = cabin.find((s) => s.cls === 'Y');
  return `${cabin.map((s) => `${s.cls}${s.seats}`).join(' ')}${y ? ` · Y ${y.pitch}″` : ''}`;
}
