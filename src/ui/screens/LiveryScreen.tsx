import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import {
  currentLivery,
  FUSELAGE_STYLES,
  inOldLivery,
  LIVERY_FONTS,
  LOGO_SYMBOLS,
  MAX_IMAGE_CHARS,
  MAX_STROKE_POINTS,
  MAX_STROKES,
  MAX_TEXT,
  PAINT_SLOTS,
  repaintQuote,
  TAIL_STYLES,
} from '../../engine/livery';
import type { CommandError } from '../../engine/commands';
import type { Livery, LiveryFont, PaintSlot } from '../../engine/state';
import { sendCommand } from '../../game/store';
import { formatMoney } from '../../i18n/format';
import { convert, money } from '../../engine/money';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { usePlayer } from '../game/usePlayer';
import { AircraftSide, slotColor } from '../livery/AircraftSide';
import { SYMBOLS } from '../livery/symbols';
import { hrefFor } from '../navigation';

/** Aircraft the preview can show (the airline's own types come first). */
const PREVIEW_TYPES = ['AT76', 'CRJ9', 'E295', 'A20N', 'B38M', 'B789', 'A359', 'B748', 'A388'];

/** Shrinks an uploaded picture to a small square image for the tail (keeps saves small). */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  for (const [size, quality] of [[160, 0.9], [128, 0.8], [96, 0.7]] as const) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const k = Math.min(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * k;
    const h = bitmap.height * k;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
    if (url.length <= MAX_IMAGE_CHARS) return url;
  }
  throw new Error('imageTooBig');
}

function SlotPicker({ livery, value, onChange, label }: { livery: Livery; value: PaintSlot; onChange: (s: PaintSlot) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {PAINT_SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={value === slot}
            title={t(`livery.slot.${slot}`)}
            aria-label={t(`livery.slot.${slot}`)}
            className={`swatch ${value === slot ? 'swatch--on' : ''}`}
            style={{ background: slotColor(livery, slot) }}
            onClick={() => onChange(slot)}
          />
        ))}
      </div>
    </div>
  );
}

