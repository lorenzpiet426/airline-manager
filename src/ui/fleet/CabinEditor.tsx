import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAircraftType, type AircraftType } from '../../data/aircraft';
import {
  abreast,
  cabinLengthIn,
  CLASSES,
  expectedScore,
  fillEconomy,
  PRODUCTS,
  PRODUCTS_OF,
  refitQuote,
  rowsOf,
  seatScore,
  standardCabin,
  stylesFor,
  totalSeats,
  usedLengthIn,
  validateCabin,
} from '../../engine/cabins';
import { convert, money } from '../../engine/money';
import type { Aircraft, Airline, CabinClass, CabinLayout, CabinSection, GameState, SeatProduct } from '../../engine/state';
import { sendCommand } from '../../game/store';
import { formatMoney } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { CabinBar } from './CabinBar';

/** Classes this aircraft can have (first class only on wide-bodies, nothing but economy on the smallest types). */
const classesFor = (type: AircraftType) => CLASSES.filter((cls) => PRODUCTS_OF[cls].some((p) => abreast(type, p) > 0));

/** Score label: how a seat compares with what passengers expect of its class on short and long flights. */
function Comfort({ section }: { section: Pick<CabinSection, 'cls' | 'product' | 'pitch'> }) {
  const { t } = useTranslation();
  const chip = (h: 0 | 1) => {
    const score = Math.round(seatScore(section.product, section.pitch, h));
    const diff = score - expectedScore(section.cls, h);
    const level = diff >= -2 ? 'normal' : diff >= -10 ? 'caution' : 'warning';
    return (
      <span className={`chip chip--${level} mono`} title={t('cabin.expected', { score: Math.round(expectedScore(section.cls, h)) })}>
        {t(h ? 'cabin.long' : 'cabin.short')} {score}
      </span>
    );
  };
  return (
    <span className="cabin-comfort">
      {chip(0)}
      {chip(1)}
    </span>
  );
}

/**
 * Cabin editor for one aircraft: presets, then class by class the seat product, pitch and rows; a diagram of the
 * cabin; what the change costs (free before delivery, else a refit with days in the hangar).
 */
