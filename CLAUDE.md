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
- **1.5 Saves & dashboard:** ✅ multiple local save slots, export/import, dashboard with KPIs (load factor,
  RASK/CASK, cash). Phase 1 complete. *Test: play a few months, save, reload on another browser via export.*

*Order change (2026-10-27): Phase 2 comes before step 1.5, and detailed scheduling (from Phase 7) becomes step 2.2:*
- **2.1 Visible AI competitors** — owner chose **real airlines** (see §5b): 2.1a ✅ real airlines visible and competing
  (static); 2.1b ✅ AI behaviour by airline type.
- **2.2 Detailed scheduling:** ✅ own departure times per flight, block times, turnarounds, aircraft rotation timeline,
  time-of-day preferences in passenger choice; competitors get timetables too.
- then back to **1.5** (save slots, export/import, dashboard), then the rest of Phase 2 (cabin classes, reputation) ✅
  (fictional AI airlines are not needed while real airlines are the AI; they come with Phase 6 "fictional startups").

### Phase 2 — Competition and passengers
Fictional AI airlines (enter/leave routes, price wars, order aircraft, go bankrupt), passenger choice
between airlines (price, frequency, quality, reputation), cabin classes and seat pitch, reputation basics, seasonality.

### Phase 3 — Cloud sync and real-clock mode ✅ (2026-10-28)
Free account login, save slots synced across devices, time mode 3 with offline catch-up and "While you were away" report.

### Phase 4 — Fleet depth
Full aircraft database (all manufacturers, historical types), order books and delivery slots, used market,
buy/sell/scrap, ageing and depreciation, A/B/C/D checks with downtime, technical failures, hangars, livery designer.
Split (2026-10-28): **4.1** ✅ buy used, order new, sell/scrap, lease ends/extensions; **4.2** ✅ maintenance checks
(planned by the game, movable by the player) + technical failures + ageing costs + own hangars + lease reserves; **4.3** ✅ livery designer;
**4.4** ✅ historical types (database + encyclopedia; flyable with Phase 5 start years). Phase 4 complete.

### Phase 5 — History and world events
Historical start years (1970s/1990s/2000s), aircraft EIS/retirement dates, event timeline (oil crises,
9/11, 2008, COVID, airspace closures, volcanic ash), economy cycles, fuel prices, currencies.
Split (2026-10-28): **5.1** ✅ world events + economy in today's games (random at real frequencies after Oct 2026);
**5.2** ✅ historical data (fuel prices, exchange rates and old currencies, GDP/population by year, real event timeline
1970–2026, History screen); **5.3** ✅ historical start years (modelled incumbents until Phase 6; books in schilling etc. until 1999).
Phase 5 complete.

### Phase 6 — Real airlines and the Austrian Airlines takeover
Real airlines as AI with real fleets/networks per era and recognizable colors; **detailed Austrian Airlines
takeover scenario at VIE** (multiple start years); fictional startups appearing in real-airline mode.
Split (2026-10-29): **6.1** ✅ calibrate the real airlines to their real numbers + transfer passengers at hubs;
**6.2** ✅ Austrian takeover today (as CEO; Lufthansa Group airlines are partners); **6.3** ✅ real airlines in past years
(real names, hubs, colours, era fleets; modelled routes; closed airlines; real founding/closing dates); **6.4** ✅ Austrian
in past years + fictional startups. Phase 6 complete.

### Phase 7 — Hubs and detailed scheduling
Connecting traffic and O&D flows through hubs, connection waves (timetables themselves come in step 2.2),
slots (LHR, JFK…), curfews, gates, lounges, bases.
Split (2026-10-29): **7.1** ✅ connection waves (flight-by-flight connections, minimum connecting times); **7.2** ✅ slots +
night curfews; **7.3** ✅ gates + own lounges; **7.4** ✅ bases (routes not from the hub). Phase 7 complete.

### Phase 8 — People
Pilots and cabin crew, type ratings and training, crew shortages, strikes; hireable managers with skills,
salaries, mistakes, and delegation levels.
Split (2026-10-29): **8.1** ✅ pilots and cabin crew (headcounts, hiring, type ratings, upgrades, shortages);
**8.2** ✅ unions, wage talks and strikes; **8.3** ✅ managers with delegation per department. Phase 8 complete.

