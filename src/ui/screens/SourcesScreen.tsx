import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { SourceTag } from '../components/SourceTag';
import type { SourceTag as Tag } from '../../engine/realAirlines';

/** Every dataset the game uses, with its licence and a link. Details: docs/DATA_SOURCES.md in the repository. */
const SOURCES: { key: string; name: string; licence: string; url: string }[] = [
  { key: 'ourairports', name: 'OurAirports', licence: 'Public domain', url: 'https://ourairports.com/data/' },
  { key: 'geonames', name: 'GeoNames', licence: 'CC BY 4.0', url: 'https://www.geonames.org/' },
  { key: 'worldbank', name: 'World Bank Open Data', licence: 'CC BY 4.0', url: 'https://data.worldbank.org/' },
  { key: 'naturalearth', name: 'Natural Earth', licence: 'Public domain', url: 'https://www.naturalearthdata.com/' },
  { key: 'openfreemap', name: 'OpenFreeMap (map fonts)', licence: 'SIL OFL / free service', url: 'https://openfreemap.org/' },
  { key: 'wikipedia', name: 'Wikipedia (English) — Wikipedia contributors', licence: 'CC BY-SA 4.0', url: 'https://en.wikipedia.org/' },
  { key: 'wikidata', name: 'Wikidata', licence: 'CC0', url: 'https://www.wikidata.org/' },
  { key: 'eurostat', name: 'Eurostat — air passenger transport (avia_par)', licence: 'Eurostat reuse policy', url: 'https://ec.europa.eu/eurostat' },
  { key: 'eia', name: 'U.S. Energy Information Administration — jet fuel prices', licence: 'Public domain', url: 'https://www.eia.gov/' },
  { key: 'bls', name: 'U.S. Bureau of Labor Statistics — consumer price index (CPI-U)', licence: 'Public domain', url: 'https://www.bls.gov/cpi/' },
  { key: 'fed', name: 'Federal Reserve Board — H.10 foreign exchange rates', licence: 'Public domain', url: 'https://www.federalreserve.gov/releases/h10/hist/' },
  { key: 'ecb', name: 'European Central Bank — euro reference rates', licence: 'Reuse with attribution', url: 'https://www.ecb.europa.eu/' },
  { key: 'faa', name: 'FAA Aircraft Registry', licence: 'Public domain', url: 'https://registry.faa.gov/' },
  { key: 'tc', name: 'Transport Canada — Canadian Civil Aircraft Register', licence: 'Non-commercial reuse with attribution', url: 'https://tc.canada.ca/' },
  { key: 'austrocontrol', name: 'Austro Control — Luftfahrzeugregister', licence: 'Public register', url: 'https://www.austrocontrol.at/' },
  { key: 'iaa', name: 'Irish Aviation Authority — aircraft register', licence: 'Public register', url: 'https://www.iaa.ie/' },
  { key: 'slots', name: 'IATA Worldwide Airport Slot Guidelines; slot coordinators (ACL, FHKD, SCA …)', licence: 'Facts', url: 'https://www.iata.org/en/programs/ops-infra/slots/' },
  { key: 'reports', name: 'Airline and airport annual reports (Austrian Airlines / Lufthansa Group, Ryanair, Flughafen Wien)', licence: 'Facts', url: 'https://www.austrianairlines.ag/' },
  { key: 'manufacturers', name: 'Aircraft manufacturers (published figures)', licence: 'Facts', url: 'https://www.airbus.com/' },
  { key: 'plex', name: 'IBM Plex fonts', licence: 'SIL OFL', url: 'https://github.com/IBM/plex' },
];

const TAGS: Tag[] = ['official', 'wikipedia', 'hand-checked', 'modelled'];

export function SourcesScreen() {
  const { t } = useTranslation();
  return (
    <div className="screen screen--narrow">
      <h1 className="screen__title">{t('sources.title')}</h1>
      <p className="muted">{t('sources.intro')}</p>

      <Panel title={t('sources.tagsTitle')} code="SRC">
        <dl className="facts">
          {TAGS.map((tag) => (
            <FactTag key={tag} tag={tag} text={t(`sources.tagHint.${tag}`)} />
          ))}
        </dl>
      </Panel>

      <Panel title={t('sources.listTitle')} code={String(SOURCES.length)}>
        <ul className="source-list">
          {SOURCES.map((s) => (
            <li key={s.key}>
              <a href={s.url} target="_blank" rel="noreferrer" className="source-list__name">
                {s.name}
              </a>
              <span className="muted small"> · {s.licence}</span>
              <p className="small">{t(`sources.use.${s.key}`)}</p>
            </li>
          ))}
        </ul>
        <p className="muted small">{t('sources.notes')}</p>
      </Panel>
    </div>
  );
}

function FactTag({ tag, text }: { tag: Tag; text: string }) {
  return (
    <>
      <dt>
        <SourceTag tag={tag} />
      </dt>
      <dd className="small">{text}</dd>
    </>
  );
}
