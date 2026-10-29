// Airline alliances over time (Phase 6.4), entered by hand from Wikipedia's articles on the alliances (CC BY-SA 4.0):
// which airline was a member from when to when. Ids are the game's airline ids (today's airlines by ICAO code, closed
// ones by Wikidata id). Dates YYYY-MM-DD; `until` = left (exclusive), absent = still a member.

export interface Membership {
  id: string;
  from: string;
  until?: string;
}

/** Star Alliance (founded 14 May 1997; Wikipedia "Star Alliance", member and former member tables). */
export const STAR_ALLIANCE: readonly Membership[] = [
  { id: 'DLH', from: '1997-05-14' },
  { id: 'UAL', from: '1997-05-14' },
  { id: 'SAS', from: '1997-05-14', until: '2024-09-01' },
  { id: 'ACA', from: '1997-05-14' },
  { id: 'THA', from: '1997-05-14' },
  { id: 'Q861197', from: '1997-10-22', until: '2007-02-01' }, // Varig
  { id: 'Q247116', from: '1999-03-01', until: '2001-09-14' }, // Ansett Australia
  { id: 'ANA', from: '1999-10-01' },
  { id: 'ANZ', from: '1999-03-01' },
  { id: 'AUA', from: '2000-03-26' },
  { id: 'SIA', from: '2000-04-01' },
  { id: 'Q157205', from: '2000-07-01', until: '2012-04-20' }, // bmi British Midland
  { id: 'Q53085', from: '2000-07-01', until: '2004-03-31' }, // Mexicana
  { id: 'LOT', from: '2003-10-26' },
  { id: 'Q204122', from: '2003-04-01', until: '2012-01-28' }, // Spanair
  { id: 'AAR', from: '2003-03-01' },
  { id: 'Q208046', from: '2004-05-04', until: '2014-03-31' }, // US Airways
  { id: 'Q223191', from: '2004-11-18', until: '2019-09-30' }, // Adria Airways
  { id: 'Q214675', from: '2004-11-18', until: '2016-01-01' }, // Blue1
  { id: 'CTN', from: '2004-11-18' },
  { id: 'TAP', from: '2005-03-14' },
  { id: 'SWR', from: '2006-04-01' },
  { id: 'SAA', from: '2006-04-10' },
  { id: 'CCA', from: '2007-12-12' },
  { id: 'CSH', from: '2007-12-12', until: '2010-11-01' },
  { id: 'THY', from: '2008-04-01' },
  { id: 'MSR', from: '2008-07-11' },
  { id: 'Q216486', from: '2009-10-27', until: '2012-03-03' }, // Continental Airlines
  { id: 'BEL', from: '2009-12-09' },
  { id: 'AEE', from: '2010-06-30' },
  { id: 'TAM', from: '2010-05-13', until: '2014-03-31' },
  { id: 'ETH', from: '2011-12-13' },
  { id: 'AVA', from: '2012-06-21' },
  { id: 'CMP', from: '2012-06-21' },
  { id: 'CSZ', from: '2012-11-29' },
  { id: 'EVA', from: '2013-06-18' },
  { id: 'AIC', from: '2014-07-11' },
];

/** The Qualiflyer Group led by Swissair (Wikipedia "Qualiflyer"); Austrian and its subsidiaries took part 1998–2000. */
export const QUALIFLYER: readonly Membership[] = [
  { id: 'Q694098', from: '1998-03-01', until: '2002-04-01' }, // Swissair
  { id: 'Q667656', from: '1998-03-01', until: '2002-04-01' }, // Crossair
  { id: 'Q141146', from: '1998-03-01', until: '2001-11-07' }, // Sabena
  { id: 'TAP', from: '1998-03-01', until: '2002-04-01' },
  { id: 'THY', from: '1998-03-01', until: '2000-06-01' },
  { id: 'Q296006', from: '1998-03-01', until: '2001-07-01' }, // AOM French Airlines
  { id: 'Q407456', from: '1998-03-01', until: '2002-04-01' }, // Air Littoral
  { id: 'Q121771', from: '1998-11-01', until: '2002-04-01' }, // Volare
  { id: 'AUA', from: '1998-03-01', until: '2000-03-26' },
];

/** Members of an alliance on a day (YYYY-MM-DD). */
export const membersOn = (list: readonly Membership[], day: string): string[] =>
  list.filter((m) => m.from <= day && (!m.until || day < m.until)).map((m) => m.id);