export function CabinEditor({ game, airline, aircraft, onDone }: { game: GameState; airline: Airline; aircraft: Aircraft; onDone: () => void }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const type = getAircraftType(aircraft.typeId);
  const [cabin, setCabin] = useState<CabinLayout>(aircraft.cabin);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const classes = classesFor(type);

  const error = validateCabin(type, cabin);
  const quote = useMemo(() => refitQuote(type, aircraft.cabin, cabin), [type, aircraft.cabin, cabin]);
  const unchanged = quote.costUsd === 0 && quote.days === 0;
  const delivering = aircraft.status === 'delivering';
  const cost = convert(money(quote.costUsd, 'USD'), airline.currency, game.fx);
  const tooExpensive = !delivering && cost.amount > airline.cash.amount;

  const section = (cls: CabinClass) => cabin.find((s) => s.cls === cls);
  const order = (list: CabinLayout) => [...list].sort((a, b) => CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls));
  const put = (cls: CabinClass, next: CabinSection | null) => {
    setResult(null);
    setCabin((c) => order([...c.filter((s) => s.cls !== cls), ...(next ? [next] : [])]));
  };
  const toggle = (cls: CabinClass, on: boolean) => {
    if (!on) return put(cls, null);
    const product = PRODUCTS_OF[cls].find((p) => abreast(type, p) > 0)!;
    const pitch = cls === 'J' && product === 'euro' ? 31 : Math.round((PRODUCTS[product].pitch[0] + PRODUCTS[product].pitch[1]) / 2);
    put(cls, { cls, product, pitch, seats: 2 * abreast(type, product) });
  };
  const setProduct = (s: CabinSection, product: SeatProduct) => {
    const [lo, hi] = PRODUCTS[product].pitch;
    put(s.cls, { ...s, product, pitch: Math.min(hi, Math.max(lo, s.pitch)), seats: rowsOf(type, s) * abreast(type, product) });
  };
  const setRows = (s: CabinSection, rows: number) => rows >= 1 && put(s.cls, { ...s, seats: rows * abreast(type, s.product) });
  const setPitch = (s: CabinSection, pitch: number) => {
    const [lo, hi] = PRODUCTS[s.product].pitch;
    if (pitch >= lo && pitch <= hi) put(s.cls, { ...s, pitch });
  };
  const fill = () => {
    const y = section('Y');
    setResult(null);
    setCabin(fillEconomy(type, cabin.filter((s) => s.cls !== 'Y'), y?.pitch ?? 30));
  };

  const apply = async () => {
    setBusy(true);
    const r = await sendCommand({ type: 'RefitCabin', airlineId: airline.id, payload: { aircraftId: aircraft.id, cabin } });
    setBusy(false);
    if (r.ok) onDone();
    else setResult(r.error);
  };

  const length = cabinLengthIn(type);
  const used = usedLengthIn(type, cabin);

  return (
    <div className="cabin-editor">
      <div className="field">
        <span className="field__label">{t('cabin.presets')}</span>
        <div className="button-row">
          {stylesFor(type).map((style) => (
            <button key={style} type="button" className="button button--small" onClick={() => (setCabin(standardCabin(type, style)), setResult(null))}>
              {t(`cabin.style.${style}`)}
            </button>
          ))}
        </div>
      </div>

      <CabinBar type={type} cabin={cabin} />
      <p className="muted small mono">
        {t('cabin.summary', { seats: totalSeats(cabin), max: type.seats.max, used: Math.round((used / length) * 100) })}
      </p>

      <div className="cabin-classes">
        {classes.map((cls) => {
          const s = section(cls);
          const products = PRODUCTS_OF[cls].filter((p) => abreast(type, p) > 0);
          return (
            <div key={cls} className={`cabin-class${s ? '' : ' cabin-class--off'}`}>
              <label className="cabin-class__name">
                <input type="checkbox" checked={!!s} onChange={(e) => toggle(cls, e.target.checked)} />
                <span className={`cls-dot cls-dot--${cls}`} aria-hidden="true" />
                <span>{t(`cabin.class.${cls}`)}</span>
              </label>
              {s && (
                <>
                  <label className="field">
                    <span className="field__label">{t('cabin.product')}</span>
                    {products.length > 1 ? (
                      <select className="input" value={s.product} onChange={(e) => setProduct(s, e.target.value as SeatProduct)}>
                        {products.map((p) => (
                          <option key={p} value={p}>
                            {t(`cabin.productName.${p}`)} · {t('cabin.abreast', { count: abreast(type, p) })}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="mono">
                        {t(`cabin.productName.${s.product}`)} · {t('cabin.abreast', { count: abreast(type, s.product) })}
                      </span>
                    )}
                  </label>
                  <div className="field">
                    <span className="field__label">{t('cabin.pitch')}</span>
                    <div className="stepper">
                      <button type="button" className="button" aria-label={t('cabin.less')} onClick={() => setPitch(s, s.pitch - 1)}>
                        −
                      </button>
                      <span className="stepper__value mono">{s.pitch}″</span>
                      <button type="button" className="button" aria-label={t('cabin.more')} onClick={() => setPitch(s, s.pitch + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <span className="field__label">{t('cabin.rows')}</span>
                    <div className="stepper">
                      <button type="button" className="button" aria-label={t('cabin.less')} onClick={() => setRows(s, rowsOf(type, s) - 1)}>
                        −
                      </button>
                      <span className="stepper__value mono">{t('cabin.rowsValue', { rows: rowsOf(type, s), seats: s.seats })}</span>
                      <button type="button" className="button" aria-label={t('cabin.more')} onClick={() => setRows(s, rowsOf(type, s) + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <span className="field__label">{t('cabin.comfort')}</span>
                    <Comfort section={s} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="button button--small" onClick={fill}>
        {t('cabin.fill')}
      </button>
      <p className="muted small">{t('cabin.comfortNote')}</p>

      {error ? (
        <p className="notice notice--error">{t(`errors.${error}`)}</p>
      ) : unchanged ? null : delivering ? (
        <p className="notice notice--ok">{t('cabin.freeBeforeDelivery')}</p>
      ) : (
        <p className={`notice ${tooExpensive ? 'notice--error' : 'notice--planned'}`}>
          {t('cabin.quote', { cost: formatMoney(language, cost), days: quote.days, seats: quote.newSeats })}
        </p>
      )}
      {result && <p className="notice notice--error">{t(`errors.${result}`)}</p>}
      <div className="button-row">
        <button type="button" className="button button--primary" disabled={!!error || unchanged || tooExpensive || busy} onClick={apply}>
          {delivering ? t('cabin.applyFree') : t('cabin.applyRefit')}
        </button>
        <button type="button" className="button" onClick={onDone}>
          {t('cabin.cancel')}
        </button>
      </div>
    </div>
  );
}
