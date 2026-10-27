// Translation system. Every visible text lives in en.json / de.json and is looked up by key,
// e.g. t('nav.fleet') → "Fleet" or "Flotte".
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import de from './de.json';
import { getSettings, subscribeSettings } from '../settings/settings';

export const resources = {
  en: { translation: en },
  de: { translation: de },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: getSettings().language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes text
});

document.documentElement.lang = getSettings().language;

subscribeSettings(() => {
  const { language } = getSettings();
  if (i18n.language !== language) void i18n.changeLanguage(language);
  document.documentElement.lang = language;
});

export default i18n;
