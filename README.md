# WheelsAndDeals

Search used vehicles within a driving-time radius and rank them by estimated KBB price delta. Configurable make/model/mileage/budget/trim; defaults to Jeep Wrangler, under 80,000 mi, under $40,000, within 2 hours of ZIP 23185.

## Run it locally

No build step, no dependencies, no API keys. Clone or download this folder, then:

**Windows (PowerShell):**
```
.\serve.ps1
```

**Mac/Linux:**
```
./serve.sh
```

Either opens `http://localhost:8791` serving the app. (A plain `python3 -m http.server` from this folder also works — the scripts are just a convenience wrapper.) You can't just double-click `index.html`, since the browser blocks `fetch()` of local JSON files over the `file://` protocol.

## How it works

This is a static site — a search form over JSON snapshot files in `data/`, indexed by `data/snapshots-index.json`. There is no backend, no database, and no API key anywhere in this project.

Data comes from **Claude Chat searches**, not a live scraping pipeline. Cars.com, KBB, and similar sites block plain scripted requests (curl/Python `requests` get a 403/Akamai block), but Claude's own `WebFetch`/`WebSearch` tools get through. So every snapshot in `data/` was produced by asking Claude (in a Claude Code session, in this project) to search and save results — the same thing you'd do by hand in a Claude Chat conversation.

- **Searching a saved combination** (default: Jeep Wrangler / 23185) filters and sorts that snapshot client-side.
- **Searching a combination with no saved snapshot** shows a ready-made prompt — paste it into Claude to generate one.
- **Refreshing an existing snapshot** (new prices, sold listings, etc.) can be done by hand the same way, or automated — see below.

## Automated refresh (optional)

`scripts/refresh-snapshots.ps1` re-runs the same Claude Chat search for every snapshot in `data/snapshots-index.json`, using `claude -p` (headless/non-interactive Claude Code) under your existing Claude subscription login — not a separate API key.

```
powershell -File scripts\refresh-snapshots.ps1
```

To run it automatically every 2 hours, register it as a Windows Scheduled Task (Windows has no native `cron`):

```
schtasks /Create /SC HOURLY /MO 2 /TN "WheelsAndDeals Refresh" /TR "powershell -File <full-path-to>\scripts\refresh-snapshots.ps1"
```

Run the script by hand first and confirm it completes without hanging on a permission prompt before relying on the scheduled task — a fresh Claude Code install may need one-time approval for WebFetch/WebSearch in this project directory.

## Data schema

See `data/jeep-wrangler-23185.json` for the canonical shape: `query` (the search that produced this snapshot), `listings[]` (each with year/trim/miles/price/city/distanceMi/kbbDeltaLow/kbbDeltaHigh, plus optional `features`, `listingUrl`, and `inspection` for the top-5 pre-purchase-inspection panel).

## Notes on honesty tradeoffs

- **Listing links** point to a Cars.com search filtered to match year/price/mileage/ZIP, not a guaranteed link to that exact vehicle — the original per-listing URLs weren't preserved when this snapshot was first compiled. New snapshots generated via the refresh prompt do preserve real listing URLs where found.
- **Photos** are generation-representative stock photos (real, credited, Wikimedia Commons), not photos of the specific listed vehicle.
- **Inspection shops** are real, named businesses we've verified for the current top 5 (with published pricing where the shop lists it, "call for quote" where it doesn't) — never invented. Vehicles without researched shop data show a generic cost-range estimate instead.
