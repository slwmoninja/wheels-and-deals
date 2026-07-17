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
- **The 🖼️ gallery icon** shows every current result as a photo grid instead of a table, in whatever sort/priority-weight order is currently active, each photo linking straight to that vehicle's own listing.
- **Refreshing an existing snapshot** (new prices, sold listings, etc.) happens automatically in the background when the local agent is running — see below — or can be done by hand/scheduled task.

## New searches without copy/paste

There's no way for this static, no-backend site to sign in to your Claude.ai account from the browser — a Pro/Max chat subscription and an API key are different products, and a public site can't safely hold either. The 🔌 "Connect Claude" icon in the header explains this and offers a way around the manual copy-prompt/copy-JSON flow, using **your own** Claude Code login (not an API key, not anything tied to whoever wrote this app) — so anyone who clones this repo gets the same option with their own subscription.

This requires a computer — a terminal, Python, and the Claude Code CLI aren't things stock iPhone/Android provide, so the setup and the mobile experience are genuinely different. Both are below.

### On a computer (Windows, Mac, or Linux)

1. **Install Claude Code and sign in**, if you haven't already — a terminal running `claude` should work and be logged into your account. (This project always uses that existing login, the same as `claude` in any other terminal — never a separate API key.)
2. **Clone or download this repo** to your computer.
3. **Start the local agent** — open a terminal in this folder and run:
   ```
   python scripts/local-agent.py        (or python3 on Mac/Linux)
   ```
   Leave this terminal window open; it's what lets the app in your browser trigger real searches.
4. **Start the app** in a second terminal:
   ```
   .\serve.ps1       (Windows)
   ./serve.sh        (Mac/Linux)
   ```
   Your browser opens to `http://localhost:8791`.
5. **Search for any make/model.** If nothing's saved for that combination, or you click the 🔌 "Connect Claude" icon any time, you'll see a green "🟢 Local agent detected" status and a "▶ Run this search now" button — click it and the app researches the listings and populates automatically, no copy/paste at all.

If you'd rather not keep the agent running, both of those same spots also give you a one-line command as a fallback:
```
powershell -File scripts\new-search.ps1 -Make Toyota -Model 4Runner -Zip 23185
```
Either way, `data/` and `data/snapshots-index.json` get written to directly. `git push` afterward to publish to the live site.

### On iPhone or Android

The one-click agent and the terminal command above need a desktop-class environment, so they don't apply on a phone. On mobile, use the manual path instead:

1. Open the app (in your browser, or as an installed home-screen icon).
2. Search for a make/model. If nothing's saved yet, tap "📋 Copy prompt" under "Or copy this prompt into Claude chat instead."
3. Open the Claude app (or claude.ai) and paste it into a new chat. Claude researches the listings and gives you back JSON.
4. Saving that JSON into this project's `data/` folder and pushing it to GitHub still has to happen from a computer — a phone isn't a practical place to edit and push files for this project. So new searches are best added from a PC; your phone is great for browsing whatever's already been published.

The agent only accepts requests from this app's own known origins (never `*`) and only listens on `127.0.0.1` — no other website or device can trigger it, regardless of platform.

## Keeping listings fresh automatically (optional)

Cars sell fast, so when the local agent (above) is running, the app quietly asks it to re-check availability for whatever search you're currently viewing — marking sold/delisted listings and picking up new ones — at these moments:

1. Whenever a saved search is (re-)loaded (opening it, or a fresh search that lands on it)
2. Whenever you reopen the tab/app after it's been in the background
3. Whenever you change the sort column or a priority weight
4. As a fallback, every 2 hours while the app stays open, in case none of the above happened

This is silent and non-blocking — nothing in the UI is interrupted — and it only ever does anything when the local agent is reachable; otherwise it's a no-op. If a refresh finds changes, whatever you're currently looking at reloads in place.

`scripts/refresh-snapshots.ps1` does the same "re-check availability" refresh for every snapshot in `data/snapshots-index.json` from the command line (or on a schedule), for when you want it to happen independent of the app being open at all.

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
