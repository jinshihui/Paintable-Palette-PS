param(
  [string]$extension_id = "com.example.mixboxpalette",
  [string]$repo_root = (Split-Path -Parent $PSScriptRoot),
  [string]$source_dir = (Join-Path (Split-Path -Parent $PSScriptRoot) "cep_ext\\com.example.mixboxpalette"),
  [string]$mixbox_source = (Join-Path (Split-Path -Parent $PSScriptRoot) "lib\\mixbox.js"),
  [string]$out_dir = (Join-Path (Split-Path -Parent $PSScriptRoot) "dist\\cep_zxp"),
  [string]$zxpsigncmd_path = $(if (![string]::IsNullOrWhiteSpace($env:ZXPSIGNCMD_PATH)) { $env:ZXPSIGNCMD_PATH } else { (Join-Path $PSScriptRoot "ZXPSignCmd.exe") }),
  [string]$cert_p12_path = (Join-Path $PSScriptRoot "certs\\cep_self_signed.p12"),
  [securestring]$cert_password,
  [switch]$include_debug
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $source_dir)) {
  throw "source_dir not found: $source_dir"
}

if (!(Test-Path -LiteralPath $mixbox_source)) {
  throw "mixbox_source not found: $mixbox_source"
}

if ([string]::IsNullOrWhiteSpace($zxpsigncmd_path)) {
  throw "zxpsigncmd_path is empty. Set env ZXPSIGNCMD_PATH or pass -zxpsigncmd_path."
}

if (!(Test-Path -LiteralPath $zxpsigncmd_path)) {
  throw "ZXPSignCmd not found: $zxpsigncmd_path"
}

if (!(Test-Path -LiteralPath $cert_p12_path)) {
  throw "cert_p12_path not found: $cert_p12_path"
}

if (-not $cert_password) {
  $cert_password = Read-Host "P12 password" -AsSecureString
}

$password_ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cert_password)
try {
  $cert_password_plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($password_ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($password_ptr)
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$staging_root = Join-Path $out_dir "staging\\$extension_id-$timestamp"
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

New-Item -ItemType Directory -Path $out_dir -Force | Out-Null
$zxp_path = Join-Path $out_dir "$extension_id-$timestamp.zxp"
Remove-Item -LiteralPath $zxp_path -Force -ErrorAction SilentlyContinue

Write-Host "Signing ZXP..."
Write-Host "  zxpsign: $zxpsigncmd_path"
Write-Host "  cert:    $cert_p12_path"
Write-Host "  src:     $staging_ext_dir"
Write-Host "  out:     $zxp_path"

& $zxpsigncmd_path -sign $staging_ext_dir $zxp_path $cert_p12_path $cert_password_plain

if (!(Test-Path -LiteralPath $zxp_path)) {
  throw "ZXP not created: $zxp_path"
}

Write-Host "[OK] Signed ZXP created:"
Write-Host "  $zxp_path"
Write-Host ""
Write-Host "Verify:"
Write-Host "  `"$zxpsigncmd_path`" -verify `"$zxp_path`""
