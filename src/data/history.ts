// The real world events since 1970 (Phase 5.2), hand-curated from encyclopedic sources (Wikipedia articles on each
// event, facts only; the wording in the game is our own). Each event has where, when and how strongly it hit air travel.
// Strengths are estimates (tag "modelled"): recessions only add the drop in (business) travel beyond what the economy
// data already explains; closures give the share of flights that could not operate.
//
// Kinds: like the simulated events (Phase 5.1), plus
//  - crisis: travellers stay away for a while (war, terror, unrest, disaster), strongest at the start;
//  - flightBan: flights between the listed airports/countries and the `pairWith` countries are banned;
//  - disruption: an airport closed for another reason (attack, drone, fire, protests, flooding);
//  - milestone: an aviation or world milestone without a direct effect (shown in the History screen).
// Names and one-line descriptions are translated in the i18n files under `hist.<id>`.
import type { WorldEventKind } from '../engine/state';

export interface HistoricEvent {
  id: string;
  kind: WorldEventKind;
  /** First day (YYYY-MM-DD, UTC). */
  start: string;
  /** Day it was over; null = still going on when the real data ends (each game then picks its own end). */
  end: string | null;
  continents?: string[];
  countries?: string[];
  airports?: string[];
  /** Flight bans: only flights to/from these countries are affected. */
  pairWith?: string[];
  depth: number;
  /** Strength over time as [date, 0–1] points (default: the standard rise–hold–recover shape). */
  profile?: [string, number][];
  /** Only the named countries/continents, without the global spill-over random pandemics have. */
  local?: boolean;
  /** Volcano name etc. */
  label?: string;
  /** Wikipedia article (English) the facts come from. */
  source: string;
}

const ALL = ['EU', 'NA', 'AS', 'SA', 'AF', 'OC'];
const EU27 = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const WEST = [...EU27, 'GB', 'NO', 'IS', 'CH', 'US', 'CA'];
/** Short crises: worst right away, then recovering. */
const SHOCK = (start: string, peakEnd: string, end: string): [string, number][] => [[start, 1], [peakEnd, 1], [end, 0]];

