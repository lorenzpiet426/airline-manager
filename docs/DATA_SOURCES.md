# Data sources

Every dataset used by the game is listed here: where it comes from, its license, and how we use it.
Status: **planned** = chosen but not yet downloaded; **in use** = shipped in the game (add download date).

| Area | Source | License | Use in game | Status |
|---|---|---|---|---|
| Airports, runways | [OurAirports](https://ourairports.com/data/) | Public domain | Coordinates, runway lengths, elevation, country, size, scheduled-service flag | **in use** (downloaded 2026-10-27) |
| Airport time zones | Time zone of the nearest GeoNames city (IANA tz names) | CC BY 4.0 | Local times, curfews | **in use** (2026-10-27) |
| City population | [GeoNames](https://www.geonames.org/) `cities15000` (all cities ≥ 15,000 inhabitants) | CC BY 4.0 | Catchment population within 100 km of each airport; **market population** (each city's people shared between airports within 150 km by size and distance) | **in use** (downloaded 2026-10-27) |
| Wealth | [World Bank](https://data.worldbank.org/) GDP per capita, current USD (`NY.GDP.PCAP.CD`), latest year | CC BY 4.0 | Demand, fare levels, salaries | **in use** (downloaded 2026-10-27; mostly 2025 values) |
| Wealth gaps | `tools/supplements/gdp-supplement.json`: IMF WEO (Taiwan), INSEE (French overseas regions), rounded estimates, parent-country values for small territories | various, cited per entry | Countries the World Bank does not cover | **in use** |
| Tourism | World Bank international tourist arrivals (`ST.INT.ARVL`); **2019 preferred** (2020–22 distorted by COVID) | CC BY 4.0 | Leisure demand factor | **in use** (downloaded 2026-10-27) |
| Market calibration | [Eurostat](https://ec.europa.eu/eurostat) `avia_par_at` (Austria, 2019, passengers carried per airport pair, both directions) | Eurostat reuse policy (free, attribution) | Demand model fitted to 46 routes from Austrian airports; 20 kept as test targets in `src/engine/routes.test.ts` | **in use** (downloaded 2026-10-27 via the Eurostat API) |
| Real airlines | [Wikidata](https://www.wikidata.org) SPARQL (`tools/download-airlines.ts` → `build-airlines.ts` → `src/data/generated/airlines.json`): name, IATA/ICAO, callsign, country, hubs (P113), alliance, parent, founding year, English Wikipedia article; one airline per ICAO code (most Wikipedia language versions wins), cargo/helicopter/military items left out | CC0 (credited anyway) | AI airlines (Phase 2.1) | **in use** (downloaded 2026-10-27; 1,657 airlines) |
| Who flies where | English Wikipedia "Airlines and destinations" sections of 3,812 airport articles (`tools/download-wikipedia-airports.ts`, `build-wikipedia-routes.ts`; both template names `Airport-dest-list` / `Airport destination list`) | CC BY-SA 4.0 | Real airline networks: 51,760 airline routes, 824 airlines, 35,490 listed at both ends | **in use** (downloaded 2026-10-27) |
| Airline details | English Wikipedia airline articles: categories (business model), infobox (hubs, bases, fleet size), current fleet table incl. separate "… fleet" articles (`download-airline-articles.ts`, `build-airline-details.ts`, `aircraft-names.ts`) | CC BY-SA 4.0 | Business model, bases, fleets (27,214 aircraft at 735 airlines), orders, seats | **in use** (downloaded 2026-10-27) |
| Airline networks | `build-networks.ts` → `networks.json`: Wikipedia routes + weekly flights where Eurostat has a total (split: hub airline 3×, base 2×, others 1×, seasonal ½, charter ⅓; tagged estimate); other routes get frequencies from the game's demand model | CC BY-SA 4.0 + Eurostat | AI airlines | **in use** |
| Brands/subsidiaries | Second Wikidata pass by Wikipedia article (`download-airlines-extra.ts`): 129 brands without own ICAO code (United Express, QantasLink…) | CC0 | Airlines that fly under a brand | **in use** |
| Individual aircraft | `build-registers.ts` → `registers.json`: FAA (USA), Transport Canada, Austro Control (operator column), IAA Ireland (Sept 2025); registered owner/operator matched to airlines by company name; leased aircraft under trust banks/lessors not matched | public domain / attribution | Registrations and build years for 7,443 aircraft at 87 airlines (United 1,218, Delta 1,124, American 997, Southwest 745, SkyWest 565, Ryanair 340, Austrian 68…) | **in use** |
| Route totals Europe | [Eurostat](https://ec.europa.eu/eurostat) `avia_par_<country>` for 33 reporting countries (`tools/download-eurostat-routes.ts` → `build-eurostat-routes.ts` → `routes-eurostat.json`): weekly flights, seats, passengers per direction and airport pair, all airlines together, **season S24** (April–September 2024; newer months not yet published) | Eurostat reuse policy (source acknowledged) | Total supply per route, to split between real airlines | **in use** (downloaded 2026-10-27; 12,315 directed routes) |
| Aircraft specs | `src/data/aircraft.ts`: 84 types (Phase 1.3: 25; Phase 2.1: turboprops, regional jets, older narrow/wide-bodies, A380, 747, freighters with payload), rounded manufacturer figures (typical seating, range, cruise speed, MTOW, take-off field length at MTOW/ISA/sea level, ETOPS) | Facts only | Range, runway and ETOPS checks, seats, lease market | **in use** (2026-10-27; entered from manufacturer published figures; to be cross-checked line by line against *Airport Planning* documents and EASA TCDS in Phase 4) |
| Aircraft specs (detail) | Manufacturer *Airport Planning* documents (Airbus, Boeing, Embraer, ATR, DHC…), EASA Type Certificate Data Sheets | Public documents; facts only | Cross-check of the values above, dimensions, payload-range curves | planned |
| Fuel burn | Average block fuel per hour per type in `src/data/aircraft.ts` (rough estimates) | Facts only | Fuel cost per flight | **in use** (estimates; to be checked against OpenAP) |
| Fuel burn (detail) | [OpenAP](https://github.com/junzis/openap) (TU Delft) + ICAO engine emissions databank | LGPL-3.0 (code) / open | Fuel flow per type and flight phase | planned |
| Maintenance cost | Direct maintenance cost per block hour per type in `src/data/aircraft.ts` (rough European level, below US BTS Form 41 figures) | Facts only | Maintenance cost per flight, +1 %/year of age | **in use** (estimates) |
| Aircraft dates, prices | Entry-into-service years, production years; last published list prices (Airbus 2018, Boeing, Embraer, ATR lists; A321XLR estimated) | Facts only | Availability by year, list price | **in use** for the 25 starter types |
| Lease rates | Typical monthly lease rates per type at a reference age, rough 2025 market level from public trade-press reporting on lessor rates | Facts only (rounded estimates) | Lease market: rent = reference × age factor (−4 %/year of the new rate, floor 30 %) ± 8 % | **in use** (estimates; calibrate in Phase 4) |
| Registrations | ICAO nationality marks + usual airliner patterns per country (e.g. OE-Lxx, D-Axxx), `src/data/registrations.ts` | Facts only | Tail numbers of leased aircraft | **in use** (~130 countries; others get a placeholder) |
| Operating costs | [US DOT BTS Form 41](https://www.transtats.bts.gov/) (Schedule P-5.2) | Public domain | Real costs per aircraft type (crew, maintenance, fuel) for calibration | planned |
| Navigation charges | EUROCONTROL formula shape (distance/100 × √(MTOW/50 t) × unit rate) with a flat unit rate ($80 Europe, $45 elsewhere) | Public | En-route charges per flight | **in use** (simplified; exact national unit rates in Hardcore, Phase 12) |
| Airport charges | Simple model: $6 per tonne MTOW per departure + $13 per departing passenger, scaled by airport size and country wealth | Estimates | Landing and passenger fees | **in use** (estimates; real tables e.g. Vienna "Tarifordnung" later) |
| Jet fuel price | [US EIA](https://www.eia.gov/) US Gulf Coast kerosene-type jet fuel spot price, weekly (series `EER_EPJK_PF4_RGC_DPG`), `src/data/fuel.ts` | Public domain | Fuel price week by week from Dec 2025 to 16 Oct 2026 (+ $0.30/gal into-plane), held after that | **in use** (downloaded 2026-10-27; full history from 1990 in Phase 5) |
| Exchange rates | [ECB](https://www.ecb.europa.eu/) euro reference rates (`eurofxref-daily.xml`), `src/data/currencies.ts` | Free reuse with attribution | Converting USD leases into the airline's book currency | **in use** (rates of 2026-10-26, fixed for now; history in Phase 5) |
| Currencies by country | Hand-made list of which country uses which ECB-listed currency (euro area incl. Bulgaria since 2026) | Facts only | Airline book currency (others keep books in USD) | **in use** |
| Airline economics | Annual reports: Lufthansa Group (Austrian Airlines segment), Ryanair, Wizz Air; IATA industry outlook | Public reports; facts only | Calibrate CASK, RASK, margins | planned |
| Historical events | Hand-curated timeline from public sources | Facts only | Crises, regulation changes | planned |
| Austrian Airlines history | Annual reports, historical timetables, encyclopedic sources | Facts only | Takeover scenario fleet/network per year | planned |
| Map base | [Natural Earth](https://www.naturalearthdata.com/) 1:50m land + land boundary lines (GeoJSON from the natural-earth-vector repository) | Public domain | Coastlines, borders (bundled, works offline) | **in use** (downloaded 2026-10-27) |
| Map label font | [OpenFreeMap](https://openfreemap.org/) glyph server (Noto Sans, SIL OFL) | free service, no key | Airport code labels on the map (cached for offline use) | **in use** |
| Optional detailed tiles | [OpenFreeMap](https://openfreemap.org/) (OpenStreetMap data) | ODbL (data), free service | Detailed map when zoomed in | optional |
| Fonts | IBM Plex Sans / Mono | SIL Open Font License | UI typography | **in use** (self-hosted via @fontsource) |

Notes:
- Real airline names and colors are used for **personal, non-commercial** play. We draw our own simplified
  liveries; we do not copy logo image files.
- Facts (numbers like range or MTOW) are not copyrightable; we re-enter them in our own data files and cite the source.

## Source check for real airlines (Phase 2.1, 2026-10-27)
Checked for: licence allows use in a public, free, non-commercial game; bulk download possible by script; usable fields.
Nothing below has been imported yet — this is the checklist the owner approves before building.

| Source | What it gives | Download | Licence / terms | Verdict |
|---|---|---|---|---|
| **Wikidata** | airline names, IATA/ICAO codes (P229/P230), hubs (P113), alliances (P114) | SPARQL endpoint / dumps (descriptive User-Agent required) | **CC0** (attribution requested, not required) | ✅ usable |
| **Wikipedia** | business model, destination lists, fleet tables with orders and seat layouts | MediaWiki API (descriptive User-Agent, requests in series, cache) | **CC BY-SA 4.0** → our derived tables from Wikipedia must also be CC BY-SA, with attribution | ✅ usable (share-alike) |
| **Eurostat** `avia_par_*` | per **airport pair** (no airline breakdown — verified: dimensions are only unit, measure, airport pair, time): passengers, seats, commercial flights | API / bulk TSV | reuse allowed with source acknowledged; non-commercial reuse unrestricted | ✅ usable: total flights/seats per route, split between airlines |
| **Brazil ANAC** — VRA (every scheduled flight per day, incl. 2026), Dados Estatísticos (per airline & route & month: passengers, seats, departures, fuel), RAB register (registration, type, **operator**, seats, year) | sistemas.anac.gov.br/dadosabertos (plain file server, CSV/JSON) | Brazilian open-data policy (Decree 8.777/2016); licence text on dados.gov.br could not be read automatically → **owner to confirm by hand** | ✅ likely usable (best source found) |
| **US BTS T-100 Segment** | per airline & airport pair & aircraft type: departures, seats, passengers (monthly) | web form (not in the PREZIP folder) — scripting still to test | US federal government work → public domain (policy page blocked automated reading) | 🟡 usable if the form can be scripted |
| **UK CAA airline data** | per **airline** (UK carriers) totals; routes only per airport, not per airline | Excel per month | attribution required, must not be sold; no open licence | 🟡 limited (calibration only) |
| **Australia BITRE** (international per airline & city pair; domestic routes) | — | site timed out from here | not read | ❓ owner to check in a browser |
| **India DGCA** | monthly traffic | — | "All rights reserved", no open licence found | ❌ not usable |
| **Canada CCAR** register | registration, type, serial, year, registered owner (in Canada usually the airline) | ✅ direct ZIP download | Government of Canada website terms (non-commercial reproduction with attribution); not on open.canada.ca | ✅ **in use** (`build-registers.ts`) |
| **Ireland IAA** register | registration, type, year, serial, registered owner (e.g. 340 Ryanair aircraft) | ✅ Excel — but **last public file Sept 2025**; since Oct 2025 the live register needs a login | no reuse terms found on the page | 🟡 usable with care (one year old) |
| **Austria Austro Control** register | registration, type, serial, MTOW, **operator** (correction: the first quick check misread the column as empty; e.g. 68 aircraft "Austrian Airlines AG") | ✅ Excel, monthly (Sept 2026) | no reuse terms found | ✅ used for validation |
| **USA FAA** register | registration, type, year, owner | blocks automated downloads (HTTP 403) → owner downloads `ReleasableAircraft.zip` by hand into `tools/raw/` | public domain | ✅ **in use** (owner download 2026-10-27) |
| **UK G-INFO** | — | paid, single-PC licence, copyright reserved | ❌ not usable |
| **Malta** register | — | site blocks automated access (403) | not read | ❓ owner to check |
| **Australia CASA** register | — | site timed out | not read | ❓ owner to check |
| **Airbus orders & deliveries** | per customer & type, monthly Excel (Sept 2026) | ✅ direct link | airbus.com terms forbid extracting/re-using content | ❌ not for import — hand-check only |
| **Boeing orders & deliveries** | — | pages returned 404 | not read | ❌ treat like Airbus until checked |
| **OpenFlights airlines.dat** | names/codes (snapshot, stale; routes stopped 2014) | ✅ | ODbL (share-alike), partly GFDL | 🟡 fallback for codes only |
| **OpenSky** | current flights | — | non-profit research/education only, no redistribution | ⛔ not used (owner decision) |

## Economics model (Phase 1.4) — how it works and how it was calibrated
All in `src/engine/economics.ts`, amounts in USD, converted to the airline's book currency when booked.
- **Demand** (gravity model): passengers/year = K × (market people A × B × tourism)^0.7 × (wealth A × wealth B)^0.2
  × (distance/1000 km)^−0.8 ÷ (1 + (400 km/distance)^4). "Market people" = the airport's share of nearby city
  populations (large airports at least 0.5 M); wealth = GDP per capita / 40,000 USD; tourism = (1 + tourist arrivals per
  inhabitant)^0.3 per country. The last term hands short trips to trains and cars.
  Fitted to Eurostat 2019 totals on 46 Austrian routes: average error ≈ ×1.9. Known gaps: transfer traffic at hubs
  (DXB, FRA, ZRH) and package holidays (Palma, Bangkok) come out too low; small Austrian airports too high.
- **Competition** ("invisible incumbents" until Phase 2): today's airlines fly as often as the market needs at 80 %
  load factor (only on markets worth ≥ 3 flights per week). Every market also has the **one-stop alternative** via other
  hubs, worth 2 (short-haul) to 6 (long-haul) non-stop flights per week. Your share = your frequency^1.3 × price
  attraction × speed ÷ (same + incumbents' frequency^1.3 + one-stop^1.3). Incumbents match half of any price cut.
  Lower fares also grow the market (leisure: elasticity −1.6, business −0.6).
- **Seasons**: monthly factors (leisure peak Jul/Aug ×1.3, low Jan ×0.75; business dip in Aug/Dec), reversed in the
  southern hemisphere, halved in the tropics.
- **Fares**: market fare = (55 + 0.13 × km^0.92) USD × wealth factor × fuel surcharge (35 % pass-through of the fuel
  price above/below $2.20/gal). Checked against typical published average fares (e.g. VIE–LHR ≈ €130–160 one way).
- **Costs**: fuel (burn/h × block time × price), maintenance (per block hour, +1 %/year of age), airport fees,
  ground handling + catering, navigation charges, 5 % sales/distribution, crew (5 crews per short-haul aircraft,
  9 per wide-body; pilots $135k/175k, cabin crew $45k per year at Austrian level, scaled by country wealth), lease.
  overheads (head office, IT, marketing, insurance: $1.5 M per year + $0.9 M per aircraft, scaled by country wages).
  Checked: an A320neo on VIE–LHR costs ≈ 4–6 US cents per seat-km before crew and lease.
- **Balance check** (scan of all ~31,000 type × destination combinations from VIE, best frequency/fare each, incl.
  crew, lease and per-aircraft overheads): best plans make ≈ 12–19 % in July, 8–16 % in April (fuel crisis),
  and almost nothing is profitable in January. Over a year a well-run airline makes a few percent, like real airlines
  (European carriers typically lose money in the winter quarter).

## Timetables and time-of-day demand (Phase 2.2)
`src/engine/timetable.ts`, `src/engine/schedule.ts`. No dataset: modelled from general industry knowledge, tagged
"modelled" in the game. Real departure times of real airlines exist only in sources we may not copy (OAG, Cirium,
Flightradar24…), so competitors' timetables are **generated**.
- **Block time** per direction: 0.45 h taxi/climb/descent + great-circle × 1.06 ÷ (cruise speed + wind), rounded up to
  5 minutes. Wind = 50 km/h westerly at 30–55° latitude (weaker towards the tropics), so eastbound flights are faster
  (VIE–JFK ≈ 50 min longer than JFK–VIE; real timetables show 40–70 min).
- **Passenger choice** (simplified "decision window" model, as used in airline network planning): travellers have a
  wished local departure hour (business: peaks 06–08 and 16–19; leisure: broad 07–21; long-haul: all day into the late
  evening). Flights within ±1 h (business) / ±3 h (leisure) are equally fine, further away appeal fades (time constant
  1.5 h / 3 h). Night arrivals 00:30–05:00 count ×0.3 (long-haul ×0.6). The one-stop alternative is always available.
  Shares are computed per hour of the day; an airline's flights get an extra ×(daily flights)^0.3 (frequency S-curve),
  which reproduces the earlier frequency^1.3 rule when flights are evenly spread.
- **Weekdays**: business Mon 1.15, Tue/Wed 1.0, Thu/Fri 1.1, Sat 0.55, Sun 0.9; leisure Mon 0.95, Tue/Wed 0.85,
  Thu 1.0, Fri 1.15, Sat 1.1, Sun 1.15 (normalised to a weekly average of 1).
- **Generated competitor timetables**: from the airline's home end (hub/base, else home country) 1 flight → 07:00,
  2 → 07:00 + 17:30, more → evenly 06:30–20:30; long-haul eastbound from 13:30, westbound from 10:45; small airline-
  specific offset (±15 min). Flights from the other end are the returns after block time + 45 min (long-haul 2 h).
- **Check**: with the new model the best plans from VIE (A320neo, 20 destinations) make about the same as before
  (July ≈ 21 % vs 24 %, April 18 % vs 21 %, January ≈ 1 % vs 3 %); good departure times can now beat bad ones.

## Cabins, seat pitch and reputation (Phase 2, 2026-10-28)
All values here are **modelled** (rough industry figures from trade-press reporting and manufacturers' typical layouts);
no dataset is copied. Code: `src/engine/cabins.ts`, `src/engine/reputation.ts`.
- **Cabin geometry:** economy seats per row by type (e.g. A320 3-3, A220 2-3, 787/A350 3-3-3, 777/747/A380 3-4-3);
  usable cabin length = rows of the type's maximum (exit-limit) seating at 29″. A layout fits when rows × pitch
  (+ 30″ per extra class for galleys/dividers) ≤ that length and seats ≤ the exit limit. Typical layouts reproduce
  manufacturer seat counts (A320neo single class 30″ ≈ 186; 787-9 three-class ≈ 292 with 28 business).
- **Seat products** (pitch range, installed price per seat): economy 28–34″ $4k; premium economy 34–42″ $18k;
  European business (economy seat, middle seat free, movable curtain) 29–34″; recliner 36–62″ $35k; angled flat
  55–66″ $120k; full flat 42–80″ $250k (staggered seats nest, so the pitch is shorter than the bed); first suite 78–90″ $600k.
- **Refits:** new seats + $150 per moved seat + engineering ($40k narrow-body / $150k wide-body); hangar time
  2–4 days for re-spacing, otherwise 4 + seats/40 days (wide-bodies 10 + seats/25), max 45. Paid in cash, written off
  over 6 years or until the lease ends (P&L line "Depreciation"). Free while the aircraft is still being delivered.
- **Demand by class:** share of travellers wanting each class (business travellers: J 15 % short-haul → 40 %
  long-haul, W 5 → 20 %, F 0 → 3 %; leisure: J 2 → 5 %, W 3 → 11 %); class market fares relative to the route's
  average fare: Y 1.0 → 0.8, W ≈ 1.4–1.8 × Y, J 2.6 × Y (Europe) → 4.5 × Y (long-haul), F 4 → 8 × Y.
  Travellers take the best class a flight offers; flying one class lower is acceptable on short flights (×0.85)
  but not long-haul (×0.6). Seat scores (0–100) by product and pitch vs. what passengers expect of the class.
- **Competitors' cabins** by airline type: network carriers euro-business + economy 30″ (long-haul: flat business,
  premium economy, economy 31″), low-cost dense 28″, regional single class, charter dense / single class.
- **Service costs** per passenger (catering, amenities, lounges): Y $2 → $15, W $8 → $30, J $50 → $170, F $105 → $385
  (short → long-haul). Wide-bodies need one extra cabin crew member per 20 business and per 8 first seats.
- **Reputation:** every passenger rates the trip vs. expectation (seat, aircraft age, value for money, crowding;
  60 = as expected). Class ratings move 8 % of the gap each week, the brand 6 % (half-life ≈ 2–3 months). Awareness
  heads to 0.25 + √(weekly pax / 40,000) (up 5 %/week, down 2 %/week); a new airline starts at 20 %. Appeal in the
  passenger choice: brand × (1 ± 0.5–0.8 × (reputation − 60)/100) × (0.85 + 0.15 × awareness). Real airlines: network
  64, low-cost 56, regional 60, charter 56 (modelled — no open ratings data exists).
- **Balance check** (A320neo from VIE, 14×/week, July, −15 % fares): two-class (euro business) ≈ old model's results
  (LHR +10 % vs +9 %), single class 30″ a few points lower, dense 28″ lower still (loses business travellers to rivals'
  business class). Long-haul point-to-point stays loss-making without hub transfer traffic (Phase 7), but premium
  cabins cut losses by more than half compared with all-economy.

## Buying, ordering and selling aircraft (Phase 4.1, 2026-10-28)
All **modelled** from public news reporting; manufacturers' order-and-delivery files are not reused (their terms
forbid it). Code: `src/data/factory.ts`, `src/engine/fleet.ts`.
- **New prices:** list price × typical share actually paid (narrow-bodies 50 %, wide-bodies 48 %, regional jets 55 %,
  turboprops 70 %); 1 % extra discount per additional aircraft in an order, max 8 %.
- **Backlogs** (years from an order in 2026 to the first free slot): A320neo family 6.5, 737 MAX 5.5, A220 4, A330neo 3,
  A350 4, 787 / 777-9 5, E-Jets E2/E175 2.5, ATR 2, small turboprops 1–1.5. At most 2 aircraft of a type per month for
  one airline (wide-bodies 1). Not orderable for a European startup: Superjet, MC-21, Tu-204 (sanctions); C919, C909,
  MA60 (so far only Chinese customers); types no longer built; freighters (cargo comes in Phase 11).
- **Payments:** 1 % deposit on signing, 6 × 5 % pre-delivery payments at 24/18/12/9/6/3 months before delivery,
  69 % on delivery (typical structure reported for Airbus/Boeing contracts).
- **Market values:** new price × 0.93^age; after production ends a further × 0.96 per year; never below the parts
  value (6 % of the new price). Selling pays market value − 3 % broker's fee; scrapping pays the parts value.
- **Accounting:** owned aircraft are written off straight-line to 10 % of the new value over 25 years of life
  (at least 5 years for old aircraft); the gain/loss against book value on a sale goes to "Aircraft sales". Lost
  deposits of cancelled orders and early-return fees too.
- **Leases:** a reminder 90 days before the end; at the end the aircraft goes back and the deposit is refunded.
  Extensions in the last 24 months at today's market rent for the aircraft's age; early return costs 60 % of the
  rent still owed. 15 % of lease offers are new aircraft from lessors' own orders (arriving in 6–30 months).
- **Used aircraft for sale:** 24 offers, refreshed monthly, priced at market value × 0.92–1.08, up to 25 years old,
  arriving in 20–75 days.

## Maintenance checks, failures and hangars (Phase 4.2, 2026-10-28)
All values in `src/data/maintenance.ts` are **modelled** (typed in by hand, nothing copied or downloaded):
- **Check programme** (modern practice, B-checks merged into A-checks): A-check every 500 (turboprop) / 750 (jets) /
  1,000 (wide-body) flight hours or 90–120 days, overnight (6–12 h); C-check every 24 months (turboprop, regional) or
  36 months (narrow/wide-body) or 5,000–12,000 flight hours, 6–14 days; heavy "D" structural check every 10–12 years,
  21–45 days. Based on the intervals manufacturers publish in their maintenance planning documents (e.g. A320 family
  750 FH A-check, 36-month/7,500 FH C-check, 6/12-year structural checks; 787/A350 12-year heavy checks) as widely
  reported in the MRO trade press.
- **Prices** (MRO, European, mid-life aircraft): A-check $6k–40k, C-check $180k–1.2M, D-check $0.6–4.5M by category,
  scaled by MTOW^0.6 and +2/2.5/4 % per year of age; hangar days +1.5 %/year. Calibrated so that checks are about
  **20 % of the BTS Form 41 hourly maintenance cost** (`CHECK_SHARE`): the player's hourly maintenance is lowered by that
  share, and checks are paid one by one (test `maintenance.test.ts`). AI airlines keep the full hourly cost.
- **Accounting:** A-checks are an expense of the day; C/D-checks are capitalised and written off until the same check is
  due again (IFRS practice for heavy maintenance), at most until a lease ends.
- **Maintenance reserves** (leases): per flight hour = expected C- and D-check cost over a typical aircraft's flying
  (A320neo ≈ $90/FH ≈ $20k a month, in the range of published lease terms). The lessor pays heavy checks from them; a
  new lease starts with the lessor's contribution for the D-cycle used before. Unused reserves stay with the lessor.
- **Short notice:** an MRO slot booked < 30 days ahead costs +25 % (modelled).
- **Own hangar:** narrow-body (2 bays) $25M, wide-body (2 bays) $60M, 18 months to build, running $6k/$11k a day,
  checks there cost 55 % of the MRO price, written off over 30 years (modelled from public airport/MRO hangar project
  costs in the news).
- **Technical failures:** 0.08 % of departures for a mid-life aircraft (≈ 99.9 % technical dispatch reliability for
  cancellations), +5 % per year of age over 8 years, up to +75 % close to the next C-check, ×1.6 in a type's first three
  years. Duration: 65 % 3–10 h, 30 % 18–40 h, 5 % 3–5 days. Repair $6k–50k per day of grounding.
- **Passenger rights:** EU Regulation 261/2004 (EU law, free to use): €250/€400/€600 by distance for cancelled flights
  leaving the EU/EEA/CH/UK or flown by an airline from there; technical problems are no extraordinary circumstance
  (CJEU C-549/07 Wallentin-Hermann, 2008). Modelled: 50 % of passengers claim; care €40 (short) / €120 (overnight).

## Liveries (Phase 4.3, 2026-10-28)
- **Aircraft side views** (`src/ui/livery/AircraftSide.tsx`) are our own parametric SVG drawings: one frame for every
  type, shaped by a few hand-entered features (fuselage proportion, engines under the wing / at the rear / propellers,
  T-tail, four engines, 747 hump, A380 double deck). Not traced from photos or drawings.
- **Logo symbols** (`src/ui/livery/symbols.ts`) are simple original shapes. Players may upload their own picture; the
  game tells them to use only pictures they made or may use, and shrinks it to ≤ 160 px (WebP/PNG, ≤ 80 KB in the save).
- **Fonts** for titles: IBM Plex Sans/Mono (SIL OFL, already bundled) and the device's serif font.
- **Repaint costs** (modelled from MRO trade press): turboprop ≈ $60k / 4 days, regional $100k / 5 days, narrow-body
  $200k / 7 days, wide-body ≈ $400k / 10 days (larger wide-bodies more); written off over 6 years like a cabin refit.
  Repainting during a C/D-check needs no extra days.
- Real airlines keep their approximated colours (no logos), as decided in §5b.

## Historical aircraft and prices (Phase 4.4, 2026-10-28)
- **US consumer price index (CPI-U, series CUUR0000SA0)** — US Bureau of Labor Statistics, **public domain** (US
  government work). Downloaded 2026-10-28 with the public API v1 (`npm run data:cpi` → `tools/download-cpi.ts`,
  `tools/build-cpi.ts`) → `src/data/generated/cpi.json`: annual averages 1913–2026 (2026 = January–September,
  marked partial; October 2025 was never published because of the US government shutdown, so 2025 averages 11 months).
  Used by `src/data/inflation.ts` to convert prices between years.
- **Historical aircraft types** (`src/data/aircraftHistorical.ts`, 62 types from the DC-3 to the A340-500): rounded
  specs (seats, range, speed, MTOW, take-off run, engines, service and production years) typed in by hand from
  manufacturers' published figures and encyclopedic sources (facts, not copied tables); **retirement years from passenger
  service are approximate**. List prices and lease rates are stored in the money of `priceYear` (prices reported at the
  time, e.g. 707-120 ≈ $5.5M in 1958); fuel burn and maintenance per block hour are modelled in 2025 dollars.
  Soviet types have no market price: values are modelled equivalents.
- Today's types keep their prices as 2025 dollars (`PRICE_YEAR`).

## How to refresh the data
```bash
export PATH=~/.local/node/bin:$PATH
npm run data:download   # raw files → tools/raw/ (not in git)
npm run data:build      # → src/data/generated/*.json (in git)
npm test                # sanity checks in src/data/world.test.ts
```

## Known simplifications (to improve later)
- **Catchment** (shown in the airport panel) = sum of all city populations within 100 km; neighbouring airports
  share people. The demand model uses **market population** instead, where every person is counted once.
- **Airport selection**: OurAirports `scheduled_service = yes` and type large/medium/small (heliports, seaplane bases
  and closed airports dropped) → 4,135 airports.
- **Time zone** via nearest city: correct for virtually all airports; a few near time-zone borders could be off.
- Wealth is **today's** value; historical start years (Phase 5) will need historical series.
- **Aircraft values** are rounded and were entered from manufacturer published figures, not yet cross-checked document
  by document. Ranges are "typical payload" figures; real range depends on payload and winds (modelled in Phase 4).
- **Lease rates** are rough market estimates; there is no free public database of lease rates.
- **Eurostat route totals** are from summer 2024 (the newest full season published); they are labelled `S24` and will
  be replaced when newer months appear. Czechia's table (avia_par_cz) was not available. Routes are all airlines together.
- **Wikipedia networks** reflect the articles at download time (a mix of the current season and announced routes);
  some routes miss the other airlines that fly them, so the split of Eurostat totals over-allocates there
  (e.g. VIE–BER for Austrian). See `docs/validation/real-airlines.md` for the comparison per airline.
- **Registers**: the FAA lists owners, not operators, so leased aircraft (≈ 2,000 airliners under trust banks) are not
  matched; register counts also include stored aircraft, so they can exceed Wikipedia's "in service" numbers.
- **Fleet tables**: rows without an aircraft name (extra cabin versions, extra orders) are skipped, so some orders
  are missing (e.g. 10 of Austrian's 787-9 orders). Light aircraft, helicopters and business jets are ignored.
- **Wikidata airlines**: hubs are often incomplete (e.g. Ryanair only lists Stansted) and business models are mostly
  missing; both come from Wikipedia articles in the next step. A few cargo airlines not tagged as such (Atlas Air,
  Cargolux, Kalitta) remain until airlines without passenger routes are dropped.
- **Exchange rates** are fixed at the ECB rates of 2026-10-26 for the whole game until Phase 5.
- **Book currency:** only currencies the ECB publishes are used; airlines in other countries keep books in USD.
