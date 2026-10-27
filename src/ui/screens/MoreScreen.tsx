import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { MOBILE_MORE, hrefFor } from '../navigation';

/** Phone only: the sections that don't fit into the five bottom tabs. */
export function MoreScreen() {
  const { t } = useTranslation();
  return (
    <div className="screen">
      <ul className="menu">
        {MOBILE_MORE.map((item) => (
          <li key={item.route}>
            <a className="menu__item" href={hrefFor(item.route)}>
              <Icon name={item.icon} />
              <span>{t(item.labelKey)}</span>
              <span className="menu__chevron">
                <Icon name="chevron" size={18} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
