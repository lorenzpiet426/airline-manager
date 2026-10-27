import { useTranslation } from 'react-i18next';
import type { SourceTag as Tag } from '../../engine/realAirlines';

/** Where a number comes from: official statistics/registers, Wikipedia/Wikidata, checked by hand, or modelled. */
export function SourceTag({ tag }: { tag: Tag }) {
  const { t } = useTranslation();
  return (
    <span className={`srctag srctag--${tag}`} title={t(`sources.tagHint.${tag}`)}>
      {t(`sources.tag.${tag}`)}
    </span>
  );
}
