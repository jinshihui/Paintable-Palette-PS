param(
  [string]$extension_id = "com.example.mixboxpalette",
  [string]$source_dir = (Join-Path $PSScriptRoot "cep_ext\\com.example.mixboxpalette"),
  [string]$mixbox_source = (Join-Path $PSScriptRoot "lib\\mixbox.js"),
  [string]$out_dir = (Join-Path $PSScriptRoot "dist\\cep"),
  [switch]$include_debug
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $source_dir)) {
  throw "source_dir not found: $source_dir"
}

if (!(Test-Path -LiteralPath $mixbox_source)) {
  throw "mixbox_source not found: $mixbox_source"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$staging_root = Join-Path $out_dir "$extension_id-$timestamp"
$staging_ext_dir = Join-Path $staging_root $extension_id

New-Item -ItemType Directory -Path $staging_ext_dir -Force | Out-Null

Write-Host "Staging CEP extension..."
Write-Host "  source:  $source_dir"
Write-Host "  staging: $staging_ext_dir"

$robocopy_args = @(
  $source_dir,
  $staging_ext_dir,
  "/E",
  "/FFT",
  "/R:2",
  "/W:1",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP"
)

if (-not $include_debug) {
  $robocopy_args += @("/XF", ".debug")
}

& robocopy @robocopy_args | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) {
  throw "robocopy failed with exit code: $rc"
}

$mixbox_dest = Join-Path $staging_ext_dir "js\\mixbox.js"
New-Item -ItemType Directory -Path (Split-Path -Parent $mixbox_dest) -Force | Out-Null
Copy-Item -LiteralPath $mixbox_source -Destination $mixbox_dest -Force

$zip_path = Join-Path $out_dir "$extension_id-$timestamp.zip"
Write-Host "Creating zip..."
Write-Host "  zip: $zip_path"
Compress-Archive -Path (Join-Path $staging_root $extension_id) -DestinationPath $zip_path -Force

Write-Host "[OK] Package created:"
Write-Host "  $zip_path"
Write-Host ""
Write-Host "Install:"
Write-Host "  1) Extract '$extension_id' folder into:"
Write-Host "     %APPDATA%\\Adobe\\CEP\\extensions\\"
Write-Host "  2) Ensure PlayerDebugMode=1"
Write-Host "  3) Restart Photoshop"

