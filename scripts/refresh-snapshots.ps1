<#
Re-runs a live Claude Chat search (WebFetch/WebSearch) for every saved snapshot in data/snapshots-index.json,
using the currently logged-in Claude Code subscription session (claude -p, headless/non-interactive)
rather than a separate API key. This is the same mechanism the in-app "no saved results" prompt asks you
to run by hand -- this script just automates running it for every existing snapshot on a schedule.

Usage:
  powershell -File scripts\refresh-snapshots.ps1
  powershell -File scripts\refresh-snapshots.ps1 -Make jeep -Model wrangler -Zip 23185   (refresh just one)

To run every 2 hours, register it as a Windows Scheduled Task (the Windows equivalent of cron):
  schtasks /Create /SC HOURLY /MO 2 /TN "WheelsAndDeals Refresh" /TR "powershell -File $PWD\scripts\refresh-snapshots.ps1"
(Not run automatically by this script -- review and register it yourself.)
#>
param(
  [string]$Make,
  [string]$Model,
  [string]$Zip
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$indexPath = Join-Path $root "data\snapshots-index.json"
$index = Get-Content $indexPath -Raw | ConvertFrom-Json

foreach ($snap in $index.snapshots) {
  if ($Make -and $snap.make -ne $Make.ToLower()) { continue }
  if ($Model -and $snap.model -ne $Model.ToLower()) { continue }
  if ($Zip -and $snap.zip -ne $Zip) { continue }

  $dataFile = Join-Path $root "data\$($snap.file)"
  $existing = Get-Content $dataFile -Raw | ConvertFrom-Json
  $q = $existing.query

  $promptParts = @(
    "Using WebFetch/WebSearch (not a scripted HTTP request -- these sites block plain curl/requests-style scraping, but Claude's WebFetch tool gets through),"
    "re-run this used-vehicle search and refresh the saved snapshot: $($q.make) $($q.trim) $($q.model),"
    "under $($q.maxMileage) miles, under `$$($q.maxPrice), within a $($q.hours)-hour drive of ZIP $($q.zip)."
    "For each current result: check whether previously-saved listings (in data\$($snap.file)) are still available -- mark or remove any that appear sold/delisted -- and add any new matching listings."
    "Fetch each vehicle's own listing detail page (VDP), confirm its price/mileage match, and save that page's URL as the listingUrl field -- never substitute a generic search-results link; only omit listingUrl if that specific vehicle's own page truly cannot be found."
    "From that same VDP, grab the direct URL of that vehicle's own primary photo (verify it's a real photo of that vehicle, not a placeholder/logo) and save it as the photoUrl field; only omit photoUrl if no real photo could be found."
    "WebSearch a KBB Fair Purchase Price anchor per listing for the kbbDeltaLow/kbbDeltaHigh estimate."
    "For the top 5 best-value results, WebFetch/WebSearch a real, named pre-purchase-inspection shop actually serving that city (phone/address/price if published) for the inspection field -- never invent a business."
    "Update compiledDate to today. Overwrite data\$($snap.file) matching its existing JSON schema exactly. Do not modify snapshots-index.json."
  )
  $prompt = $promptParts -join " "

  Write-Host "Refreshing $($snap.file) ..."
  # acceptEdits so this can run unattended; still scoped to only these 4 tools.
  # First run manually and watch for permission prompts before relying on a scheduled task --
  # a fresh install may still need one-time approval for WebFetch/WebSearch in this project.
  claude -p $prompt --allowedTools "WebFetch,WebSearch,Read,Edit,Write" --permission-mode acceptEdits
}
