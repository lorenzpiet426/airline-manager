import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';

/** Screens that exist in the navigation but get their content in a later phase. */
export function ComingSoonScreen({ route, phase }: { route: 'network' | 'fleet' | 'finance'; phase: string }) {
  const { t } = useTranslation();
  return (
    <div className="screen">
      <h1 className="screen__title">{t(`nav.${route}`)}</h1>
      <div className="empty">
        <span className="empty__icon">
          <Icon name={route} size={40} />
        </span>
        <span className="tag tag--magenta">{t('comingSoon.title', { phase })}</span>
        <p>{t(`comingSoon.${route}`)}</p>
      </div>
    </div>
  );
}
