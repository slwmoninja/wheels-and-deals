<#
Runs a brand-new used-vehicle search through Claude Code (claude -p, headless/non-interactive),
using your existing Claude Code login session -- not a separate API key. This replaces the
copy-prompt-into-chat-then-copy-JSON-back flow: Claude does the WebFetch/WebSearch research and
writes the result straight into data/ and registers it in data/snapshots-index.json itself.

Requires the Claude Code CLI to be installed and logged in (same login as your Claude Pro/Max
Claude Code usage -- this is not a pay-per-token API key).

Usage:
  powershell -File scripts\new-search.ps1 -Make Toyota -Model 4Runner -Zip 23185
  powershell -File scripts\new-search.ps1 -Make Jeep -Model Wrangler -Trim Rubicon -MaxMileage 60000 -MaxPrice 35000 -Zip 23185 -Hours 3

After it finishes, refresh the app (if running locally via serve.ps1) to see the new results,
or git add/commit/push data/ to publish them to the live site.
#>
param(
  [Parameter(Mandatory=$true)][string]$Make,
  [Parameter(Mandatory=$true)][string]$Model,
  [string]$Trim = "",
  [int]$MaxMileage = 80000,
  [int]$MaxPrice = 40000,
  [Parameter(Mandatory=$true)][string]$Zip,
  [int]$Hours = 2
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$makeSlug = $Make.Trim().ToLower()
$modelSlug = $Model.Trim().ToLower()
$dataFileName = "$makeSlug-$modelSlug-$Zip.json"
$dataFile = "data\$dataFileName"

$promptParts = @(
  "Using WebFetch/WebSearch (not a scripted HTTP request -- these sites block plain curl/requests-style scraping, but Claude's WebFetch tool gets through),"
  "search current used-vehicle listings for a $Make $Trim $Model, under $MaxMileage miles, under `$$MaxPrice, within a $Hours-hour drive of ZIP $Zip."
  "For each result: (1) WebSearch a KBB Fair Purchase Price anchor for that model year/trim and estimate the delta vs. asking price;"
  "(2) fetch that specific vehicle's own listing detail page (VDP), confirm price/mileage match, and save that URL as the listingUrl field -- never substitute a generic search-results link; only omit listingUrl if that page truly cannot be found;"
  "(3) from that same VDP, save the direct URL of that vehicle's own primary photo as the photoUrl field (verify it's a real photo of that vehicle, not a placeholder/logo); only omit photoUrl if none is found."
  "For the top 5 best-value results, also WebFetch/WebSearch a real, named pre-purchase-inspection shop actually serving that listing's city (phone/address/price if published) for the inspection field -- never invent a business."
  "Sort results by best value first (most under book)."
  "Save the results as JSON matching the exact schema in data\jeep-wrangler-23185.json (query/compiledDate/source/notes/listings fields), write it to $dataFile, and add an entry { `"make`": `"$makeSlug`", `"model`": `"$modelSlug`", `"zip`": `"$Zip`", `"file`": `"$dataFileName`" } to data\snapshots-index.json if one isn't already there for this make/model/zip."
)
$prompt = $promptParts -join " "

Write-Host "Searching for $Make $Trim $Model near $Zip via Claude Code ..."
# acceptEdits so this can run without prompting; scoped to only the tools this task needs.
# First run this manually and watch for permission prompts before relying on it unattended --
# a fresh install may still need one-time approval for WebFetch/WebSearch in this project.
claude -p $prompt --allowedTools "WebFetch,WebSearch,Read,Edit,Write" --permission-mode acceptEdits

if (Test-Path $dataFile) {
  Write-Host ""
  Write-Host "Saved: $dataFile"
  Write-Host "Refresh the app (if running locally) or git add/commit/push data/ to publish."
} else {
  Write-Host ""
  Write-Host "No data file was created -- check Claude's output above for errors."
}
