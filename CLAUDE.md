# CLAUDE.md — Airline Manager (working title)

This file is the single source of truth for the project. Claude reads it at the start of every
session. **Keep it updated at the end of every session** (progress log, decisions, roadmap status).

- Owner: 19-year-old aspiring airline pilot living near Vienna (VIE). A **beginner programmer**:
  Claude does the technical work and explains what was built in simple terms so they learn the basics.
- Aviation authenticity matters a lot. When in doubt, choose the realistic option and cite a source.
- Status: see the progress log (§8). Architecture and roadmap were **approved on 2026-10-27**.

---

## 1. How we work (rules for every session)

1. **Small steps:** one phase step or one feature per session. Test it, commit it to git, update this file.
2. At the end of each step, tell the owner **how to open and play the new version and what to test**.
3. When the owner has to do something (create a free account, install a tool), give **step-by-step instructions**.
4. **Ask before big design decisions** instead of guessing. Record each decision in §7 (Decision log).
5. **$0 budget:** only free hosting, free tiers and open data. No service that needs a credit card.
6. **Every visible text goes through the translation system** (English + German). No hard-coded UI strings.
7. Every dataset gets an entry in `docs/DATA_SOURCES.md` (source, license, date downloaded, how it is processed).
8. Explain things simply: short "What I built / why" notes after each step. No jargon without a one-line explanation.
9. Achievements never give artificial rewards (no free money or bonuses). Everything stays realistic.
10. **Git: stage files explicitly by path** (never `git add -A` / `git add .`) and check `git status` before committing.
    Downloads and raw datasets belong in `tools/raw/` (git-ignored). (2026-10-27: an FAA ZIP the owner saved in the
    project root was committed by `git add -A` and removed again in the next commit; it remains in history.)

---

## 2. Game design (the full spec from the owner)

### 2.1 Platform constraints
- Everything costs **$0**: no paid services, no credit card anywhere. Free hosting, free tiers, open data only.
- Runs in the browser on **computer and phone**, responsive, installable as a **PWA**, with layouts
  *designed* for each (not just squeezed).
- **Bilingual EN/DE**, switchable in settings; all text through a translation system from day one.
- **Multiple save slots**, **cloud sync** across devices (free service), **local saving**, **save export/import** as backup.
- **Single player** for now, but code structured so **multiplayer in a shared world** can be added later.

### 2.2 Game modes (chosen when starting a new game)
- **Realism level:** "Realistic" (believable data and economics, learnable by playing) or "Hardcore" (spreadsheet-deep).
- **Time mode:**
  1. Real-time with pause and speed controls, planes moving on the map.
  2. Turn-based, week by week.
  3. Tied to the real clock (VIE–JFK takes ~9 real hours). The world keeps progressing while the game
     is closed and catches up correctly on return.
- **Start year:** present day (2026) or historical (e.g. 1970s, 1990s, 2000s). Aircraft types enter service
  and retire on their real dates; real historical events happen at the right time (oil crises, 9/11,
  2008 financial crisis, COVID, airspace closures, etc.).
- **Scenario type:** found a startup (name, colors, livery, hub, starting capital); take over a real airline
  with its real fleet and network for that year (**Austrian Airlines takeover at VIE must be included and
  done in detail**); goal scenarios (rescue a bankrupt carrier, build a long-haul hub in 10 years); sandbox (unlimited money).
- **Competitors:** real airlines as AI, or fictional AI airlines. In real-airline mode, fictional startups may
  appear over time. AI reacts realistically: price wars, entering/leaving routes, ordering aircraft,
  bankruptcy, mergers.

### 2.3 World and data (realism is top priority)
- **Every commercial airport** in the world from open data (OurAirports, public domain): coordinates,
  runway lengths, elevation, country, size. Plus demand data (city population, wealth, tourism, business
  importance), airport fees, slot restrictions (LHR, JFK…), curfews.
- **All commercial aircraft** from all manufacturers (Airbus, Boeing, Embraer, ATR, De Havilland Canada,
  Bombardier, COMAC, Sukhoi, McDonnell Douglas, Fokker, historical types) with realistic specs: seats per
  cabin layout, range, cruise speed, fuel burn, runway requirements, MTOW, ETOPS, list price, lease rates,
  maintenance costs, entry-into-service and retirement years. **Range, runway and ETOPS limits actually
  restrict which routes a type can fly.**
- **Realistic prices** for everything: fuel, airport and navigation fees, crew salaries, maintenance, leases,
  aircraft prices, fares. Costs and margins roughly match real airline annual reports. Data sources documented.
- **World map** showing my network, all routes and live moving aircraft.

### 2.4 Airline operations (manage everything myself, or delegate)
- **Managers** (network planning, revenue management, fleet, HR, maintenance, finance) with skill levels,
  specialties, salaries. They suggest or decide automatically depending on delegation. Good ones cost more; bad ones make mistakes.
- **Aircraft:** lease new/used, order new with realistic order books and delivery waits, buy used, sell,
  retire, scrap. Aircraft age, lose value, need more maintenance as they get older.
- **Cabin configuration:** economy, premium economy, business, first; seat pitch and product quality affect demand and reputation.
- **Staff:** pilots and cabin crew to hire and train, type ratings, salaries, crew shortages, strikes.
- **Maintenance:** A/B/C/D checks, aircraft out of service during checks, technical failures, hangars.
- **Airports:** slots, gates, lounges, opening bases and hubs.
- **Scheduling (choosable per game):** Simple = weekly frequency per route and aircraft. Detailed = full
  timetables with exact departure times, aircraft rotations and hub connection waves.
- **Business models:** network carrier with hubs and long-haul, low-cost point-to-point, regional, charter
  (incl. tour operator contracts), cargo (freighters + belly cargo), subsidiaries (own regional/LCC/cargo brands).

### 2.5 Passengers and revenue
- Realistic demand: city size, wealth, distance, seasonality, business vs leisure (different price
  sensitivity), competition, schedule quality.
