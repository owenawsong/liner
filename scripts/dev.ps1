param([int]$Port = 5178)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:USERPROFILE '.sleeve\dev'
$secrets = Join-Path $stage '.dev.vars'
if (-not (Test-Path -LiteralPath $secrets)) {
  throw "Local AI secrets are missing at $secrets. Put NVIDIA_API_KEY and OPENROUTER_API_KEY there."
}

# Pages serves every file in its asset directory during local development.
# Stage only public files; keep .dev.vars alongside, never inside, that directory.
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$siteName = 'site-' + [guid]::NewGuid().ToString('N')
$site = Join-Path $stage $siteName
New-Item -ItemType Directory -Path $site | Out-Null
foreach ($name in @('index.html', 'styles.css', 'sleeve.css', 'profile.css', 'discover.css', 'analysis.css', 'audio.css', 'config.js', 'manifest.webmanifest', 'sw.js')) {
  Copy-Item -LiteralPath (Join-Path $project $name) -Destination (Join-Path $site $name)
}
foreach ($name in @('assets', 'js')) {
  Copy-Item -LiteralPath (Join-Path $project $name) -Destination (Join-Path $site $name) -Recurse
}
Copy-Item -LiteralPath (Join-Path $project 'docs\audio-pilot.json') -Destination (Join-Path $site 'audio-pilot.json')
$functionSource = Join-Path $project 'functions'
foreach ($file in Get-ChildItem -LiteralPath $functionSource -Recurse -File) {
  $relative = $file.FullName.Substring($functionSource.Length).TrimStart('\', '/')
  $target = Join-Path (Join-Path $stage 'functions') $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

Write-Host "Serving Sleeve from $site"
Push-Location $stage
try {
  & npx wrangler pages dev $siteName --port $Port --persist-to state --compatibility-date=2026-09-01
} finally {
  Pop-Location
}
