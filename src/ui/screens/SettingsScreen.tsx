import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { updateSettings, useSettings, type Language, type ThemePreference } from '../../settings/settings';
import { usePlayer } from '../game/usePlayer';
import { hrefFor } from '../navigation';
import { sendCommand } from '../../game/store';
import { formatGameDate } from '../../i18n/format';
import { fromDate, toDate } from '../../engine/time';

export function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { game, airline } = usePlayer();

  const switchToRealClock = async (airlineId: string) => {
    if (!window.confirm(t('settings.realClockConfirm'))) return;
    await sendCommand({ type: 'SetTimeMode', airlineId, payload: { timeMode: 'realclock', now: fromDate(new Date()) } });
  };

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

      <Panel title={t('settings.game')} code="GAME">
        {airline ? (
          <>
            <p>
              {t('settings.currentGame', { name: airline.name })}
            </p>
            <p className="muted small">{t('settings.autosaveNote')}</p>
            <a href={hrefFor('saves')} className="button">
              {t('settings.toSaves')}
            </a>
            <span className="field__label">{t('settings.timeMode')}</span>
            <p className="mono">{t(`ops.mode.${game!.options.timeMode}`)}</p>
            {game!.options.timeMode !== 'realclock' && (
              <>
                <p className="muted small">{t('settings.realClockHint', { date: formatGameDate(settings.language, toDate(game!.time), false) })}</p>
                <button type="button" className="button" onClick={() => void switchToRealClock(airline.id)}>
                  {t('settings.realClockSwitch')}
                </button>
              </>
            )}
          </>
        ) : (
          <p className="muted">{t('settings.noGame')}</p>
        )}
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
