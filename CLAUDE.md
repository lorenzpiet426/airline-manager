# CLAUDE.md — Airline Manager (working title)

This file is the single source of truth for the project. Claude reads it at the start of every
session. **Keep it updated at the end of every session** (progress log, decisions, roadmap status).

- Owner: 19-year-old aspiring airline pilot living near Vienna (VIE). A **beginner programmer**:
  Claude does the technical work and explains what was built in simple terms so they learn the basics.
- Aviation authenticity matters a lot. When in doubt, choose the realistic option and cite a source.
- Status: **Phase 0 (planning). The architecture and roadmap below are PROPOSED and await the owner's approval.**

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

## 3. Architecture (PROPOSED — awaiting approval)

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
  engine/        pure TS simulation: state, commands, time, systems/ (demand, ops, finance, fleet, ai, events)
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
  **Phone:** bottom tab bar (Map · Network · Fleet · Finance · More), full-screen sheets that slide up, thumb-reachable controls.

---

## 4. Roadmap (PROPOSED)

Each phase is split into steps; **one step ≈ one session**, each ends with a testable, committed version.
"Realistic" mode is built first; "Hardcore" depth is added to each system as it matures.

### Phase 0 — Planning ✅ (this session)
Research, architecture, roadmap, git, CLAUDE.md.

### Phase 1 — "First Flight": smallest fun playable game
Found a startup at a hub of your choice (VIE default), year 2026, Realistic mode, simple scheduling.
- **1.1 Skeleton:** Vite + React + TS project, app shell with distinct desktop and phone layouts,
  OCC theme (dark/light), EN/DE switch, PWA install, auto-deploy to the free host. *Test: open it on your phone and install it.*
- **1.2 World data:** pipeline for all scheduled-service airports + population/wealth; starter aircraft
  database (~20 current types: ATR 72, Dash 8-400, E175/E195-E2, A220, A320neo family, 737 MAX,
  A330neo, A350, 787, 777…); world map showing airports. *Test: browse airports, zoom the map.*
- **1.3 Engine core + new game:** game state, commands, clock with **pause/speed (real-time)** and
  **turn-based weekly** mode; new-game wizard (name, IATA-style code, colors, hub, starting capital);
  lease aircraft. *Test: start an airline, lease a plane.*
- **1.4 Routes & money:** open routes (range/runway checks), weekly frequency, fares, demand model
  (gravity + business/leisure), cost model (fuel, crew, airport, navigation, maintenance, lease),
  weekly P&L, **planes flying on the map**. *Test: does a VIE–LHR A320 route make believable money?*
- **1.5 Saves & dashboard:** multiple local save slots, export/import, dashboard with KPIs (load factor,
  RASK/CASK, cash). Phase 1 complete. *Test: play a few months, save, reload on another browser via export.*

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
Connecting traffic and O&D flows through hubs, detailed timetables with exact times, rotations, connection
waves, slots (LHR, JFK…), curfews, gates, lounges, bases.

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
- **Before Phase 1.1:** install **Node.js LTS** (free) from nodejs.org — Claude will give step-by-step instructions.
- **Phase 1.1:** create a free **GitHub** account (for backup of the code + free hosting).
- **Phase 3:** create a free **Firebase** project with a Google account (no credit card; stay on the Spark plan).

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

## 8. Progress log
### 2026-10-27 — Session 1 (Phase 0)
- Researched free hosting, cloud sync options, open data sources for airports, aircraft and costs.
- Wrote this CLAUDE.md (spec, proposed architecture, roadmap) and `docs/DATA_SOURCES.md`.
- Initialised git. No game code yet (by request).
- Notes: Node.js is not installed on the Mac yet. Firebase Cloud Storage now requires the paid Blaze
  plan → we will only use Firestore + Auth (free on Spark). Supabase free projects pause after 7 days inactivity.
- **Next:** owner reviews and approves the plan and decisions D1–D4, installs Node.js → Phase 1.1.
