// Recognisable livery colours of well-known airlines: [main colour, accent colour]. Colours are facts, not logos
// (the game never uses real logos). Entered by hand from the airlines' public appearance; all other airlines get a
// generated colour pair (marked "generated" in the game).
export const AIRLINE_COLORS: Readonly<Record<string, [string, string]>> = {
  AUA: ['#e2001a', '#ffffff'], DLH: ['#05164d', '#ffad00'], SWR: ['#e2001a', '#ffffff'], BEL: ['#00235f', '#e2001a'],
  EWG: ['#a3195b', '#ffffff'], CFG: ['#fdc500', '#2f2f2f'], DLA: ['#00235f', '#c8a95b'], AFR: ['#002157', '#e4002b'],
  KLM: ['#00a1de', '#ffffff'], TRA: ['#00d66c', '#1c3664'], TVF: ['#00d66c', '#1c3664'], BAW: ['#075aaa', '#eb2226'],
  EIN: ['#006a4e', '#8dc63f'], IBE: ['#d7192d', '#f8b131'], VLG: ['#ffcc00', '#4c4c4c'], IBS: ['#d7192d', '#f8b131'],
  TAP: ['#00a14b', '#e2001a'], AZA: ['#0a2240', '#00a3e0'], ITY: ['#0a2240', '#00a3e0'], SAS: ['#000a5c', '#ffffff'],
  FIN: ['#0b1560', '#ffffff'], NAX: ['#d81939', '#ffffff'], LOT: ['#11397e', '#ffffff'], CSA: ['#d0103a', '#00285f'],
  AEE: ['#0b2361', '#5aa5d8'], THY: ['#c70a0c', '#ffffff'], PGT: ['#fdb913', '#d71920'], TKJ: ['#e30613', '#1d1d1b'],
  RYR: ['#073590', '#f1c933'], WZZ: ['#c6007e', '#2e2a6d'], WMT: ['#c6007e', '#2e2a6d'], WUK: ['#c6007e', '#2e2a6d'],
  EZY: ['#ff6600', '#ffffff'], EJU: ['#ff6600', '#ffffff'], EZS: ['#ff6600', '#ffffff'], VOE: ['#ffde00', '#000000'],
  BTI: ['#b7ce27', '#ffffff'], CTN: ['#0f2d69', '#e41e26'], ASL: ['#002f6c', '#e2001a'], ROT: ['#00287a', '#e2001a'],
  LDA: ['#d4021d', '#ffffff'], SXS: ['#ffcc00', '#c00018'], TUI: ['#70cbf4', '#d40e14'], JAF: ['#70cbf4', '#d40e14'],
  UAE: ['#d71a21', '#ffffff'], QTR: ['#5c0632', '#ffffff'], ETD: ['#bd8b13', '#5f6062'], SVA: ['#006c35', '#ffffff'],
  ELY: ['#1b3e93', '#ffffff'], MSR: ['#00265d', '#c3a161'], RJA: ['#c8102e', '#bf9b30'], GFA: ['#a6883e', '#ffffff'],
  UAL: ['#002244', '#0033a0'], DAL: ['#003366', '#e01933'], AAL: ['#0078d2', '#c30019'], SWA: ['#304cb2', '#ffbf27'],
  JBU: ['#003876', '#0079c1'], ASA: ['#01426a', '#64ccc9'], ACA: ['#d22630', '#000000'], WJA: ['#00aaa5', '#003e51'],
  ROU: ['#d22630', '#ffffff'], POE: ['#0b2a5b', '#ffffff'], SIA: ['#f99f1c', '#1d3c6e'], CPA: ['#006564', '#ffffff'],
  JAL: ['#cc0000', '#ffffff'], ANA: ['#13448f', '#00a0e9'], KAL: ['#00256c', '#8fc8e8'], CCA: ['#e30613', '#ffffff'],
  CES: ['#1a3a7a', '#e30613'], CSN: ['#008ccf', '#e30613'], QFA: ['#e40000', '#ffffff'], ANZ: ['#000000', '#ffffff'],
  VOZ: ['#e2001a', '#3c3c3c'], AIC: ['#da0e29', '#e8a13a'], IGO: ['#0c2d83', '#ffffff'], ETH: ['#078930', '#fcdd09'],
  SAA: ['#002b5c', '#ffb81c'], KQA: ['#d7182a', '#000000'], LAN: ['#1b0088', '#e8114b'], AVA: ['#e30613', '#ffffff'],
  GLO: ['#ff5a00', '#ffffff'], AZU: ['#0066cc', '#ffffff'], AMX: ['#0b2343', '#a0a5aa'], CMP: ['#0a2a6c', '#c8b273'],
};

/** A stable colour pair for airlines without known colours, derived from the airline id. */
export function generatedColors(id: string): [string, string] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const hsl = (s: number, l: number) => {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  return [hsl(65, 38), h % 2 ? '#ffffff' : hsl(70, 72)];
}
