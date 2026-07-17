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
- **Searching a combination with no saved snapshot** offers two options: a ready-to-run terminal command (see below) that does the whole thing for you, or a prompt you can paste into Claude Chat by hand instead.
- **Refreshing an existing snapshot** (new prices, sold listings, etc.) can be done by hand the same way, or automated — see below.

## New searches without copy/paste

There's no way for this static, no-backend site to sign in to your Claude.ai account from the browser — a Pro/Max chat subscription and an API key are different products, and a public site can't safely hold either. The 🔌 "Connect Claude" icon in the header explains this and offers two ways around the manual copy-prompt/copy-JSON flow, both using **your own** Claude Code login (not an API key, not anything tied to whoever wrote this app) — so anyone who clones this repo gets the same options with their own subscription.

**Option 1 — one-click, no terminal at all.** Run the local search agent alongside `serve.ps1`/`serve.sh`:

```
python scripts/local-agent.py        (or python3 on Mac/Linux)
```

With it running, the 🔌 icon (and the "no saved results" screen) shows a green "🟢 Local agent detected" status and a "▶ Run this search now" button — click it and the app runs the search, saves the result, and reloads automatically. The agent only accepts requests from this app's own known origins (not `*`) and only listens on `127.0.0.1`, so no other website or device can trigger it.

**Option 2 — one command, no extra process running.** If you don't want to keep the agent running, both the same spots give you a ready-to-run one-liner instead:

```
powershell -File scripts\new-search.ps1 -Make Toyota -Model 4Runner -Zip 23185
```

Either way, `data/` and `data/snapshots-index.json` get written to directly — no manual copy-pasting of a prompt or the JSON it returns. Refresh the app (or `git push` to publish) once it's done.

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

See `data/jeep-wrangler-23185.json` for the canonical shape: `query` (the search that produced this snapshot), `listings[]` (each with year/trim/miles/price/city/distanceMi/kbbDeltaLow/kbbDeltaHigh, plus optional `listingUrl`, `photoUrl`, and `inspection` for the top-5 pre-purchase-inspection panel).

## Notes on honesty tradeoffs

- **Listing links** point to the specific vehicle's own Cars.com listing page where one was verified by a price/mileage match; a handful that couldn't be matched to a specific page fall back to a filtered Cars.com search instead of a guessed link.
- **Photos** are each vehicle's own listing photo where one was verified; falls back to a generation-representative stock photo (real, credited, Wikimedia Commons) only when a real one isn't available.
- **Inspection shops** (🔧 icon per row) are real, named businesses we've verified (with published pricing where the shop lists it, "call for quote" where it doesn't) — never invented — matched to a listing by city or by the shop's own published service area, not a real drive-time calculation (we only have city-level data, not exact seller addresses). Listings with no matched shop show a generic cost-range estimate instead.