- Connecting traffic through hubs (e.g. VIE as gateway to Eastern Europe).
- Revenue management: fare classes, dynamic pricing, booking curves.
- Loyalty program, brand reputation, reviews, on-time performance.

### 2.6 World events
- Economy cycles, fuel price changes, currency swings.
- Crises: pandemics, volcanic ash, wars and airspace closures, strikes, weather.
- Regulation/politics: traffic rights and freedoms of the air, open skies, EU rules, CO2 taxes, noise curfews.
- Everything that can realistically happen to an airline.

### 2.7 Finance and corporate
- Loans, bonds, fuel hedging, currency effects.
- Stock market: IPO, share price, buying competitors' shares, takeovers, mergers.
- Alliances and codeshares: join real alliances or found fictional ones (same real/fictional choice as airlines).
- CEO career: board of directors, shareholder expectations; **I can be fired** if I perform badly.

### 2.8 Flights and detail
- Overviews first (dashboards, network map, route stats), always drill-down to full detail: click any
  flight → passengers per class, load factor, delays, weather, profit.
- Incidents to handle: diversions, technical problems, delays.

### 2.9 Long-term motivation
- Open-ended, no end.
- Rankings vs other airlines (size, profit, punctuality, customer satisfaction, industry awards).
- Achievements and milestones tracked and shown, **no artificial rewards**.

### 2.10 Look and feel
- Distinctive visual style fitting a real airline operations environment; no generic template look.
- My airline gets a **livery I design** (colors, tail design) shown on aircraft in the game. Real airlines
  appear with their recognizable colors (personal, non-commercial use).
- Very good on phone and computer.

---

## 3. Architecture (approved 2026-10-27)

### 3.1 Big picture in simple words
The game is a **website that behaves like an app** (a PWA). It has three main parts:

1. **The engine** ("the simulation brain"): pure TypeScript code that knows the rules of the world —
   demand, costs, flights, AI airlines, events. It knows nothing about screens or buttons. It runs in a
   **Web Worker** (a background thread) so the screen never freezes while it calculates.
2. **The interface** ("the cockpit"): React screens for desktop and phone that *show* the engine's state
   and send the player's decisions to the engine as **commands** (e.g. `OpenRoute`, `LeaseAircraft`).
3. **Storage**: saves on the device (IndexedDB), optional cloud copy (free service), and export/import files.

```
 ┌──────────── Browser / installed PWA ─────────────┐
 │  UI (React)  ──commands──▶  Engine (Web Worker)   │
 │      ▲                        │  pure TypeScript   │
 │      └────── state snapshots ─┘  deterministic     │
 │  Persistence: IndexedDB saves ⇄ Cloud sync adapter │
 └───────────────────────────────────────────────────┘
        static files from free host       free cloud DB (saves only)
```

### 3.2 Technology choices
| Need | Choice | Why (simple) |
|---|---|---|
| Language | **TypeScript** | JavaScript with types: catches mistakes before the game runs. Essential for a project that grows for months. |
| Build tool | **Vite** | Starts a local dev server in a second, builds the final website. Free, standard. |
| UI | **React** | Most popular UI library: huge ecosystem, easy to find help. |
| Map | **MapLibre GL JS** + bundled **Natural Earth** coastlines/borders (public domain) | Fast GPU map that handles thousands of planes; works offline with no map service. Optional detailed street-level tiles later via OpenFreeMap (free, no key). |
| Translations | **i18next** + `react-i18next`, `Intl` for numbers/dates/currency | Industry standard; `de.json`/`en.json` files; correct "1.234,56 €" vs "€1,234.56". |
| Local saves | **IndexedDB** via **Dexie** + **fflate** compression | Browser database that holds large saves; compression keeps late-game saves small. |
| Cloud sync | **Firebase (Spark plan: Auth + Firestore)** — *recommended*, see decision D1 | Free, no credit card, does not pause inactive projects. Saves stored compressed in chunks (<1 MB per document). |
| PWA | **vite-plugin-pwa** | Makes the site installable and playable offline. |
| Engine thread | **Web Worker** + **Comlink** | Simulation runs in the background; Comlink makes talking to it simple. |
| Tests | **Vitest** | Automatic checks of the engine, including "economics calibration tests" (e.g. a realistic route must produce a realistic margin). |
| Hosting | **GitHub Pages** (public repo) — *recommended*, see decision D2 | Free, no card, auto-deploys every time we push. |
| Data pipeline | Node.js scripts in `tools/` | Download open data, clean it, produce compact JSON shipped with the game. |
| Fonts | IBM Plex Sans + IBM Plex Mono (SIL Open Font License), self-hosted | Free, technical "aviation instrument" look, tabular numbers. |

### 3.3 Engine design principles (these make realism, real-clock mode and multiplayer possible)
- **Commands in, events out.** Every player or AI decision is a serializable command
  `{ type, airlineId, payload, issuedAt }`. The engine validates it (e.g. "A320 can't reach JFK from VIE")
  and applies it. The UI never edits game state directly.
  → Multiplayer later = the same engine runs on a server and players send commands to it.
- **The player is just an airline** with `controller: "human"`. AI airlines use **exactly the same command
  API** with `controller: "ai"`. No special rules for the player.
- **Deterministic:** seeded random numbers; same save + same commands → same result. Makes bugs reproducible
  and server-authoritative multiplayer possible.
- **Time as a number:** simulation time = UTC minutes since 1 Jan 1950. Airports carry IANA time zones for local times.
- **Event-driven time advance:** `advance(state, untilTime)` processes scheduled events (departures,
  arrivals, checks, deliveries, world events) in order, plus **daily economics steps**. All three time modes
  use this one function:
  - Real-time: advance in small steps, speed multiplier (pause, 1×, … very fast).
  - Turn-based: advance 7 days per "End week".
  - Real clock: on opening, `advance(state, now)` catches up the missed time in the background
    and shows a "While you were away" report. Your managers/standing rules make decisions in the meantime.
- **Two levels of detail:** passenger demand and revenue are computed per **market per day** (fast,
  aggregate), while individual flights exist for the map, delays and incidents. This keeps catch-up of
  weeks of real time fast even with large networks.
