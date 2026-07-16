param([int]$Port = 8791)
Set-Location $PSScriptRoot
Write-Host "WheelsAndDeals running at http://localhost:$Port"
Start-Process "http://localhost:$Port/index.html"
python -m http.server $Port