export const HISTORIC_EVENTS: readonly HistoricEvent[] = [
  // ── 1970s ──
  { id: 'jumbo1970', kind: 'milestone', start: '1970-01-22', end: '1970-01-22', depth: 0, source: 'Boeing 747' },
  { id: 'brettonWoods1971', kind: 'milestone', start: '1971-08-15', end: '1971-08-15', depth: 0, source: 'Nixon shock' },
  { id: 'yomKippur1973', kind: 'airspace', start: '1973-10-06', end: '1973-10-26', countries: ['IL', 'EG', 'SY'], depth: 0.8, source: 'Yom Kippur War' },
  { id: 'oil1973', kind: 'fuelShock', start: '1973-10-17', end: '1974-03-18', depth: 1.5, source: '1973 oil crisis' },
  { id: 'recession1974', kind: 'recession', start: '1974-01-01', end: '1975-12-31', continents: ALL, depth: 0.06, source: '1973–1975 recession' },
  { id: 'concorde1976', kind: 'milestone', start: '1976-01-21', end: '1976-01-21', depth: 0, source: 'Concorde' },
  { id: 'skytrain1977', kind: 'milestone', start: '1977-09-26', end: '1977-09-26', depth: 0, source: 'Laker Airways Skytrain' },
  { id: 'blizzard1978', kind: 'winterStorm', start: '1978-02-06', end: '1978-02-10', airports: ['KBOS', 'KPVD', 'KJFK', 'KLGA', 'KEWR'], depth: 1, source: 'Northeastern United States blizzard of 1978' },
  { id: 'deregulation1978', kind: 'milestone', start: '1978-10-24', end: '1978-10-24', depth: 0, source: 'Airline Deregulation Act' },
  { id: 'oil1979', kind: 'fuelShock', start: '1979-01-16', end: '1980-09-30', depth: 1.2, source: '1979 oil crisis' },
  // ── 1980s ──
  { id: 'recession1980', kind: 'recession', start: '1980-04-01', end: '1982-12-31', continents: ['NA', 'EU'], depth: 0.06, source: 'Early 1980s recession' },
  { id: 'stHelens1980', kind: 'volcano', start: '1980-05-18', end: '1980-05-23', airports: ['KGEG', 'KYKM', 'KPSC'], depth: 1, label: 'Mount St. Helens', source: '1980 eruption of Mount St. Helens' },
  { id: 'iranIraq1980', kind: 'airspace', start: '1980-09-22', end: '1988-08-20', countries: ['IR', 'IQ'], depth: 0.7, source: 'Iran–Iraq War' },
  { id: 'patco1981', kind: 'atcStrike', start: '1981-08-03', end: '1981-10-31', countries: ['US'], depth: 0.25, source: 'Professional Air Traffic Controllers Organization (1968)' },
  { id: 'patcoRebuild1981', kind: 'atcStrike', start: '1981-11-01', end: '1983-06-30', countries: ['US'], depth: 0.08, source: 'Professional Air Traffic Controllers Organization (1968)' },
  { id: 'falklands1982', kind: 'airspace', start: '1982-04-02', end: '1982-06-14', countries: ['FK'], depth: 1, source: 'Falklands War' },
  { id: 'debtCrisis1982', kind: 'recession', start: '1982-08-12', end: '1984-06-30', countries: ['MX', 'BR', 'AR'], depth: 0.1, local: true, source: 'Latin American debt crisis' },
  { id: 'fear1986', kind: 'crisis', start: '1986-04-15', end: '1986-10-31', countries: ['US', 'GB', 'FR', 'DE', 'IT', 'GR', 'ES', 'AT', 'CH', 'NL'], depth: 0.12, profile: SHOCK('1986-04-15', '1986-06-30', '1986-10-31'), local: true, source: '1986 United States bombing of Libya' },
  { id: 'chernobyl1986', kind: 'crisis', start: '1986-04-26', end: '1986-09-30', countries: ['UA', 'BY', 'RU', 'PL', 'AT', 'DE', 'CZ', 'SK', 'HU', 'SE', 'FI'], depth: 0.05, local: true, source: 'Chernobyl disaster' },
  { id: 'eu1987', kind: 'milestone', start: '1987-12-14', end: '1987-12-14', depth: 0, source: 'Liberalisation of the aviation market in the European Union' },
  { id: 'tiananmen1989', kind: 'crisis', start: '1989-06-04', end: '1990-03-31', countries: ['CN'], depth: 0.3, profile: SHOCK('1989-06-04', '1989-09-30', '1990-03-31'), local: true, source: '1989 Tiananmen Square protests and massacre' },
  { id: 'redoubt1989', kind: 'volcano', start: '1989-12-15', end: '1989-12-17', airports: ['PANC'], depth: 1, label: 'Redoubt', source: 'Mount Redoubt' },
  { id: 'wall1989', kind: 'milestone', start: '1989-11-09', end: '1989-11-09', depth: 0, source: 'Fall of the Berlin Wall' },
  // ── 1990s ──
  { id: 'gulf1990', kind: 'fuelShock', start: '1990-08-02', end: '1991-02-28', depth: 1, source: '1990 oil price shock' },
  { id: 'kuwait1990', kind: 'airspace', start: '1990-08-02', end: '1991-03-31', countries: ['KW'], depth: 1, source: 'Iraqi invasion of Kuwait' },
  { id: 'iraqSanctions1990', kind: 'airspace', start: '1990-08-06', end: '2004-08-31', countries: ['IQ'], depth: 1, source: 'Sanctions against Iraq' },
  { id: 'recession1990', kind: 'recession', start: '1990-07-01', end: '1992-06-30', continents: ['NA', 'EU'], depth: 0.04, source: 'Early 1990s recession' },
  { id: 'gulfWar1991', kind: 'crisis', start: '1991-01-15', end: '1991-06-30', continents: ALL, depth: 0.22, profile: SHOCK('1991-01-15', '1991-03-15', '1991-06-30'), source: 'Gulf War' },
  { id: 'yugoslavia1991', kind: 'airspace', start: '1991-09-01', end: '1992-02-28', countries: ['HR', 'BA', 'RS', 'ME', 'MK', 'XK'], depth: 0.8, source: 'Yugoslav Wars' },
  { id: 'bosnia1992', kind: 'airspace', start: '1992-03-01', end: '1996-08-15', countries: ['BA'], depth: 1, source: 'Siege of Sarajevo' },
  { id: 'pinatubo1991', kind: 'volcano', start: '1991-06-15', end: '1991-06-20', airports: ['RPLL', 'RPLC'], depth: 1, label: 'Pinatubo', source: '1991 eruption of Mount Pinatubo' },
  { id: 'panAm1991', kind: 'milestone', start: '1991-12-04', end: '1991-12-04', depth: 0, source: 'Pan Am' },
  { id: 'ussr1991', kind: 'milestone', start: '1991-12-26', end: '1991-12-26', depth: 0, source: 'Dissolution of the Soviet Union' },
  { id: 'andrew1992', kind: 'hurricane', start: '1992-08-24', end: '1992-08-27', airports: ['KMIA', 'KFLL', 'KPBI'], depth: 0.9, source: 'Hurricane Andrew' },
  { id: 'spurr1992', kind: 'volcano', start: '1992-08-18', end: '1992-08-20', airports: ['PANC'], depth: 1, label: 'Spurr', source: 'Mount Spurr' },
  { id: 'blackWednesday1992', kind: 'milestone', start: '1992-09-16', end: '1992-09-16', depth: 0, source: 'Black Wednesday' },
  { id: 'eu1993', kind: 'milestone', start: '1993-01-01', end: '1993-01-01', depth: 0, source: 'Liberalisation of the aviation market in the European Union' },
  { id: 'tequila1994', kind: 'recession', start: '1994-12-20', end: '1996-03-31', countries: ['MX'], depth: 0.1, local: true, source: 'Mexican peso crisis' },
  { id: 'austriaEu1995', kind: 'milestone', start: '1995-01-01', end: '1995-01-01', depth: 0, source: '1995 enlargement of the European Union' },
  { id: 'schengen1995', kind: 'milestone', start: '1995-03-26', end: '1995-03-26', depth: 0, source: 'Schengen Area' },
  { id: 'cabotage1997', kind: 'milestone', start: '1997-04-01', end: '1997-04-01', depth: 0, source: 'Liberalisation of the aviation market in the European Union' },
  { id: 'asia1997', kind: 'recession', start: '1997-07-02', end: '1999-06-30', countries: ['TH', 'ID', 'KR', 'MY', 'PH'], depth: 0.12, local: true, source: '1997 Asian financial crisis' },
  { id: 'hongKong1997', kind: 'milestone', start: '1997-07-01', end: '1997-07-01', depth: 0, source: 'Handover of Hong Kong' },
  { id: 'chekLapKok1998', kind: 'milestone', start: '1998-07-06', end: '1998-07-06', depth: 0, source: 'Hong Kong International Airport' },
  { id: 'russia1998', kind: 'recession', start: '1998-08-17', end: '1999-12-31', countries: ['RU'], depth: 0.12, local: true, source: '1998 Russian financial crisis' },
  { id: 'euro1999', kind: 'milestone', start: '1999-01-01', end: '1999-01-01', depth: 0, source: 'Euro' },
  { id: 'kosovo1999', kind: 'airspace', start: '1999-03-24', end: '1999-06-10', countries: ['RS', 'ME', 'XK'], depth: 1, source: 'NATO bombing of Yugoslavia' },
  // ── 2000s ──
  { id: 'starAlliance2000', kind: 'milestone', start: '2000-03-26', end: '2000-03-26', depth: 0, source: 'Austrian Airlines' },
  { id: 'dotcom2001', kind: 'recession', start: '2001-03-01', end: '2002-06-30', continents: ['NA'], depth: 0.05, source: 'Early 2000s recession' },
  { id: 'turkey2001', kind: 'recession', start: '2001-02-19', end: '2002-03-31', countries: ['TR'], depth: 0.12, local: true, source: '2001 Turkish economic crisis' },
  { id: 'sept11Closure', kind: 'airspace', start: '2001-09-11', end: '2001-09-14', countries: ['US', 'CA'], depth: 1, source: 'Closure of airspace over the United States after the September 11 attacks' },
  { id: 'sept11', kind: 'crisis', start: '2001-09-11', end: '2002-12-31', countries: ['US', 'CA'], depth: 0.25, profile: [['2001-09-11', 1], ['2001-11-30', 0.8], ['2002-06-30', 0.4], ['2002-12-31', 0]], local: true, source: 'Economic effects of the September 11 attacks' },
  { id: 'sept11World', kind: 'crisis', start: '2001-09-11', end: '2002-06-30', continents: ALL, depth: 0.1, profile: SHOCK('2001-09-11', '2001-11-30', '2002-06-30'), source: 'Economic effects of the September 11 attacks' },
  { id: 'swissair2001', kind: 'milestone', start: '2001-10-02', end: '2001-10-02', depth: 0, source: 'Swissair' },
  { id: 'sabena2001', kind: 'milestone', start: '2001-11-07', end: '2001-11-07', depth: 0, source: 'Sabena' },
  { id: 'argentina2001', kind: 'recession', start: '2001-12-01', end: '2003-06-30', countries: ['AR'], depth: 0.15, local: true, source: '1998–2002 Argentine great depression' },
  { id: 'euroCash2002', kind: 'milestone', start: '2002-01-01', end: '2002-01-01', depth: 0, source: 'Euro banknotes' },
  { id: 'bali2002', kind: 'crisis', start: '2002-10-12', end: '2003-06-30', countries: ['ID'], depth: 0.2, profile: SHOCK('2002-10-12', '2002-12-31', '2003-06-30'), local: true, source: '2002 Bali bombings' },
  { id: 'iraq2003', kind: 'crisis', start: '2003-03-20', end: '2003-06-30', continents: ALL, depth: 0.08, source: '2003 invasion of Iraq' },
  {
    id: 'sars2003', kind: 'pandemic', start: '2003-03-12', end: '2003-08-31', countries: ['CN', 'HK', 'TW', 'SG', 'VN', 'MO'], depth: 0.85, local: true,
    profile: [['2003-03-12', 0.2], ['2003-04-10', 1], ['2003-05-31', 0.9], ['2003-07-05', 0.4], ['2003-08-31', 0]], source: '2002–2004 SARS outbreak',
  },
  { id: 'sarsAsia2003', kind: 'pandemic', start: '2003-03-25', end: '2003-07-31', continents: ['AS'], depth: 0.12, local: true, source: '2002–2004 SARS outbreak' },
  { id: 'concordeEnd2003', kind: 'milestone', start: '2003-10-24', end: '2003-10-24', depth: 0, source: 'Concorde' },
  { id: 'tsunami2004', kind: 'crisis', start: '2004-12-26', end: '2005-06-30', countries: ['TH', 'LK', 'MV'], depth: 0.25, profile: SHOCK('2004-12-26', '2005-02-28', '2005-06-30'), local: true, source: '2004 Indian Ocean earthquake and tsunami' },
  { id: 'katrina2005', kind: 'hurricane', start: '2005-08-28', end: '2005-09-13', airports: ['KMSY'], depth: 1, source: 'Hurricane Katrina' },
  { id: 'wilma2005', kind: 'hurricane', start: '2005-10-21', end: '2005-11-01', airports: ['MMUN', 'MMCZ'], depth: 0.9, source: 'Hurricane Wilma' },
  { id: 'liquids2006', kind: 'disruption', start: '2006-08-10', end: '2006-08-14', airports: ['EGLL', 'EGKK', 'EGSS', 'EGGW', 'EGCC'], depth: 0.3, source: '2006 transatlantic aircraft plot' },
  { id: 'a380_2007', kind: 'milestone', start: '2007-10-25', end: '2007-10-25', depth: 0, source: 'Airbus A380' },
  { id: 'openSkies2008', kind: 'milestone', start: '2008-03-30', end: '2008-03-30', depth: 0, source: 'EU–US Open Skies Agreement' },
  { id: 'fuel2008', kind: 'fuelShock', start: '2008-03-01', end: '2008-09-30', depth: 0.8, source: '2000s energy crisis' },
  { id: 'recession2008', kind: 'recession', start: '2008-09-15', end: '2010-06-30', continents: ALL, depth: 0.08, source: '2008 financial crisis' },
  { id: 'iceland2008', kind: 'recession', start: '2008-10-06', end: '2010-12-31', countries: ['IS'], depth: 0.2, local: true, source: '2008–2011 Icelandic financial crisis' },
  { id: 'bangkok2008', kind: 'disruption', start: '2008-11-25', end: '2008-12-04', airports: ['VTBS', 'VTBD'], depth: 1, source: '2008 Thai political crisis' },
  { id: 'redoubt2009', kind: 'volcano', start: '2009-03-28', end: '2009-03-30', airports: ['PANC'], depth: 1, label: 'Redoubt', source: 'Mount Redoubt' },
  { id: 'h1n1_2009', kind: 'pandemic', start: '2009-04-24', end: '2009-07-31', countries: ['MX'], depth: 0.4, profile: SHOCK('2009-04-24', '2009-05-31', '2009-07-31'), local: true, source: '2009 swine flu pandemic' },
  { id: 'austrianLufthansa2009', kind: 'milestone', start: '2009-09-03', end: '2009-09-03', depth: 0, source: 'Austrian Airlines' },
  // ── 2010s ──
  {
    id: 'eyjafjallajokull2010', kind: 'volcano', start: '2010-04-15', end: '2010-04-21', depth: 0.85, label: 'Eyjafjallajökull', source: 'Air travel disruption after the 2010 Eyjafjallajökull eruption',
    countries: ['GB', 'IE', 'NO', 'SE', 'FI', 'DK', 'NL', 'BE', 'LU', 'DE', 'FR', 'PL', 'CZ', 'SK', 'AT', 'CH', 'HU', 'SI', 'EE', 'LV', 'LT'],
  },
  { id: 'euroCrisis2010', kind: 'recession', start: '2010-05-01', end: '2013-12-31', countries: ['GR', 'PT', 'ES', 'IT', 'IE', 'CY'], depth: 0.08, local: true, source: 'European debt crisis' },
  { id: 'merapi2010', kind: 'volcano', start: '2010-11-05', end: '2010-11-20', airports: ['WARJ', 'WARQ'], depth: 1, label: 'Merapi', source: '2010 eruptions of Mount Merapi' },
  { id: 'spainAtc2010', kind: 'atcStrike', start: '2010-12-03', end: '2010-12-05', countries: ['ES'], depth: 1, source: '2010 Spanish air traffic controllers strike' },
  { id: 'snow2010', kind: 'winterStorm', start: '2010-12-18', end: '2010-12-23', airports: ['EGLL', 'EGKK', 'EDDF', 'LFPG', 'EBBR', 'EHAM'], depth: 0.5, source: 'Winter of 2010–11 in Great Britain and Ireland' },
  { id: 'arabSpring2011', kind: 'crisis', start: '2011-01-25', end: '2012-06-30', countries: ['EG', 'TN'], depth: 0.35, profile: SHOCK('2011-01-25', '2011-04-30', '2012-06-30'), local: true, source: 'Arab Spring' },
  { id: 'libya2011', kind: 'airspace', start: '2011-02-20', end: '2011-10-31', countries: ['LY'], depth: 1, source: '2011 Libyan civil war' },
  { id: 'tohoku2011', kind: 'crisis', start: '2011-03-11', end: '2011-09-30', countries: ['JP'], depth: 0.25, profile: SHOCK('2011-03-11', '2011-05-15', '2011-09-30'), local: true, source: '2011 Tōhoku earthquake and tsunami' },
  { id: 'sendai2011', kind: 'disruption', start: '2011-03-11', end: '2011-04-13', airports: ['RJSS'], depth: 1, source: 'Sendai Airport' },
  { id: 'grimsvotn2011', kind: 'volcano', start: '2011-05-22', end: '2011-05-26', countries: ['IS'], airports: ['EGPH', 'EGPF', 'EGPD', 'EGPE'], depth: 0.7, label: 'Grímsvötn', source: '2011 eruption of Grímsvötn' },
  { id: 'puyehue2011', kind: 'volcano', start: '2011-06-04', end: '2011-06-30', airports: ['SAEZ', 'SABE', 'SAZS'], depth: 0.5, label: 'Puyehue', source: '2011 Puyehue-Cordón Caulle eruption' },
  { id: 'puyehueOceania2011', kind: 'volcano', start: '2011-06-12', end: '2011-06-23', airports: ['YMML', 'YSSY', 'YPAD', 'YMHB', 'NZCH', 'NZQN'], depth: 0.4, label: 'Puyehue', source: '2011 Puyehue-Cordón Caulle eruption' },
  { id: 'bangkokFlood2011', kind: 'disruption', start: '2011-10-25', end: '2012-03-04', airports: ['VTBD'], depth: 1, source: '2011 Thailand floods' },
  { id: 'ets2012', kind: 'milestone', start: '2012-01-01', end: '2012-01-01', depth: 0, source: 'European Union Emissions Trading System' },
  { id: 'vieCheckIn3_2012', kind: 'milestone', start: '2012-06-05', end: '2012-06-05', depth: 0, source: 'Vienna International Airport' },
  { id: 'syria2012', kind: 'airspace', start: '2012-06-01', end: '2025-01-07', countries: ['SY'], depth: 0.9, source: 'Syrian civil war' },
  { id: 'sandy2012', kind: 'hurricane', start: '2012-10-29', end: '2012-11-01', airports: ['KJFK', 'KLGA', 'KEWR'], depth: 1, source: 'Hurricane Sandy' },
  { id: 'egypt2013', kind: 'crisis', start: '2013-07-03', end: '2014-06-30', countries: ['EG'], depth: 0.25, local: true, source: '2013 Egyptian coup d\'état' },
  { id: 'kelud2014', kind: 'volcano', start: '2014-02-14', end: '2014-02-16', airports: ['WARJ', 'WARQ', 'WARR'], depth: 1, label: 'Kelud', source: '2014 eruption of Kelud' },
  { id: 'donbas2014', kind: 'airspace', start: '2014-05-26', end: '2022-02-24', airports: ['UKCC', 'UKCW'], depth: 1, source: 'War in Donbas' },
  { id: 'libya2014', kind: 'airspace', start: '2014-07-13', end: null, countries: ['LY'], depth: 0.7, source: 'Second Libyan Civil War' },
  { id: 'ebola2014', kind: 'pandemic', start: '2014-08-01', end: '2015-06-30', countries: ['LR', 'SL', 'GN'], depth: 0.4, local: true, source: 'Western African Ebola epidemic' },
  { id: 'russia2014', kind: 'recession', start: '2014-12-01', end: '2016-06-30', countries: ['RU'], depth: 0.12, local: true, source: '2014–2016 Russian financial crisis' },
  { id: 'brazil2015', kind: 'recession', start: '2015-01-01', end: '2016-12-31', countries: ['BR'], depth: 0.1, local: true, source: '2014 Brazilian economic crisis' },
  { id: 'yemen2015', kind: 'airspace', start: '2015-03-26', end: null, countries: ['YE'], depth: 0.9, source: 'Yemeni civil war (2014–present)' },
  { id: 'mers2015', kind: 'pandemic', start: '2015-05-20', end: '2015-08-31', countries: ['KR'], depth: 0.25, local: true, source: '2015 MERS outbreak in South Korea' },
  { id: 'sousse2015', kind: 'crisis', start: '2015-06-26', end: '2017-07-31', countries: ['TN'], depth: 0.3, profile: SHOCK('2015-06-26', '2016-06-30', '2017-07-31'), local: true, source: '2015 Sousse attacks' },
  { id: 'raung2015', kind: 'volcano', start: '2015-07-09', end: '2015-07-13', airports: ['WADD', 'WADL'], depth: 0.8, label: 'Raung', source: 'Mount Raung' },
  { id: 'sinaiUk2015', kind: 'flightBan', start: '2015-11-04', end: '2019-10-09', airports: ['HESH'], pairWith: ['GB'], depth: 1, source: 'Metrojet Flight 9268' },
  { id: 'sinaiRussia2015', kind: 'flightBan', start: '2015-11-06', end: '2021-08-09', airports: ['HESH', 'HEGN'], pairWith: ['RU'], depth: 1, source: 'Metrojet Flight 9268' },
  { id: 'cairoRussia2015', kind: 'flightBan', start: '2015-11-06', end: '2018-04-11', airports: ['HECA'], pairWith: ['RU'], depth: 1, source: 'Metrojet Flight 9268' },
  { id: 'paris2015', kind: 'crisis', start: '2015-11-13', end: '2016-03-31', countries: ['FR'], depth: 0.08, local: true, source: 'November 2015 Paris attacks' },
  { id: 'blizzard2016', kind: 'winterStorm', start: '2016-01-23', end: '2016-01-25', airports: ['KJFK', 'KLGA', 'KEWR', 'KPHL', 'KIAD', 'KDCA', 'KBWI'], depth: 0.95, source: 'January 2016 United States blizzard' },
  { id: 'turkey2016', kind: 'crisis', start: '2016-01-12', end: '2017-06-30', countries: ['TR'], depth: 0.25, local: true, source: '2016 in Turkey' },
  { id: 'brussels2016', kind: 'disruption', start: '2016-03-22', end: '2016-04-03', airports: ['EBBR'], depth: 1, source: '2016 Brussels bombings' },
  { id: 'qatarBlockade2017', kind: 'flightBan', start: '2017-06-05', end: '2021-01-09', countries: ['QA'], pairWith: ['SA', 'AE', 'BH', 'EG'], depth: 1, source: 'Qatar diplomatic crisis' },
  { id: 'harvey2017', kind: 'hurricane', start: '2017-08-27', end: '2017-08-31', airports: ['KIAH', 'KHOU'], depth: 1, source: 'Hurricane Harvey' },
  { id: 'irmaSxm2017', kind: 'hurricane', start: '2017-09-06', end: '2017-10-10', airports: ['TNCM'], depth: 1, source: 'Hurricane Irma' },
  { id: 'irma2017', kind: 'hurricane', start: '2017-09-09', end: '2017-09-12', airports: ['KMIA', 'KFLL', 'KMCO', 'KTPA', 'KRSW'], depth: 0.9, source: 'Hurricane Irma' },
  { id: 'maria2017', kind: 'hurricane', start: '2017-09-19', end: '2017-10-15', airports: ['TJSJ'], depth: 0.7, source: 'Hurricane Maria' },
  { id: 'airBerlin2017', kind: 'milestone', start: '2017-10-27', end: '2017-10-27', depth: 0, source: 'Air Berlin' },
  { id: 'agung2017', kind: 'volcano', start: '2017-11-27', end: '2017-11-30', airports: ['WADD', 'WADL'], depth: 1, label: 'Agung', source: '2017 eruption of Mount Agung' },
  { id: 'niki2017', kind: 'milestone', start: '2017-12-13', end: '2017-12-13', depth: 0, source: 'Niki (airline)' },
  { id: 'beastFromTheEast2018', kind: 'winterStorm', start: '2018-02-28', end: '2018-03-03', airports: ['EIDW', 'EGPH', 'EGPF'], depth: 0.7, source: '2018 British Isles cold wave' },
  { id: 'turkey2018', kind: 'recession', start: '2018-08-01', end: '2019-06-30', countries: ['TR'], depth: 0.08, local: true, source: '2018 Turkish currency and debt crisis' },
  { id: 'jebi2018', kind: 'typhoon', start: '2018-09-04', end: '2018-09-14', airports: ['RJBB'], depth: 0.8, source: 'Typhoon Jebi (2018)' },
  { id: 'mangkhut2018', kind: 'typhoon', start: '2018-09-16', end: '2018-09-18', airports: ['VHHH', 'VMMC'], depth: 0.9, source: 'Typhoon Mangkhut' },
  { id: 'gatwickDrone2018', kind: 'disruption', start: '2018-12-19', end: '2018-12-21', airports: ['EGKK'], depth: 0.9, source: 'Gatwick Airport drone incident' },
  { id: 'pakistan2019', kind: 'airspace', start: '2019-02-27', end: '2019-07-16', countries: ['PK'], depth: 0.8, source: '2019 India–Pakistan border skirmishes' },
  { id: 'max2019', kind: 'milestone', start: '2019-03-13', end: '2019-03-13', depth: 0, source: 'Boeing 737 MAX groundings' },
  { id: 'istanbul2019', kind: 'milestone', start: '2019-04-06', end: '2019-04-06', depth: 0, source: 'Istanbul Airport' },
  { id: 'hongKong2019', kind: 'disruption', start: '2019-08-12', end: '2019-08-14', airports: ['VHHH'], depth: 0.8, source: '2019–2020 Hong Kong protests' },
  { id: 'hongKongProtests2019', kind: 'crisis', start: '2019-08-01', end: '2020-01-31', countries: ['HK'], depth: 0.25, local: true, source: '2019–2020 Hong Kong protests' },
  { id: 'thomasCook2019', kind: 'milestone', start: '2019-09-23', end: '2019-09-23', depth: 0, source: 'Thomas Cook Group' },
  { id: 'hagibis2019', kind: 'typhoon', start: '2019-10-12', end: '2019-10-13', airports: ['RJTT', 'RJAA'], depth: 1, source: 'Typhoon Hagibis' },
  // ── 2020s ──
  {
    id: 'covidChina2020', kind: 'pandemic', start: '2020-01-23', end: '2023-03-31', countries: ['CN', 'HK', 'MO'], depth: 0.6, local: true,
    profile: [['2020-01-23', 0.6], ['2020-02-15', 1], ['2020-05-31', 0.5], ['2022-04-01', 0.6], ['2022-12-31', 0.5], ['2023-03-31', 0]], source: 'COVID-19 pandemic in mainland China',
  },
  {
    id: 'covid2020', kind: 'pandemicSevere', start: '2020-03-01', end: '2023-05-05', continents: ALL, depth: 0.97,
    profile: [['2020-03-01', 0.15], ['2020-04-01', 0.95], ['2020-06-01', 0.9], ['2020-08-01', 0.75], ['2021-03-01', 0.75], ['2021-07-01', 0.55], ['2021-12-01', 0.45], ['2022-03-01', 0.4], ['2022-07-01', 0.25], ['2022-12-01', 0.15], ['2023-05-05', 0]],
    source: 'Impact of the COVID-19 pandemic on aviation',
  },
  { id: 'ber2020', kind: 'milestone', start: '2020-10-31', end: '2020-10-31', depth: 0, source: 'Berlin Brandenburg Airport' },
  { id: 'belarus2021', kind: 'flightBan', start: '2021-06-05', end: null, countries: ['BY'], pairWith: EU27, depth: 1, source: 'Ryanair Flight 4978' },
  { id: 'afghanistan2021', kind: 'airspace', start: '2021-08-15', end: null, countries: ['AF'], depth: 0.8, source: 'Fall of Kabul (2021)' },
  { id: 'ita2021', kind: 'milestone', start: '2021-10-15', end: '2021-10-15', depth: 0, source: 'ITA Airways' },
  { id: 'ukraine2022', kind: 'airspace', start: '2022-02-24', end: null, countries: ['UA', 'MD'], depth: 1, source: 'Closure of Ukrainian airspace during the Russian invasion of Ukraine' },
  { id: 'russiaBan2022', kind: 'flightBan', start: '2022-02-27', end: null, countries: ['RU'], pairWith: WEST, depth: 1, source: 'Airspace closures during the Russian invasion of Ukraine' },
  { id: 'fuel2022', kind: 'fuelShock', start: '2022-03-01', end: '2022-12-31', depth: 0.8, source: '2022 Russia–European Union gas dispute' },
  { id: 'sudan2023', kind: 'airspace', start: '2023-04-15', end: null, countries: ['SD'], depth: 1, source: 'Sudanese civil war (2023–present)' },
  { id: 'natsFailure2023', kind: 'disruption', start: '2023-08-28', end: '2023-08-29', countries: ['GB'], depth: 0.3, source: '2023 NATS air traffic control failure' },
  { id: 'israel2023', kind: 'disruption', start: '2023-10-08', end: '2024-06-30', airports: ['LLBG'], depth: 0.6, source: 'Effects of the Gaza war' },
  { id: 'iranIsrael2024', kind: 'airspace', start: '2024-04-13', end: '2024-04-15', countries: ['IL', 'JO', 'IQ', 'IR', 'LB'], depth: 1, source: '2024 Iranian strikes on Israel' },
  { id: 'heathrowFire2025', kind: 'disruption', start: '2025-03-21', end: '2025-03-22', airports: ['EGLL'], depth: 1, source: '2025 Heathrow Airport fire' },
  { id: 'twelveDayWar2025', kind: 'airspace', start: '2025-06-13', end: '2025-06-25', countries: ['IR', 'IQ', 'IL', 'JO'], depth: 1, source: 'Twelve-Day War' },
  { id: 'gulf2025', kind: 'airspace', start: '2025-06-23', end: '2025-06-24', countries: ['QA', 'BH', 'KW'], depth: 0.8, source: 'Twelve-Day War' },
  { id: 'bulgariaEuro2026', kind: 'milestone', start: '2026-01-01', end: '2026-01-01', depth: 0, source: 'Bulgaria and the euro' },
  { id: 'iranWar2026', kind: 'airspace', start: '2026-02-28', end: '2026-04-09', countries: ['IQ', 'KW', 'BH', 'IL', 'JO'], depth: 1, source: '2026 Iran war' },
  { id: 'iranWarIran2026', kind: 'airspace', start: '2026-02-28', end: '2026-07-01', countries: ['IR'], depth: 1, source: '2026 Iran war' },
  { id: 'iranWarQatar2026', kind: 'airspace', start: '2026-02-28', end: '2026-04-21', countries: ['QA'], depth: 0.8, profile: [['2026-02-28', 1], ['2026-03-07', 1], ['2026-03-08', 0.6], ['2026-04-21', 0.6]], source: '2026 Iran war' },
  { id: 'iranWarGulf2026', kind: 'airspace', start: '2026-02-28', end: '2026-04-09', countries: ['AE', 'OM', 'SA'], depth: 0.4, source: '2026 Iran war' },
  { id: 'iranWarFuel2026', kind: 'fuelShock', start: '2026-02-28', end: null, depth: 0.8, source: '2026 Iran war' },
  {
    id: 'iranWarDemand2026', kind: 'crisis', start: '2026-02-28', end: '2026-12-31', countries: ['AE', 'QA', 'BH', 'KW', 'OM', 'SA', 'JO', 'IL', 'IQ', 'LB'], depth: 0.35, local: true,
    profile: [['2026-02-28', 1], ['2026-04-30', 1], ['2026-12-31', 0]], source: '2026 Iran war',
  },
];