### Phase 9 — Revenue and operations detail
Fare classes, booking curves, dynamic pricing; loyalty program; on-time performance, delays, weather,
incidents (diversions, technical problems); click-any-flight drill-down.
Split (2026-10-29): **9.1** ✅ delays and on-time performance (knock-on through rotations, causes, diversions, missed
connections); **9.2** ✅ click any flight for full detail; **9.3** ✅ booking classes, booking curves, live bookings;
**9.4** ✅ own loyalty programme with tiers. Phase 9 complete.

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
- ~~Phase 3: create a free Firebase project~~ — done (airline-manager-a45e8), 2026-10-28. Never upgrade to Blaze.

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
| 2026-10-27 | 2.1b: AI for the **whole world, simplified** (monthly reviews, only changed routes), plus **world news** | Owner choice; keeps a year of play fast (≈ 0.5 s) |
| 2026-10-27 | 2.2: timetables as **flight pairs on aircraft timelines** (departure time, days of operation, ground time; return = flight number + 1) | Owner choice; like real airline rotations |
| 2026-10-27 | 2.2: **Simple or Detailed scheduling chosen per game**; Simple games can switch to Detailed once (timetable kept) | Owner choice; matches the spec |
| 2026-10-27 | 2.2: **realistic time-of-day demand** (business/leisure decision windows, weekdays, night arrivals, clustering) | Owner choice |
| 2026-10-27 | 2.2: **competitors get generated, plausible timetables** tagged "modelled" (real times only in non-copyable sources) | Owner choice |
| 2026-10-27 | Timetable times stored in **hub local time** (published-timetable convention), converted with IANA time zones incl. summer time; 24-hour pickers (no AM/PM) | Aviation convention |
| 2026-10-27 | 1.5: **every game = its own autosaving slot + named copies** (go back to a copy; it continues in its game's slot) | Owner choice |
| 2026-10-27 | 1.5: **Ops screen is the dashboard** (KPI tiles first, then airline, clock, messages, news) | Owner choice; one tap away on phone |
| 2026-10-27 | 1.5: **airline standard KPIs** (result, margin, revenue, pax, LF, RASK, CASK, CASK ex fuel, yield, utilisation, best/worst routes) with ▲▼ vs last week and 12-week sparklines | Owner choice |
| 2026-10-27 | 1.5: export = **compressed `.amsave` file** (gzip JSON with header); the same bytes are stored in IndexedDB | Owner choice; ~16 KB for a short game |
| 2026-10-27 | Libraries pinned to versions ≥ 2 weeks old: dexie 4.4.6, fflate 0.8.3, fake-indexeddb 6.2.5 (tests) | Avoid freshly published releases (supply-chain safety) |
| 2026-10-28 | Cabins: **refits cost money and hangar days** (free before delivery); editor with **rows, pitch and seat product** per class; **one fare slider per class** | Owner choice (recommended options) |
| 2026-10-28 | Reputation "the realistic option" (owner): **per-class ratings from every passenger's experience feed one brand score**, plus **awareness** growing with passengers; real airlines get modelled values by type | Owner choice; how reviews and word of mouth work |
| 2026-10-28 | European business has a **movable curtain** (unused business rows are sold as economy each flight) | How European network carriers really fly; avoids empty business cabins |
| 2026-10-28 | Phase 3: **Google sign-in**, **automatic sync with safe conflicts** (choose which version continues, the other is kept as a copy) | Owner choice (recommended options) |
| 2026-10-28 | Real clock for **new games and existing ones (one-way switch)**; a game behind today catches up to today, a game ahead keeps its date (offset) and runs at real speed | Owner choice; engine never reads the clock itself (commands carry `now`) |
| 2026-10-28 | Real clock: **the world keeps running while the app is closed**, full catch-up + "While you were away" report; no automatic decisions until managers (Phase 8) | Owner choice |
| 2026-10-28 | firebase pinned to **13.0.0** (13.1.0 was < 2 weeks old); loaded as a separate chunk only when a Firebase project is configured | Supply-chain rule; keeps the game fast without sync |
| 2026-10-28 | Phase 4 split into 4.1 buy/order/sell → 4.2 maintenance checks → 4.3 livery → 4.4 historical types | Owner choice |
| 2026-10-28 | 4.1: **realistic factory backlogs** (A320neo ≈ 6.5 years, 787 ≈ 5, ATR ≈ 2), max 2 deliveries/month per type (wide-bodies 1); Superjet/MC-21 blocked (sanctions), C919/ARJ21/MA60 China only | Owner choice; modelled from news, manufacturers' O&D files may not be reused |
| 2026-10-28 | 4.1: **real payment schedule, cash only**: 1 % deposit, 6 × 5 % pre-delivery payments in the last 24 months, 69 % on delivery; cancelling loses what was paid. Loans come in Phase 10 | Owner choice |
| 2026-10-28 | 4.1: new price ≈ 50 % of list; value −7 %/year (−4 %/year more once out of production), floor = parts value 6 %; straight-line depreciation over 25 years to 10 % (min. 5 years); sell at market −3 %, scrap at parts value | Common appraisal/accounting rules of thumb |
| 2026-10-28 | 4.1: leases end automatically (reminder 90 days before, deposit back); extension in the last 24 months at today's market rent; early return = 60 % of remaining rent | Usual lease practice, simple to follow |
| 2026-10-28 | 4.2: **A, C and D checks** (B merged into A, modern practice); A overnight at the hub if the aircraft stays ≥ 6–12 h there, else 1 day lost; C/D days to weeks out of service | Owner choice |
| 2026-10-28 | 4.2: checks at an **MRO (pay per check) or an own hangar** at the hub (expensive to build/run, checks 45 % cheaper) | Owner choice |
| 2026-10-28 | 4.2: **realistic technical failures**: AOG hours to days, cancelled flights, EU 261 compensation, reputation hit | Owner choice |
| 2026-10-28 | 4.2: **maintenance reserves** for leased aircraft (per flight hour; lessor pays heavy checks from them); owned aircraft pay checks themselves | Owner choice |
| 2026-10-28 | 4.2: checks = 20 % of the old hourly maintenance cost (player's hourly cost lowered by that share); heavy checks capitalised and written off until due again | Keeps the 1.4 calibration; IFRS practice |
| 2026-10-28 | 4.3: livery = **whole aircraft side view**, **patterns + colours plus free drawing** (strokes in a shared 1000×320 frame, clipped to the aircraft), logo = **symbol library, letters or uploaded picture** | Owner choice ("Patterns + colours, but also free draw"; logo "Both") |
| 2026-10-28 | 4.3: **realistic repaint**: new aircraft come in the new livery, the fleet keeps the old one until repainted (cash + days, or with the next C/D-check without extra days) | Owner choice |
| 2026-10-28 | 4.3: liveries stored per airline as a list (aircraft point to the one they wear); unused old ones set to null; default tail = solid colour | Small saves; white letters on a white sweep were invisible |
| 2026-10-28 | 4.4: **historical database + aircraft encyclopedia** now; historical start years stay in Phase 5 | Owner choice; a 1970s start needs the 1970s world (airlines, fuel, demand) to be realistic |
| 2026-10-28 | 4.4: coverage = **jet age and the 1950s propliners** (DC-3 … Constellation, Viscount, Britannia, Electra) | Owner choice ("Also propliners") |
| 2026-10-28 | 4.4: historical prices in **then-year dollars** + BLS CPI table (`priceYear` on the type; undated = 2025 dollars) | Owner choice |
| 2026-10-28 | Phase 5 order: **5.1 world events first**, then 5.2 historical data, then 5.3 historical start years | Owner choice; each step playable |
| 2026-10-28 | Historical games before Phase 6: **modelled incumbents** ("established carriers") instead of real airlines | Owner choice; no wrong names or networks |
| 2026-10-28 | After the real data ends: **realistic random events** at real-world frequencies (recessions, fuel shocks, pandemics, ash, airspace closures, strikes, storms) | Owner choice |
| 2026-10-28 | Historical books in the **real old currency** (ATS, DEM, FRF…), switching to the euro on 1 Jan 1999 at the fixed rates | Owner choice (for 5.2/5.3) |
| 2026-10-28 | 5.1: the past stays real (no invented events before 24 Oct 2026); AI airlines see the same conditions in both their sums (no capacity cuts in crises yet) | Avoids AI mass exits; crisis capacity cuts later |
| 2026-10-28 | 5.2: real history **from 1970**, **big + regional events** (153), **real big events + random small ones** in the past, a **History screen** to see it before 5.3 | Owner choice (all recommended) |
| 2026-10-28 | 5.2: real events also apply to today's games before 24 Oct 2026 (e.g. the 2026 Iran war); events still going on then end at a per-game random date, shown as "no end in sight" | Realism; nobody knows when wars end |
| 2026-10-29 | 5.3: **any start year 1970–2026** (quick choices 1970/80/90/2000/2010/today) | Owner choice |
| 2026-10-29 | 5.3: rivals in historical games = **modelled national carriers** (plus charter and, where they existed, low-cost carriers), rebuilt each year from today's networks; former states (Soviet Union, Yugoslavia, Czechoslovakia, East/West Germany) have their own | Owner choice; real airlines of past years in Phase 6 |
| 2026-10-29 | 5.3: **regulated fares** before deregulation (±10 % around the official fare, no AI price wars); free from US 1978, EU 1993/94, else 1995 | Owner choice |
| 2026-10-29 | 5.3: **real airports per year** (12 replaced airports shown as the old one, Tempelhof/Schönefeld closing with routes moving to BER, 104 later airports hidden before opening) | Owner choice |
| 2026-10-29 | 5.3: prices = 2025 dollars × US CPI ratio; fares additionally × a real fare level (4.2× in 1975 → 1 from 2019), own operating costs × that level^0.8 (^1.0 since 6.4); fuel and maintenance per type unchanged | Keeps realistic margins in every decade (calibration test) |
| 2026-10-29 | 5.3: game options carry `startYear` (unset for today's games); no save version change; worlds are cached per year/airport change | Old saves unaffected |
| 2026-10-29 | Phase 6 order: **calibrate first** (6.1), then Austrian takeover today (6.2), real airlines in past years (6.3), Austrian in the past + fictional startups (6.4) | Owner choice; before 6.1 every real airline lost 30–80 % of revenue in the model |
| 2026-10-29 | Takeover **both ways**: as Austrian's CEO in a scenario (6.2), and buying airlines later with the stock market (Phase 10) | Owner choice |
| 2026-10-29 | Running Austrian: the **Lufthansa Group airlines are partners** (no attacks, feed, codeshares) | Owner choice (realistic) |
| 2026-10-29 | Past years: **real airlines that existed then with modelled routes** (real hubs, colours, era fleets) | Owner choice; open data has almost no old route networks |
| 2026-10-29 | 6.2: **Detailed timetable generated** on the real fleet (Simple can't put several aircraft on a route) | Owner choice |
| 2026-10-29 | 6.2: **money and ownership modelled** (most aircraft owned, A320neo/787 group leases, E195 leases ending 2027–28, 17 A320neo-family group leases coming, €350 m cash) | Owner choice; Austrian's balance sheet sits in the LH Group pool |
| 2026-10-29 | 6.2: **partners = no attacks + feed** (LH Group by Wikidata parent + LHX + ITA) | Owner choice |
| 2026-10-29 | 6.2: **takeover starts today** (any time mode); summer-2024 frequencies scaled to the season, holiday-island routes rest in winter | Owner choice |
| 2026-10-29 | 6.3: past years get **today's airlines that existed then plus airlines that have closed since** (Wikidata), each between its real founding and closing day | Owner choice |
| 2026-10-29 | 6.3: routes = **hubs + demand** (today's network thinned to the economy and size of the time; closed airlines from their real hubs to the best-ranked destinations), all `modelled` | Owner choice |
| 2026-10-29 | 6.3: fleets = **real types per year** from Wikipedia's historical fleet tables, counts modelled; else typical types of the time | Owner choice |
| 2026-10-29 | 6.3: **real dates**: airlines start/stop flying on their real days, with news; the AI can still bankrupt them earlier | Owner choice |
| 2026-10-29 | 6.3: in past years every airline's frequency is its share of that time's demand (today's measured frequencies dropped) | Measured 2024 frequencies plus added closed airlines over-supplied busy routes (2005 VIE startup −59 %) |
| 2026-10-29 | 7.4: **real crew bases** (set-up and running costs, stationed aircraft and crews at local wages, routes from hub or base) | Owner choice |
| 2026-10-29 | 7.4: bases allowed in the **own country and the EU single aviation market** (real dates, Brexit); other rights in Phase 12 | Owner choice |
| 2026-10-29 | 7.4: bases can be **second hubs** with flight-by-flight connections, gates and lounges | Owner choice |
| 2026-10-29 | 7.3: **realistic gate capacity** at the hub (contact gates + remote stands, peak of aircraft on the ground, remote = bus, worse rating, +10 min MCT; remote stands rented automatically, contact gates on purpose) | Owner choice |
| 2026-10-29 | 7.3: **own lounges of any size and quality** at the hub (bases with 7.4); otherwise contract lounge per passenger; partners' lounges at their hubs | Owner choice |
| 2026-10-29 | Phase 7 order: **7.1 waves → 7.2 slots + curfews → 7.3 gates + lounges → 7.4 bases** | Owner choice |
| 2026-10-29 | 7.1: **connections flight by flight** (MCT, waits up to 2½ h good, max 7 h / 12 h long journeys), connecting passengers booked on the connecting flights; Connections view with waves and missed connections | Owner choice |
| 2026-10-29 | 7.2 (planned): **realistic slots** (IATA Level 3 airports, seasonal allocation with newcomer priority, 80/20 use-it-or-lose-it, slot purchases at Heathrow) | Owner choice |
| 2026-10-29 | 7.2 (planned): **real night curfews/quotas** hand-entered with sources for the ~100 busiest airports | Owner choice |
| 2026-10-29 | 7.1: takeover timetables planned in **five waves** with night stops | Without waves the flight-by-flight model cut Austrian's transfers from 40 % to 32 % |
| 2026-10-29 | 6.4: Austrian takeover in **any start year 1970–2026** | Owner choice |
| 2026-10-29 | 6.4: Austrian's **fleet per year entered by hand** (Wikipedia EN/DE, counts partly modelled), registrations made up in its real OE-L series, all owned | Owner choice; old registers aren't open data |
| 2026-10-29 | 6.4: **partners follow history** (Tyrolean 1997, Lauda Air 2001, Qualiflyer 1998–2000, Star Alliance from 2000, Lufthansa Group from Sep 2009; also today: LH Group + Star Alliance) | Owner choice |
| 2026-10-29 | 6.4: subsidiaries at the hub **fly for the player** (aircraft + routes join on their real date) | Otherwise Tyrolean/Lauda competed with Austrian at Vienna |
| 2026-10-29 | 6.4: **fictional startups at a realistic rate** (≈ 8/year in free markets, many fail) | Owner choice |
| 2026-10-29 | 6.4: real fare level 1985–2010 raised (IATA 2016: −61 % since 1995) and own costs follow it fully (was ^0.8) | Austrian's margins per decade went from +27 % … −30 % to +11 % … −7 % |
| 2026-10-29 | 6.1: transfer passengers at hubs (network airlines + the player), measured route passengers split into local + transfer, smaller winter schedules, route-sized aircraft, thin unmeasured routes ≤ 3/week, low-cost fares 60 % + low-cost cost profile, connections half as attractive | Calibrated to Austrian 2024, Vienna Airport 2024 and Ryanair FY25 (docs/DATA_SOURCES.md) |
| 2026-10-29 | Phase 8 order: **8.1 crews → 8.2 unions/strikes → 8.3 managers** | Owner choice |
| 2026-10-29 | 8.1: **real headcounts** per base and licence family from the timetable (750/800 block h a year, +10 % reserve, augmented crews), hiring takes weeks, type ratings ≈ 7 weeks, upgrades; shortages cancel flights with compensation | Owner choice |
| 2026-10-29 | 8.1: **real job market** by region (market population) and era (pilot surpluses/shortages), pay per base 80–130 %; big employers attract more applicants | Owner choice; without the size effect Austrian would shrink by attrition |
| 2026-10-29 | 8.1: HR plans crews automatically by default (switchable); old saves and takeovers get the crews their timetable needs; new startups must hire | Realistic start; managers (8.3) will replace the simple HR switch |
| 2026-10-29 | 8.3: managers **delegate per department** (advise / act after OK / decide alone; skills, salaries, mistakes; act while away in real-clock mode) | Owner choice |
| 2026-10-29 | 8.2: wage talks in **rounds of offers** (union demand from inflation, profits, job market; offers every 2 weeks; mediation; HR offers if the player doesn't) | Owner choice |
| 2026-10-29 | 8.2: **pilot and cabin crew unions per country** with real names | Owner choice |
| 2026-10-29 | 8.2: **real strike culture by country** (notice, warning strikes, minimum services, no-strike periods); strikes only after the agreement ends; EU 261 compensation for own-staff strikes from 2021 unless 14 days' notice | Owner choice; CJEU C-28/20 |
| 2026-10-29 | 8.2: **the agreement sets pay**; the station pay setting becomes extra pay on top (100–130 %) | Owner choice |
| 2026-10-29 | 8.3: managers for **all five departments** (network, revenue, fleet, maintenance, HR); finance with loans in Phase 10 | Owner choice |
| 2026-10-29 | 8.3: **generated candidates** (local made-up names, 1–5 stars, experience, specialty, salary by skill; new each month; poaching) | Owner choice |
| 2026-10-29 | 8.3: **proposal inbox** for "after my OK" (expires after 2 weeks, waits while away); "advise" = advice only; "decide alone" acts and reports | Owner choice |
| 2026-10-29 | 8.3: **judgement by skill** (estimate = true effect + error shrinking with skill); forecast and real effect shown in a track record | Owner choice |
| 2026-10-29 | 8.3: without a head a department makes no proposals; HR staff keep planning crews (old behaviour); manager randomness from stable hashes (other random events unchanged) | Old games and calibration unchanged |
| 2026-10-29 | **Cities with several airports**: other airports < 100 km count as competition and share their travellers (weight 0.8 × (1 − km/130), travellers × 0.5); unmeasured routes next to measured ones keep (1 − weight) of their demand | Vienna–Orly showed ≈ 52 % margin without CDG's competitors (owner asked for the fix before Phase 9) |
| 2026-10-29 | Phase 9 order: **9.1 delays/OTP → 9.2 flight drill-down → 9.3 booking classes + dynamic pricing → 9.4 loyalty** | Owner choice |
| 2026-10-29 | 9.1: **delays per flight with knock-on through rotations** (airline, ATC, airport, weather causes; buffers; diversions; curfews; missed connections; EU 261 from 3 h for own causes); calibrated to EUROCONTROL CODA 2024 | Owner choice |
| 2026-10-29 | 9.3 (planned): **booking classes per cabin filled along a booking curve**, dynamic pricing by hand or by the revenue manager; class-fare sliders stay as base level | Owner choice |
| 2026-10-29 | 9.4 (planned): **own frequent-flyer programme with tiers**; points a liability; alliance partners' programmes count | Owner choice |
| 2026-10-29 | 9.2: single flights kept **7 days**; flight pages reachable **everywhere** (departures board, map aircraft, timetable, route cards, fleet cards) | Owner choice |
| 2026-10-30 | 9.3: **live bookings day by day** for every upcoming flight (on sale 60–120 days ahead), **own fare buckets** (name, price %, flexible, advance purchase, default seat share), **seats per bucket by hand** per route and class | Owner choice (not the recommended options) |
| 2026-10-30 | 9.3: willingness to pay calibrated so the default buckets keep Austrian's margins; AI airlines keep average fares | Default settings give no free advantage; good settings earn more |
| 2026-10-30 | 9.4: points **per euro spent** (status bonus), **award seats on own flights** (share of economy, taken from sale), points as a liability with breakage | Owner choice |
| 2026-10-30 | 9.4: taken-over airlines **stay in their group's programme** (Austrian: Miles & More; fee per point, paid for the group's award seats; can leave) | Owner choice |
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
- **Pipeline step 2 (continued, same day):** fixed title resolution (API errors were silently treated as "no redirect";
  now batches split on error), parser accepts both `{{Airport-dest-list}}` and `{{Airport destination list}}` (big
  airports like MUC/CDG use the latter) → **51,760 airline routes, 824 airlines** (35,490 confirmed by both ends);
  129 brands/subsidiaries merged (cumulative second Wikidata pass; brands without own ICAO code get their Wikidata id);
  airline articles (+ 26 separate "… fleet" articles via Main/Excerpt links) → `airline-details.json`: business model
  (560 legacy, 123 low-cost, 80 regional, 61 charter), hubs/bases, current fleet only (first table with "In service"),
  27,214 aircraft; aircraft types 84 → **103** (commuter, older and regional types: Caravan, PC-12, Islander, King Air,
  MD-80, A300/A310, 717, 737-200, Avro RJ, An-24/26, Metro, Jetstream 32, Do 228, MA60, Tu-204, MC-21…);
  `tools/aircraft-names.ts` (name patterns incl. Boeing customer codes), `tools/xlsx.ts` (register reader);
  `networks.json` (weekly flights where Eurostat has totals: 10,703 routes); `docs/validation/real-airlines.md`
  (Austrian, Lufthansa, Ryanair, Wizz: destinations vs. their Wikipedia lists, frequencies vs. Eurostat, fleets vs.
  Austrian/Irish registers). Austro Control register **does** have operators (68 × Austrian Airlines AG = our draft).
  `src/data/generated/README.md` lists licences (networks/details = CC BY-SA 4.0). Tests: 54.
- **Registers (2026-10-27):** `tools/build-registers.ts` → `registers.json`: 7,443 individual aircraft (registration,
  type, build year) at 87 airlines from FAA, Transport Canada, Austro Control (operator column) and IAA Ireland; owner
  names matched by company-name key (legal forms and words like "Airlines" removed); regional operators without own
  network (SkyWest, Republic) included; leased aircraft under trust banks not matched. More register model codes in
  `aircraft-names.ts` (CL-600-2xxx, ERJ 170/190-x00, BD-500, 737-9xxER…). Tests: 56.
- **2.1a (same session) — real airlines in the game:** `src/engine/realAirlines.ts` (RealAirline/RealRoute, pair
  index, `observedWeeklyPax`), `src/data/realAirlinesData.ts` (lazy loader, shared by worker and UI),
  `src/data/airlineColors.ts` (~85 hand-entered brand colour pairs, others generated and marked). Engine:
  `competitorsOn()` = real airlines per direction (weekly from Eurostat split, else demand model; tag `official` only
  when alone on the route, otherwise `modelled`); fare level by business model (`MODEL_FARE`: low-cost 0.75, legacy
  1.05, regional 1.0, charter 0.85); routes without real airlines have no non-stop competition (one-stop only).
  Market demand uses **measured Eurostat passengers** where available (× 0.75 local share, ÷ 1.12 summer→year), which
  fixed holiday routes (PMI, LCA, AYT) where the gravity model was 4× too low. Balance (best plans from VIE vs real
  airlines): July ~15–25 %, April ~10–20 %, January ~−5…+10 %. UI: planner lists competitors (tail fin, weekly,
  type, source tag, link), market size tagged official/modelled; new screens **Airlines** (`#/airlines`, list +
  `?id=` detail: hubs, bases, alliance, parent, colour source, fleet Wikipedia vs register, registrations, network with
  tags, "Show network on the map") and **Data sources** (`#/sources`, all credits + tag explanations); map shows another
  airline's network (`#/map?airline=AUA`, layer `other-routes`); `useRouteParam`, `hrefFor(route, params)`; nav: Airlines
  in rail/More, Data sources in rail bottom/More. Airline names fall back to the Wikipedia title when Wikidata has no
  English label. Tests: 60.
- **Known / to do:** airline data is bundled twice (worker + UI) → offline cache ~18 MB (≈4 MB gzip): load it once
  (e.g. fetch a JSON asset in both places). Real airlines don't move on the map yet (planes for 27k aircraft are too
  many per tick; later: show the selected airline's flights). AI doesn't react yet (2.1b). Save files unchanged in
  2.1a (real airlines are static data), IndexedDB move comes with 2.1b when AI state changes.
- **2.1b (same day) — AI airlines react, whole world simplified** (owner: whole world + world news):
  `src/engine/ai.ts`: every airline reviews its network once a month (staggered over a 28-day cycle); behaviour by type
  (`BEHAVIOUR`: low-cost matches fully and undercuts 3 %, exits after 2 bad reviews, enters 30 %/month; legacy follows
  50 % of a cut, defends hub/base routes +25 % flights, exits after 4; regional/charter react little; **home rival** =
  legacy airline at the player's hub: follows 80 %, defends +40 %, enters 30 %). Only routes where something differs
  from reality are reviewed (player there, AI change, new competitor, AI-opened) — untouched real routes stay as in the
  data, so the world stays stable and fast (a full year for all 824 airlines ≈ 0.5 s). Exits only when a route loses
  money and is clearly worse than its real starting point; AI-opened routes close if they lose. Growth: new routes from
  hubs/bases to busy airports others serve (≈1,200/year worldwide). Health = loss vs. real starting point of the
  airline's real routes; bankruptcy for small airlines with health < −10 % (8 %/review) or very rarely for weak small
  non-legacy ones. Monthly player watch: airlines with a base at either end may enter the player's full, profitable
  routes. AI changes stored compactly in `state.ai` (save version 5; ≈0.3 MB after a year). `competitorsOn` merges AI
  changes; `routeWeek` takes a context (ai, exclude, extra suppliers) so player and AI share one market model; with
  real airlines the automatic "incumbents match half" rule is gone (AI reacts itself with up to a month's delay).
  Derived bases now need ≥ 8 routes to ≥ 3 countries (fixed Pegasus "based" at DUS). UI: AI messages to the player,
  **World news** panel on Ops (≤ 2/day), planner shows competitor fare level and "reacted", airline pages show the
  network as it is in the game (new routes, closed count, bankruptcy). Tests: 65 (price war, home rival defence, entry,
  one-year stability/speed/size, determinism).
- **Next (then):** 2.2 detailed scheduling, then 1.5 (save slots → IndexedDB, export, dashboard).
- Owner confirmed: 2.1b tried.

### 2026-10-27 — Session 7 (Phase 2.2 Detailed scheduling) ✅
- Owner decisions (all recommended options): flights on aircraft timelines; Simple/Detailed per game (switch once);
  realistic time preferences; generated competitor timetables (§7).
- **Engine:** `timetable.ts` (directional block times with westerly wind, rounded to 5 min; decision-window passenger
  choice per hour; weekday factors; generated competitor timetables; day-mask helpers), `schedule.ts` (`FlightPair` =
  out + ground + back on weekdays, hub local time; `validateSpecs`: overlaps incl. hub turnaround and week wrap,
  minimum ground time, max 36 h, 5-min steps, weekly hours; `autoPlanAircraft` = Simple mode planner (old
  06:00–21:00 back-to-back logic, grouped into weekday pairs); `ensureFlights` for old saves; `makeDetailed` gives every
  pair its own flight number). `routeWeek` now works **flight by flight** (per weekday and direction; competitors
  from `competitorDepartures`; mixed aircraft types per route; result per flight in `byFlight`). Daily booking books the
  flights of that weekday. `time.ts`: `utcOffsetMin` (IANA, cached), `weekdayOf`. Map legs from the pairs.
  Commands: `OpenRoute`/`UpdateRoute` take `flights` in Detailed mode, new `SetScheduling`. AI sees the player's real
  timetable. Save version 6 (migration: Simple, pairs planned on load). Balance unchanged (see DATA_SOURCES).
- **UI:** wizard choice Simple/Detailed; Network: Routes / Timetable tabs (departures board, local times, days
  "12345··", weekday filter), switch-to-Detailed button, route cards show departures; route planner: timetable editor
  (aircraft, 24-hour time pickers, weekday toggles, ground time, computed local times, night stop chip), live rotation
  chart per aircraft (`AircraftTimeline`: magenta = editing, red = collision), forecast per flight (pax/flight, LF) and
  competitors' departure times (modelled); Fleet: "Show week" rotation chart per aircraft.
- Tests: 76 (wind, summer time, morning vs night, clustering, Friday vs Tuesday, competitor waves, detailed open/
  overlap/night stop/ground time, weekday booking, switch to Detailed, v5 → v6 upgrade).
- Verified in browser: old save migrated (Simple times), switched to Detailed, edited and saved a timetable,
  collisions shown in red and blocked, phone 375 px without sideways scrolling, 6 game days simulated, no console errors.
- Known: Simple auto-plan leaves gaps (e.g. empty Sundays) like before; crew duty limits, curfews and slots come later
  (Phases 7/8); real airlines' planes still not on the map.
- **Next (then):** 1.5 — save slots (IndexedDB), export/import, dashboard with KPIs.
- Owner confirmed: 2.2 tried.

### 2026-10-27 — Session 8 (Phase 1.5 Saves & dashboard) ✅ — Phase 1 complete
- Owner decisions (all recommended): game slots + copies, Ops = dashboard, airline standard KPIs, compressed export (§7).
- **Persistence** `src/persistence/`: `saveFile.ts` (format `airline-manager-save` v1: header + state, gzip via fflate;
  also reads plain JSON and the old bare autosave), `saves.ts` (Dexie database `airline-manager`: table `slots` = small
  list entries, table `data` = compressed bytes; delete a game → its copies too; current slot id in localStorage;
  `navigator.storage.persist()` requested so the browser keeps saves). The engine worker packs/unpacks saves
  (`serialize`, `loadBytes`), so the screen never stalls. `src/game/store.ts`: autosave into the open game's slot at most
  every 15 s / once per game day while running, always on pause, commands and leaving the app; one save at a time;
  `startNewGame` (new slot, old game kept), `saveCopy`, `loadSlot` (copy → continues in its game's slot),
  `closeGame`, `deleteSave`, `exportSave`, `importSave` (new slot). The old localStorage autosave moves into a slot on
  first start. Settings: link to Saves instead of "Quit game".
- **KPIs** `src/engine/kpis.ts` (`periodKpis`): ASK/RPK/block hours now recorded per route and day (`RouteStats.ask/rpk/
  blockHours`, optional — older periods rebuilt from route distances, no block hours).
- **UI:** Saves screen (`#/saves`, rail bottom + More on phone: open game with "Save copy"/"Close game", games with
  their copies, Continue / Go back / Export / Delete, Import file, storage use), Ops dashboard (`Dashboard.tsx`: hero
  result + cash, 9 KPI tiles with explanation, ▲▼ change in ECAM colours by whether up is good, sparkline with hover
  readout, best/weakest routes).
- Tests: 81 (save file round trip/size/legacy/garbage, IndexedDB slots with fake-indexeddb, KPI maths + old periods).
- Verified in browser: old autosave migrated into a slot, dashboard values, copy saved, export captured in the page
  (16 KB) and re-imported as a new game, delete + continue, phone layout without sideways scrolling, no console errors.
- **Next:** rest of Phase 2 (cabin classes and seat pitch, reputation) — or what the owner prefers next.
- Owner confirmed: 1.5 tried.

### 2026-10-28 — Session 9 (Phase 2: cabins, seat pitch, reputation) ✅
- Owner decisions: refits cost money + days, rows/pitch/seat product editor, fare per class, realistic reputation (§7).
- **Engine:** `cabins.ts` (classes F/J/W/Y, seat products with pitch ranges and prices, seats per row by type, cabin
  length, `validateCabin`, typical layouts/presets `standardCabin`, `modelCabin` for real airlines, `refitQuote`, class
  demand shares, class fare ratios, seat scores, brand appeal, service costs), `reputation.ts` (weekly experience sums,
  class ratings, brand score, awareness, 2-year history). `routeWeek` now works class by class: travellers wanting a
  class pick the best class each flight offers (class fit × price × seat × brand × speed), revenue per class, movable
  curtain for European business, experience per class, service costs. Competitors' cabins and reputations by airline
  type (modelled); AI airlines fly model cabins; the AI sees the player's cabins, class fares and brand. Command
  `RefitCabin` (free before delivery; else cash, hangar days with flights cancelled, `refitDone` event, depreciation
  over 6 years). Routes get `classFares`. New P&L lines `service` and `depreciation`; `RouteStats.classes`. Save
  version 7 (migration: all-economy cabins with the old seat counts, single-class lease offers, reputation with awareness
  from last week's passengers). Lease offers come with the previous operator's layout.
- **UI:** Fleet: cabin bar + layout per aircraft and offer, **cabin editor** (presets, per class: seat product, pitch,
  rows, passenger rating short/long-haul, fill with economy, cost/days quote, free before delivery), "Refit until" chip;
  Network planner: fare slider per class, forecast per class, competitors' cabins; route cards: load factor per class;
  Ops: **Reputation panel** (brand score with trend, awareness, ratings per class with reasons); Finance: new lines.
- Tests: 95 (layouts fit all types, seat counts, invalid layouts, refit prices/days, flat > recliner, legroom, class
  fares, curtain, free change before delivery, refit cancels flights + depreciation, reputation up/down, awareness,
  weekly update, v6 → v7 upgrade).
- Verified in browser: old save migrated, euro-business preset, refit ordered (5 days, €64k) and finished, class fares
  and per-class forecast, reputation panel after 3 weeks, phone 375 px without sideways scrolling, no console errors.
- Known: long-haul point-to-point still loses money (transfer traffic comes in Phase 7); seat weight doesn't change
  fuel burn yet; lounges are a per-passenger cost (own lounges with Phase 7).
- **Next:** owner tries cabins; then Phase 3 (cloud sync + real-clock mode) or what the owner prefers.
- Owner confirmed: cabins tried.

### 2026-10-28 — Session 10 (Phase 3: cloud sync + real-clock mode) ✅ (sync live; owner's device test pending)
- Owner decisions: Google sign-in, automatic sync with safe conflicts, real clock for new + existing games, world keeps
  running with a report (§7).
- **Real clock:** time mode `realclock` (`GameOptions.clockOffset`), new games start now (`NewGameOptions.startTime`),
  command `SetTimeMode` (Settings; one way). Worker: live tick every second sets game time = real time; gaps ≥ 60 min
  are caught up week by week with a progress banner (`CatchUpBanner`), then `awaySummary` (`engine/away.ts`: flights,
  pax, revenue, result, cash before/after, player messages) → "While you were away" panel on Ops. App back in the
  foreground → `wake()`. LIVE sign instead of speed buttons. No save version change.
- **Cloud sync (code done, not connected yet):** `persistence/sync.ts` (pure `planSync`: upload / download / delete in
  cloud / delete here / conflict, by comparing each slot's `sync: {rev, savedAt}` with the cloud revision; `runSync`,
  `resolveConflict` keeps the other version as a copy), `persistence/cloudFirebase.ts` (Google sign-in with pop-up,
  redirect fallback; Firestore `users/{uid}/slots/{id}` + `chunks/{n}` of ≤ 700 KB; uploads in a transaction that checks
  the revision), `firestore.rules` (only the owner of the data), `persistence/firebaseConfig.ts` (**null until the owner's
  project config is pasted in**), `game/cloud.ts` (sync on start before the last game reopens (max 6 s wait), on
  leaving/returning, every 3 min if something changed; autosaves held during a sync; open game reopened if replaced;
  deletions remembered and done in the cloud), Saves screen: Cloud panel (sign in, status, sync now, conflicts) and a
  cloud state per slot. `deleteSlot` returns the synced ids; `writeSlot` keeps a slot's sync state.
- Tests: 103 (sync rules, two devices via a fake cloud incl. conflict + copy, deletes both ways, open game never
  overwritten; real-clock start, switch behind/ahead, away report = accounts).
- Verified in browser: test game switched to the real clock, 132 days caught up in seconds with report, LIVE sign,
  game time = real UTC, no console errors.
- Owner created Firebase project **airline-manager-a45e8** (Spark, Firestore europe-west3, Google sign-in, rules from
  `firestore.rules`); web config is in `firebaseConfig.ts` (public by design). Checked from outside: unauthenticated
  Firestore read → 403 (rules work), Google provider enabled. Sign-in itself needs the owner (can't be done by Claude).
- **Next:** owner signs in on computer and phone, checks that a game appears on both and that a conflict offers the
  choice; then Phase 4 (fleet depth) or what the owner prefers.
### 2026-10-28 — Session 11 (Phase 4.1: buy, order, sell) ✅
- Owner decisions (all recommended): buy/order/sell first, realistic backlogs, real payment schedule (cash), maintenance
  checks planned by the game but movable (4.2) (§7).
- `src/data/factory.ts` (backlog years, blocked types, price shares, payment plan, depreciation constants),
  `src/engine/fleet.ts` (orders with delivery slots and staged payments, buy used, sell/scrap, lease end/extend/early
  return, daily fleet step, book value/depreciation, removing an aircraft clears its flights). Aircraft are now
  `lease` / `owned` / `order`. Market: 24 used aircraft for sale + 15 % brand-new lessor aircraft (6–30 months).
  New P&L line `disposals` (gains/losses on sales, lost deposits, early-return fees); depreciation of owned aircraft.
  Save version 8 (migration adds the sales market + line).
- UI: Fleet tabs My fleet / Lease market / Buy used / Order new, `FleetSummary` line, `Ownership` facts + actions with
  confirm, new ops messages. Fixes after the browser check: missing payment-plan text, small types default to an
  all-economy cabin when ordered, "ATR ATR 72" title, no age for aircraft not built yet.
- Tests: 113. Verified in browser: bought a used ATR 42, ordered 2 ATR 72-600 (deliveries Oct 2028), cancelled one,
  phone 375 px without sideways scrolling, no console errors.
- Known: owning looks much cheaper than leasing in the P&L (no interest on the cash until loans in Phase 10);
  lessor cabins on small types sometimes have a business section (from Phase 2 `lessorStyle`).
- **Next:** 4.2 maintenance checks (A/C/D with downtime, planned by the game, movable), technical failures, maintenance
  costs rising with age.
### 2026-10-28 — Session 12 (Phase 4.2: maintenance) ✅
- Owner decisions (all recommended): A/C/D checks, MRO + own hangar, realistic failures, maintenance reserves (§7).
- `src/data/maintenance.ts` (check programme per category, prices, reserves, hangars, failure chances, EU 261),
  `src/engine/maintenance.ts` (`MaintState` per aircraft: flight hours, last A/C/D, plan, in check, AOG, write-off,
  reserves; `initialMaint` new/transition/used; `checksDue`; daily step: hours flown, reserves, A-checks overnight or
  1 day grounded, heavy checks planned 120 days ahead in the low season and pulled forward if flying more, started on
  their day; failures rolled per day and fired as events with repair, compensation, care and a reputation hit;
  `moveCheck`, `buildHangar`, `hangarReady`). `schedule.ts`: `grounded`, `aogCancels`, `pairDepartureUtc`;
  `routeWeek` ctx `checksSeparate`. Save version 9 (migration: histories, reserves, hangars, `disruption` line).
- UI: Fleet tab **Maintenance** (check plan, own hangar), check facts + "Move check" (date, quote, short-notice,
  reserves) on fleet cards, chips "C-check until" / "AOG until", next heavy check on used aircraft for sale, new ops
  messages, P&L line "Passenger compensation & care", reputation column "Cancellations", grounded aircraft hidden on the
  map, Saves note no longer says cloud sync is coming.
- Tests: 124. Verified in browser: migrated real-clock game shows checks and reserves; new turn-based test game "Maint
  Test Air" (local dev browser only): leased 737-800 on VIE–LHR, C-check moved, ran 10 days (lessor paid part from
  reserves), finished and back in service; phone 375 px without sideways scrolling; no console errors.
- **Next:** 4.3 livery designer (or what the owner prefers).

### 2026-10-28 — Session 13 (Phase 4.3: livery designer) ✅
- Owner decisions: whole aircraft; patterns + colours **and** free drawing; symbol library + letters **and** picture
  upload; realistic repaint (§7).
- Engine `src/engine/livery.ts` (`Livery` in state: 3 colours, base, fuselage style + colour, tail style, engines,
  logo, titles, strokes; `validateLivery` with size limits; `setLivery`, `repaint` now or `atCheck`, `repaintDone`,
  `repaintWithCheck` (called when a heavy check starts), `paintOnDelivery`; repaints written off like refits).
  `Airline.liveries`, `Aircraft.paint/paintUntil/repaintAtCheck`; `grounded` includes the paint shop. Save version 10.
- UI: `#/livery` designer (`LiveryScreen`: sticky preview on any type, colours/base, 8 fuselage + 8 tail styles with
  live mini previews, engine colour, logo symbol/letters/picture, titles, freehand drawing with pen colour/width,
  undo/clear, save, "repaint all with next check"); `AircraftSide` (parametric side views for all 103 types),
  `AircraftPaint` (fleet cards: aircraft in the livery it wears, "Old livery" + repaint now / with next check),
  livery tail on fleet card heads and the Ops airline card, "Livery designer" button on Fleet, phone tab stays Fleet.
- Tests: 130. Verified in browser: shapes (737, ATR 72, CRJ900, 787-9, 747-8, A380), chevron + cheatline + swallow
  logo + drawing saved, fleet shows old livery, repaint now → "Paint shop until", phone 375 px without sideways scrolling.
- **Next:** 4.4 historical aircraft types (with Phase 5), or what the owner prefers.

### 2026-10-28 — Session 14 (Phase 4.4: historical aircraft + encyclopedia) ✅ — Phase 4 complete
- Owner decisions: database + encyclopedia now (historical starts in Phase 5), jet age + propliners, then-year prices (§7).
- Data: `tools/download-cpi.ts` + `build-cpi.ts` (`npm run data:cpi`) → `src/data/generated/cpi.json` (BLS CPI-U 1913–2026);
  `src/data/inflation.ts` (`cpiOf`, `usdInYear`); `src/data/aircraftHistorical.ts` (62 types: DC-3 … A340-500, incl.
  Comet, 707, DC-8, Caravelle, 727, Trident, VC10, One-Eleven, DC-9, Tu-134/154, Il-18/62/86/96, Yak-40/42, 747 classics,
  DC-10, TriStar, Concorde, A300B4, MD-11 passenger, 737 Classic, MD-87/90, F28/F70, BAe 146, propliners). `AircraftType`
  gets `priceYear` and `propulsion: 'piston'`; `listPriceUsd(type, year)`; `newPriceUsd` and lease rents convert from
  `priceYear` (today's types unchanged); Il-96 blocked (sanctions). 165 types in total (155 without freighters).
- Side views: rear-engine and three-engine T-tails (727, Trident, Tu-154…), DC-10/MD-11/TriStar tail engine, 747 classic
  humps, four-engine propliners (outer engines smaller), Concorde (delta, no tailplane), fin height now scales with the fuselage.
- UI: **Aircraft** screen (`#/aircraft`, rail + More on phone, new icon): search, category, still flying/retired, decade,
  freighters; rows with a 1930–2035 timeline (built = cyan bar, service = line, game year = magenta); detail page
  (`?id=`) with side view in your livery, chips, large timeline, specs, then-year price + today's dollars, "in your game"
  (orderable / used market only / freighter later / historical → Phase 5). BLS credited on Data sources.
- Tests: 132. Verified in browser (desktop + phone 375 px, no new console errors).
- **Next:** Phase 5 (history and world events: historical start years using these types) — or what the owner prefers.

### 2026-10-28 — Session 15 (Phase 5.1: world events and economy) ✅
- Owner decisions: events first, modelled incumbents for history, realistic random future, old currencies (§7).
- Engine `src/engine/worldEvents.ts`: `state.world` (fuel, fuel history, FX base + EUR/USD history, events; save v11),
  `REAL_DATA_END` = 24 Oct 2026; daily fuel random walk with mean reversion + fuel shocks; monthly FX walk with pegs;
  11 event kinds with yearly rates/seasons (`SPAWNS`), `intensity` (gradual events rise, hold, recover), `conditionsOf`
  (fuel, 3 %/yr traffic trend, demand per segment/continent), `closureAt`/`closureCancels` (stable share of flights).
  `closures.ts`: pairs touching a closed airport don't fly (`plannedFlights`), daily care costs (P&L "disruption") +
  message. `routeWeek` takes `ctx.conditions` (fuel, demand, fares follow demand^0.3, competitors' capacity × trend);
  player booking, AI evaluations and the route planner forecast use them.
- UI: Ops **World situation** panel (`WorldPanel`: jet fuel with 52-week sparkline, euro/USD or book currency per USD,
  demand in the hub's continent, traffic growth, events now with where/until/strength, last three months), world news +
  player messages ("affects your network", "yesterday N flights cancelled … care … no compensation").
- Tests: 139 (no events before the real data end, 20-year rates/fuel/FX ranges and pegs, determinism, recession cuts
  business most, closure cancels + care costs, traffic trend, v10 → v11). 45 simulated years checked by hand: fuel
  $2–4.7, EUR/USD 0.91–1.22, ~7 ATC strikes, ~9 winter storms, a recession every 5–7 years.
- Verified in browser (turn-based test game to May 2027: strikes, storms, airport strike in the panel; phone; no console errors).
- **Next:** 5.2 historical data (fuel prices since 1990 and earlier, exchange rates + old European currencies, GDP and
  population by year, real event timeline 1970–2025).
- Owner confirmed: 5.1 tried.

### 2026-10-28 — Session 16 (Phase 5.2: historical data) ✅
- Owner decisions: from 1970, big + regional events, real big + random small, History screen (§7).
- Pipeline `npm run data:history` (`tools/download-history.ts` + `build-history.ts`): EIA monthly jet fuel since 1970
  (spot from 1990, refiner resale from 1975 scaled, crude-based before) → `fuel-history.json`; Federal Reserve H.10
  daily rates (two page layouts) + World Bank yearly → `fx-history.json` (50 currencies, units/USD monthly 1970–2025,
  legacy euro currencies, synthetic euro from DEM); World Bank population/GDP/passengers → `economy-history.json`
  (demand index per country, elasticity 1.10, propensity fitted to world totals: 1970 0.07 of 2019 like reality).
- Data: `src/data/currencyHistory.ts` (21 old euro currencies, fixed rates, changeover dates), `fxHistory.ts` (lazy;
  `perUsdAt`, `currencyAt`), `economyHistory.ts` (`demandIndex`, `worldDemandIndex`), `fuel.ts` reads the monthly history
  before the 2026 weekly data, `history.ts`: **153 real events 1970–2026** with Wikipedia sources (incl. the 2026 Iran
  war found by web search); texts EN/DE in i18n `hist.<id>`.
- Engine (no save change): new kinds crisis / flightBan (`pairWith`) / disruption / milestone; event `profile`, `local`,
  `openEnded`; `historicEvents(seed)` + `eventsOf(state)` merge real and simulated events (open-ended ones get a per-game
  end); `conditionsOf` adds `growth(a, b)` (economy history before 2025) used for demand and competitors' capacity;
  demand effects by country or continent; flight bans per pair; real events announced in the news on their day; random
  small events (strikes, storms, Etna; German strikes from 2012) also before the real data end.
- UI: **History** screen (`#/history`, rail + More): charts (jet fuel then/2025 dollars, any currency per USD incl.
  schilling, world passengers real vs model) with hover readout; timeline with filters (kind, decade), where, strength,
  source link. World panel lists real events, open-ended ones say "no end in sight"; messages use the event's name.
- Tests: 149 (timeline consistency, 2010 ash cloud cancels VIE–LHR, flight bans by pair, open ends per seed, 9/11 and
  SARS demand, COVID calibration vs world totals, fuel history and seam, schilling = euro × 13.7603, currency by date,
  demand index growth).
- Verified in browser (desktop + phone 375 px, charts, timeline, Ops panel in a 2027 game, no console errors).
- Known / for 5.3: Ukrainian (and other closed) airports are missing from today's airport data; re-based currencies
  (TRY, PLN, BRL…) are in today's units; costs other than fuel are still in 2025 dollars; fares in the past need their
  historic level; the into-plane fuel fee is in 2026 dollars.
- **Next:** 5.3 historical start years (modelled incumbents, books in schilling etc., historical airports and prices).

### 2026-10-29 — Session 17 (Phase 5.3: historical start years) ✅ — Phase 5 complete
- Owner decisions (all recommended): any year 1970–2026, modelled national carriers, regulated fares, real airports per year (§7).
- Data: `tools/build-airport-history.ts` → `airport-history.json` (OurAirports closed airports + Wikidata opening dates via
  `download-history.ts`); `src/data/eras.ts` (price levels, real fare level, deregulation dates, former states incl. West
  Germany `DW`); `currencyHistory.ts` old units (TRL, PLZ, ROL, MXP, BGL, ISJ, ILP/ILR) and dollar books;
  `fxHistory.ts` `ratesPerEurAt`, `currencyAt` (old units), `nextCurrencyChange`.
- Engine: `era.ts` (`airportsAt`, `airportOnDate`, `buildModelledAirlines`, `fromParts`, `priceLevelAt`), `world.ts`
  `worldCache` (world per game year + airport change), `advance` takes a world provider, `books.ts` (euro/re-basing
  restatement), `airportMoves.ts`, conditions carry `levels` (prices/fares/costs), price levels in market, fleet,
  maintenance, refits, repaints, hangars, AI; factory orders by production years (era discounts and waits,
  `behindIronCurtain`); lessors with their real years; regulated fares (`fareRange`, AI no price wars); EU 261 from 2005.
- UI: wizard start year (choices + any year; hub search in that year's airports; capital in the money of the time; no real
  clock for the past), era-aware `useEngineWorld`/`useGameWorld` on all game screens, carrier names (`airlineName`), planner
  (regulated slider + note, market size and competitors scaled to the year), Airlines intro/notes, World panel "Air travel
  compared with today", new messages (currency changed, airport moved).
- Tests: 161 (airports per year, carriers, states, schilling → euro restatement, old units, prices, factory orders,
  regulated fares, calibration of 1975/1985/1995/2005 startups).
- Verified in browser: 1975 and 1980 Vienna games (ATS 240m, ATS 16.8/$, DC-9/727/Caravelle market with ILFC/GPA, VIE–LHR
  regulated until 1994 with Austrian + British national carriers, Kai Tak on the map), German, phone 375 px, no console errors.
- Known: modelled networks are today's geography scaled down (not real old networks); one world price level for wages and
  fees; Ukrainian airports missing in all years.
- **Next:** Phase 6 (real airlines per era + Austrian Airlines takeover) — or what the owner prefers.

### 2026-10-29 — Session 18 (Phase 6.1: real airlines calibrated, transfer passengers) ✅
- Owner decisions: calibrate first, takeover both ways, Lufthansa Group partners, real airlines with modelled routes in
  the past (§7). Phase 6 split into 6.1–6.4 (§4).
- Diagnosis: with real networks the model gave Austrian/Lufthansa/Ryanair/Wizz load factors of 16–34 % and big losses.
  Passenger totals were already close to reality (Austrian 14.7 m, Ryanair 195 m); capacity and costs were wrong.
- `src/engine/transfers.ts`: `transferTable` (pairs of a hub's destinations, gravity × detour × non-stop share, shared
  with competing hubs via `hubsServing`, long-journey boost, prorated yields; caches per pair and per network),
  `realLegTransfers` (memo per AI state, `networkChanged` bumps an airline's revision after each review/entry),
  `realTransfersOn` (measured passengers minus real transfers = local market), `routeTransfers`/`playerHubLegs` (player).
  `routeWeek` takes `ctx.transfer` (demand added to own flights only, paid at the prorated yield) and returns
  `transferPax`; `RouteStats.transfer` (optional, no save change). `market()` uses measured − transfers (≥ 45 %) × 1.15;
  `gravityAnnualPax` extracted; `capacitySeason`; thin unmeasured routes ≤ 3/week (`RealAirlines.measuredAt`);
  `observedSeatsPerFlight` → `aircraftFor(…, seatsWanted)`; `MODEL_FARE.lowcost` 0.6; `COST_PROFILE` per business model in
  the AI's sums; `CONNECTING_PULL` 0.5; long-haul time windows. `evaluate` exported (with pax/seats/km/flights/costs).
- UI: planner forecast "Changing planes at your hub" (count + share), route cards show last week's transfer passengers,
  Data sources lists the annual reports used for calibration (EN/DE).
- Tests: 165 (new `calibration.test.ts`: Austrian passengers/LF/margin, Ryanair LF/fare/margin, Austrian transfers per
  flight, no connections for low-cost). AI one-year test ≈ 6.5 s locally (limit 25 s).
- Result table in `docs/DATA_SOURCES.md`: Austrian margin ≈ +3 % after overheads (real 3.1 %), Ryanair LF 0.83 / +14 %,
  Lufthansa LF 0.81. Known: Austrian's LF 0.62 (aircraft slightly too large in the model), BA long-haul weak (UK routes
  not measured), a small startup still loses money.
- **Next:** 6.2 Austrian takeover today (play as Austrian's CEO with its real fleet, network, finances; LH Group partners).
- Owner confirmed: 6.1 tried.

### 2026-10-29 — Session 19 (Phase 6.2: Austrian Airlines takeover today) ✅
- Owner decisions (all recommended): Detailed pre-planned timetable, modelled money/ownership, partners = no attacks + feed,
  start today (§7).
- `src/data/takeovers.ts` (scenario facts per real airline: cash, build years, leases, incoming group aircraft, partners,
  livery); `src/engine/takeover.ts` (`takeOver`: airline with `realId` + `partners`, register fleet with cabins/ownership/
  maintenance, incoming leases, reputation, AI status `player`; network from the hub with season-scaled frequencies,
  holiday-island routes resting in winter; timetable generator `placeUnit` (widebody/narrowbody, size fit to Eurostat
  seats, earliest free time, route spacing, weekly hours, overlap-free); established routes/aircraft (no ramp-up)).
  Command `TakeOverAirline`; worker/store `startNewGame` accept it. `AiAirlineState.status` 'player' (treated as not flying
  by competitorsOn/transfers/AI); AI ctx `partners` (no price/defence reactions, no entries, no new routes on the player's
  pairs). Transfers: `transferTable(…, self, feed)` (partner spokes feed, only own legs earn), `routeTransfers` uses
  `realId` as self, partner feed cached per day. Messages `takenOver`, `takeoverRoutes`.
- UI: wizard "New game" with Scenario panel (startup / Take over Austrian Airlines), takeover panel (hub, register fleet by
  type, coming aircraft, routes, cash, partners, notes), scheduling fixed to Detailed, start today; Airlines screen marks the
  airline you run. German texts use "du" (fixed the "Sie" ones from 6.1 too).
- Tests: 168 (`takeover.test.ts`: fleet/routes/valid timetable/cash/partners/AUA not an AI competitor; November margin
  −12…+12 %, > 600k pax, > 25 % transfer; Lufthansa doesn't follow a deep price cut to FRA, no partner entries).
- Verified in browser: takeover from the wizard (124 routes, 68 + 17 aircraft, €350m), first week €46.3m revenue,
  218k pax, +0.7 % margin, CASK 8.18 c; Network/Fleet screens; phone 375 px without sideways scrolling; no console errors.
- Known: ~2.1 s per simulated month for the large network (fine for turn-based/real time, slower when fast-forwarding);
  some aircraft are lightly used by the generated timetable; Austrian's routes from Innsbruck/Klagenfurt not included
  (hub-only routes until Phase 7); no board/targets yet (Phase 10).
- **Fix (owner report):** taken-over cabins were too long (real seat counts put into the model cabin without a length
  check). `fitCabin` (economy pitch down to 29", then economy rows dropped, premium kept) in `airlineCabin`; no divider
  behind European business (movable curtain); old saves repaired on load (`migrate`). Austrian A320 now J20 Y142
  (real 174 incl. blocked middle seats). Tests: 169.
- **Next:** 6.3 real airlines in past years (real names, hubs, colours, era fleets; modelled routes).

### 2026-10-29 — Session 20 (Phase 6.3: real airlines of past years) ✅
- Owner decisions (all recommended): closed airlines too, routes from hubs + demand, real types per year, real dates (§7).
- Pipeline `npm run data:airlines:history`: `tools/download-airlines-history.ts` (Wikidata closed airlines since 1970 with
  dates + precision, successors; founding days of today's airlines; Wikipedia articles of the closed ones, 50 per request;
  `relevantParts` moved to `tools/wikipedia.ts`), `tools/build-airline-history.ts` (generic wikitable reader with
  rowspans, Introduced/Retired columns, one span per type; hand `FIXES` for Malév's closing day and Interflug's hub) →
  `airline-history.json`: 1,223 closed airlines, 1,351 founding days, historical fleets of 814 airlines.
  `tools/aircraft-names.ts`: `HISTORICAL_PATTERNS` / `mapHistoricalType` (DC-9, 727, TriStar, Il-62 …).
- Engine `src/engine/eraAirlines.ts`: `buildEraYear` (airlines active during a year: today's ones (founding day,
  network thinned × home demand^0.5 × growth of young/low-cost airlines, frequencies left to the demand model) and closed
  ones (hubs, fleet of the year, routes ranked by gravity × economy, range/charter/regional/foreign-hub rules), West Berlin
  rule until 1990, modelled national carriers for uncovered states), `eraAirlinesOn` (filter by day, `eraChanges`),
  `airlineEraKey`, `eraFleet`, `networkShare`, `airlineChangesToday`. `worldCache` caches one `EraYear` per year/airport era
  and worlds per airline change day; without the history it falls back to 5.3's modelled carriers. `RealAirline.era`,
  `RealAirlines.history/eraChanges/facts`; `aircraftFor` uses typical types for era airlines without a fitting type.
  News `airlineFounded`/`airlineCeased` (fame ≥ 15 or the player's hub country). `DEFUNCT_COLORS` (44 airlines).
- UI: Airlines screen intro for past years, "Flying since/until", successor, fleet "In <year>" (modelled) with source
  note, network note + frequencies of the time, former states' names (East Germany); new-game hint and Data sources
  texts updated (EN/DE).
- Tests: 172 (era tests rewritten: 1980 world, growth of Ryanair/Emirates/Austrian, Pan Am/Swissair/Emirates dates,
  Pan Am closing in the news, fallback without history; calibration 1975–2005 still holds).
- Verified in browser (owner's 1980 save "Alpine Eighty"): 449 airlines incl. Pan Am, Eastern, TWA, Braniff; Austrian with
  DC-9-30/-50 and 44 routes at 1980 frequencies; Pan Am's US network + flights home from its foreign hubs; Interflug at
  Schönefeld with Il-62/Tu-134. A simulated year ≈ 4 s.
- Known: networks of the past are modelled; fleet counts rough; some later airports exist too early (no Wikidata opening
  date); political limits besides West Berlin not modelled for AI airlines; Wikidata's founding years are company years.
- **Next:** 6.4 Austrian in past years (takeover scenario per start year) + fictional startups appearing in real-airline mode.

### 2026-10-29 — Session 21 (Phase 6.4: Austrian in past years + fictional startups) ✅ — Phase 6 complete
- Owner decisions (all recommended): any start year, fleet per year by hand, partners following history, startups at a
  realistic rate (§7).
- Data: `src/data/alliances.ts` (Star Alliance and Qualiflyer memberships with dates, `membersOn`), `takeovers.ts`
  (`FleetEra`, Austrian's `fleetHistory` 1960–2026 with sources, `ownGroup`, `alliances`, `groupFrom`).
- Engine `takeover.ts`: `fleetLinesIn`, `takeoverCashEur`, `partnersAt` + monthly `refreshPartners`, `addFleetOfYear`
  (owned, OE-L series), frequencies × growth of the year, idle-aircraft fill (≥ 60 % of weekly hours), extra flights on
  existing routes, `absorbSubsidiaries` (Tyrolean, Lauda Air: aircraft + Vienna routes, AI status `player`, message
  `subsidiaryJoined`). Error `notToday` → `notYet`. `startups.ts`: `StartupAirline` in `state.ai.startups` (optional,
  no save version change), `withStartups` overlay (advance, worker, UI hook), `startupsMonthly` (founding, failure),
  message `startupFounded`; `RealAirline.startup`. `eraAirlines.ts`: measured route totals shared by the year's airlines,
  routes ranked by flights × √distance. `eras.ts`: fare table 1985–2015 and `COST_FOLLOWS_FARES` 1.0 (see §7).
- UI: wizard: start-year choice also for the takeover, preview of the year's fleet, routes, cash (money of the time) and
  partners, notes for past years; Airlines screen marks fictional airlines; texts EN/DE.
- Tests: 178 (`takeover.test.ts`: 1985 fleet/currency/no partners/valid timetable, partners 1999/2001/2012, 2001
  subsidiaries joining, 1985 margin; `startups.test.ts`: 2027–28 founding/failing/competing, none in 1975).
- Calibration (one simulated year, details in DATA_SOURCES): Austrian 1975 +10.6 %, 1985 +3.0 % (real ≈ +3 %, 1.9 m pax
  vs real 2 m), 1995 −7.4 %, 2005 −7.2 %; load factors still low (46–57 %).
- Verified in browser: 1980 takeover from the wizard (18 aircraft: 9 DC-9-30, 5 DC-9-50, 4 MD-80; 43 routes; ATS 230 m),
  two weeks played (margin ≈ +1 %), fleet OE-LDA…, phone 375 px without sideways scrolling.
- Known: Austrian's fleet doesn't follow its real future deliveries during the game (the player orders); load factors low;
  only Austrian can be taken over; startups fly typical aircraft and appear only in games with real airlines.
- **Next:** Phase 7 (hubs: connection waves, slots, curfews, gates, lounges, bases) — or what the owner prefers.

### 2026-10-29 — Session 22 (Phase 7.1: connection waves) ✅
- Owner decisions (all recommended): Phase 7 split and order, flight-by-flight connections, realistic slots, real
  curfews (§7).
- Engine `transfers.ts`: `MCT_MIN` + `mctAt`, `connectionQuality`, `hubFlights` (player's departures/arrivals at the hub
  per destination, minute of the week, key "pairId:dir"), `playerConnections` (per destination pair: arrivals with their
  best departure, quality-weighted connectivity, passengers booked per flight and weekday, prorated yields, partners'
  feed spread, missed connections; cached by timetable signature + day); `routeTransfers` returns [outbound, inbound].
  `LegTransfers.perFlight`; `PlannedFlight.key` (from `specFlights`); `routeWeek` books transfer demand on the
  connecting flights. `takeover.ts`: wave candidates, `waveMisfit`, night stops.
- UI: Network → **Connections** tab (`src/ui/network/ConnectionsView.tsx`): MCT, last week's connecting passengers,
  connections offered, average wait, wave chart (arrivals above, departures below, per hour), top connecting flights,
  missed connections. EN/DE texts.
- Tests: 181 (`connections.test.ts`: MCT and waits, per-flight sums = leg totals, takeover departures in waves).
- Verified in browser (Austrian today): 37,686 connecting passengers in the first week, waves visible, phone 375 px
  without sideways scrolling, no console errors.
- Known: Austrian today ≈ −4.7 % in November (was −0.6 %) and 36 % transfer (real ≈ 46 %); AI airlines still use the
  frequency model; partners' passengers spread evenly; Simple-mode auto-planning ignores waves.
- **Next:** 7.2 slots + night curfews.

### 2026-10-29 — Session 23 (Phase 7.2: slots and night curfews) ✅
- Owner decisions from 7.1: realistic slots (Level 3, seasons, newcomer priority, 80/20, buying at Heathrow), real curfews.
  Defaults chosen here (no new questions): existing flights keep their slots (historic rights); slots per hour of the
  week; AI airlines hold no explicit slots; quota periods cost double landing fees; slots in every start year (airports
  less full in the past).
- Data `src/data/slots.ts` (61 Level 3 airports: capacity, use, trading prices), `src/data/curfews.ts` (30 airports,
  ban/quota, since-years, `curfewAtTime`, `hasCurfews`).
- Engine `src/engine/slots.ts` (`SlotHolding` in `state.slots`: held/used/weeks/requests per hour of the week;
  `slotUse`, `freeSlots`, `slotNeeds`, `grantHistoricSlots`, `ensureSlots`, `acquireSlots`, `buySlots`, `requestSlots`,
  `recordSlotUse` (Mondays), `seasonStarts`/`seasonChange` (80/20 + allocation), `slotPriceUsd`). Commands `BuySlots`,
  `RequestSlots`; `OpenRoute`/`UpdateRoute` run through `withSlots` (refused plan undone, `CommandResult.slots`).
  Curfews: `curfewProblem` in `validateSpecs` (errors `curfewHub`/`curfewDestination`) and the Simple auto-planner;
  takeover generator and AI `competitorDepartures` avoid bans; night quota = double landing fee in `routeWeek`. Ledger
  kind `slotPurchase` (cash, not P&L). Messages `slotsBought`, `slotSeason`. Worker grants historic slots on loading.
- UI: route planner shows missing slots (airport, hours) with "Buy them for …" / "Ask for them for <season>"; Network →
  **Slots** tab (held/needed per day, use this season, asked for, how full; night rules on the network); airport panel
  "Slots and night rules"; Data sources credit; EN/DE.
- Tests: 187 (`slots.test.ts` 6; older tests that fly to Heathrow give the test airline LHR slots; maintenance test
  flies to Málaga instead of Lisbon).
- Verified in browser: Austrian save from 7.1 got its historic slots on loading (VIE 309/day, LHR 7.7, ZRH 8 …), Slots
  tab and night-rule list, Heathrow airport panel; no console errors. The "buy/ask" box in the planner was only checked by
  the engine tests (every Austrian aircraft was busy at Heathrow's peak, so no refused plan could be made by hand).
- Known: slot holdings are per hour (not exact minutes); AI airlines aren't slot-limited; delays and late arrivals into
  curfews come with Phase 9; slots can't be sold yet.
- **Next:** 7.3 gates + own lounges.

### 2026-10-29 — Session 24 (Phase 7.3: gates and lounges) ✅
- Owner decisions (recommended): realistic gate capacity, own lounges any size (§7).
- Engine `src/engine/hub.ts`: `gatesAt`, `freeGates`, `hubGates` (visits, 5-minute load, peak, contact-first assignment),
  `hubGatesCached`, `ensureGates` (auto-rent remote stands), `grantHistoricGates`/`ensureHubFacilities`, `setGates`,
  `gateRentPerDayUsd`; lounges `buildLounge`/`closeLounge`, `loungeAt`, `loungeCrowding`, `loungeExperience`,
  `loungeRunPerDayUsd`, `groundContext`. `Airline.gates/lounges`, `Lounge`, `ExperienceSums.ground`, ledger kind
  `lounge`, event `loungeReady`, messages `gatesRented`/`loungeOrdered`/`loungeReady`. `routeWeek` ctx `ground` (bus cost,
  remote −3, lounge bonus/visitor cost instead of contract fee, partner lounges); reputation counts `ground`;
  connections +10 min MCT for remote stands; daily gate rent (airport line) and lounge running costs (service line).
  Commands `RentGates`, `BuildLounge`, `CloseLounge`; timetable changes refused with `noGate` when no stands are left.
  Takeover keeps its gates and gets its Vienna lounges (`hubLounge` in takeovers.ts).
- UI: Network → **Hub** tab (`HubView.tsx`: gates rented/free/rent, peak, share at contact gates, chart of aircraft at the
  gates per hour with the contact-gate line, rent/give back; lounge build form with cost, status, visitors, close);
  reputation panel "Ground" column; planner forecast includes the hub on the ground; EN/DE.
- Tests: 191 (`hub.test.ts`: gate supply, auto-rented stands + contact first + refused give-back, bus cost/rating,
  lounge build rules/cost/rating).
- Verified in browser (Austrian save): Hub tab, 30 + 11 gates, peak 41 at Mon 06:30, lounge built (opens in 6 months),
  give-back below need refused, phone 375 px without sideways scrolling, no console errors.
- Known: gates only at the hub (bases in 7.4); AI airlines don't compete for gates explicitly; one lounge per airport.
- **Next:** 7.4 bases (routes that don't start at the hub; lounges and gates there).

### 2026-10-29 — Session 25 (Phase 7.4: bases) ✅ — Phase 7 complete
- Owner decisions (all recommended): real crew bases, real traffic rules, bases as second hubs (§7).
- Data `src/data/aviationMarkets.ts` (single aviation market membership dates, `inSingleMarket`).
- Engine `src/engine/bases.ts` (`stationsOf`, `stationOf`, `baseRight`, `openBase`, `closeBase`, `stationAircraft`,
  `baseRunPerDayUsd`); `Airline.bases` (`Base` with its own gates), `Aircraft.baseId`, ledger kind `base`, message
  `baseOpened`. Commands `OpenBase`, `CloseBase`, `StationAircraft`; `RouteSettings.originId`; `validateRoute`
  (`originNotBase`, `aircraftElsewhere`), `validateSpecs` (aircraft station = route origin), one route per airport pair.
  `hub.ts` generalised per station (`gatesOf`, `hubGates(…, airportId)`, cache per airport, `ensureGates` at all stations,
  `setGates`/`buildLounge` with airportId, `GroundContext.lounges` by airport); connections at bases work through
  `routeTransfers` (route origin); crews at the station country's wages; base running costs in overheads; AI
  `playerHubs` = hub + bases.
- UI: Network → **Bases** tab (stations with aircraft/routes/gates, open a base via airport search with rights check and
  costs, close, station aircraft), station chooser on the Hub and Connections tabs, planner "Route starts at" (hub/bases)
  with the aircraft stationed there; EN/DE.
- Tests: 193 (`bases.test.ts`: rights incl. 1990/2003/2005/Brexit, base costs, aircraft station rules, routes and gates at a
  base, a Málaga → Munich → Warsaw connection at the base, one route per pair, closing/moving refused while in use).
  While testing, another program used ≈ 2.5 CPU cores: three long simulation tests ran into their time limits (the 7.3 code
  as slow), all others passed.
- Verified in browser (Austrian save): Bases tab, base opened at Innsbruck (€1.8 m set-up), aircraft moved there, planner
  offers VIE/INN as origin, station chooser on Hub; phone 375 px without sideways scrolling; no console errors.
- Known: the Austrian takeover still leaves out Austrian's real routes from other airports; no ferry flights when moving
  an aircraft; AI airlines' own bases unchanged; traffic rights outside the EU come in Phase 12.
- **Next:** Phase 8 (people: pilots, cabin crew, type ratings, strikes, managers) — or what the owner prefers.

### 2026-10-29 — Session 26 (Phase 8.1: pilots and cabin crew) ✅
- Owner decisions (all recommended): crews → strikes → managers, real headcounts, real job market, managers delegate per
  department (§7).
- Data `src/data/crews.ts` (licence families `ratingFamily`, hours, reserve, augmented crews, pay ratios, training times
  and costs, pilot market 1970–2026, quota per base, attrition, `EMPLOYER_PULL`).
- Engine `src/engine/crews.ts`: `Airline.crew` (stations → pilots per family as captains/first officers, cabin crew, pay,
  pipeline of hires/ratings/upgrades; `auto`; monthly hires), `crewNeeds` (from the timetable per station and family),
  `crewShortages` → `crewCancelsPair` (stable share of pairs, skipped in `plannedFlights`), `crewPayPerDayUsd` (replaces
  the per-aircraft crew cost for airlines with crews), `hiringQuota`, `hireCrew`, `trainCrew`, `releaseCrew`,
  `setCrewPay`, `planCrew` (HR: retrain spare pilots, upgrade, hire), `crewDailyStep` (training done, monthly attrition,
  Monday planning, yesterday's crew cancellations with care + EU 261 + reputation). Ledger kind `training`; messages
  `crewReady`, `crewLeft`, `crewCancellations`. Commands `HireCrew`, `TrainCrew`, `ReleaseCrew`, `SetCrewPay`,
  `SetCrewAuto`; `withSlots` re-plans crews after timetable changes. Old saves/takeovers get the crews they need
  (`ensureCrew`); founded airlines start with none. No save version change (optional field).
- UI: Fleet → **Crews** tab (`src/ui/fleet/Crews.tsx`: totals, salaries a year, automatic planning switch, per station
  have/needed per family and cabin crew with shortage chips, pay, this month's job market, hire / upgrade / type rating /
  let go with times and costs, people coming); EN/DE; new messages and errors.
- Tests: 198 (`crews.test.ts`: headcount of a 13 h/day A320, a new airline's cancellations until crews arrive, job market
  and pay, upgrade/rating costs and times, salaries vs. the old crew cost). Old tests that aren't about crews remove the
  crew record of their test airline.
- Austrian today: ≈ 690 pilots / 1,630 cabin crew from its timetable, November margin −4.0 % (before −5.3 %), no
  shortages and steady headcount over 7 months.
- Verified in browser (Austrian save): Crews tab, upgrade of 2 first officers (ready in 6 weeks), phone 375 px without
  sideways scrolling, no console errors.
- Known: one pool per base (no individual pilots, seniority or duty rosters); AI airlines' crews not modelled; pilots of
  stationed aircraft count at their base only.
- **Next:** 8.2 unions, wage talks and strikes.

### 2026-10-29 — Session 27 (Phase 8.2: unions, wage talks and strikes) ✅
- Owner decisions (all recommended): rounds of offers, unions per country and group, real strike culture, agreement sets
  pay (§7).
- Data `src/data/unions.ts` (union names, `strikeCulture` per country incl. UK notice before 2017, Italian no-strike
  periods, talks timing, participation, `inflationBefore` from BLS CPI).
- Engine `src/engine/unions.ts`: `Airline.labour` (`Agreement` per "country|group": pay level, second-year step, until,
  mood, `WageTalks`, `Strike`s; no save version change), `ensureLabour` (agreements for every crew country, modelled end
  3–24 months ahead; Austrian takeover today: real end 31 Dec 2026), `groupPay`/`groupMood` (used by crews.ts for salaries,
  hiring quota, severance, attrition), `unionDemand`, `offerWage`, `acceptDemand`, `callMediation`, `answerProposal`,
  `maybeStrike` (weekly after expiry), `strikeShare`/`strikeCancelsPair` (skipped in `plannedFlights`), strike
  cancellations booked with care + EU 261 (from 2021, < 14 days' notice), `labourDailyStep` (steps, talks opening,
  mediation proposals, HR offers rising per round, HR mediation before repeated strikes). Commands `OfferWage`,
  `AcceptDemand`, `CallMediation`, `AnswerProposal`; `SetCrewPay` now 1–1.3 (extra pay). Messages `talksOpened`,
  `unionAnswer`, `agreementSigned`, `hrOffer`, `strikeAnnounced`, `strikeCancellations`, `mediationStarted`,
  `mediationProposal`, `mediationRejected`.
- UI: Fleet → Crews: **Unions and wage agreements** panel (`src/ui/fleet/Unions.tsx`: union, group, country, status chip,
  pay vs market, runs until, mood, strike culture, strikes called; talks: demand, inflation, best offer, round, offer
  input, accept demand, mediation, proposal answer); extra-pay setting; message texts; EN/DE.
- Tests: 203 (`unions.test.ts`: agreements per country, talks/offers/signing, German warning strike then strikes with
  compensation, strike share + mediation, HR negotiating alone).
- Verified in browser: new Austrian takeover today → talks opened (vida pilots 4.6 %, cabin 3.4 %), offer 2 % → union
  down to 4 % and next round in 2 weeks, mediation started; phone 375 px without sideways scrolling. Fixed a crash in the
  message log (dates formatted for messages that don't carry them).
- Known: AI airlines' strikes are not modelled (only the world events' strikes); one agreement per country (no separate
  regional/LCC agreements); disputes only at agreement ends (no other conflicts yet).
- **Next:** 8.3 managers with delegation per department.

### 2026-10-29 — Session 28 (Phase 8.3: managers with delegation) ✅ — Phase 8 complete
- Owner decisions (all recommended): all five departments, generated people, proposal inbox, judgement by skill (§7).
- Data `src/data/managers.ts` (departments, delegation levels, specialties, salaries, skill odds, judgement noise, name
  lists by region, `managerName`).
- Engine `src/engine/managers.ts`: `Airline.mgmt` (`Management`: heads, delegation, candidates, proposals, decisions,
  review/idle bookkeeping; no save version change), `ensureMgmt`, `appointHeads` (takeover: skill 3–4; HR alone, revenue
  and fleet and maintenance after OK, network advises), `hireManager`/`fireManager` (severance), `setDelegation` (HR syncs
  `crew.auto`), `propose` (auto → `applyCommand` + decision; else inbox/advice), `approveProposal`/`declineProposal`,
  `routeOutlook`, reviews per department (revenue weekly, network day 3, fleet day 10, maintenance day 17, HR Mondays),
  `managerWageOffer` (used by unions.ts), passive `reliabilityFactor` (maintenance.ts failures), `recruitingFactor`
  (crews.ts quota), `leaseRentFactor` (fleet.ts extensions), salaries as overhead (ledger `management`), monthly candidates
  and poaching, messages `managerHired`/`managerLeft`/`managerActions`/`proposalsWaiting`. Commands `HireManager`,
  `FireManager`, `SetDelegation`, `ApproveProposal`, `DeclineProposal`, `SetFares`, `RunCrewPlan`; `crewShortfall`.
- UI: new **Management** screen (`#/management`, rail + More, people icon): inbox with approve/decline/advice, one panel per
  department (head with stars/experience/specialty/salary/help, delegation switch, candidates to hire), track record
  (forecast vs real effect after 4 weeks); EN/DE.
- Tests: 209 (`managers.test.ts`: candidates and salary, revenue proposal approved with forecast/actual, advice vs
  deciding alone, skill vs judgement, network opens a route for an idle aircraft, HR head recruiting + HR delegation).
- Austrian today: five heads appointed; the revenue head proposes ≈ 9 fare changes a month (mostly +3…6 %, real effects
  close to forecasts); ≈ 3.5 s per simulated month.
- Verified in browser (Austrian save): Management screen, hired a 2-star revenue head, one week → 4 proposals, approved one
  → track record; phone 375 px without sideways scrolling.
- Known: **multi-airport cities** — competitors on VIE–CDG don't count on VIE–ORY, so routes to a city's second airport
  look too profitable (seen when the network head proposed VIE–ORY at ≈ 50 % direct margin; pre-existing model issue);
  network heads only add routes, not frequencies on existing ones; no finance department until Phase 10.
- **Next:** Phase 9 (revenue and operations detail: fare classes, booking curves, loyalty, delays, incidents) — or what
  the owner prefers. Consider fixing the multi-airport competition first.

### 2026-10-29 — Session 29 (fix: cities with several airports) ✅
- Owner asked to fix the multi-airport issue found in 8.3 before Phase 9.
- Engine `economics.ts`: `substitution`, `nearbyAirports` (cached per world), `nearbyPairs`, `nearbyCompetitors`,
  `nearbyCounted` (closest 3 with weight ≥ 0.15), `nearbyMarket` (quick demand estimate), `measuredNearby`; `routeWeek`
  adds the other airports' flights to the passengers' choice (weighted) and their travellers to the route's own (×
  weight × `NEARBY_DEMAND_SHARE` 0.5); `market()` cached per world and reduced for unmeasured routes next to measured
  ones. First tried separate choice calculations per nearby market: correct but twice as slow, replaced by pooling.
- UI: route planner lists "From the same cities' other airports" with their weight and flights (EN/DE).
- Tests: 211 (`cities.test.ts`: nearby airports and weights, Vienna–Orly no longer far better than Vienna–CDG).
  Calibration within about a point except British Airways (≈ −8 %, see DATA_SOURCES).
- Verified in browser: Austrian's VIE–CDG forecast lists VIE–ORY (Transavia, 59 %) and VIE–BVA (Ryanair, 44 %).
- **Next:** Phase 9 (revenue and operations detail).

### 2026-10-29 — Session 30 (Phase 9.1: delays and on-time performance) ✅
- Owner decisions (all recommended): operations first, knock-on delays, booking classes, own loyalty programme (§7).
- Data `src/data/delays.ts` (causes, chances, lengths, padding, quick turns, curfew grace, costs, missed connections).
- Engine `src/engine/delays.ts`: `state.ops` (`OpsState`: today's and yesterday's `OpsFlight`s, aircraft ready times;
  optional, no save version change), `weatherAt`, `opsDailyStep` (settles yesterday: costs to "disruption", punctuality
  per route (`RouteStats.opsFlights/onTime/delayMin/diverted/causes`, merged in finance.ts), reputation, diversion
  messages; plays today aircraft by aircraft with cancellation reasons), `delayOf`, `punctuality`. `kpis.ts` `onTime`.
  `flights.ts` `airborne(…, adjust)` moves aircraft on the map by today's delays and diversions.
- UI: Ops **Departures today** board (`DeparturesBoard.tsx`: next / problems / all, local times, status with cause,
  delays known 2 h ahead, yesterday's on-time share), dashboard tile "On time", map uses delays, message `flightDiverted`;
  EN/DE.
- Tests: 215 (`delays.test.ts`: bad-weather days, Austrian punctuality winter/summer vs EUROCONTROL, compensation for own
  long delays only, stable daily simulation).
- Verified in browser (Austrian save): board ("Yesterday: 72 % of 308 flights on time"), cancellations with reasons, On
  time tile 78 %, phone 375 px without sideways scrolling.
- Known: AI airlines don't have delays; passengers' bookings don't react to a route's own punctuality yet (only via the
  brand reputation); crews' duty limits on long delays not modelled.
- **Next:** 9.2 click any flight for full detail (passengers per class, load factor, delay and cause, weather, profit).

### 2026-10-29 — Session 31 (Phase 9.2: click any flight) ✅
- Owner decisions (recommended): 7 days of single flights, links everywhere (§7).
- Engine: `routeWeek`'s `FlightResult` now carries revenue, transfer passengers, classes and its own cost lines;
  `operations.ts` `recordFlightEcon` attaches each day's numbers to the day's `OpsFlight` (matched by real departure time,
  so returns after midnight work); `OpsFlight.econ` (`FlightEcon`), `.disruption`, `.weather`; `OpsState.history`
  (7 days, `HISTORY_DAYS`); `flightId`, `knownFlights`, `findFlight`, `flightResult` in `delays.ts`. `flights.ts` legs
  carry pair + direction and `airborne` the scheduled departure (map links).
- UI: `#/flight?id=` (`FlightScreen`: route, date, aircraft, scheduled/actual times, delay and cause explained, weather,
  passengers per class with load factor and revenue, transfer passengers, revenue and cost lines with delay costs, flight
  result, the aircraft's rotation that day) and `#/flights?route=` / `?aircraft=` (`FlightsScreen`: last 7 days). Links from
  the Ops departures board, aircraft on the map (click), Network timetable (latest operation), route cards and fleet cards
  ("Last flights"). Delay causes of future flights stay hidden until 2 h before departure. EN/DE.
- Tests: 216 (per-flight revenue adds up to the route's week, 7-day history, lookup).
- Verified in browser (Austrian save): board → flight page, aircraft's flights list → a flown flight (OS 180 LCA–VIE: 80/184
  passengers, business 79 %, result €5,813 before crews and leases), phone 375 px without sideways page scrolling.
  Clicking aircraft on the map wasn't tried by hand (the in-app browser pane doesn't draw the map).
- **Next:** 9.3 booking classes, booking curves and dynamic pricing.

### 2026-10-30 — Session 32 (Phase 9.3: booking classes and live bookings) ✅
- Owner decisions: live bookings, own buckets, seats per bucket by hand (§7).
- Data `src/data/fares.ts` (default buckets, willingness to pay, booking curves, sales horizons, curve marks, curtain).
- Engine `src/engine/bookings.ts`: `state.bookings` (`BookingRecord` per upcoming flight: capacity, sold per class and
  bucket, transfer passengers, value at sale prices, booking curve; optional, no save version change), `routeForecast`
  (the market model's travellers per flight and class, split leisure/business/transfer; cached per week and timetable),
  `bookingsDailyStep` (opens flights, sells each day's arrivals, far ones every third day), `applyBookings` (the flown
  flight's passengers and revenue replace the model's, passenger costs follow), `setFareBuckets`/`setBucketLimits`
  (commands `SetFareBuckets`, `SetBucketLimits`), `bookingOf`, `bucketsOf`, `limitOf`, `willingToPay`, `bookedWithin`.
  `economics.ts` `FlightResult.classes` carry demand by segment, fare and transfer yield; `FlightEcon.buckets/curve`.
  Speed: booking index once per day, wind cached per airport pair.
- UI: Network → **Fares** tab (`FaresView.tsx`: bucket editor per cabin, seat limits per route in seats, next two weeks'
  sales per bucket), flight page "Bookings so far" / "Bookings by fare" (buckets on sale / closed / sold out, booking
  curve chart; upcoming flights open from the Fares table), planner note that its revenue is at class fares; EN/DE.
- Tests: 219 (`bookings.test.ts`: willingness and curves, daily sales with closing buckets and flown = booked, route
  limits and own buckets).
- Verified in browser (Austrian save): Fares tab, VIE–LAX limits working (Basic stops at 30 %), upcoming flight's
  bookings and curve, phone 375 px without sideways page scrolling.
- Known: no overbooking/no-shows; the revenue head's proposals still only change the base fare (not bucket limits);
  the route planner's forecast is at class fares; AI airlines don't sell by buckets.
- **Next:** 9.4 own loyalty programme with tiers.

### 2026-10-30 — Session 33 (Phase 9.4: frequent-flyer programme) ✅ — Phase 9 complete
- Owner decisions (recommended): earn per euro, award seats on own flights, group programme for takeovers (§7).
- Data `src/data/loyalty.ts`; engine `src/engine/loyalty.ts`: `Airline.loyalty` (`Loyalty`: own/partner, rules, member
  share, points, award rate, 26 weeks of `LoyaltyWeek`; optional, no save version change), `programmeValue`,
  `loyaltyPull` (new `RouteContext.loyalty` multiplies the brand appeal per segment in `routeWeek`; passed by the daily
  booking, the booking forecast, the planner and the revenue manager), `tierShares`, `startProgramme`,
  `joinPartnerProgramme`, `setProgramme`, `leaveProgramme`, `loyaltyWeeklyStep` (Mondays after the week closes). P&L line
  `loyalty` (optional, in `pnlCosts` and the Finance screen), ledger kind `loyalty`, message `loyaltyMilestone`. Bookings:
  award seats taken out of economy when a flight opens (`BookingRecord.awards`), flown as passengers without revenue.
  Commands `StartLoyalty`, `SetLoyalty`, `LeaveLoyalty`; Austrian takeover joins Miles & More (from 2009).
- UI: **Loyalty** screen (`#/loyalty`, rail + More, star icon): start, overview (members, tiers, member share,
  attractiveness, pull, points and debt, last week, net cost), own rules or the group's (leave); EN/DE.
- Tests: 222 (`loyalty.test.ts`: own programme growing with points and award seats, tier thresholds and rule checks,
  Austrian in Miles & More).
- Verified in browser (Austrian save): programme started, first week 77,000 members, points and debt, rules form, phone 375 px.
- Known: members are aggregate numbers (no individual members); no co-branded credit card deals to negotiate; AI airlines'
  programmes are only part of their calibrated results; the programme's debt isn't on a balance sheet yet (Phase 10).
- **Next:** Phase 10 (finance and corporate: loans, bonds, fuel hedging, stock market, board) — or what the owner prefers.

- (Earlier plan for 2.1a:) load real airlines into the engine (replace invisible
  incumbents; demand-model frequencies where `weekly` is null), screens (Airlines list/detail, competitors per route,
  map toggle, in-game "Data sources" screen with all credits and source tags), save size → IndexedDB.
- **Next pipeline steps (original list):** Wikipedia articles (business model, bases, destination lists, fleet tables, seat layouts;
  ambiguous destinations listed for the owner); Brazil ANAC + Canada register; split Eurostat route totals between the
  airlines that serve each route; fleets; validation report (Austrian, Lufthansa, Ryanair, Wizz Air); then 2.1a screens.
- (Earlier plan text:) build the pipeline (Wikidata + Wikipedia → airlines/hubs/destinations; official stats
  for frequencies; registers for fleets; new aircraft types), validation report, then 2.1a screens.
