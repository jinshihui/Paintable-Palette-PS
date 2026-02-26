param(
  [string]$zxpsigncmd_path = $(if (![string]::IsNullOrWhiteSpace($env:ZXPSIGNCMD_PATH)) { $env:ZXPSIGNCMD_PATH } else { (Join-Path $PSScriptRoot "ZXPSignCmd.exe") }),
  [string]$out_p12_path = (Join-Path $PSScriptRoot "certs\\cep_self_signed.p12"),
  [string]$country = "CN",
  [string]$state = "Beijing",
  [string]$org = "MyOrg",
  [string]$common_name = "CEP Self-Signed",
  [securestring]$password,
  [switch]$force
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($zxpsigncmd_path)) {
  throw "zxpsigncmd_path is empty. Set env ZXPSIGNCMD_PATH or pass -zxpsigncmd_path."
}

if (!(Test-Path -LiteralPath $zxpsigncmd_path)) {
  throw "ZXPSignCmd not found: $zxpsigncmd_path"
}

if (-not $password) {
  $password = Read-Host "P12 password" -AsSecureString
}

$password_ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
  $password_plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($password_ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($password_ptr)
}

New-Item -ItemType Directory -Path (Split-Path -Parent $out_p12_path) -Force | Out-Null

if ((Test-Path -LiteralPath $out_p12_path) -and -not $force) {
  throw "Output .p12 already exists: $out_p12_path (use -force to overwrite)"
}

if ($force) {
  Remove-Item -LiteralPath $out_p12_path -Force -ErrorAction SilentlyContinue
}

Write-Host "Creating self-signed CEP cert (.p12)..."
Write-Host "  zxpsign: $zxpsigncmd_path"
Write-Host "  out:     $out_p12_path"

& $zxpsigncmd_path -selfSignedCert $country $state $org $common_name $password_plain $out_p12_path

if (!(Test-Path -LiteralPath $out_p12_path)) {
  throw "Cert not created: $out_p12_path"
}

Write-Host "[OK] Cert created:"
Write-Host "  $out_p12_path"
