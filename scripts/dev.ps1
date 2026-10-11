param([int]$Port = 5178)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:USERPROFILE '.sleeve\dev'
$secrets = Join-Path $stage '.dev.vars'
$wrangler = Join-Path $project 'node_modules\.bin\wrangler.cmd'
if (-not (Test-Path -LiteralPath $wrangler)) { throw 'Install the pinned dependencies first: npm ci' }
if (-not (Test-Path -LiteralPath $secrets)) {
  Write-Warning "Starting without local AI keys. Statistics and demo views work; writing requires OPENROUTER_API_KEY in $secrets."
}

# Use the same public builder as production, with a separate private run folder.
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$run = Join-Path $stage ('run-' + [guid]::NewGuid().ToString('N'))
$site = Join-Path $run 'public'
New-Item -ItemType Directory -Path $run -Force | Out-Null
$previousReadKey = $env:LASTFM_API_KEY
try {
  if (-not $previousReadKey -and (Test-Path -LiteralPath $secrets)) {
    $privateText = Get-Content -LiteralPath $secrets -Raw
    $readKey = [regex]::Match($privateText, '(?m)^LASTFM_API_KEY\s*=\s*["'']?([a-fA-F0-9]{32})["'']?\s*$')
    if ($readKey.Success) { $env:LASTFM_API_KEY = $readKey.Groups[1].Value }
  }
  & node (Join-Path $PSScriptRoot 'build.mjs') --out-dir $site
  if ($LASTEXITCODE -ne 0) { throw 'Public asset build failed.' }
} finally {
  $env:LASTFM_API_KEY = $previousReadKey
}
$functionSource = Join-Path $project 'functions'
foreach ($file in Get-ChildItem -LiteralPath $functionSource -Recurse -File) {
  $relative = $file.FullName.Substring($functionSource.Length).TrimStart('\', '/')
  $target = Join-Path (Join-Path $run 'functions') $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

Write-Host "Serving Sleeve from $site"
# Local preview intentionally has no production budget binding. For a full budget
# integration test, use the separate Worker instructions in docs/DEPLOYMENT.md.
$localConfig = Join-Path $run 'wrangler.jsonc'
@{ name = 'liner'; compatibility_date = '2026-09-01'; pages_build_output_dir = $site } | ConvertTo-Json | Set-Content -LiteralPath $localConfig -Encoding UTF8
$previewArgs = @('pages', 'dev', $site, '--port', "$Port", '--persist-to', (Join-Path $stage 'state'))
if (Test-Path -LiteralPath $secrets) { $previewArgs += @('--env-file', $secrets) }
Push-Location $run
try {
  & $wrangler @previewArgs
} finally {
  Pop-Location
}
