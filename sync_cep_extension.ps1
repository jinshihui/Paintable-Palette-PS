param(
  [string]$source_dir = (Join-Path $PSScriptRoot "cep_ext\\com.example.mixboxpalette"),
  [string]$extensions_root = "C:\\Users\\jinxx\\AppData\\Roaming\\Adobe\\CEP\\extensions",
  [string]$extension_id = "com.example.mixboxpalette",
  [switch]$enable_player_debug_mode,
  [int]$csxs_major = 11
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $source_dir)) {
  throw "source_dir not found: $source_dir"
}

$dest_dir = Join-Path $extensions_root $extension_id
New-Item -ItemType Directory -Path $dest_dir -Force | Out-Null

if ($enable_player_debug_mode) {
  $csxs_key_path = "HKCU:\\Software\\Adobe\\CSXS.$csxs_major"
  New-Item -Path $csxs_key_path -Force | Out-Null
  New-ItemProperty -Path $csxs_key_path -Name "PlayerDebugMode" -PropertyType String -Value "1" -Force | Out-Null
  Write-Host "[OK] PlayerDebugMode enabled at $csxs_key_path"
}

Write-Host "Syncing CEP extension files..."
Write-Host "  source: $source_dir"
Write-Host "  dest:   $dest_dir"

& robocopy $source_dir $dest_dir /E /FFT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
$rc = $LASTEXITCODE

if ($rc -ge 8) {
  throw "robocopy failed with exit code: $rc"
}

Write-Host "[OK] Sync finished."
Write-Host "Tip: Restart Photoshop to reload the CEP panel if needed."
