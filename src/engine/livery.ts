// Liveries (Phase 4.3): the airline's paint scheme, made of patterns for each part of the aircraft, three colours, a
// logo (a symbol, letters or an uploaded picture), titles and an optional freehand drawing layer. A new livery is used
// for aircraft delivered from now on; aircraft already flying keep the old one until they are repainted (cash and days
// in the paint hangar, or with no extra days during their next C- or D-check, as real airlines often do).
import { getAircraftType, type AircraftCategory } from '../data/aircraft';
import { book, postMessage, schedule } from './core';
import { convert, money } from './money';
import { grounded } from './schedule';
import type { Aircraft, Airline, FuselageStyle, GameState, Livery, LiveryFont, PaintSlot, TailStyle } from './state';
import { MINUTES_PER_DAY, startOfDay } from './time';

export const FUSELAGE_STYLES: FuselageStyle[] = ['plain', 'cheatline', 'belly', 'twoTone', 'sweep', 'nose', 'stripes', 'full'];
export const TAIL_STYLES: TailStyle[] = ['solid', 'split', 'stripes', 'chevron', 'band', 'sweep', 'disc', 'gradient'];
export const LIVERY_FONTS: LiveryFont[] = ['sans', 'bold', 'italic', 'serif', 'mono', 'wide'];
export const PAINT_SLOTS: PaintSlot[] = ['p', 's', 'a', 'w', 'k'];
/** Symbols of the logo library (drawn in ui/livery/symbols.ts). */
export const LOGO_SYMBOLS = ['bird', 'swallow', 'star', 'globe', 'arrow', 'wave', 'crown', 'sun', 'leaf', 'mountain', 'diamond', 'wings'] as const;

/** Limits that keep saves small (and cloud uploads quick). */
export const MAX_STROKES = 200;
export const MAX_STROKE_POINTS = 8000;
export const MAX_IMAGE_CHARS = 80_000;
export const MAX_TEXT = 28;

/** The drawing frame of the side view: everything is drawn in 1000 × 320 units, whatever the aircraft type. */
export const FRAME = { width: 1000, height: 320 };