- **Realism level as a parameter:** "Realistic" and "Hardcore" use the same engine; Hardcore turns on
  more detailed sub-models (e.g. exact EUROCONTROL route-charge formula, per-check maintenance, currency per transaction).
- **Money has a currency from day one** (`{ amount, currency }`), so currency swings work later.
- **Versioned saves with migrations**, so saves from older versions keep working as the game grows.
- **Static data separate from state:** the world database (airports, aircraft types, historical events)
  is shipped as read-only data; saves only store what changed.

### 3.4 Folder layout (planned)
```
src/
  engine/        pure TS simulation: state, commands, time, money, rng, market, advance (systems grow here)
  game/          the screen's link to the engine worker (store + autosave)
  data/          generated + hand-curated datasets (airports, aircraft, airlines, history)
  ui/            React: screens/, components/, layouts/desktop + layouts/mobile, map/
  i18n/          en.json, de.json
  persistence/   local saves (IndexedDB), export/import, cloud sync adapter
  worker/        Web Worker entry for the engine
tools/           data pipeline scripts (download → clean → JSON)
docs/            DATA_SOURCES.md, calibration notes, decisions
tests/           engine + calibration tests
```

### 3.5 Data strategy (realism)
See `docs/DATA_SOURCES.md` for full list + licenses. Summary:
- **Airports:** OurAirports (public domain) filtered to scheduled-service airports; time zones added at build.
- **Demand inputs:** GeoNames cities (CC BY 4.0) for population, World Bank GDP per capita (CC BY 4.0),
  tourism indicators; **Eurostat** route-level passenger statistics to calibrate real markets (e.g. VIE–LHR).
- **Aircraft:** hand-curated database from manufacturer *Airport Planning* documents (range, MTOW, runway),
  EASA type certificates, **OpenAP** (TU Delft, open) for fuel flow, published list prices, service-entry dates.
- **Costs:** **US DOT/BTS Form 41** (public domain: real operating costs per aircraft type), **EUROCONTROL**
  route-charge unit rates and formula, published airport charge tables (e.g. VIE), **EIA** jet fuel prices
  (public domain, since 1990), ECB exchange rates. Calibrate margins against annual reports
  (Lufthansa Group incl. Austrian segment, Ryanair, Wizz Air, IATA industry data).
- **History:** hand-curated event timeline and aircraft service dates; Austrian Airlines fleet/network per
  era from annual reports, historical timetables and encyclopedic sources.
- **Liveries:** our own parametric SVG aircraft/tail templates. Real airlines shown with approximated colors
  and shapes, not copied logo images (personal, non-commercial use).

