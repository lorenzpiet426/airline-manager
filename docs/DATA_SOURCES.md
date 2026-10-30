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
| Jet fuel price | [US EIA](https://www.eia.gov/) US Gulf Coast kerosene-type jet fuel spot price, weekly (series `EER_EPJK_PF4_RGC_DPG`), `src/data/fuel.ts` | Public domain | Fuel price week by week from Dec 2025 to 16 Oct 2026 (+ $0.30/gal into-plane); simulated after that (Phase 5.1) | **in use** (downloaded 2026-10-27) |
| Jet fuel history | US EIA monthly history pages (`tools/download-history.ts` → `build-history.ts` → `fuel-history.json`): Gulf Coast spot `EER_EPJK_PF4_RGC_DPG` from 1990-04; refiner wholesale/resale `EMA_EPJK_PWG_NUS_DPG` from 1975-07, × 0.936 (spot/resale ratio 1990–94); before: crude oil first purchase price `F000000__3` (monthly from 1974, yearly before) × 0.0374 (jet/crude ratio Jul 1975–Jun 1976) | Public domain | Fuel price 1970–2025 (money of that time); 1970–mid-1975 **modelled** | **in use** (downloaded 2026-10-28; 1970: $0.12/gal, 1980: $0.81, July 2008: $3.89) |
| Exchange rates | [ECB](https://www.ecb.europa.eu/) euro reference rates (`eurofxref-daily.xml`), `src/data/currencies.ts` | Free reuse with attribution | Converting USD leases into the airline's book currency | **in use** (rates of 2026-10-26; simulated after the real data, Phase 5.1) |
| Exchange rate history | [Federal Reserve H.10](https://www.federalreserve.gov/releases/h10/hist/) daily rates since 1971 (31 currencies incl. ATS, DEM, FRF, ITL, NLG, BEF, ESP, PTE, GRD, IEP until the euro), monthly averages; other currencies and gaps from World Bank `PA.NUS.FCRF` yearly averages (interpolated); old euro currencies after the changeover = euro × fixed rate (`src/data/currencyHistory.ts`, Council Regulations); euro before 1999 = DEM ÷ 1.95583 ("synthetic euro"). → `fx-history.json` (units per USD, monthly 1970–2025, 50 currencies) | Public domain / CC BY 4.0 | History screen; book currency in historical games (5.3) | **in use** (downloaded 2026-10-28). Currencies re-based later (TRY 2005, PLN 1995, BRL 1994, ILS 1985, RON 2005, MXN 1993, ISK 1981, BGN 1999) are in today's units; 5.3 converts to the old units. CZK before 1993 = first known value |
| Economy history | World Bank WDI `SP.POP.TOTL`, `NY.GDP.PCAP.KD` (constant 2015 USD), `IS.AIR.PSGR` 1960–2024 → `economy-history.json` | CC BY 4.0 | Demand index per country and year (see below) | **in use** (downloaded 2026-10-28; 206 countries) |
| Currencies by country | Hand-made list of which country uses which ECB-listed currency (euro area incl. Bulgaria since 2026) | Facts only | Airline book currency (others keep books in USD) | **in use** |
| Airline economics | Annual reports: Lufthansa Group (Austrian Airlines segment), Ryanair, Wizz Air; IATA industry outlook | Public reports; facts only | Calibrate CASK, RASK, margins | planned |
| Historical events | Hand-curated timeline `src/data/history.ts`: 153 events 1970–2026, each with its English Wikipedia article as source (facts only; our own wording) | Facts (Wikipedia CC BY-SA cited per event) | Closures, flight bans, demand crises, recessions, milestones | **in use** (2026-10-28; strengths modelled) |
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

## World events and economy (Phase 5.1, 2026-10-28)
All **modelled** (`src/engine/worldEvents.ts`); no new dataset. Before `REAL_DATA_END` (24 Oct 2026, after the last EIA
fuel week and the ECB rates) the game uses the real data and real events (Phase 5.2) plus small random ones.
- **Traffic growth** 3 %/year (IATA/ICAO long-term forecasts of ~3–4 %); competitors' capacity grows alike.
- **Jet fuel** after the real data: log mean reversion to $2.40/gal (2026 dollars, +2.5 %/year inflation), half-life ≈ 8
  months, volatility ≈ 35 %/year (typical of jet fuel since 2000); fuel shocks raise the target by 40–90 % for 2–8 months.
  Fares follow fuel by 35 % (unchanged from Phase 1.4).
- **Exchange rates** move monthly: EUR/USD ≈ 7.5 %/year volatility with mean reversion; USD pegs (HKD, AED, SAR, QAR…) and
  EUR pegs (DKK…) hold; higher volatility and drift for TRY, ARS, BRL, ZAR, INR (their long-run depreciation).
- **Event rates** (per year): world recession 0.05 (−10…−18 % demand, business ×1.4), continental recession 0.2 in total;
  fuel shock 0.1; disease outbreak 0.05 (−10…−30 %, international ×2); severe pandemic 0.012 (−75…−92 % international,
  18–36 months; COVID-19 cut world traffic ~60–66 % in 2020); Icelandic ash 0.06 (2–8 days, UK/Ireland + random
  north-western Europe; 2010: ~100,000 flights cancelled in 6 days), Etna 0.4, Agung/Bali 0.25, Andes 0.05; airspace
  closure 0.04 (from countries with closures in the 2010s–2020s, neutral wording); ATC strikes France 4, Italy 1.5, Greece,
  Belgium 0.5, Spain 0.3 (30–60 % of flights, 1–2 days); German airport strikes 1.5; London 0.5; Helsinki 0.5; winter
  storms 3 per winter in Europe, North America and North-East Asia; hurricanes 2 (Aug–Oct, Caribbean/Gulf); typhoons 3
  (Jul–Oct, East Asia). Rates are rounded from news archives of the last 20 years.
- **Passenger care** for cancelled flights under EU 261 Art. 9 (meals, hotels: €40 / €120 per passenger); no
  compensation for extraordinary circumstances (weather, ATC strikes, volcanic ash, security; Art. 5(3)).

## Real history since 1970 (Phase 5.2, 2026-10-28)
- **Demand index** per country and year (relative to 2024 = 1): (population ratio) × (GDP per person ratio)^1.10 ×
  propensity(year). The income elasticity 1.10 is the best fit of country traffic (World Bank passengers carried, by
  airline registration) in normal years; the **propensity** (cheaper fares, liberalisation, habits) is fitted so the
  traffic-weighted world model matches the World Bank world total in normal years (local linear fit ±4 years), and is
  flat from 2019 (crisis years 1974–75, 1980–82, 1991, 2001–03, 2008–09, 2020–24 are bridged so their dips come only
  from the event timeline). Check: model/real world traffic (2019 = 1) 1970 0.07/0.07 · 1980 0.15/0.14 · 1990 0.24/0.23
  · 2000 0.37/0.38 · 2010 0.59/0.60. Demand on a route = √(index A × index B); competitors' frequencies scale alike.
- **Events**: 153 real events (`src/data/history.ts`) with where, when, strength (modelled) and a Wikipedia source;
  new kinds *crisis* (travellers stay away; international ×1, domestic ×0.6), *flightBan* (only flights to the
  `pairWith` countries, e.g. Russia ↔ EU/UK/US/Canada since 2022), *disruption* (airport closed by an attack, drone,
  fire, protest, flood), *milestone* (no effect). Profiles over time for COVID-19 (calibrated: a 40 % international /
  60 % domestic mix gives 2020 ≈ 0.43, 2021 ≈ 0.52, 2022 ≈ 0.77 of 2019; real 0.40 / 0.51 / 0.72), SARS, 9/11 and
  others. Recession strengths only add the drop in travel beyond the GDP data (mostly business travel).
- **Events still going on in October 2026** (Ukraine, Russia ban, Belarus ban, Libya, Yemen, Afghanistan, Sudan, the 2026
  Iran war oil shock) end at a per-game random date 3 months to 3 years after the real data; the game says "no end in
  sight". The 2026 Iran war (from 28 Feb 2026: Gulf airspace closures, Qatar's staged reopening on 7 Mar / 21 Apr,
  ceasefire 8 Apr, Iran flights from 1 Jul) is from news reports; the shares of cancellations in the UAE/Oman/Saudi
  Arabia and the demand drop are estimates.
- **Random events in the real past**: only the small kinds nobody records one by one (ATC strikes, airport strikes —
  German multi-airport strikes from 2012 —, winter storms, hurricanes, typhoons, Etna) at their 5.1 rates.
- Ukrainian airports are not in today's airport data (no scheduled service since 2022), so Ukrainian closures only matter
  once historical airports exist (5.3).

## Historical start years (Phase 5.3, 2026-10-29)
- **Airports per year** (`src/data/generated/airport-history.json`, built by `tools/build-airport-history.ts`):
  - **Replaced airports** (12, dates from each airport's Wikipedia article): before the move, today's airport is shown
    as the old one. Location, name and runways come from OurAirports' closed airports (public domain). Fornebu's and
    Stapleton's runways are hand-entered from Wikipedia because OurAirports has none. The airports: Kai Tak → HKG
    1998, Munich-Riem → MUC 1992, Ellinikon → ATH 2001, Fornebu → OSL 1998, Stapleton → DEN 1995, Atatürk → IST 2019,
    Tegel → BER 2020, HAL → BLR 2008, Begumpet → HYD 2008, Paya Lebar → SIN 1981, old Riyadh → RUH 1983, and
    Nicosia (closed July 1974) → Larnaca (Feb 1975).
  - **Closed airports with a successor**: Tempelhof (until 30 Oct 2008) and Schönefeld (until 25 Oct 2020). On the day
    they close, the player's hub, routes and hangars there move to BER.
  - **Opening dates** of today's airports: hand-checked dates for 21 airports first, then Wikidata (CC0: official
    opening P1619, else inception P571). An airport opened after 1970 is hidden before its opening day only when another
    airport in the same country within 60 km had the flights instead (104 airports, e.g. DFW → Love Field, CDG → Orly,
    NRT → Haneda, ICN → Gimpo). The other 454 dates are treated as relocations of an airport with the same code and
    ignored; 7 such cases are listed in the script by hand.
- **Modelled carriers** (real airlines of past years come in Phase 6), rebuilt for every game year from today's
  networks:
  - Each country's (state's) network and regional airlines become its national carrier. Former states get their own
    carriers: the Soviet Union until 26 Dec 1991, Yugoslavia, Czechoslovakia until 1993, East and West Germany until
    3 Oct 1990.
  - Charter airlines become the country's charter airline.
  - Low-cost airlines become a low-cost carrier where that model existed: USA from 1979, Europe from 1995,
    Oceania 2000, Latin America 2001, Asia 2002, Africa 2004, then a growing share over 15 years.
  - Before that, a low-cost route survives only as a holiday charter: one end in a southern holiday country, flown
    by the charter airline of the travellers' country. Its other routes didn't exist yet.
  - Planned economies (the Soviet Union until 1992, the Eastern bloc and China until 1990) have one state airline and
    no charter or low-cost airlines.
  - A country whose flag carrier no longer exists (e.g. Czech Airlines) gets its biggest airline of today as a
    stand-in.
  - Routes too thin for the year's economy are left out:
    - routes with official numbers: fewer than 2 flights a week at today's frequency × the year's demand index;
    - routes without official numbers: by airport size.
  - Modelled carriers fly the most common passenger type of the year that has the range.
- **Money of the time**:
  - Exchange rates follow the real monthly history (Phase 5.2) until the real data ends.
  - Books are kept in the hub country's currency of the time: legacy euro currencies until their changeover date,
    then the euro at the fixed rate.
  - Re-based currencies use their old units with the official factors: TRL ÷ 10⁶ 2005, PLZ ÷ 10⁴ 1995, ROL ÷ 10⁴
    2005, MXP ÷ 1,000 1993, BGL ÷ 1,000 1999, ISJ ÷ 100 1981, Israeli pound and old shekel.
  - In countries whose money wasn't usable, the books are in US dollars: planned economies before 1990, new states
    before their own currency, Brazil before the real (1994).
  - At a changeover, the airline restates cash, assets and all past accounts at the fixed rate.
- **Prices**: the engine's prices are 2025 dollars.
  - In a historical year, aircraft, checks, refits, repaints, hangars and compensation are multiplied by the US CPI
    ratio (BLS).
  - Fares are multiplied by the CPI ratio × a real fare level: 4.4 in 1970, 4.2 (1975), 3.6 (1980), 3.2 (1985), 2.9
    (1990), 2.6 (1995), 2.1 (2000), 1.65 (2005), 1.3 (2010), 1.05 (2015), 1.0 from 2019 (changed in 6.4, before:
    3.0 / 2.5 / 2.0 / 1.6 / 1.3 / 1.15 for 1985–2010; IATA 2016: real return fares 61 % lower than in 1995). This is
    modelled from:
    - IATA: real yields fell nearly 6× per tonne-km since 1970;
    - ICAO's world passenger yield: roughly 7–8 US cents per passenger-km in the mid-1970s vs 8–9 in 2019, nominal;
    - A4A/DOT: US real fares about 40 % lower in 2015 than in 1979.
  - Crew, airport, handling, navigation, sales, service and overhead costs follow the real fare level fully (6.4;
    before: to the power 0.8). Airlines of the 1970s needed far more staff per aircraft (Austrian 1975: ≈ 2,500
    employees for 11 aircraft; 2025: ≈ 6,000 for 67), so their own costs per seat fell about as fast as fares.
  - Fuel is the real then-year price; maintenance per hour comes from each aircraft type.
  - Check: a Vienna startup in its first half year, as a weekly margin:

    | Year | Aircraft | Margin |
    |---|---|---|
    | 1975 | DC-9 | −2 % |
    | 1985 | 737-300 | −5 % |
    | 1995 | A320 | −22 % |
    | 2005 | A320 | −37 % |
    | 2026 | A320, same plan as 2005 | −26 % |

  - New aircraft: discounts grew from about 12 % (1970s) to today's ~50 %. Order waits were about 2 years before
    2015.
  - Lease rents in historical years ≈ 0.8 % of the aircraft's value a month, + 0.04 % per year of age.
  - Lessors appear with their real years of business (ILFC 1973–2014, GPA 1975–1993, GECAS 1993–2021 …). Before 1990,
    other airlines also sublease.
  - Soviet types are neither sold nor leased to Western startups before 1992.
- **Regulated fares**: before deregulation the player's fares may only differ ±10 % from the market fare, and AI
  airlines don't start price wars. Fares became free on these dates:
  - US domestic: 24 Oct 1978;
  - EU single market: 1993; EEA members 1994; Switzerland 2002; later members on joining;
  - domestic markets of other big countries: their reform years (Wikipedia);
  - everything else from 1995 (modelled).
- **EU 261** compensation only from 17 Feb 2005; care for passengers (meals, hotels) always.
- **Real clock** only for games starting today.

## Real airlines calibrated, transfer passengers (Phase 6.1, 2026-10-29)

**Why:** before 6.1, the real airlines flying their real networks filled only 16–34 % of their seats and lost 30 %
(summer) to 80 % (winter) of their revenue. Austrian, Lufthansa, Ryanair and Wizz Air all lost money. Causes found:

- Transfer passengers were missing.
- Every route used the airline's most common aircraft.
- The summer schedule ran all year.
- Thin modelled routes got far too many flights.
- Low-cost cost structures were missing.
- One-stop connections were too attractive.

**Calibration targets** (facts from published reports, used only to check the totals):

| Airline | Real figure | Source |
|---|---|---|
| Austrian Airlines 2024 | 14.6 m passengers, load factor 81.3 %, revenue €2,457 m, adjusted EBIT €76 m (3.1 %) | [Lufthansa Group annual report 2024, Austrian segment](https://report.lufthansagroup.com/2024/annual-report/en/combined-management-report/business-segments/passenger-airlines-business-segment/austrian-airlines/), [Austrian press release](https://www.austrianairlines.ag/en/?p=9126) |
| Vienna Airport 2024 | 31.7 m passengers, 6.76 m transfer passengers (≈ 46 % of Austrian's passengers, as Austrian carries almost all of them) | [Flughafen Wien traffic results 2024](https://www.viennaairport.com/jart/prj3/va/uploads/data-uploads/IR/2025/PAX_24_Outlook_25_EN.pdf) |
| Ryanair FY25 (Apr 2024–Mar 2025) | 200 m passengers, load factor 94 %, revenue €13.95 bn, operating costs €12.39 bn (≈ 11 % margin) | [Ryanair FY25 results](https://investor.ryanair.com/wp-content/uploads/2025/05/FY25-Ryanair-Results.pdf) |

**Model changes:**

- **Transfer passengers** (`src/engine/transfers.ts`):
  - For every pair of destinations of a network airline (`legacy`) at its hub, the gravity-model travellers between them connect there if the detour is small. The detour is free up to 15 % longer than flying direct; nobody connects from 80 % longer.
  - The share is 50 % of all such travellers when no non-stop flight exists, 8 % when one does.
  - That share is split with every other hub that connects the same pair, weighted by each hub's detour.
  - Pairs closer than 300 km don't count (they go by train or car).
  - Legs flown less than daily connect fewer passengers (× √(weekly/7)).
  - Long journeys count more (× (km/2000)^1.1, up to × 6): the gravity model was fitted on short routes.
  - Scaled by 0.07, so Austrian at Vienna carries ≈ 60 transfer passengers per flight. Real: ≈ 118 passengers per flight (Eurostat) × 46 %.
  - Transfer passengers pay their share of the through fare by distance flown (prorate), usually 65–75 % of a local fare.
  - They only fly the airline's own flights.
  - Low-cost and charter airlines sell no connections.
  - The player connects passengers at their own hub with the same model. A few European routes give only a handful a week; it is the breadth of a network that brings them.
- **Measured demand:** the passengers Eurostat measured on a route are now split into transfer passengers (those the real hub airlines' networks would carry) and local travellers.
  - Local travellers are what remains, at least 45 % of the measured passengers.
  - They are multiplied by 1.15, because the choice model loses some travellers to price, connections and full flights.
  - Before 6.1 the local part was a flat 75 % of the measured passengers.
- **One-stop connections via other hubs** appeal half as much as a non-stop flight at the same price. With full appeal, a route with one daily non-stop lost half its travellers.
- **Long-haul travellers** have wider time windows (business ±3 h, leisure ±6 h): they plan around the few flights there are.
- **Aircraft size:** an AI airline uses the type in its fleet closest to the average seats per flight Eurostat measured on the route. Before, it always used its most common type.
- **Winter schedule:** the frequencies in the data are the summer schedule (S24). In other months airlines fly (season ÷ 1.12)^0.8 of them, at most 15 % more in the peak. Frequencies from the demand model are now summer frequencies too.
- **Thin routes:** a route listed on Wikipedia that touches an airport Eurostat measures, but has no Eurostat flights, didn't fly in summer 2024. It is a newer route, a winter-only route or an outdated entry, and gets at most 3 flights a week (`modelled`). Before, Ryanair and Wizz Air had 30–60 % more flights than in reality.
- **Low-cost fares and costs:**
  - Fares are 60 % of the market fare (was 75 %).
  - Cost profile per business model: low-cost airlines pay 50 % airport fees, 60 % handling and maintenance, 20 % distribution and 30 % in-flight service. They use secondary airports, discounts, their own handling, young fleets and their own website.
  - Charter airlines pay 50 % distribution and 85 % handling.
  - This applies to the AI airlines. Business models for the player come in Phase 11.

**Result** (one year of 2025 conditions, real networks, before overheads; `src/engine/calibration.test.ts` keeps it in range):

| Airline | Load factor | Revenue per passenger | Margin | Real |
|---|---|---|---|---|
| Austrian | 0.62 | $176 | +6 % (≈ +3 % after overheads) | LF 0.81, EBIT 3.1 %, 14.6 m pax (model 14.1 m) |
| Lufthansa | 0.81 | $250 | +10 % | LF ≈ 0.82 |
| British Airways | 0.72 | $217 | 0 % | — (UK routes not in Eurostat, so long-haul frequencies are modelled) |
| Ryanair | 0.83 | $86 | +14 % | LF 0.94, ≈ 11 %, 200 m pax (model 203 m) |
| Wizz Air | 0.80 | $85 | +14 % | LF 0.91, $86 revenue per pax |
| easyJet | 0.88 | $90 | +15 % | LF ≈ 0.90 |

Months follow reality: Austrian loses money in winter (January −1 %) and earns in summer (+9 %). Austrian's load factor
is too low because the model gives it slightly larger aircraft than it really flies (175 seats per flight vs ≈ 150).
Its revenue, passengers and margin match.

**Effect on the player:** a Vienna startup does a little better than before, but still loses money with a small
network (the real airlines now fill their planes as in reality, so a newcomer must win passengers from them).

## Austrian Airlines takeover (Phase 6.2, 2026-10-29)

**From open data:**

- **Fleet:** the 68 aircraft in the Austro Control register with operator Austrian Airlines AG (registration and type, tag `official`; see "Registers" above).
- **Seats per type:** Wikipedia fleet table.
- **Routes from Vienna and weekly flights:** networks.json (Wikipedia destinations, Eurostat S24 totals).
- **Aircraft size per route:** Eurostat seats per flight.
- **Colours:** the hand-entered colour pair.

**Modelled** (`src/data/takeovers.ts`), because Austrian doesn't publish these per aircraft:

- **Build years:** spread over each type's delivery years at Austrian (A320 1999–2016, A320neo 2017–2024, A321 1998–2008, 767 1991–2004, 777 1997–2007, 787-9 2018–2023, E195 2008–2012). The register file used has no build years.
- **Ownership:**
  - A320ceo, A321 and the widebodies except the 787s are owned, in the books at today's market value.
  - The A320neos and 787-9s are leased from "Lufthansa Group" (group allocations).
  - The E195s are leased with leases ending 7–20 months after the start. Austrian retires them by 2028 ([reisetopia](https://reisetopia.de/news/austrian-airlines-erneuert-europaflotte/)).
- **Coming aircraft:** 11 A320neo + 6 A321neo (Wikipedia fleet table "orders") arrive as group leases, one a month from two months after the start. Reports differ on the exact number (17 or 22, [aerointernational](https://www.aerointernational.de/?p=345720)).
- **Cash:** €350 m, about 15 % of the 2024 revenue of €2,457 m. Austrian's liquidity sits in the Lufthansa Group pool and its own balance sheet isn't published.
- **Reputation:** network-airline level (64), with everybody knowing the brand.
- **Timetable** (real timetables may not be copied):
  - Each route's summer frequency is scaled to the season (`capacitySeason`).
  - It is split into daily round trips plus one pair on the remaining days.
  - Long routes are placed first: widebodies from 4,500 km, or where Eurostat measures more than 230 seats per flight. Long-haul departures leave in the usual banks (Asia 13:30, America 10:45).
  - Then each route's first, second … flight goes to the aircraft that is free earliest. That aircraft must be closest in size to the measured seats, and the route's own flights are kept at least 2½ hours apart where possible.
  - Every pair passes the normal timetable checks.
- **Winter:** Wikipedia's "seasonal" label doesn't say which season, so only seasonal routes to smaller airports in very touristy countries (more than 1.5 tourist arrivals per inhabitant, outside the tropics: Greek islands, Croatian coast …) rest from 25 October to 25 March.
- **Not taken over:** six Austrian routes that don't start in Vienna (from Innsbruck and Klagenfurt), because all routes start at the hub until Phase 7.
- **Lufthansa Group partners:**
  - Partners are every airline with `parent` = "Lufthansa Group" in Wikidata (Lufthansa, SWISS, Brussels, Eurowings, CityLine, Air Dolomiti, Discover, SunExpress), their subsidiaries (Edelweiss), plus Lufthansa City Airlines and ITA Airways.
  - They never react to the player's prices or timetable, never enter the player's routes and don't open new routes on them.
  - Their flights into Vienna feed transfer passengers onto the player's flights. In the transfer model their spokes count as connections, and only the player's leg earns.

**Result (first weeks, November 2026):**

| | Model | Real |
|---|---|---|
| Revenue | ≈ €46 m a week | ≈ €47 m a week on average over the year |
| Passengers | ≈ 220,000 a week, ≈ 40 % transfer | ≈ 1 m a month in November |
| CASK | 8.2 € cents | ≈ 8.3 |
| Margin after overheads | November ≈ +1 %, December ≈ −2 % (with the high 2026 fuel price) | Q4 ≈ break-even |

`src/engine/takeover.test.ts` keeps it in range.

## Real airlines of past years (Phase 6.3, 2026-10-29)
Owner decisions: closed airlines too, routes from hubs + demand, real types per year, real founding/closing dates.

**Data** (`npm run data:airlines:history` → `src/data/generated/airline-history.json`, CC BY-SA 4.0):
- **Wikidata (CC0)**, downloaded 2026-10-29 (`tools/download-airlines-history.ts`): passenger airlines with a closing
  date (P576) from 1970 on, an ICAO or IATA code and ≥ 3 Wikipedia language versions — name, codes, country, hubs
  (P113), type, alliance, parent, founding (P571) and closing day with their precision, successor (P1366/P156/P7888).
  Day precision is used as it is; month precision → the 15th; year precision → 1 January (founding) or 1 July
  (closing). Several closing dates → the earliest (flights stop before the company is wound up). Also the founding
  days of today's airlines (from 1960). Result: **1,223 closed airlines** with a hub in the game (275 without one and
  45 cargo/other items left out), 1,351 founding days.
- **English Wikipedia (CC BY-SA 4.0)**: the articles of the closed airlines (infobox hubs/bases, categories for the
  business model, "Fleet" section) and the already downloaded articles of today's airlines. `tools/build-airline-history.ts`
  reads every fleet table with "Introduced/Delivered" and "Retired" columns (rowspans copied down, one span per type,
  counts added up); a closed airline without such a table gets its fleet at closure. Type names → game types with
  `mapHistoricalType` (`tools/aircraft-names.ts`: DC-9, 727, TriStar, Il-62 … before today's names; Convair 880/990 are
  shown as the similar Boeing 720). Result: historical fleets for **814 airlines** (631 closed ones).
- Hand corrections (`FIXES` in the builder, from the airlines' Wikipedia articles): Malév stopped flying on
  3 Feb 2012 (Wikidata: company wound up 2018); Interflug's hub is Schönefeld (Wikidata links today's BER).
- Colours of 44 well-known closed airlines entered by hand (`DEFUNCT_COLORS`, no logos); the others are generated.

**Model** (`src/engine/eraAirlines.ts`, built once per game year, filtered per day):
- An airline flies from its founding to its closing day. Today's airlines without a founding year in Wikidata (160,
  mostly young ones) are assumed founded when the types they fly today entered service, not before 1995.
- **Fleet of the year**: the fleet-table spans covering that year (no last year: at most 30 years, not after closing),
  only types in service that year; today's types without a historical row from their entry into service. Aircraft
  numbers = table total × 0.7 (tables count all aircraft over the years) — estimates, shown as "modelled".
  No table: typical types of the time (`typicalTypeOf`).
- **Network of today's airlines**: today's routes mapped onto the airports of the year, only routes the economy of the
  year could fill (as in 5.3), then shrunk to the size the airline had: × (home demand index)^0.5, young airlines
  × ((years since founding) / 30)^1.2, low-cost airlines × e^−(2024 − year)/6 (Ryanair: 1 route in 1985, 5 in 1995,
  42 in 2005). Hub routes are kept first, then the busiest.
- **Network of closed airlines**: from their real hubs (bases count half) to the destinations flown from there today,
  ranked by the gravity model × the economy of the year; as many as 0.8 routes per aircraft (at least what their fame
  suggests: 0.6 per Wikipedia language version, ≤ 25 without fleet numbers; ≤ 150). Only distances the fleet could fly;
  charter airlines only to holiday countries, regional airlines ≤ 2,500 km; from a hub abroad (Pan Am at Frankfurt or
  Tokyo) only flights back home.
- **Frequencies**: today's measured frequencies don't apply to the past; every airline's weekly flights are its share
  of the market of the time (demand model, scaled by the economy history), so the total on a route stays right.
- **West Berlin** (Tegel, Tempelhof) until 3 Oct 1990: only American, British and French airlines (AI airlines).
- States without any real airline of the year keep a modelled national carrier (Phase 5.3), e.g. Greece before 1987.
- News: founding and closing days of airlines with ≥ 15 Wikipedia language versions, or from the countries of the
  player's hubs (not when the founding day is assumed); not when the AI made the airline fail earlier.

**Checks** (`src/engine/era.test.ts`): 1980 world (Austrian with DC-9s at Vienna, Pan Am, Interflug at Schönefeld,
Aeroflot, no Emirates/easyJet/SWISS/Brussels, every type in service, no Austrian flights to West Berlin); Ryanair and
Emirates growth; Pan Am stops on 4 Dec 1991 (and is in the news), Swissair on 31 Mar 2002, Emirates starts on
25 Mar 1985; the 1975/1985/1995/2005 startup calibration still holds. A simulated year of a 1990 game takes ≈ 4 s
(before: ≈ 2 s with fewer, modelled carriers).

**Known**: networks of the past are modelled (open data has almost no old route lists); fleet counts are rough; some
airports opened later are still in the airport list of earlier years where Wikidata has no opening date (e.g. Beijing
Daxing, Istanbul Sabiha Gökçen); political limits other than West Berlin (Albania, the Iron Curtain's traffic rights) are
not modelled for AI airlines.

## Austrian in past years, partners over time, fictional startups (Phase 6.4, 2026-10-29)
Owner decisions: any start year 1970–2026, Austrian's fleet per year by hand, partners following history, startups at a
realistic rate.

**Austrian's fleet per year** (`fleetHistory` in `src/data/takeovers.ts`): years from Wikipedia's historical fleet table
(EN "Austrian Airlines"), counts where the articles say them (EN/DE "Austrian Airlines", read 2026-10-29: six Viscount
837 from 1960, two HS 748, nine DC-9-32 from 1971, five DC-9-51 from 1975, 13 MD-81 from 1980, four A340 and four A330
until 2007, eleven Boeing 737 until 2013 (from Lauda Air, 2004), five A320 ex Air Berlin 2017, 17 Embraer 195 from 2016,
fifth and sixth 777 in 2014/2018, A320neo and 787-9 from the current fleet table), the other counts modelled (marked
in the file). New aircraft arrive over three years, old ones leave over two; fleets taken over (Lauda Air 2004,
Tyrolean 2015, Air Berlin 2017) at once. Registrations are made up in Austrian's real series (OE-LD… DC-9/MD-80,
OE-LB… A320 family, OE-LP… 777/787 …) because old registers are not open data; all owned. Cash = today's modelled
€350 m × (seats of the year's fleet ÷ today's), in the money of the time.

**Partners over time** (`src/data/alliances.ts`, Wikipedia "Star Alliance" and "Qualiflyer" member tables): Star
Alliance with join/leave days (1997–2014), Qualiflyer 1998–2002 (Austrian 1998 – 25 Mar 2000), Austrian's own group
(Tyrolean from Dec 1997, Lauda Air from Jan 2001), the Lufthansa Group from 3 Sep 2009. Partners are recalculated
every month. Subsidiaries based at the hub fly for the player: when they join (at the takeover or later on their real
date) their aircraft (types the player doesn't fly yet) and Vienna routes become the player's (extra flights on routes
flown already) and they stop flying as AI airlines.

**Timetable**: as in 6.2, plus frequencies of the time (× the economy growth used for all airlines) and a second pass
that gives aircraft below 60 % of their weekly hours extra flights on routes of their kind (up to daily).

**6.3 change found while calibrating**: on measured routes, today's total weekly flights (Eurostat) are now shared by
the airlines flying the route in the year (by their measured frequencies; closed airlines an average share) instead of
an equal split of local demand — that ignored a hub carrier's transfer traffic (Austrian 2005 flew New York twice a
week). Today's networks are cut to the year's size by flights × √distance (long-haul routes were cut first).

**Check: Austrian taken over on 1 January, one simulated year** (no player decisions; real figures from Wikipedia
and annual reports, rounded):

| Year | Aircraft | Routes | Passengers (real) | Margin (real) |
|---|---|---|---|---|
| 1975 | 11 | 34 | 1.0 m (≈ 1 m) | +10.6 % (small profit) |
| 1985 | 22 | 51 | 1.9 m (just over 2 m) | +3.0 % (≈ +3 %) |
| 1995 | 32 | 71 | 3.3 m (≈ 3.5 m) | −7.4 % (around break-even) |
| 2005 | 84 incl. Tyrolean/Lauda | 106 | 5.8 m (group ≈ 9 m incl. charter) | −7.2 % (small losses 2004–2008) |

Load factors stay low (46–57 % against ≈ 65–75 % real): the generated timetable flies more than the demand model
fills. `src/engine/takeover.test.ts` keeps 1985 in range.

**Fictional startups** (`src/engine/startups.ts`): about 8 a year worldwide where domestic fares are free (USA from
1978, Europe from the 1990s, elsewhere 1995), weighted by people, three times as likely at the player's hub; made-up
names ("Sky Link", "Nova Air" …) and codes no real airline uses, generated colours. Low-cost after the region's low-cost
era (60 %), else regional, charter or small network airlines; 2–4 first routes to the busiest markets from the base with
the fewest airlines. They then follow the normal AI (reviews, growth, entering the player's routes); young ones fail
with 1.4 %/month (≈ 40 % in three years), plus 3 %/month while losing money. Check: 13 founded in 2027–2028, 5 failed;
none in 1975.

## Connections flight by flight (Phase 7.1, 2026-10-29)
Owner decisions: Phase 7 = 7.1 waves → 7.2 slots + curfews → 7.3 gates + lounges → 7.4 bases; connections flight by
flight; slots realistic (IATA Level 3, seasons, 80/20, Heathrow slot trading); real curfews for the top airports.

- **Minimum connecting times** (`MCT_MIN` in `src/engine/transfers.ts`, read 2026-10-29; airports and their airlines
  publish them as facts): Vienna 25 min ([Aviation Week](https://aviationweek.com/vienna-airport), Austrian Airlines),
  Munich 30, Zurich 40, Amsterdam 40 (short-haul), Frankfurt 45 (Lufthansa 60 from 2025), Heathrow 60 (BA T5 60–75),
  Paris CDG 60 ([Business Traveller](https://www.businesstraveller.com/news/beating-the-clock/)). Other airports: large
  60, medium 45. +10 min when a long-haul flight is involved (other pier, passport control).
- **Connection quality**: 1 from the MCT up to 2½ h wait, falling linearly to 0 at 7 h (journeys ≥ 4,000 km: 12 h).
- **The player's hub**: for every pair of destinations E → D the travellers who would connect at the hub (gravity ×
  detour × non-stop share, shared with competing hubs — as in 6.1), but instead of a frequency factor: every arrival
  from E with its best departure to D; the sum of their qualities over the week replaces the weekly frequency
  (7 = full). Passengers are booked on exactly those two flights (per weekday), with the prorated fare per leg. Partners'
  passengers (no timetable known) are spread over the player's flights to that destination. AI airlines keep the
  frequency model (their timetables are generated).
- **Takeover timetables** (`takeover.ts`) now plan five departure waves at the hub (07:00, 10:30, 13:30, 17:00, 20:30
  local), returns landing 30–90 min before the next wave (weighted twice as much as the departure), evening flights
  may night-stop and return for the morning wave.
- **Check, Austrian today, November**: before 7.1 (6.4 code) −0.6 % margin, 856k passengers, 40 % transfer; flight by
  flight without waves −9.8 %, 32 %; with waves and night stops −4.7 %, 814k passengers, 36 % transfer, ≈ 33,000
  connecting passengers a week, average wait 2 h 40. Real Austrian: ≈ break-even in Q4, ≈ 46 % transfer — the generated
  timetable is less tightly banked than the real one; players gain by planning waves. Computing a hub of 124 routes
  takes ≈ 85 ms (cached until the timetable changes, refreshed daily for partners).

## Slots and night curfews (Phase 7.2, 2026-10-29)
**Data** (entered by hand, read 2026-10-29; facts):
- `src/data/slots.ts`: 61 of the ≈ 215 IATA Level 3 (slot-coordinated) airports
  ([IATA](https://iata.org/en/programs/ops-infra/slots/coordinated-airports)): the busiest in Europe, Asia, the Middle
  East and the Americas. `capacity` = declared movements per hour (coordinators' published capacities, rounded, partly
  estimated → modelled); `use` = how full the peak hours are today (estimated from capacity reports; Heathrow 100 %,
  Amsterdam 98 %, Vienna 70 %). Trading allowed in the UK and at the US slot-controlled airports (JFK, LaGuardia,
  Washington National), with the price of a peak daily slot pair in 2016 dollars: Heathrow $60 m (SAS sold a pair for
  $60 m in 2014 ([Business Traveller](https://www.businesstraveller.com/business-travel/sas-sells-heathrow-slots-75-million/)),
  Oman Air paid $75 m in 2016 ([One Mile at a Time](https://onemileatatime.com/oman-air-heathrow-slot/))), others
  estimated (Gatwick $6 m, JFK $25 m, LaGuardia and Washington $10 m …). An hourly demand profile (night 3–10 %, peaks
  07–08 and 17–19) is shared by all airports; at airports over 85 % full the daytime profile flattens out (Heathrow is
  full all day).
- `src/data/curfews.ts`: night rules of 30 airports (Wikipedia "Night flying restrictions" and the airports' articles,
  e.g. Frankfurt 23:00–05:00 since October 2011, Zurich 23:30–06:00 since July 2010, Sydney 23:00–06:00 (Curfew Act
  1995), Paris-Orly 23:30–06:00, Narita 00:00–06:00, London airports' night quota 23:30–06:00), with the year they began
  where known. "ban" = no scheduled take-offs or landings; "quota" = flights allowed with double landing fees (night
  noise charges). The other airports of the world's busiest ≈ 100 have no general night restriction.

**Model** (`src/engine/slots.ts`): slots are weekly series (one movement in one hour of the week, local time) held by the
player per coordinated airport. Existing flights keep theirs (historic rights: old saves on loading, takeovers). A
timetable change takes free slots at once; free = capacity × (1 − use of the year × hour profile) − slots held. Without
them the change is refused (and undone), naming the airport and hours; the player can buy them (trading airports;
price = pair price ÷ 14 × (0.3 + 0.7 × hour profile), CPI from 2016 to the game's year) or ask for them for the next IATA
season (from the last Sunday of March / October): granted where capacity is free, otherwise with 35 % chance for new
entrants (< 5 slots a day at the airport, EU rule) and 10 % for others. Use it or lose it: at the season start, slot series
used less than 80 % of the season's weeks (recorded every Monday) shrink to what was used. Airports fill with the
economy of the year (demand index^0.8 before 2025) and 3 %/year after the real data ends. AI airlines hold no explicit
slots (the `use` stands for them). Curfews: the player's timetable (Detailed and Simple), the takeover's generated
timetables and the AI airlines' generated departures avoid bans.

**Checks** (`src/engine/slots.test.ts`): rules and years (Frankfurt 2005 vs 2015), a Frankfurt arrival after 23:00 refused,
Heathrow full at 08:00 for a newcomer but buyable (≈ $60 m+ a peak pair in today's money), not tradable in Lisbon,
use it or lose it and requests at the season start, IATA season dates.

## Gates and lounges (Phase 7.3, 2026-10-29)
Owner decisions: realistic gate capacity at the hub; own lounges of any size (hub now, bases with 7.4).

**Gates** (`src/engine/hub.ts`, all modelled):
- Gates at an airport: slot-coordinated airports 0.5 × capacity per hour contact gates (jet bridge) and 0.9 × remote
  stands (Vienna 74/h → 37 and 67); others by size (large 25/45, medium 9/16, small 0/5). Free for the player: contact
  × (1 − how full the airport is), stands × (1 − 0.6 × how full); the rest is the other airlines' (Heathrow: no contact
  gate free).
- Need: an aircraft uses a gate from landing until 30 min later and from 60 min before take-off; turnarounds up to 3 h
  keep the gate throughout (longer: towed to parking in between). Peak = most aircraft at once in the week (5-minute
  steps). Flights take contact gates in time order, the others stand remote. New timetables rent the missing remote
  stands automatically (refused when the airport has none left); contact gates are rented in the Hub tab.
- Rent per year (2025 USD, × price level of the year): contact gate $350,000, remote stand $60,000 — standing for
  boarding-bridge and stand charges that European airports bill per use; booked in the "airport" P&L line. Remote stand:
  buses $140 per flight (handling), −3 experience points per passenger, +10 min minimum connecting time.
- Takeovers and older games keep the gates their timetable uses (contact up to 80 % of the hub's contact gates).
  Austrian at Vienna today: 30 contact gates + 11 remote stands, peak 41 aircraft (Monday 06:30), 97 % of turnarounds
  at a contact gate; November margin −5.3 % (−4.7 % before gates, ≈ €10 m rent a year).

**Lounges** (modelled from published lounge projects; a 300-seat flagship lounge ≈ $15–20 m):
- Build per seat $15,000 / $30,000 / $55,000 (standard / premium / flagship), 6 months; running per seat and year
  $4,000 / $7,000 / $12,000 (service line); food per visitor $10 / $18 / $32 instead of the contract lounge fee
  ($30 business, $55 first, part of the service cost per passenger).
- Business and first class passengers leaving the hub rate it +3 / +6 / +9 experience points; crowded (visitors at the
  busiest time ≈ 18 % of a day's departing premium passengers, over the seats): −12 points per 100 % over. Partners'
  lounges at their hubs: +2.
- Austrian takeover: its Vienna lounges (≈ 600 premium seats today, smaller with the fleet in past years).

## Bases (Phase 7.4, 2026-10-29)
Owner decisions: real crew bases; real traffic rules; bases can be second hubs with flight-by-flight connections.

- **Where** (`src/data/aviationMarkets.ts`, Wikipedia "European Common Aviation Area", "Enlargement of the European
  Union", read 2026-10-29): in the airline's own country (the state of the time: West/East Germany, Soviet Union …),
  and for airlines of the single aviation market anywhere in it — full cabotage from 1 April 1997 for the EU-15 and
  Norway/Iceland (EEA), Switzerland from 1 June 2002, the 2004 members from 1 May 2004, Bulgaria and Romania 2007,
  Croatia 1 July 2013, the United Kingdom until 31 December 2020. Other countries: Phase 12 (freedoms of the air).
- **Costs** (modelled): set-up $2 m (station office, crew rooms, recruiting, ground equipment), running $3 m a year
  (station management, crew planning, line maintenance), in the overheads line; crews of stationed aircraft are paid
  at the base country's wage level.
- **Rules**: aircraft are stationed at the hub or a base (they can move while they have no flights); routes start at
  the hub or a base and are flown only by aircraft stationed there; one route per pair of airports. Gates, a lounge,
  connections (7.1–7.3) work at every base like at the hub; the AI treats bases like the hub (home rivals defend them).

## Pilots and cabin crew (Phase 8.1, 2026-10-29)
Owner decisions: real headcounts per base and licence family, a real job market by region and era, managers later (8.3).

- **Hours** (EU Regulation 965/2012, ORO.FTL, read 2026-10-29): at most 900 block hours a year and 100 in 28 days;
  airlines plan about 750 (short-haul) / 800 (long-haul) block hours per pilot and 800 per cabin crew member, plus 10 %
  reserve (sickness, leave, standby) and a 4 % planning buffer. Augmented crews: a third pilot over 9 h block, a fourth
  over 12 h (one captain + first officers; four pilots = two captains).
- **Cabin crew**: EU minimum one per 50 seats (CS-25 / ORO.CC.100); long-haul one per 35 seats, plus extra crew for
  premium cabins (service standard, modelled).
- **Type ratings** (families: A320 incl. neo, 737 NG/MAX, A330/A340/A350 cross-crew, 757/767, E-Jets …): about 7 weeks
  and $35k per pilot; command upgrade 6 weeks and $25k; cabin crew safety course 6 weeks and $5k; hiring takes 6 weeks
  (notice period). Typical figures from airline and training-provider reports (modelled).
- **Pay**: the game's existing crew costs (Austrian level, scaled by the base country's wage level); captain 1.35×, first
  officer 0.65× of the average pilot cost. Severance about 3 months' pay.
- **Job market** (`src/data/crews.ts`, modelled from CAE/Boeing pilot outlooks and the industry's boom and bust years):
  pilots per month at a base by its market population (2–25), plus 1 % of the pilots the airline already employs
  there (big employers, cadet programmes), × the pilot market of the year (surpluses after 1991, 2001, 2008, COVID;
  shortages mid-2000s and from 2023) × pay². 30 % of candidates can start as captains, 40 % already hold the rating;
  cabin crew 4× as many. Attrition 0.5 % a month at market pay, more when pay is low or other airlines are hiring.
- **Shortages** cancel a stable share of that base's and family's flights (care + EU 261 compensation for 50 % of
  passengers who claim, a reputation hit).
- **Calibration**: an A320 flying 13 h a day needs 14 pilots (7 crews); Austrian today ≈ 680–780 pilots and
  ≈ 1,600–1,850 cabin crew (real ≈ 1,000 pilots and ≈ 2,000 cabin crew in the Austrian AOC incl. training and office
  roles); Austrian's November margin −4.0 % with crews (−5.3 % before), steady headcount over 7 months.

## Unions, wage agreements and strikes (Phase 8.2, 2026-10-29)
Owner decisions: rounds of offers, pilot and cabin crew unions per country, real strike culture by country, pay set by
the agreement (extra pay on top allowed).

- **Unions** (`src/data/unions.ts`): real union names for 17 countries (e.g. vida in Austria, Vereinigung Cockpit and
  UFO in Germany, SNPL/SNPNC in France, BALPA/Unite in the UK, ALPA/AFA-CWA in the USA); others "pilots' union".
- **Austrian Airlines**: cockpit and cabin crew (vida) struck in spring 2024; the agreement signed then raises pay by
  19.4 % in three steps and runs until the end of 2026 with a peace obligation (industriemagazin.at, vienna.at, ORF,
  April–June 2024, read 2026-10-29). A takeover today starts with talks for the next agreement.
- **Strike culture** (modelled from labour law and practice, read 2026-10-29): Germany warning strikes after the peace
  obligation, 1–2 days' notice; France 5 days' notice (loi Diard 2012); Italy 10 days, guaranteed flights, no strikes
  27 Jul–5 Sep and 17 Dec–7 Jan (Law 146/1990); Spain/Portugal 10 days with minimum services; UK ballot + 14 days'
  notice (Trade Union Act 2016, from 2017; 7 before); Switzerland peace obligation, almost never; USA Railway Labor Act
  (NMB mediation, 30-day cooling-off), very rare; Austria rare (social partnership). How readily unions strike
  ("militancy") is a modelled number per country.
- **Talks**: agreements run 2 years; talks start 10 weeks before the end; offers every 2 weeks. Demand = last year's
  inflation (US CPI, BLS; 2.5 % after the data ends) + catching up if pay is below the market + a share of profits
  (margin above 3 %) + the pilot market (shortage/surplus) + militancy − mood. The union signs at a hidden minimum
  between inflation and its demand (firmer where strikes are common). Mediation: 3 weeks of peace, proposal halfway,
  members accept 85 %.
- **Strikes** cancel a stable share of the flights from the country's stations (pilots 90 %, cabin crew 75 %; warning
  strikes 40 % of that; minus minimum services). EU 261: own-staff strikes are no extraordinary circumstance (CJEU
  C-28/20 Airhelp v SAS, 23 March 2021): compensation unless announced 14 days ahead; before 2021 only care.
- **Pay**: a raise equal to inflation keeps the pay level; the level feeds salaries, hiring (pay²) and people leaving
  (plus an angry mood). Austrian today: the HR department settles ≈ 3.6 % (pilots) / 3.1 % (cabin) in December 2026.

## Managers (Phase 8.3, 2026-10-29)
Owner decisions: all five departments, generated people, a proposal inbox, judgement by skill.

- **People** (`src/data/managers.ts`): made-up names from common first and last names of the hub's region (no real
  people); skill 1–5 stars (20/35/28/13/4 %), experience, a specialty; three new candidates per department each month.
- **Salaries** (modelled from published pay for airline department heads, vice-president level at a mid-size European
  airline ≈ €150–400k a year): $120k / 165k / 230k / 320k / 450k by skill (± 10 %), × the hub country's wage level and the
  price level of the year. Severance 6 months' salary. Leaving: 0.6 % a month, the 4–5-star ones 1 % more (poached).
- **Judgement**: a manager's estimate of a decision's effect = the model's true effect + an error of 45 / 30 / 20 / 12 /
  6 % (by skill; × 0.65 with a matching specialty) of a typical effect size. Weak managers therefore sometimes choose
  worse options; the true effect (the model's own forecast at the time of the decision) is shown four weeks later.
- **Decisions**: revenue — fares ×0.94…1.06 on 3–7 routes a week (oldest-reviewed first); network — closing routes with
  two months of losses and a poor outlook, opening one route a month for the aircraft with most unused hours (largest
  markets in range, no flight bans, first free time from 06:00, tried on a copy of the game); fleet — lease extensions
  within a year of the end (aircraft's recent route results vs the new rent), idle aircraft (6 weeks) returned or sold;
  maintenance — an own hangar when the yearly saving beats running costs and building cost over its life; HR — crew
  plans and wage offers (the head's guess of the union's minimum).
- **Help without deciding** (modelled): technical failures × (1.1 − 0.05 × skill), recruits × (0.9 + 0.05 × skill),
  lease-extension rent × (1.04 − 0.02 × skill); without a head: unchanged.

## Cities with several airports (fix after Phase 8.3, 2026-10-29)
Before, every airport pair was its own market: a route to a city's second airport (Vienna–Paris Orly next to the
Austrian and Air France flights to CDG) saw no competition and also counted travellers that the measured CDG numbers
already contain, so it looked very profitable (≈ 52 % before crews and leases).

- **Same city** (modelled): airports (large/medium) less than 100 km apart. How readily travellers use the other one:
  0.8 × (1 − km/130) — CDG–Orly 35 km ≈ 0.58, Heathrow–Gatwick ≈ 0.55, Heathrow–Stansted ≈ 0.41, Vienna–Bratislava ≈ 0.5.
- **Competition**: flights between the same two cities from their other airports join the passengers' choice, weighed by
  the product of both ends' weights (the closest three pairs with weight ≥ 0.15).
- **Travellers**: those living near the other airports join the route's travellers at their weight × 0.5 (calibrated so
  that Austrian, Ryanair, Wizz Air and easyJet keep their Phase 6.1 results within about a point); an unmeasured route
  next to a measured one between the same cities keeps only (1 − weight) of its estimated demand (at least 25 %).
- **Results** (one model year): Austrian +4.4 → ≈ +3.8 % (before overheads), Ryanair LF 0.84 / +14.4 % → ≈ 0.85 / +15 %,
  easyJet 0.88 / +15.3 % → ≈ 0.88 / +15.5 %, Wizz Air 0.80 / +14.3 % → ≈ 0.80 / +13.5 %; British Airways −0.5 % → ≈ −8 %
  (Heathrow now competes with Gatwick, Stansted, Luton and City; BA was already weak in the model). A startup's daily
  A320: Vienna–Orly ≈ +4 % and Vienna–CDG ≈ −3 % before crews and leases. A simulated AI year ≈ 20 % slower.

## Delays and punctuality (Phase 9.1, 2026-10-29)
Owner decisions: operations first in Phase 9, delays carried through each aircraft's rotation (knock-on).

- **Calibration target**: EUROCONTROL CODA, "All-Causes Delays to Air Transport in Europe – Annual 2024" (read
  2026-10-29): 17.5 minutes average departure delay per flight, 72.4 % of flights arriving within 15 minutes,
  reactionary (knock-on) delay 46 % of delay minutes (8.0 min per flight), airline causes 4.3 min, en-route ATFM 2.3 min.
- **Model** (`src/data/delays.ts`, `src/engine/delays.ts`): per flight, causes with a chance and an exponentially
  distributed length — airline 20 % × 21 min (+12 % with less than 10 minutes' buffer), ATC 10 % × 22 min (Europe; summer
  × 1.5, winter × 0.8; other regions less), airport congestion 6 % × 16 min (× 1.8 at slot airports), weather (bad days
  4 % of days, more in northern winter and summer storm season: 35 % × 25–50 min; else 1 % × 12 min). Knock-on: an
  aircraft leaves no earlier than its late arrival plus 75 % of the minimum turnaround; schedules make up 8 % of block time
  (at most 20 minutes) in the air. Night bans: 30 minutes' grace for delayed flights (e.g. Zurich, Frankfurt), then a late
  departure is cancelled and a late arrival diverts (nearest diversion airport within 400 km; passengers by bus, aircraft
  back next morning); very bad weather diverts a few flights.
- **Result**: Austrian today 76 % on time and 15.5 min average in January, 73 % and 18 min in July; knock-on 36–38 % of
  delay minutes, airline 28–33 %, ATC 11–16 %, weather 11–12 %.
- **Costs**: delay minutes €15 per minute per 150 seats (crew overtime, fuel, maintenance — the tactical order of magnitude
  in University of Westminster's "European airline delay cost reference values" for EUROCONTROL; planned crew and fuel are
  already in the normal costs); meals from 2 h; EU 261 compensation (CJEU Sturgeon 2009) from 3 h at arrival when the
  airline is to blame (own causes, knock-on, curfew), not for weather or ATC (extraordinary), 50 % claim; diversion
  €90 per passenger; transfer passengers miss connections from 30 minutes late (up to 80 % at 3 h): €110 + compensation.
  Austrian: delays add ≈ 1.5–2 % of revenue (Lufthansa Group reported irregularity costs of this order in bad years).
- Random numbers from stable hashes (other random events unchanged); AI airlines' delays are not modelled.

## Booking classes, booking curves and live bookings (Phase 9.3, 2026-10-30)
Owner decisions: live bookings day by day, the player's own fare buckets, seats per bucket by hand per route.

- **Model** (`src/data/fares.ts`, `src/engine/bookings.ts`), following the textbook model of airline revenue management
  (Talluri & van Ryzin, "The Theory and Practice of Revenue Management", 2004): flights open for sale 60 (short-haul), 75
  (medium) or 120 (long-haul) days ahead; travellers arrive along exponential booking curves (holidaymakers: typical
  42 days before short-haul, 70 long-haul; business 9 / 16 days — leisure books 6–10 weeks ahead, business within 2–3 weeks
  as airlines describe it); each buys the cheapest open bucket within their willingness to pay (log-normal relative to
  the class's fare: leisure median 0.93, business 1.45; 60 % of business travellers need a flexible ticket, a fixed one
  is worth 1/1.4 to them). A bucket stops at its seat limit or its advance-purchase day. The market model's travellers per
  flight (competition, timetable, brand) are those who buy at the class's fare; the potential is that ÷ the share willing
  to pay it. Expected (fractional) bookings, far-off flights processed every third day.
- **Default buckets**: Saver 60 % (closes 14 days before, 20 % of seats), Basic 80 % (3 days, 30 %), Classic 100 %,
  Flex 150 % (flexible) — the same steps in every cabin; airlines set their own.
- **Calibration**: willingness to pay chosen so that Austrian with the default buckets keeps its margins (November −7.2 %
  vs −8.6 % before, June −2.2 % vs −1.7 %); the load factor rises from 59–65 % to 77–83 % (real Austrian ≈ 80 %), the
  average fare falls accordingly. AI airlines keep their calibrated average fares (their real results include revenue
  management). A simulated month for Austrian ≈ 50 % slower (≈ 20,000 flights on sale).

## Frequent-flyer programmes (Phase 9.4, 2026-10-30)
Owner decisions: points per euro spent, award seats on own flights, taken-over airlines stay in their group's programme.

- **Model** (`src/data/loyalty.ts`, `src/engine/loyalty.ts`), after today's revenue-based programmes (Miles & More from
  2024, BA Executive Club, United MileagePlus: points per euro/dollar, more for status members) and IFRS 15 (points are a
  liability until redeemed or expired; airlines value a point at roughly 0.5–1.5 cents). All numbers are modelled orders
  of magnitude, not one programme's.
- **Members**: share of passengers 10 % + 40 % × the programme's attractiveness (own; grows 2 points a week), 55 % in a
  group programme; members spend 1.3× the average. Attractiveness of an own programme from the network (routes/60) and
  generosity (earn rate, award seats, Gold threshold, expiry). Pull on choice: business +12 %, holidaymakers +3 % at full
  attractiveness and membership.
- **Tiers**: Silver/Gold/Platinum shares of member revenue 45 / 25 / 8 % at 1,500 / 4,000 / 10,000 EUR a year, falling
  exponentially with higher thresholds; status bonus 25 / 50 / 100 %; Gold and Platinum in economy use lounges (25 % of
  trips, €25).
- **Points**: default 4 per euro; award seat 10,000 + 8 points per km (≈ 20,000 Vienna–London); 1.5 % of outstanding points
  redeemed a week; 30 % breakage over the expiry period; award seats limited to a share of economy (default 5 %) and taken
  out of sale when a flight opens.
- **Costs**: own programme €3 per member a year to run, €4 per member a year earned by selling points to partners;
  group programme €0.005 per point earned paid to the group, €50 + 0.03 per km received per award seat of the group's members
  (3 % of economy). Austrian (Miles & More from 2009) stays as calibrated: November −7.0 % (−7.2 % before), June −1.8 %
  (−2.2 %).

## Central bank rates, balance sheet, loans and bonds (Phase 10.1, 2026-10-30)
Owner decisions: Phase 10 money first; real rates + credit rating; realistic owners per scenario (from 10.3).

- **Central bank policy rates**: Bank for International Settlements (BIS), "Central bank policy rates" (WS_CBPOL),
  data.bis.org bulk download `WS_CBPOL_csv_flat.zip`, downloaded 2026-10-30 (`npm run data:rates`:
  `tools/download-policy-rates.ts` → `tools/raw/bis/`, `tools/build-policy-rates.ts` → `src/data/generated/policy-rates.json`:
  end-of-month rates per country from January 1970, 49 areas, euro area "XM" from 1999). **Licence** (BIS "Terms of
  permitted use of BIS statistics", data.bis.org/help/legal, read 2026-10-30): use is unrestricted provided the BIS is
  cited as the source, translations are marked as not official BIS translations, nothing implies BIS endorsement, and
  no charge is added. Credited on the in-game Data sources screen (German text: "Keine offizielle Übersetzung der BIZ").
  Currencies map to their central bank (`src/data/rates.ts`; old euro currencies to their national bank before 1999,
  Germany as stand-in; others without a series: US rate + 2 points); after the data ends the last rate is kept.
- **Credit rating** (modelled after how S&P/Moody's look at airlines): net debt incl. leases ÷ EBITDAR (< 1 → AA … ≥ 6 →
  CCC), cash ÷ revenue (< 8 % one notch worse, > 25 % one better), margin (< 0 worse, > 10 % better), at best BB below
  €500 m revenue or with less than 12 months of accounts, CCC with cash below zero; a parent's backing as a floor
  (Austrian: state-owned "A" until 2009, then the Lufthansa Group "BBB", S&P rates Lufthansa BBB−).
- **Interest** = policy rate + spread (AAA 0.6 … BBB 1.7 … B 5 … CCC 9 points) + 0.12 points per year of term (≤ 1.2);
  aircraft-secured loans: half the spread + 0.6, up to 75 % of the market value, 5–12 years; bonds (≥ €1 bn revenue,
  ≥ BB, from €250 m, 3–10 years, repaid at the end) 0.9 × the spread. Lenders' limit: debt incl. leases ≤ 4 × EBITDAR
  (no earnings: a third of the assets). Cash earns the policy rate − 0.5; an overdraft costs the policy rate + 9.
  Sale-and-leaseback at market value, 8 years at 1.05 × the typical rent. Insolvent after 60 days below zero.
- **Balance sheet**: cash, owned aircraft at book value, order payments, lease deposits, hangars; loans, lease
  obligations of delivered aircraft (rent still to pay × 0.85, like IFRS 16), own programmes' points.

## How to refresh the data
```bash
export PATH=~/.local/node/bin:$PATH
npm run data:download   # raw files → tools/raw/ (not in git)
npm run data:build      # → src/data/generated/*.json (in git)
npm test                # sanity checks in src/data/world.test.ts
npm run data:history    # Phase 5.2/5.3: EIA fuel, Fed + World Bank exchange rates, World Bank economy, Wikidata airport
                        # dates → *-history.json, airport-history.json
npm run data:airlines:history  # Phase 6.3: closed airlines + historical fleets (Wikidata, Wikipedia) → airline-history.json
                               # (needs tools/raw/wikipedia-airlines.json from download-airline-articles.ts)
```

## Known simplifications (to improve later)
- **Catchment** (shown in the airport panel) = sum of all city populations within 100 km; neighbouring airports
  share people. The demand model uses **market population** instead, where every person is counted once.
- **Airport selection**: OurAirports `scheduled_service = yes` and type large/medium/small (heliports, seaplane bases
  and closed airports dropped) → 4,135 airports.
- **Time zone** via nearest city: correct for virtually all airports; a few near time-zone borders could be off.
- Wealth for fares and wages is **today's** value per country; demand in past years uses the Phase 5.2 index.
- **Historical games**: modelled carriers instead of real ones (Phase 6); the Ukrainian airports closed since 2022 are
  missing in all years; non-fuel costs follow one world price level (no per-country history of wages or fees).
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
- **Book currency:** only currencies the ECB publishes are used; airlines in other countries keep books in USD.
