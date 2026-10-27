# Austrian Airlines — hand-checked data

These two files are filled in **by hand** (by the owner) and are tagged `hand-checked` in the game.
Open them in Numbers, Excel or any text editor; keep the first line (column names) unchanged and one row per entry.
Delete the example rows when you start.

## routes.csv — one row per destination served from Vienna (VIE)
| Column | Meaning | Example |
|---|---|---|
| destination_iata | 3-letter airport code of the destination | `LHR` |
| season | IATA season: `S26` = summer 2026 (29 Mar – 24 Oct 2026), `W26` = winter 2026/27 (from 25 Oct 2026) | `W26` |
| weekly_flights | departures **from VIE** per week in a normal week of that season (not counting the return flights) | `28` |
| aircraft_types | types usually flying it, separated by `/` | `A320/A321` |
| first_date, last_date | only for seasonal routes (otherwise leave empty) | `2026-12-20` |
| source | where you checked it | `VIE airport website` |
| checked_on | date you checked (YYYY-MM-DD) | `2026-11-01` |
| notes | anything special (e.g. "Saturdays only", "via another airport") | |

## fleet.csv — one row per aircraft
| Column | Meaning | Example |
|---|---|---|
| registration | e.g. `OE-LBA` | |
| type | as in the game: A320ceo, A320neo, A321ceo, A321neo, 787-9, 777-200ER, 767-300ER, Dash 8-400, E195 … | `A320ceo` |
| seats_business / seats_premium_economy / seats_economy | cabin layout, leave empty if unknown | `0 / 0 / 174` |
| year_built | year of manufacture | `2000` |
| status | `active`, `stored`, `on order` (for ordered aircraft: registration empty, year = planned delivery) | `active` |
| source, checked_on, notes | as above | |

Please don't copy from Planespotters, Flightradar24, FlightConnections, Airfleets, Cirium, OAG or ch-aviation —
use them only to compare. Good sources to fill this in: Austrian's own fleet page and timetable, the VIE airport
website, Austrian/Lufthansa Group annual reports, the Austro Control register (`OE-` aircraft list).