### 3.6 Visual style proposal: "OCC — Operations Control Center"
The game should feel like sitting in an airline's operations control center or looking at an EFB, not like a generic website.
- **Dark navy/slate base** (ops-room screens), with a **light "Daylight EFB" theme** for phones outdoors.
- **ECAM colour logic** (from Airbus cockpit displays, which you'll learn as a pilot):
  green = normal/on time, amber = caution, red = warning/loss, cyan = your selections/your network,
  white = data, magenta = planned/forecast.
- **Monospace tabular numbers** for flight numbers, times, money. **UTC "Z" clock** always visible next to local time.
- **ICAO/IATA codes** everywhere (VIE / LOWW), flight numbers like real ones.
- Departure-board (FIDS) style lists for flights; map with dark oceans, glowing great-circle routes, small
  aircraft symbols in your livery colour.
- **Desktop:** sidebar + map + docked detail panels (multi-panel ops console).
  **Phone:** bottom tab bar (Ops · Map · Network · Fleet · More), full-screen sheets that slide up, thumb-reachable controls.

---

## 4. Roadmap (approved 2026-10-27)

Each phase is split into steps; **one step ≈ one session**, each ends with a testable, committed version.
"Realistic" mode is built first; "Hardcore" depth is added to each system as it matures.

### Phase 0 — Planning ✅ (this session)
Research, architecture, roadmap, git, CLAUDE.md.

### Phase 1 — "First Flight": smallest fun playable game
Found a startup at a hub of your choice (VIE default), year 2026, Realistic mode, simple scheduling.
- **1.1 Skeleton:** Vite + React + TS project, app shell with distinct desktop and phone layouts,
  OCC theme (dark/light), EN/DE switch, PWA install, auto-deploy to the free host. *Test: open it on your phone and install it.*
- **1.2 World data + map:** ✅ pipeline for all scheduled-service airports + population/wealth/tourism;
  offline world map (MapLibre + Natural Earth) with airport search and detail panel. *Test: browse airports, zoom the map.*
- **1.3 Engine core + aircraft + new game:** ✅ starter aircraft database (~20 current types: ATR 72, Dash 8-400,
  E175/E195-E2, A220, A320neo family, 737 MAX, A330neo, A350, 787, 777…, moved here from 1.2 so it is built
  together with leasing); game state, commands, clock with **pause/speed (real-time)** and
  **turn-based weekly** mode; new-game wizard (name, IATA-style code, colors, hub, starting capital);
  lease aircraft. *Test: start an airline, lease a plane.*
- **1.4 Routes & money:** ✅ open routes (range/runway checks), weekly frequency, fares, demand model
  (gravity + business/leisure), cost model (fuel, crew, airport, navigation, maintenance, lease),
  weekly P&L, **planes flying on the map**. *Test: does a VIE–LHR A320 route make believable money?*
- **1.5 Saves & dashboard:** multiple local save slots, export/import, dashboard with KPIs (load factor,
  RASK/CASK, cash). Phase 1 complete. *Test: play a few months, save, reload on another browser via export.*

*Order change (2026-10-27): Phase 2 comes before step 1.5, and detailed scheduling (from Phase 7) becomes step 2.2:*
- **2.1 Visible AI competitors** (fictional airlines; replace the invisible incumbents).
- **2.2 Detailed scheduling:** own departure times per flight, block times, turnarounds, aircraft rotation timeline,
  time-of-day preferences in passenger choice; competitors get timetables too.
- then back to **1.5** (save slots, export/import, dashboard), then the rest of Phase 2 (cabin classes, reputation).

### Phase 2 — Competition and passengers
Fictional AI airlines (enter/leave routes, price wars, order aircraft, go bankrupt), passenger choice
between airlines (price, frequency, quality, reputation), cabin classes and seat pitch, reputation basics, seasonality.

### Phase 3 — Cloud sync and real-clock mode
Free account login, save slots synced across devices, time mode 3 with offline catch-up and "While you were away" report.

### Phase 4 — Fleet depth
Full aircraft database (all manufacturers, historical types), order books and delivery slots, used market,
buy/sell/scrap, ageing and depreciation, A/B/C/D checks with downtime, technical failures, hangars, livery designer.

### Phase 5 — History and world events
Historical start years (1970s/1990s/2000s), aircraft EIS/retirement dates, event timeline (oil crises,
9/11, 2008, COVID, airspace closures, volcanic ash), economy cycles, fuel prices, currencies.

### Phase 6 — Real airlines and the Austrian Airlines takeover
Real airlines as AI with real fleets/networks per era and recognizable colors; **detailed Austrian Airlines
takeover scenario at VIE** (multiple start years); fictional startups appearing in real-airline mode.

### Phase 7 — Hubs and detailed scheduling
Connecting traffic and O&D flows through hubs, connection waves (timetables themselves come in step 2.2),
slots (LHR, JFK…), curfews, gates, lounges, bases.

### Phase 8 — People
Pilots and cabin crew, type ratings and training, crew shortages, strikes; hireable managers with skills,
salaries, mistakes, and delegation levels.

### Phase 9 — Revenue and operations detail
Fare classes, booking curves, dynamic pricing; loyalty program; on-time performance, delays, weather,
incidents (diversions, technical problems); click-any-flight drill-down.

### Phase 10 — Finance and corporate
Loans, bonds, fuel hedging, currency effects; stock market, IPO, share price, buying competitor shares,
takeovers and mergers; board of directors, shareholder expectations, getting fired.

### Phase 11 — Business models and partnerships
Low-cost, regional, charter + tour operator contracts, cargo (freighters + belly), subsidiaries; alliances
and codeshares (real or fictional).

### Phase 12 — Regulation and Hardcore depth
Traffic rights and freedoms of the air, open skies, EU rules, CO2 taxes/ETS, noise rules; full Hardcore sub-models.

### Phase 13 — Scenarios, rankings, achievements
Goal scenarios (rescue a bankrupt carrier, long-haul hub in 10 years), sandbox, rankings, industry awards,
achievements and milestones (no rewards).

### Phase 14 (optional) — Multiplayer groundwork
Server-authoritative shared world running the same engine (free tier to be researched at that time).

---

## 5. Things the owner will need to do (when the time comes)
- ~~Before Phase 1.1: install Node.js~~ — done by Claude into `~/.local/node` (2026-10-27).
- ~~Phase 1.1: create a free GitHub account~~ — done (lorenzpiet426), 2026-10-27.
- **Phase 3:** create a free **Firebase** project with a Google account (no credit card; stay on the Spark plan).

## 5b. Phase 2.1 data brief from the owner (2026-10-27, final version) — real airlines
**General rules**
- Only sources whose licence allows use in this public, free, non-commercial game. Check every licence first; credit
  every source in an in-game **"Data sources" screen** and in `docs/DATA_SOURCES.md`.
- **No OpenSky data at all** (owner decision 2026-10-27: no permission request; its terms don't allow our use).
- **Never copy** Planespotters, Flightradar24, FlightConnections, Airfleets, Cirium, OAG, ch-aviation (owner spot-checks by hand only).
- Real airline names and colours, **no real logos**.
- Every route, frequency and fleet number carries a **source tag**: `official`, `wikipedia` (Wikipedia/Wikidata),
  `hand-checked` or `modelled`, visible in the game.

**1. Airlines, hubs, routes:** base = Wikipedia + Wikidata (names, codes, hubs, business model, destination lists).
Official traffic statistics where licensed: USA BTS T-100 segment (monthly, per airline & route), UK CAA airline data,
Eurostat route data, Australia BITRE (international per airline & city pair, domestic routes), Brazil ANAC open data
incl. VRA, India DGCA. Where only destination lists exist: frequencies from the demand model, tagged `modelled`.
Resolve ambiguous destinations (which London airport) and list uncertain ones for the owner.
**Seasons:** IATA winter started 25 Oct 2026; never mix seasons; store the season with all data.
**TODO mid-December 2026: refresh winter data** (ski/winter-sun routes start in December); until then the summer network
is used for both seasons, clearly marked; later the game switches networks by season.
Show a **coverage map** (official / Wikipedia-based / modelled by region).

**2. Fleets**, in order of trust: (a) official aircraft registers with real individual aircraft where downloadable and
licensed (check FAA, UK CAA G-INFO, Austro Control, Irish IAA, Malta, Transport Canada, Australia CASA, Brazil ANAC RAB);
(b) Airbus & Boeing official orders & deliveries (order books, delivery dates); (c) airlines' fleet pages / annual
reports (bigger airlines, entered as facts); (d) Wikipedia/Wikidata fleet tables (counts, orders, seat configurations);
(e) otherwise generated aircraft (right national registration format, ages from the type's delivery years), `modelled`.
Match by **operator**, not registration country (leasing, Malta/Ireland). Disagreements: most trusted source wins,
difference explained in the validation report. Cabin layouts per airline where known, else typical for the airline type.

**3. Austrian:** Claude drafts Austrian's network (routes + weekly flights) and fleet (types, registrations) from
Eurostat, Wikipedia, Wikidata and the registers into `data-hand/austrian/`, shows it to the owner as a readable list;
the owner reports errors. **Only entries the owner has confirmed are tagged `hand-checked`.** → Owner (2026-10-27):
accepted the draft as it is, **no hand-check** — entries keep their tags (`wikipedia`, `official`, `modelled`).
**4. Validation report** for Austrian, Lufthansa, Ryanair, Wizz Air: reconstruction vs. Wikipedia, every difference listed.
**5. Aircraft types:** all common missing types incl. turboprops (ATR 42, Dash 8 family), regional jets, freighters.
Then 2.1a (real airlines visible) / 2.1b (AI behaviour by airline type). **Show the owner which sources work before
building screens.**

**Why no OpenSky (read 2026-10-27):** its terms allow use "solely for the purpose of non-profit research and non-profit
education", forbid making the data available to others (§3 iii) and require a written licence for any live product.

## 6. Open questions / decisions waiting for the owner
- **D1 Cloud sync service:** Firebase Spark (recommended: no pausing, no card) vs Supabase Free (Postgres, but
  free projects pause after 7 days of inactivity until restored in the dashboard).
- **D2 Hosting:** GitHub Pages with a public code repository (recommended: simplest) vs Cloudflare with a private repository.
- **D3 Visual style:** "OCC" proposal in §3.6 (recommended) or another direction.
- **D4 Roadmap order:** e.g. move cloud sync earlier/later, or real airlines (Austrian) earlier.

## 7. Decision log
| Date | Decision | Reason |
|---|---|---|
| 2026-10-27 | Project folder under git, `main` branch | Track every change, easy to undo |
| 2026-10-27 | **Architecture and roadmap approved** as proposed in §3–§4 | Owner approval |
| 2026-10-27 | D1: **Firebase Spark** (Auth + Firestore) for cloud sync | Free, no card, no inactivity pause |
| 2026-10-27 | D2: **GitHub Pages**, public repository, deployed by GitHub Actions | Simplest free hosting |
| 2026-10-27 | D3: **"OCC" visual style** (§3.6) | Fits airline ops / cockpit feel |
| 2026-10-27 | D4: roadmap order unchanged | Owner approval |
| 2026-10-27 | Hash-based navigation (`#/map`) instead of path URLs | GitHub Pages has no server-side routing; hash URLs never 404 |
| 2026-10-27 | Phone tab bar: Ops · Map · Network · Fleet · More (Finance + Settings under More) | Dashboard must be one tap away on phone |
| 2026-10-27 | Starter aircraft database moved from step 1.2 to 1.3 | Built together with leasing, where it is first used; keeps 1.2 focused |
| 2026-10-27 | Generated data files (`src/data/generated/`) are committed; raw downloads are not | Builds/CI need no downloads; refresh is a deliberate step |
| 2026-10-27 | Base map = Natural Earth 1:50m GeoJSON (not world-atlas TopoJSON) | world-atlas shapes are spherical and draw artefacts at the 180° line on a flat map |
| 2026-10-27 | Map data is put into the MapLibre style at creation (no "load" event wait) | Faster first paint; robust when the page is in the background |
| 2026-10-27 | Tourism figures use 2019 when available | 2020–2022 are COVID-distorted; crises will be modelled as game events |
| 2026-10-27 | Starting capital chosen in the wizard: €25M (tight) / €75M (standard) / €200M (well funded), converted to the hub currency and rounded to 2 significant digits | Owner choice; sandbox comes with scenarios |
| 2026-10-27 | Books in the hub country's currency (if the ECB publishes a rate, else USD); leases priced in USD, converted at booking time | Owner choice; like real airlines, prepares currency risk |
| 2026-10-27 | Leased aircraft arrive after a realistic wait (30–80 days, wide-bodies 45–110); only used aircraft (≥ 1 year old, ≤ 20 years) for now; new aircraft via factory orders in Phase 4 | Owner choice |
| 2026-10-27 | Lease terms: deposit 2 months' rent (wide-bodies 3) on signing; rent from delivery (part month pro rata), then on the 1st of every month | Usual industry practice, simple to follow |
| 2026-10-27 | Real-time speeds: pause, 1 min / 10 min / 1 h / 1 day of game time per real second; turn-based mode advances 7 days per "End week" | Covers watching flights up to fast-forwarding months |
| 2026-10-27 | Money stored as whole currency units (no cents) | Airline accounts at this scale don't need cents; avoids rounding drift |
| 2026-10-27 | One automatic save in localStorage until Phase 1.5 (save slots in IndexedDB) | Reloading the page must not lose the game while testing |
| 2026-10-27 | Until Phase 2: "invisible incumbents" — real markets already have airlines; the player wins a share by frequency, price and speed | Owner choice; keeps profits realistic from day one |
| 2026-10-27 | Fares: market fare per route + slider −50 % … +50 % (fare classes in Phase 9) | Owner choice |
| 2026-10-27 | Simple scheduling: route = hub → destination, one aircraft, weekly round trips; an aircraft can fly several routes until its weekly hours are used (112–154 h by category) | Owner choice |
| 2026-10-27 | All routes start at the hub; one route per destination | Simple scheduling; bases/hubs elsewhere in Phase 7 |
| 2026-10-27 | Economics computed per route per day (aggregate), individual flights only derived for the map (weekly pattern, 06:00–21:00 hub time) | Architecture §3.3 "two levels of detail" |
| 2026-10-27 | Weekly P&L Monday–Sunday UTC; lease cost accrued daily in the P&L while the cash leaves monthly; crews paid per active aircraft | Readable weekly reports without monthly spikes |
| 2026-10-27 | Real 2026 jet fuel prices (EIA weekly) in the game, incl. the March 2026 spike | Realism; airlines really had to cope with it |
| 2026-10-27 | Balance "realistic & tough" (owner): one-stop competition on every market, incumbents match half of price cuts, stronger price elasticity, seasons, overheads | Owner found 1.4 too easy (monopoly routes at +50 % fare gave 55–60 % margins) |
| 2026-10-27 | Roadmap change: **Phase 2 (visible AI competitors) moves before 1.5** (save slots, export, dashboard) | Owner wants to see competition; autosave covers saving meanwhile |
| 2026-10-27 | Roadmap: **2.1 visible AI competitors → 2.2 detailed scheduling** (own departure times, block times, turnarounds, rotation timeline; passengers prefer good times) **→ 1.5** save slots/dashboard | Owner wants timetables, not only frequencies; detailed scheduling moved forward from Phase 7 (hub waves stay in Phase 7) |
| 2026-10-27 | **No OpenSky data** (owner); real-airline data only from open, reusable sources (§5b) | OpenSky terms forbid publishing derived data without a licence; owner chose not to ask |
| 2026-10-27 | Finance history: weeks kept 2 years, calendar months kept for the whole game; quarters/years summed from months | Owner wants to see patterns over time; months stay small enough to keep forever |
| 2026-10-27 | Demand uses a new "market population" (cities shared between airports) instead of the 100 km catchment | Catchments double-counted London etc.; calibration error fell from ×2.4 to ×1.9 |

## 8. Progress log
### 2026-10-27 — Session 1 (Phase 0)
- Researched free hosting, cloud sync options, open data sources for airports, aircraft and costs.
- Wrote this CLAUDE.md (spec, proposed architecture, roadmap) and `docs/DATA_SOURCES.md`.
- Initialised git. No game code yet (by request).
- Notes: Node.js is not installed on the Mac yet. Firebase Cloud Storage now requires the paid Blaze
  plan → we will only use Firestore + Auth (free on Spark). Supabase free projects pause after 7 days inactivity.
- **Next:** owner reviews and approves the plan and decisions D1–D4, installs Node.js → Phase 1.1.

### 2026-10-27 — Session 2 (Phase 1.1 Skeleton) ✅ locally, deploy pending
- Owner approved the plan and D1–D4 (see §7).
- **Node.js v24.22.1 LTS installed in `~/.local/node`** (user folder, no admin rights; SHA-256 verified).
  It is *not* on the shell PATH: use `export PATH=~/.local/node/bin:$PATH` before `npm` commands.
  `.claude/launch.json` starts Vite with the absolute node path. If the owner later installs the
  official .pkg, `/usr/local/bin/node` works too.
- Built the app skeleton: Vite 8 + React 19 + TypeScript 7, i18next (EN/DE, with a test that both
  languages have the same keys and placeholders), device settings store (language, theme),
  OCC dark + Daylight light theme (`src/ui/styles/tokens.css`), desktop console layout
  (sidebar rail, icon-only below 1100 px) and phone layout (header + 5-tab bottom bar + "More"),
  hash navigation, UTC/LCL clocks, split-flap welcome board, ECAM-style status checklist,
  placeholder screens for Map/Network/Fleet/Finance, Settings screen, PWA (manifest, icons,
  offline cache via service worker), GitHub Actions workflow for GitHub Pages.
- Verified in browser: desktop 1280 px, tablet 800 px, phone 375 px, German + light theme. No console errors.
  Offline status shows "Preparing…" in dev mode (the service worker only runs in the built version).
- Owner created GitHub account **lorenzpiet426**. GitHub CLI v2.103.3 installed in `~/.local/gh`
  (checksum verified; use `export PATH=~/.local/gh/bin:$PATH`), logged in via device code, set up as git credential helper.
- Public repo: https://github.com/lorenzpiet426/airline-manager — **live game: https://lorenzpiet426.github.io/airline-manager/**
  Pages source = GitHub Actions. First deploy succeeded; verified live: no console errors, service worker active ("Offline play: Ready").
  Bumped workflow actions to current majors (checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5).
- **Next:** owner installs the game on their phone and tests it. Then Phase 1.2 (world data + map).
- Owner confirmed: installed on phone, works.

### 2026-10-27 — Session 3 (Phase 1.2 World data + map) ✅
- Data pipeline: `npm run data:download` / `npm run data:build` (scripts in `tools/`, run directly by Node 24 as TypeScript).
  Output: `src/data/generated/airports.json` (4,135 airports: 1,154 large, 2,115 medium, 866 small; runways,
  elevation, IANA time zone, 100 km catchment population), `countries.json` (234 countries: World Bank GDP/capita
  + tourism, supplement for Taiwan/overseas regions), `basemap.json` (Natural Earth 1:50m coastlines + land borders).
- Tests: `src/data/world.test.ts` (hubs present, VIE exact values, unique codes, valid time zones, every country has GDP),
  `src/i18n/format.test.ts` (aviation coordinates, number formats, Vienna UTC offset winter/summer). 15 tests total.
- Map screen: MapLibre GL 6 (WebGL), Mercator/Globe toggle (saved in settings), theme-aware colours,
  airport dots sized by category, IATA labels by zoom level, tap targets enlarged for phones, selection ring.
  Airport search (code/city/name, accent-insensitive). Airport panel: codes, coordinates (N48°06.6' E016°34.2'),
  elevation ft/m, local time + UTC offset, runways with length bars, catchment, GDP, tourism.
  Desktop: docked panel on the right; phone: bottom sheet.
- Map code and world data are loaded only when the Map is opened (lazy loading); all precached for offline use.
- Lessons: MapLibre 6 needs `setWorkerUrl(...)` with Vite; its CSS sets `position: relative` on the map container;
  the in-app browser pane runs pages as "hidden", so screenshots can lag — verify map state via `window.__map` (dev only).
- **Next:** Phase 1.3 — aircraft database, engine core (state, commands, clock), new-game wizard, leasing.
- Owner confirmed: map tested on phone, works.

### 2026-10-27 — Session 4 (Phase 1.3 Engine core + aircraft + new game) ✅
- Owner decisions: capital chosen in wizard (€25M/€75M/€200M), hub-currency books + USD leases, realistic delivery wait (§7).
- **Aircraft database** `src/data/aircraft.ts`: 25 types (ATR 42/72-600, Dash 8-400, E175, E190, E190-E2, E195-E2,
  A220-100/300, A320ceo/neo, A321ceo/neo, A321XLR, 737-800, 737-8, 737-9, A330-300/-900, 787-8/9/10, A350-900/1000,
  777-300ER, 777-9 (enters service 2027)). Currencies + ECB rates (`currencies.ts`), registration patterns (`registrations.ts`).
- **Engine** `src/engine/` (pure TypeScript, no UI): `time.ts` (minutes since 1950 UTC), `money.ts` (Money with currency,
  conversion), `rng.ts` (seeded Mulberry32, state in the save), `state.ts` (GameState, version 1), `core.ts` (ids,
  event queue, messages, bookings), `market.ts` (lease market: 36 offers, refreshed monthly), `commands.ts`
  (FoundAirline, LeaseAircraft with validation + error codes), `advance.ts` (event-driven time: deliveries, monthly rent,
  market refresh), `game.ts` (createGame, migrate).
- **Worker** `src/worker/engine.worker.ts` (Comlink): owns the state, runs the real-time clock (100 ms ticks, catches up by
  elapsed time), end-week, commands. Each snapshot carries a revision number so late copies are ignored.
  `src/game/store.ts`: React hooks (`useGame`, `useSpeed`), autosave to localStorage (`am.autosave.v1`), restore on start.
- **UI:** new-game wizard (`#/new`: name, auto-suggested codes, livery colours with tail-fin preview, hub search,
  capital cards in hub currency, time mode), Ops screen (airline card, game clock + speed controls, ACARS-style message
  log), Fleet screen (my fleet; lease market with category filter, runway warning vs hub, confirm step), game clock +
  speed controls in the desktop status bar, game date in the phone header, "Quit game" in Settings.
- Tests: 29 (engine: determinism, founding validation, JFK → USD capital, deposit/registration/delivery, monthly rent,
  one-year run; data: aircraft plausibility, currencies, registration patterns).
- Verified in browser: founded "Danube Air" at VIE (€75M), leased a 737-800 → OE-LLX, delivered 7 Feb 2026 with
  pro-rata rent, market refreshed, reload restores the game, German phone layout. No console errors.
- Known: `airports.json` is bundled twice (map + engine worker, ~250 kB gzip extra) — share it later (e.g. fetch once).
- **Next:** Phase 1.4 — routes (range/runway checks), demand model, costs (fuel, crew, airport, navigation, maintenance),
  weekly P&L, planes flying on the map.
- Owner confirmed: 1.3 tested on phone.

### 2026-10-27 — Session 5 (Phase 1.4 Routes & money) ✅
- Owner decisions: invisible incumbents, market fare + slider, aircraft can fly several routes (§7).
- **Data:** Eurostat 2019 route totals for Austria (calibration), EIA weekly jet fuel 2026 (`src/data/fuel.ts`),
  fuel burn + maintenance per type, new `marketPop` per airport (pipeline: cities shared between airports, Huff model).
- **Engine:** `geo.ts` (great circle, bearing), `world.ts` (EngineWorld incl. countries, diversion airports, tourism),
  `economics.ts` (block time, range/runway/ETOPS checks, demand, market fare, costs, `routeWeek` forecast),
  `operations.ts` (daily booking of revenue/costs per route, crew + lease accrual, weekly P&L close on Mondays,
  route ramp-up 60 % → 100 % over 8 weeks from first flight), `flights.ts` (weekly flight pattern per aircraft,
  airborne position), commands `OpenRoute`/`UpdateRoute`/`CloseRoute` with `validateRoute`. Save version 2 with
  migration from version 1 (Phase 1.3 saves keep working). Flight numbers: outbound odd from 101, return +1.
- **UI:** Network screen (route cards with last week's passengers, load factor, result; route planner with destination
  search, aircraft choice with free hours, frequency stepper, fare slider and live weekly forecast incl. cost lines),
  Finance screen (cash, 12-week result bars, P&L last week / this week so far, route results table), Fleet shows hours
  and routes per aircraft, map shows routes as great circles and airborne aircraft in livery colour (labels from zoom 4.5),
  new ops messages (route opened/closed, weekly result). Map style moved to `src/ui/map/mapStyle.ts`.
- Tests: 41 (incl. Eurostat calibration, rail cut-off, CASK/LF plausibility, range/runway/ETOPS, P&L reports,
  ramp-up, flight pattern, v1 → v2 save upgrade, MapLibre style validation).
- Verified in browser: VIE–ATH 14×/wk at −25 % + VIE–LIS 4×/wk on one 737-800 → ~5 % weekly margin in April 2026
  (after the fuel spike); aircraft symbol seen landing in Athens; Finance and Network screens on desktop and phone.
- Lessons: the in-app browser pane often doesn't run animation frames, so MapLibre can't even load its style there —
  validate the style with `validateStyleMin` (test) instead of relying on screenshots; front the tab before screenshots.
- Owner feedback after playing: "works perfectly, but too simple and easy to make good profit; I want to see the
  competition". Analysis: all top-100 plans were routes without non-stop competition at +50 % fare (55–60 % margin).
- **Balance update (same session):** one-stop alternative on every market, incumbents match half of price cuts,
  stronger leisure price elasticity, seasons (`seasonFactor`), overheads (new P&L line, `overheadPerDayUsd`),
  save version 3 (migration adds the overhead line). Forecast shows the season; competition text mentions connections.
  Tests: 44 (new: monopoly +50 % no longer fills the plane, summer > winter, price matching).
- Owner feedback on the balance update: overheads line seen ✓; can't see competitors' flights or whether they offer
  stops (→ 2.1); wants past finances to spot patterns (→ done below); wants to choose departure times and plan block
  hours, not only frequencies (→ 2.2 detailed scheduling, owner decision).
- **Finance history:** `src/engine/finance.ts` (periods, `mergePnl`, `sumPeriods`); every day is booked into the running
  week and the running month; months kept forever (`AirlineFinance.month/months`), save version 4 (migration rebuilds
  months from stored weeks). Finance screen: Weeks / Months / Quarters / Years, result chart (`ResultChart`, bars around
  zero, tap to select, hover readout, running period lighter), KPIs for the selected period (revenue, result, margin,
  passengers, LF, change vs previous period), P&L and route table for any period. Tests: 44.
- Verified: 7 months played (A220-300 on MAD + DUB): Q1 −€597k (start-up + winter), April +€228k (8.6 %, LF 81 %).
- **Next:** **Phase 2.1 — visible AI competitors**: fictional AI airlines with names, colours, hubs, fleets, routes and
  fares, shown on the map and per route (who flies, how often, fare, load; non-stop vs one-stop options); they enter/leave
  routes, react to prices, lease aircraft, can go bankrupt; they replace the "invisible incumbents".
  Then **2.2 detailed scheduling**, then **1.5** save slots/export/dashboard.

### 2026-10-27 — Session 6 (Phase 2.1 preparation: real airline data)
- Owner chose **real airlines** (all of them), real hubs, fleets and networks as close to today as possible; home rival
  at the hub (Austrian at VIE); AI behaviour realistic by airline type; existing saves get the airlines.
- Owner's detailed data brief recorded in §5b. Free data check: OpenSky (one recent week of flights) is the only free
  source of *current* networks for all airlines; public OpenSky flight lists end Dec 2021 (COVID-reduced).
- **Blocked on licensing:** OpenSky's terms don't allow publishing derived data in a public repo/app without written
  permission (§5b findings). Nothing fetched, nothing uploaded.
- Owner chose to build from open sources (final brief §5b). Later decided: **no OpenSky at all** (no permission request).
- **Source check done** (table in `docs/DATA_SOURCES.md`, "Source check for real airlines"): ✅ Wikidata (CC0),
  Wikipedia (CC BY-SA → derived tables CC BY-SA), Eurostat (route totals, no airline split), Brazil ANAC (VRA flights,
  per-airline route stats incl. fuel, RAB register with operator), Canada CCAR; 🟡 BTS T-100 (form), UK CAA (airline
  totals only), Ireland IAA (Sept 2025, login since), Austria (operator column empty), FAA (owner downloads by hand);
  ❌ India DGCA, UK G-INFO, Airbus/Boeing O&D (terms forbid reuse → hand-check only); ❓ BITRE, CASA, Malta (sites
  unreachable from here → owner checks in a browser).
- Austrian hand-check templates created: `data-hand/austrian/routes.csv`, `fleet.csv`, `README.md` (format explained).
- Owner approved the source list ("Build").
- **Pipeline step 1 (same session):** `tools/download-airlines.ts` + `build-airlines.ts` → `airlines.json` (1,657 real
  passenger airlines from Wikidata, CC0; shared ICAO codes resolved by Wikipedia language count — DLH = Lufthansa,
  THY = Turkish); `tools/download-eurostat-routes.ts` + `build-eurostat-routes.ts` → `routes-eurostat.json` (12,315
  directed routes, weekly flights/seats/passengers, season **S24** = Apr–Sep 2024, the newest published; VIE–LHR
  59/week each way, VIE–JFK 6.3). Aircraft database 26 → **84 types** (turboprops incl. ATR 42/72-500, Dash 8-100/200/300,
  Saab, Dornier, Twin Otter, L-410; CRJ/ERJ/E1/Superjet/C909/Fokker; A318/A319/A319neo, 737-300/700/900ER, 737-7/-10
  (2027), 757, C919; A330-200/-800, A340, A380, 767, 777-200ER/LR/-300, 747-400/-8; freighters with `payloadT`, kept
  off the lease market). npm scripts `data:airlines:download` / `data:airlines:build`. Tests: 49.
- Owner: no OpenSky email (removed); Austrian tables are drafted by Claude for the owner to check.
- `tools/wikipedia.ts` (polite MediaWiki fetch with cache, redirect resolution, `{{Airport-dest-list}}` parser — reusable
  for every airport article), `tools/download-airport-titles.ts` (11,565 airport articles → ICAO, Wikidata).
  `tools/build-austrian-draft.ts` → `data-hand/austrian/routes.csv`, `fleet.csv`, `DRAFT.md`: 135 destinations from VIE
  (70 year-round, 65 seasonal; 32 without Eurostat 2024 total), weekly flights = Eurostat S24 total split between the
  airlines Wikipedia lists (Austrian 3×, destination's home airline 2×, others 1×, seasonal ½) — sums to ~1,400/week,
  probably 20–40 % too high (Wikipedia misses other airlines on some routes). Fleet: Wikipedia counts + register
  registrations matched by Austrian's series (OE-LB/LX/LZ/LA/LP/LW): 29 A320ceo, 5+2? A320neo, 6 A321, 3 767, 6 777,
  4 787-9 (Wikipedia: 3), 13 E195; 31 on order. Owner accepted it without hand-checking (nothing tagged `hand-checked`).
- **Pipeline step 2 (in progress, 2026-10-27):** `tools/download-wikipedia-airports.ts` (destination sections of 3,812
  airport articles, 50 per request) → `tools/build-wikipedia-routes.ts` → `routes-wikipedia.json`: 27,821 airline
  routes, 665 airlines, 7,981 confirmed by both ends (CC BY-SA). `tools/download-airlines-extra.ts`: 106 brand/subsidiary
  airlines found in Wikidata (AJet, United Express, QantasLink…) — **not merged into airlines.json yet**.
  **Open bug:** `tools/raw/wikipedia/_redirects.json` has some wrong self-mappings from one failed batch (e.g.
  "Henri Coandă International Airport" should → "Bucharest Henri Coandă…"; batch resolution itself works) → re-resolve
  entries where value == key, then rebuild routes (Bucharest, Dhaka, Don Mueang missing until then).
  Still to do in step 2: merge extra airlines (build-airlines), airline articles (business model, bases, fleet tables,
  seat layouts), split Eurostat totals into airline frequencies, FAA/Canada registers, validation report.
- **Next pipeline steps (original list):** Wikipedia articles (business model, bases, destination lists, fleet tables, seat layouts;
  ambiguous destinations listed for the owner); Brazil ANAC + Canada register; split Eurostat route totals between the
  airlines that serve each route; fleets; validation report (Austrian, Lufthansa, Ryanair, Wizz Air); then 2.1a screens.
- (Earlier plan text:) build the pipeline (Wikidata + Wikipedia → airlines/hubs/destinations; official stats
  for frequencies; registers for fleets; new aircraft types), validation report, then 2.1a screens.
