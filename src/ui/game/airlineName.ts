// Names of the modelled carriers of historical games (Phase 5.3): their id is "~" + state + kind, e.g. "~ATN" =
// Austria's national carrier; the screens name them in the player's language. Real airlines keep their own names.
import type { TFunction } from 'i18next';
import { countryName } from '../../i18n/format';
import type { Language } from '../../settings/settings';

/** Former states with their own names in the translation files. */
const FORMER = new Set(['SU', 'YU', 'CS', 'DD', 'DW']);

export function airlineName(t: TFunction, language: Language, name: string): string {
  const m = /^~([A-Z]{2})([NCL])$/.exec(name);
  if (!m) return name;
  const [, state, kind] = m;
  const country = FORMER.has(state!) ? t(`era.state.${state}`) : countryName(language, state!, state!);
  return t(`era.carrier.${kind}`, { country });
}
