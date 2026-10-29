// How Wikipedia articles and official registers name aircraft → the game's aircraft type ids.
// Most specific patterns first; null = a real aircraft that is deliberately not in the game (light aircraft, bizjets).
/** Wikipedia's ways of naming aircraft → the game's type ids. Most specific first; null = not in the game. */
export const TYPE_PATTERNS: [RegExp, string | null][] = [
  // Manufacturer model codes as used in official registers (FAA, Transport Canada, Austro Control…).
  [/CL-600-2B19/, 'CRJ2'], [/CL-600-2C1[01]/, 'CRJ7'], [/CL-600-2D(15|24)/, 'CRJ9'], [/CL-600-2E25/, 'CRJX'],
  [/CL-600-2B16|BD-700|BD-100|CL-600-1A11/, null], // Challenger / Global business jets
  [/ERJ 170-100/, 'E170'], [/ERJ 170-200/, 'E175'], [/ERJ 190-100/, 'E190'], [/ERJ 190-300/, 'E290'], [/ERJ 190-400/, 'E295'],
  [/BD-500-1A10/, 'BCS1'], [/BD-500-1A11/, 'BCS3'], [/(CESSNA|TEXTRON).*208/, 'C208'], [/SAAB 340|340B/i, 'SF34'],
  [/Beech A?100|Beech B?200|Beech 300|Beech 350/i, 'BE20'],
  [/DHC-3|DHC-2|DC-?3|CESSNA 1\d\d|CESSNA 20[67]|PA-\d\d/i, null], // floatplanes, piston singles: not airliners
  [/A321-2[57]\dNY/, 'A21N-XLR'], [/737-8200/, 'B38M'],
  [/777-3[0-9A-Z]{2}ER/, 'B77W'], [/777-2[0-9A-Z]{2}LR/, 'B77L'], [/777-3[0-9A-Z]{2}\b/, 'B773'],
  [/A321XLR/, 'A21N-XLR'], [/A321LR|A321neo|A321-2[57]1N/, 'A21N'], [/A320neo|A320-2[57]1N/, 'A20N'], [/A319neo/, 'A19N'],
  [/A321P2F|A321-200P2F|A321.*freighter/i, 'A321-F'], [/A318/, 'A318'], [/A319/, 'A319'], [/A321/, 'A321'], [/A320/, 'A320'],
  [/A220-100|CS100|A220-1/, 'BCS1'], [/A220/, 'BCS3'], [/CS300/, 'BCS3'],
  [/A330-900|A330neo/, 'A339'], [/A330-800/, 'A338'], [/A330-200F|A330-300P2F|A330.*freighter/i, 'A332-F'], [/A330-200|A330-2/, 'A332'], [/A330/, 'A333'],
  [/A340-600|A340-500/, 'A346'], [/A340/, 'A343'], [/A350-1000/, 'A35K'], [/A350F/, null], [/A350/, 'A359'], [/A380/, 'A388'],
  [/737 MAX 10|737-10/, 'B3XM'], [/737 MAX 7|737-7\b/, 'B37M'], [/737 MAX 9|737-9\b/, 'B39M'], [/737 MAX|737-8\b|737-8-200/, 'B38M'],
  [/737-900/, 'B739'], [/737-800(BCF|SF|F)|737-800.*(freighter|converted)/i, 'B738-F'], [/737-800/, 'B738'], [/737-700/, 'B737'],
  [/737-[3456]00/, 'B733'], [/737 Next Generation/, 'B738'],
  // Boeing customer codes as used in registers: 737-8AS = 737-800 for Ryanair, 767-3Z9 = 767-300 for Austrian…
  [/737-8[0-9A-Z]{2}\b/, 'B738'], [/737-7[0-9A-Z]{2}\b/, 'B737'], [/737-9[0-9A-Z]{2}(ER)?\b/, 'B739'], [/737-[2345][0-9A-Z]{2}\b/, 'B733'],
  [/757-300/, 'B753'], [/757-200(PF|SF|PCF|F)|757.*freighter/i, 'B752-F'], [/757/, 'B752'],
  [/767-300(ER)?F|767-300BCF|767.*freighter/i, 'B763-F'], [/767-400/, 'B764'], [/767/, 'B763'],
  [/777F|777-200F|777.*freighter/i, 'B77L-F'], [/777-9|777X/, 'B779'], [/777-8/, null], [/777-300ER/, 'B77W'], [/777-300/, 'B773'],
  [/777-200LR/, 'B77L'], [/777/, 'B772'], [/787-10/, 'B78X'], [/787-8/, 'B788'], [/787/, 'B789'],
  [/747-8F|747-8.*freighter/i, 'B748-F'], [/747-400(ER)?F|747-400BCF|747.*freighter/i, 'B744-F'], [/747-8/, 'B748'], [/747/, 'B744'],
  [/MD-11/, 'MD11-F'],
  [/E195-E2|E195 E2|195-E2/, 'E295'], [/ERJ[ -]?190-200/, 'E195'], [/E190-E2|E190 E2|190-E2/, 'E290'], [/E175-E2/, null],
  [/Embraer 195|E195|ERJ-195/, 'E195'], [/Embraer 190|E190|ERJ-190/, 'E190'], [/Embraer 175|E175|ERJ-175/, 'E175'],
  [/Embraer 170|E170|ERJ-170/, 'E170'], [/ERJ[ -]?145|EMB[ -]?145/, 'E145'], [/ERJ[ -]?1(35|40)|EMB[ -]?135/, 'E135'],
  [/EMB[ -]?120|Brasilia/, 'E120'],
  [/CRJ[ -]?1000/, 'CRJX'], [/CRJ[ -]?900/, 'CRJ9'], [/CRJ[ -]?700|CRJ[ -]?550/, 'CRJ7'], [/CRJ|Canadair Regional Jet/, 'CRJ2'],
  [/ATR 72-600F|ATR 72F|ATR 72.*freighter/i, 'AT76-F'], [/ATR 72-600|ATR 72-6/, 'AT76'], [/ATR 72/, 'AT75'],
  [/ATR 42-600/, 'AT46'], [/ATR 42/, 'AT45'],
  [/Q400|Dash 8-400|DHC-8-4|Dash 8 Q4/, 'DH8D'], [/Dash 8-300|Q300|DHC-8-3/, 'DH8C'], [/Dash 8-200|Q200|DHC-8-2/, 'DH8B'],
  [/Dash 8|DHC-8/, 'DH8A'], [/Saab 2000/, 'SB20'], [/Saab 340/, 'SF34'], [/Dornier 328|328JET/, 'D328'], [/Jetstream 4/, 'JS41'],
  [/Fokker 50/, 'F50'], [/Fokker 100|Fokker 70/, 'F100'], [/1900D?|Beech(craft)? 1900/, 'B190'], [/Twin Otter|DHC-6/, 'DHC6'],
  [/L-410|L 410|Let 410/, 'L410'], [/Superjet/, 'SU95'], [/ARJ21|C909/, 'AJ27'], [/C919/, 'C919'],
  [/MD-8\d|MD-90/, 'MD82'], [/717/, 'B712'], [/Dornier 228|Do 228/, 'D228'], [/MA60/, 'MA60'], [/A310/, 'A310'], [/A300/, 'A306'], [/737-[12]00/, 'B732'], [/737 Classic/, 'B733'],
  [/Avro RJ|BAe 146|RJ85|RJ100/, 'RJ1H'], [/An-2[46]/, 'AN24'], [/Jetstream 3/, 'JS32'], [/Metro|Merlin/, 'SW4'],
  [/Tu-2[01]4/, 'T204'], [/MC-21/, 'MC21'], [/SkyCourier|Cessna 408/, 'C408'], [/Caravan II|F406|Cessna 40[246]|Cessna 414/, 'C402'],
  [/Caravan|Cessna 208/, 'C208'], [/PC-12/, 'PC12'], [/Islander|BN-2/, 'BN2P'], [/King Air/, 'BE20'],
  // Light aircraft, helicopters and business jets: not airliners, not in the game.
  [/Cessna 1[5-8]\d|Cessna 20[67]|Piper|Beaver|Otter DHC-3|Airvan|Citation|Learjet|Gulfstream|Challenger 6|Falcon|Eurocopter|Airbus Helicopters|Bell \d|Sikorsky|Mil Mi|ACJ|BBJ|Il-76|An-12|An-124/, null],
];

