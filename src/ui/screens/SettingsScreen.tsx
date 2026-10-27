import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { updateSettings, useSettings, type Language, type ThemePreference } from '../../settings/settings';

export function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useSettings();

  return (
    <div className="screen screen--narrow">
      <h1 className="screen__title">{t('settings.title')}</h1>

      <Panel title={t('settings.language')} code="LANG">
        <Segmented<Language>
          label={t('settings.language')}
          value={settings.language}
          options={[
            { value: 'en', label: t('lang.en') },
            { value: 'de', label: t('lang.de') },
          ]}
          onChange={(language) => updateSettings({ language })}
        />
      </Panel>

      <Panel title={t('settings.theme')} code="DISP">
        <Segmented<ThemePreference>
          label={t('settings.theme')}
          value={settings.theme}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'dark', label: t('settings.themeDark') },
            { value: 'light', label: t('settings.themeLight') },
          ]}
          onChange={(theme) => updateSettings({ theme })}
        />
      </Panel>

      <Panel title={t('settings.about')} code="INFO">
        <dl className="facts">
          <dt>{t('settings.version')}</dt>
          <dd className="mono">{__APP_VERSION__}</dd>
        </dl>
        <p className="muted">{t('settings.dataNote')}</p>
      </Panel>
    </div>
  );
}