/** A first livery from the two colours chosen when founding the airline. */
export function defaultLivery(colors: { primary: string; secondary: string }, name: string, code: string): Livery {
  return {
    colors: [colors.primary, colors.secondary, colors.secondary],
    base: 'w',
    fuselage: 'plain',
    fuselageColor: 'p',
    tail: 'solid',
    engines: 'p',
    logo: { kind: 'letters', text: code, font: 'bold', color: 's' },
    titles: { text: name, font: 'bold', color: 'p', size: 'm', position: 'front' },
    drawing: [],
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

export type LiveryError = 'liveryInvalid' | 'imageTooBig' | 'drawingTooBig';

/** Checks a livery sent by the screen (all enums known, colours valid, sizes within the limits). */
export function validateLivery(l: Livery): LiveryError | null {
  const slot = (s: unknown) => PAINT_SLOTS.includes(s as PaintSlot);
  if (!Array.isArray(l.colors) || l.colors.length !== 3 || !l.colors.every((c) => HEX.test(c))) return 'liveryInvalid';
  if (!['w', 'grey', 'metal', 'p'].includes(l.base) || !FUSELAGE_STYLES.includes(l.fuselage) || !TAIL_STYLES.includes(l.tail)) return 'liveryInvalid';
  if (!slot(l.fuselageColor) || !slot(l.engines)) return 'liveryInvalid';
  const logo = l.logo;
  if (logo.kind === 'symbol' && (!(LOGO_SYMBOLS as readonly string[]).includes(logo.symbol) || !slot(logo.color))) return 'liveryInvalid';
  if (logo.kind === 'letters' && (logo.text.length > 4 || !LIVERY_FONTS.includes(logo.font) || !slot(logo.color))) return 'liveryInvalid';
  if (logo.kind === 'image') {
    if (!IMAGE.test(logo.image)) return 'liveryInvalid';
    if (logo.image.length > MAX_IMAGE_CHARS) return 'imageTooBig';
  }
  if (!['none', 'symbol', 'letters', 'image'].includes(logo.kind)) return 'liveryInvalid';
  const t = l.titles;
  if (t && (t.text.length > MAX_TEXT || !LIVERY_FONTS.includes(t.font) || !slot(t.color) || !['s', 'm', 'l'].includes(t.size) || !['front', 'middle'].includes(t.position))) {
    return 'liveryInvalid';
  }
  if (!Array.isArray(l.drawing)) return 'liveryInvalid';
  if (l.drawing.some((s) => !HEX.test(s.color) || !(s.width >= 1 && s.width <= 60) || s.points.length % 2 !== 0 || s.points.some((n) => !Number.isFinite(n)))) {
    return 'liveryInvalid';
  }
  if (l.drawing.length > MAX_STROKES || l.drawing.reduce((n, s) => n + s.points.length / 2, 0) > MAX_STROKE_POINTS) return 'drawingTooBig';
  return null;
}

/** The airline's current livery. */
export function currentLivery(airline: Airline): Livery {
  const list = airline.liveries ?? [];
  return list.at(-1) ?? defaultLivery(airline.colors, airline.name, airline.iata);
}

/** Index of the current livery. */
export const currentPaint = (airline: Airline): number => Math.max(0, (airline.liveries?.length ?? 1) - 1);

/** The livery an aircraft wears (aircraft still being delivered come in the current one). */
export function liveryOf(airline: Airline, aircraft: Aircraft): Livery {
  if (aircraft.status !== 'active' || aircraft.paint === undefined) return currentLivery(airline);
  return airline.liveries?.[aircraft.paint] ?? currentLivery(airline);
}

export const inOldLivery = (airline: Airline, aircraft: Aircraft): boolean =>
  aircraft.status === 'active' && (aircraft.paint ?? currentPaint(airline)) < currentPaint(airline);

/** Old liveries no aircraft wears any more are dropped (their slot stays, so indexes don't change). */
function prune(state: GameState, airline: Airline): void {
  const list = airline.liveries;
  if (!list) return;
  const used = new Set(Object.values(state.aircraft).filter((a) => a.airlineId === airline.id).map((a) => a.paint));
  list.forEach((_, i) => {
    if (i < list.length - 1 && !used.has(i)) list[i] = null;
  });
}

type Result = { ok: true; id?: string } | { ok: false; error: LiveryError | RepaintError };

/** A new livery: from now on for new aircraft; the fleet keeps the old one until repainted. */
export function setLivery(state: GameState, airlineId: string, livery: Livery): Result {
  const airline = state.airlines[airlineId];
  if (!airline) return { ok: false, error: 'airlineUnknown' };
  const error = validateLivery(livery);
  if (error) return { ok: false, error };
  const copy: Livery = JSON.parse(JSON.stringify(livery));
  copy.colors = copy.colors.map((c) => c.toLowerCase()) as Livery['colors'];
  (airline.liveries ??= []).push(copy);
  airline.colors = { primary: copy.colors[0], secondary: copy.colors[1] };
  prune(state, airline);
  const old = Object.values(state.aircraft).filter((a) => a.airlineId === airlineId && inOldLivery(airline, a)).length;
  postMessage(state, { airlineId, kind: 'liveryChanged', level: 'info', params: { count: old } });
  return { ok: true };
}

// ─── Repainting ────────────────────────────────────────────────────────────────

/** Repaint price (USD) and days in the paint hangar by aircraft size (stripping, primer, paint, logos). */
const REPAINT: Record<AircraftCategory, { usd: number; days: number }> = {
  turboprop: { usd: 60_000, days: 4 },
  regional: { usd: 100_000, days: 5 },
  narrowbody: { usd: 200_000, days: 7 },
  widebody: { usd: 400_000, days: 10 },
};

export function repaintQuote(aircraft: Pick<Aircraft, 'typeId'>): { usd: number; days: number } {
  const type = getAircraftType(aircraft.typeId);
  const r = REPAINT[type.category];
  const size = type.category === 'widebody' ? (type.seats.typical / 300) ** 0.7 : 1;
  return { usd: Math.round((r.usd * size) / 1000) * 1000, days: r.days };
}

export type RepaintError = 'airlineUnknown' | 'aircraftUnknown' | 'notActive' | 'alreadyPainted' | 'inHangar' | 'insufficientCash';

/** Repaint now (cash, days out of service) or with the next heavy check (no extra days, paid then). */
export function repaint(state: GameState, airlineId: string, aircraftId: string, atCheck: boolean): Result {
  const airline = state.airlines[airlineId];
  const a = state.aircraft[aircraftId];
  if (!airline) return { ok: false, error: 'airlineUnknown' };
  if (!a || a.airlineId !== airlineId) return { ok: false, error: 'aircraftUnknown' };
  if (a.status !== 'active') return { ok: false, error: 'notActive' };
  if (!inOldLivery(airline, a)) return { ok: false, error: 'alreadyPainted' };
  if (atCheck) {
    a.repaintAtCheck = true;
    return { ok: true, id: a.id };
  }
  if (grounded(a, state.time)) return { ok: false, error: 'inHangar' };
  const q = repaintQuote(a);
  if (airline.cash.amount < convert(money(q.usd, 'USD'), airline.currency, state.fx).amount) return { ok: false, error: 'insufficientCash' };
  const cost = book(state, airlineId, 'repaint', money(-q.usd, 'USD'), a.id);
  writeOff(state, a, -cost.amount);
  delete a.repaintAtCheck;
  a.paintUntil = startOfDay(state.time) + (q.days + 1) * MINUTES_PER_DAY;
  schedule(state, { at: a.paintUntil, kind: 'repaintDone', aircraftId: a.id });
  postMessage(state, {
    airlineId,
    kind: 'repaintStarted',
    level: 'caution',
    params: { registration: a.registration, days: q.days, until: a.paintUntil, amount: -cost.amount, currency: airline.currency },
  });
  return { ok: true, id: a.id };
}

/** Paint is an investment: written off over six years (or until the lease ends), like a cabin refit. */
function writeOff(state: GameState, a: Aircraft, amount: number): void {
  const today = startOfDay(state.time);
  const dep = a.cabinDepreciation;
  const left = dep && dep.until > today ? (dep.perDay * (dep.until - today)) / MINUTES_PER_DAY : 0;
  const until = Math.min(a.lease?.endAt ?? Infinity, today + 6 * 365 * MINUTES_PER_DAY);
  a.cabinDepreciation = { perDay: (amount + left) / Math.max(1, (until - today) / MINUTES_PER_DAY), until };
}

/** The paint hangar is done: the aircraft wears the current livery. */
export function repaintDone(state: GameState, aircraftId: string): void {
  const a = state.aircraft[aircraftId];
  const airline = a && state.airlines[a.airlineId];
  if (!a || !airline || a.paintUntil === undefined || a.paintUntil > state.time) return;
  delete a.paintUntil;
  a.paint = currentPaint(airline);
  prune(state, airline);
  postMessage(state, { airlineId: a.airlineId, kind: 'repaintDone', level: 'normal', params: { registration: a.registration } });
}

/** Called when a heavy check starts: an aircraft waiting for it is repainted in the same hangar visit. */
export function repaintWithCheck(state: GameState, a: Aircraft): void {
  const airline = state.airlines[a.airlineId];
  if (!a.repaintAtCheck || !airline) return;
  delete a.repaintAtCheck;
  if (!inOldLivery(airline, a)) return;
  const cost = book(state, a.airlineId, 'repaint', money(-repaintQuote(a).usd, 'USD'), a.id);
  writeOff(state, a, -cost.amount);
  a.paint = currentPaint(airline);
  prune(state, airline);
  postMessage(state, { airlineId: a.airlineId, kind: 'repaintDone', level: 'normal', params: { registration: a.registration } });
}

/** A new aircraft is painted in the current livery before it arrives (part of the delivery or transition work). */
export function paintOnDelivery(state: GameState, a: Aircraft): void {
  const airline = state.airlines[a.airlineId];
  if (airline) a.paint = currentPaint(airline);
}
