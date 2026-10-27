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
| Aircraft specs | `src/data/aircraft.ts`: 25 types, rounded manufacturer figures (typical seating, range, cruise speed, MTOW, take-off field length at MTOW/ISA/sea level, ETOPS) | Facts only | Range, runway and ETOPS checks, seats, lease market | **in use** (2026-10-27; entered from manufacturer published figures; to be cross-checked line by line against *Airport Planning* documents and EASA TCDS in Phase 4) |
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

## Economics model (Phase 1.4) — how it works and how it was calibrated
All in `src/engine/economics.ts`, amounts in USD, converted to the airline's book currency when booked.
- **Demand** (gravity model): passengers/year = K × (market people A × B × tourism)^0.7 × (wealth A × wealth B)^0.2
  × (distance/1000 km)^−0.8 ÷ (1 + (400 km/distance)^4). "Market people" = the airport's share of nearby city
  populations (large airports at least 0.5 M); wealth = GDP per capita / 40,000 USD; tourism = (1 + tourist arrivals per
  inhabitant)^0.3 per country. The last term hands short trips to trains and cars.
  Fitted to Eurostat 2019 totals on 46 Austrian routes: average error ≈ ×1.9. Known gaps: transfer traffic at hubs
  (DXB, FRA, ZRH) and package holidays (Palma, Bangkok) come out too low; small Austrian airports too high.
- **Competition** ("invisible incumbents" until Phase 2): today's airlines fly as often as the market needs at 80 %
  load factor (only on markets worth ≥ 3 flights per week). Your share = your frequency^1.3 × price attraction × speed
  ÷ (same + incumbents' frequency^1.3). Lower fares also grow the market (leisure travellers react more than business).
- **Fares**: market fare = (55 + 0.13 × km^0.92) USD × wealth factor × fuel surcharge (35 % pass-through of the fuel
  price above/below $2.20/gal). Checked against typical published average fares (e.g. VIE–LHR ≈ €130–160 one way).
- **Costs**: fuel (burn/h × block time × price), maintenance (per block hour, +1 %/year of age), airport fees,
  ground handling + catering, navigation charges, 5 % sales/distribution, crew (5 crews per short-haul aircraft,
  9 per wide-body; pilots $135k/175k, cabin crew $45k per year at Austrian level, scaled by country wealth), lease.
  Checked: an A320neo on VIE–LHR costs ≈ 4–6 US cents per seat-km before crew and lease. Not yet included: overheads.
- **Sanity check**: a well-chosen startup network makes single-digit margins; entering busy trunk routes at the
  market fare loses money; underserved holiday routes do best.

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
- **Exchange rates** are fixed at the ECB rates of 2026-10-26 for the whole game until Phase 5.
- **Book currency:** only currencies the ECB publishes are used; airlines in other countries keep books in USD.