export function LiveryScreen() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { game, airline } = usePlayer();
  const saved = airline ? currentLivery(airline) : null;
  const [draft, setDraft] = useState<Livery | null>(null);
  const livery = draft ?? saved;
  const fleetTypes = useMemo(
    () => (game && airline ? [...new Set(Object.values(game.aircraft).filter((a) => a.airlineId === airline.id).map((a) => a.typeId))] : []),
    [game, airline],
  );
  const types = [...fleetTypes, ...PREVIEW_TYPES.filter((id) => !fleetTypes.includes(id))].slice(0, 12);
  const [typeId, setTypeId] = useState<string | null>(null);
  const shown = typeId ?? types[0] ?? 'A20N';
  const [drawing, setDrawing] = useState(false);
  const [pen, setPen] = useState({ color: '#ffffff', width: 8 });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<number[] | null>(null);

  if (!game || !airline || !livery) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('livery.title')}</h1>
        <Panel title={t('livery.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
        </Panel>
      </div>
    );
  }

  const update = (change: Partial<Livery>) => {
    setDraft({ ...livery, ...change });
    setNotice(null);
  };
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id && a.status === 'active');
  const points = livery.drawing.reduce((n, s) => n + s.points.length / 2, 0);
  const local = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx));

  // Freehand drawing on the preview: screen points → drawing frame.
  const toFrame = (e: PointerEvent<SVGSVGElement>): [number, number] | null => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawing || livery.drawing.length >= MAX_STROKES || points >= MAX_STROKE_POINTS) return;
    const p = toFrame(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = [...p, ...p];
    update({ drawing: [...livery.drawing, { color: pen.color, width: pen.width, points: active.current }] });
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const stroke = active.current;
    const p = toFrame(e);
    if (!stroke || !p) return;
    const [lx, ly] = stroke.slice(-2) as [number, number];
    if (Math.hypot(p[0] - lx, p[1] - ly) < 5) return;
    stroke.push(...p);
    const strokes = livery.drawing.slice(0, -1);
    update({ drawing: [...strokes, { color: pen.color, width: pen.width, points: [...stroke] }] });
  };
  const up = () => {
    active.current = null;
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      update({ logo: { kind: 'image', image: await shrinkImage(file) } });
    } catch {
      setNotice({ ok: false, text: t('errors.imageTooBig') });
    }
  };

  const save = async () => {
    const r = await sendCommand({ type: 'SetLivery', airlineId: airline.id, payload: { livery } });
    if (r.ok) {
      setDraft(null);
      setNotice({ ok: true, text: t('livery.savedNotice', { count: fleet.length }) });
    } else setNotice({ ok: false, text: t(`errors.${r.error as CommandError}`) });
  };
  const old = fleet.filter((a) => inOldLivery(airline, a) && !a.repaintAtCheck);
  const repaintAll = async () => {
    for (const a of old) await sendCommand({ type: 'Repaint', airlineId: airline.id, payload: { aircraftId: a.id, atCheck: true } });
    setNotice({ ok: true, text: t('livery.allAtCheck', { count: old.length }) });
  };

  const logo = livery.logo;
  return (
    <div className="screen livery">
      <h1 className="screen__title">{t('livery.title')}</h1>
      <p className="muted">
        {t('livery.intro')} <a href={hrefFor('fleet')}>{t('livery.toFleet')}</a>
      </p>

      <div className="livery__preview">
        <AircraftSide
          livery={livery}
          typeId={shown}
          className={`livery__side ${drawing ? 'livery__side--draw' : ''}`}
          title={t('livery.previewLabel', { type: getAircraftType(shown).name })}
          svgRef={svg}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
        />
        <label className="field livery__type">
          <span className="field__label">{t('livery.showOn')}</span>
          <select className="input" value={shown} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((id) => (
              <option key={id} value={id}>
                {getAircraftType(id).name}
              </option>
            ))}
          </select>
        </label>
        <div className="livery__save">
          {notice && <p className={`notice notice--${notice.ok ? 'ok' : 'error'} small`}>{notice.text}</p>}
          {changed ? (
            <>
              <p className="small muted">{t('livery.saveHint', { count: fleet.length })}</p>
              <div className="button-row">
                <button type="button" className="button" onClick={() => (setDraft(null), setNotice(null))}>
                  {t('livery.discard')}
                </button>
                <button type="button" className="button button--primary" onClick={() => void save()}>
                  {t('livery.save')}
                </button>
              </div>
            </>
          ) : (
            old.length > 0 && (
              <>
                <p className="small muted">
                  {t('livery.oldFleet', { count: old.length, price: local(repaintQuote(old[0]!).usd), days: repaintQuote(old[0]!).days })}
                </p>
                <div className="button-row">
                  <button type="button" className="button" onClick={() => void repaintAll()}>
                    {t('livery.allWithCheck')}
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>

      <div className="livery__controls">
        <Panel title={t('livery.colors')}>
          <div className="field-row">
            {(['p', 's', 'a'] as const).map((slot, i) => (
              <label key={slot} className="field">
                <span className="field__label">{t(`livery.slot.${slot}`)}</span>
                <input
                  type="color"
                  className="input input--color"
                  value={livery.colors[i]}
                  onChange={(e) => {
                    const colors = [...livery.colors] as Livery['colors'];
                    colors[i] = e.target.value;
                    update({ colors });
                  }}
                />
              </label>
            ))}
          </div>
          <Segmented
            label={t('livery.base')}
            value={livery.base}
            options={(['w', 'grey', 'metal', 'p'] as const).map((v) => ({ value: v, label: t(`livery.baseOpt.${v}`) }))}
            onChange={(base) => update({ base })}
          />
        </Panel>

        <Panel title={t('livery.fuselage')}>
          <div className="style-grid">
            {FUSELAGE_STYLES.map((style) => (
              <button key={style} type="button" className={`style-chip ${livery.fuselage === style ? 'style-chip--on' : ''}`} aria-pressed={livery.fuselage === style} onClick={() => update({ fuselage: style })}>
                <AircraftSide livery={{ ...livery, fuselage: style, drawing: [] }} typeId="A20N" className="style-chip__img" />
                <span>{t(`livery.fuselageOpt.${style}`)}</span>
              </button>
            ))}
          </div>
          <SlotPicker livery={livery} label={t('livery.fuselageColor')} value={livery.fuselageColor} onChange={(fuselageColor) => update({ fuselageColor })} />
          <SlotPicker livery={livery} label={t('livery.engines')} value={livery.engines} onChange={(engines) => update({ engines })} />
        </Panel>

        <Panel title={t('livery.tail')}>
          <div className="style-grid style-grid--tails">
            {TAIL_STYLES.map((style) => (
              <button key={style} type="button" className={`style-chip ${livery.tail === style ? 'style-chip--on' : ''}`} aria-pressed={livery.tail === style} onClick={() => update({ tail: style })}>
                <AircraftSide livery={{ ...livery, tail: style, drawing: [] }} typeId="A20N" crop="tail" className="style-chip__tail" />
                <span>{t(`livery.tailOpt.${style}`)}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t('livery.logo')}>
          <Segmented
            label={t('livery.logo')}
            value={logo.kind}
            options={(['none', 'symbol', 'letters', 'image'] as const).map((v) => ({ value: v, label: t(`livery.logoOpt.${v}`) }))}
            onChange={(kind) =>
              update({
                logo:
                  kind === 'symbol'
                    ? { kind, symbol: 'bird', color: 's' }
                    : kind === 'letters'
                      ? { kind, text: airline.iata, font: 'bold', color: 's' }
                      : kind === 'image'
                        ? logo.kind === 'image' ? logo : { kind: 'none' }
                        : { kind: 'none' },
              })
            }
          />
          {logo.kind === 'symbol' && (
            <>
              <div className="symbol-grid">
                {LOGO_SYMBOLS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`symbol-chip ${logo.symbol === id ? 'symbol-chip--on' : ''}`}
                    aria-pressed={logo.symbol === id}
                    aria-label={t(`livery.symbol.${id}`)}
                    title={t(`livery.symbol.${id}`)}
                    onClick={() => update({ logo: { ...logo, symbol: id } })}
                  >
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <path d={SYMBOLS[id]!.d} fill={SYMBOLS[id]!.stroke ? 'none' : 'currentColor'} stroke={SYMBOLS[id]!.stroke ? 'currentColor' : 'none'} strokeWidth={7} strokeLinecap="round" />
                    </svg>
                  </button>
                ))}
              </div>
              <SlotPicker livery={livery} label={t('livery.logoColor')} value={logo.color} onChange={(color) => update({ logo: { ...logo, color } })} />
            </>
          )}
          {logo.kind === 'letters' && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field__label">{t('livery.letters')}</span>
                  <input className="input mono" maxLength={4} value={logo.text} onChange={(e) => update({ logo: { ...logo, text: e.target.value } })} />
                </label>
                <label className="field">
                  <span className="field__label">{t('livery.font')}</span>
                  <select className="input" value={logo.font} onChange={(e) => update({ logo: { ...logo, font: e.target.value as LiveryFont } })}>
                    {LIVERY_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {t(`livery.fontOpt.${f}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SlotPicker livery={livery} label={t('livery.logoColor')} value={logo.color} onChange={(color) => update({ logo: { ...logo, color } })} />
            </>
          )}
          {logo.kind === 'image' && <p className="small muted">{t('livery.imageLoaded')}</p>}
          {(logo.kind === 'image' || logo.kind === 'none') && (
            <label className="field">
              <span className="field__label">{t('livery.upload')}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input" onChange={(e) => void upload(e.target.files?.[0])} />
              <span className="small muted">{t('livery.uploadNote')}</span>
            </label>
          )}
        </Panel>

        <Panel title={t('livery.titles')}>
          <label className="check">
            <input
              type="checkbox"
              checked={livery.titles !== null}
              onChange={(e) => update({ titles: e.target.checked ? { text: airline.name, font: 'bold', color: 'p', size: 'm', position: 'front' } : null })}
            />{' '}
            {t('livery.titlesOn')}
          </label>
          {livery.titles && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field__label">{t('livery.text')}</span>
                  <input className="input" maxLength={MAX_TEXT} value={livery.titles.text} onChange={(e) => update({ titles: { ...livery.titles!, text: e.target.value } })} />
                </label>
                <label className="field">
                  <span className="field__label">{t('livery.font')}</span>
                  <select className="input" value={livery.titles.font} onChange={(e) => update({ titles: { ...livery.titles!, font: e.target.value as LiveryFont } })}>
                    {LIVERY_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {t(`livery.fontOpt.${f}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Segmented
                label={t('livery.size')}
                value={livery.titles.size}
                options={(['s', 'm', 'l'] as const).map((v) => ({ value: v, label: t(`livery.sizeOpt.${v}`) }))}
                onChange={(size) => update({ titles: { ...livery.titles!, size } })}
              />
              <Segmented
                label={t('livery.position')}
                value={livery.titles.position}
                options={(['front', 'middle'] as const).map((v) => ({ value: v, label: t(`livery.positionOpt.${v}`) }))}
                onChange={(position) => update({ titles: { ...livery.titles!, position } })}
              />
              <SlotPicker livery={livery} label={t('livery.titleColor')} value={livery.titles.color} onChange={(color) => update({ titles: { ...livery.titles!, color } })} />
            </>
          )}
        </Panel>

        <Panel title={t('livery.draw')}>
          <p className="small muted">{t('livery.drawIntro')}</p>
          <div className="field-row">
            <label className="field">
              <span className="field__label">{t('livery.penColor')}</span>
              <input type="color" className="input input--color" value={pen.color} onChange={(e) => setPen({ ...pen, color: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">{t('livery.penWidth', { value: pen.width })}</span>
              <input type="range" min={2} max={40} value={pen.width} onChange={(e) => setPen({ ...pen, width: Number(e.target.value) })} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className={`button ${drawing ? 'button--primary' : ''}`} aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>
              {drawing ? t('livery.drawStop') : t('livery.drawStart')}
            </button>
            <button type="button" className="button" disabled={!livery.drawing.length} onClick={() => update({ drawing: livery.drawing.slice(0, -1) })}>
              {t('livery.undo')}
            </button>
            <button type="button" className="button" disabled={!livery.drawing.length} onClick={() => update({ drawing: [] })}>
              {t('livery.clear')}
            </button>
          </div>
          <p className="small muted mono">{t('livery.drawUsage', { strokes: livery.drawing.length, max: MAX_STROKES, points, maxPoints: MAX_STROKE_POINTS })}</p>
        </Panel>
      </div>
    </div>
  );
}