export function mapType(text: string): string | null | undefined {
  for (const [re, id] of TYPE_PATTERNS) if (re.test(text)) return id;
  return undefined; // unknown to the mapping
}


/**
 * Older types (Phase 6.3: historical fleet tables). Checked before TYPE_PATTERNS, so e.g. a "747-300" is the 747-300
 * and not today's 747-400, and a "DC-9-32" isn't missed.
 */
export const HISTORICAL_PATTERNS: [RegExp, string | null][] = [
  [/DC-?3\b|C-47|Dakota|Li-2/, 'DC3'], [/DC-?4\b|C-54|Skymaster/, 'DC4'], [/DC-?6/, 'DC6'], [/DC-?7/, 'DC7'],
  [/Constellation|L-?1049|L-?749|L-?049|L-?1649/, 'CONI'], [/Convair (CV-?)?5[48]0|CV-?580|Convair 600|Convair 640/, 'CVLT'],
  [/Convair (CV-?)?[234]40|CV-?[234]40|Metropolitan/, 'CVLP'], [/Viscount/, 'VISC'], [/Britannia/, 'BRIT'],
  [/F-?27|Friendship|FH-227/, 'F27'], [/L-?188|Electra/, 'L188'], [/Il-?18\b/, 'IL18'], [/HS[ -]?748|Avro 748|Andover/, 'A748'],
  [/Bandeirante|EMB[ -]?110/, 'E110'], [/Dash 7|DHC-7/, 'DHC7'], [/Shorts? 3[36]0|SD3-/, 'SH36'],
  [/ATR 42-[235]00|ATR 42\b(?!-6)/, 'AT43'], [/ATR 72-[12]00/, 'AT72'],
  [/Comet/, 'COMT'], [/Caravelle/, 'S210'], [/Boeing 720|\b720B?\b/, 'B720'], [/707-?(3|4)\d\d|707-320|707-420|707-?3[0-9A-Z]{2}/, 'B703'],
  [/707/, 'B701'], [/Convair (CV-)?880|Convair (CV-)?990|Coronado/, 'B720'],
  [/727-?2\d\d|727-200/, 'B722'], [/727/, 'B721'], [/Trident/, 'TRID'], [/VC-?10/, 'VC10'], [/One-Eleven|BAC 1-11|BAC-111|BAC 111/, 'BA11'],
  [/DC-?8-?(6\d|7\d)|Super Sixty|Super 70/, 'DC86'], [/DC-?8/, 'DC85'],
  [/DC-?9-?(5\d)|DC-9-50/, 'DC95'], [/MD-?87/, 'MD87'], [/MD-?90/, 'MD90'], [/MD-?8\d/, 'MD82'], [/DC-?9/, 'DC93'],
  [/Tu-?134/, 'T134'], [/Tu-?154/, 'T154'], [/Il-?62/, 'IL62'], [/Il-?86/, 'IL86'], [/Il-?96/, 'IL96'],
  [/Yak-?40/, 'YK40'], [/Yak-?42/, 'YK42'], [/F-?28|Fellowship/, 'F28'], [/Fokker 70\b|F70\b/, 'F70'],
  [/737-?100\b|737-1\d\d/, 'B731'], [/737-?200|737-2\d\d/, 'B732'], [/737-?400|737-4\d\d/, 'B734'], [/737-?500|737-5\d\d/, 'B735'],
  [/737-?600|737-6\d\d/, 'B736'], [/737-?300|737-3\d\d/, 'B733'],
  [/747SP/, 'B74S'], [/747-?100|747-1\d\d/, 'B741'], [/747-?200|747-2\d\d/, 'B742'], [/747-?300|747-3\d\d/, 'B743'],
  [/767-?200|767-2\d\d/, 'B762'], [/DC-?10/, 'DC10'], [/L-?1011|TriStar/, 'L101'], [/MD-?11(?!F)/, 'MD11'],
  [/A300-?600|A300B4-6/, 'A306'], [/A300/, 'A30B'], [/Concorde/, 'CONC'], [/BAe 146|BAe-146/, 'B462'],
  [/CRJ-?100\b/, 'CRJ1'], [/A340-?200|A340-2\d\d/, 'A342'], [/A340-?500/, 'A345'],
  [/328 ?JET|Do ?328JET/, 'J328'],
];

/** Like mapType, but older types first (historical fleet tables). */
export function mapHistoricalType(text: string): string | null | undefined {
  for (const [re, id] of HISTORICAL_PATTERNS) if (re.test(text)) return id;
  return mapType(text);
}
