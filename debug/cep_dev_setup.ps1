param(
    [string]$extension_folder_name = "com.example.mixboxpalette.cep"
)

$repo_root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cep_extensions_root = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$link_path = Join-Path $cep_extensions_root $extension_folder_name

Write-Host "[CEP] repo_root=$repo_root"
Write-Host "[CEP] link_path=$link_path"

# 1) Enable unsigned extension loading (PlayerDebugMode=1)
foreach ($v in 6..12) {
    $key_path = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key_path)) {
        New-Item -Path $key_path -Force | Out-Null
    }
    New-ItemProperty -Path $key_path -Name "PlayerDebugMode" -PropertyType DWord -Value 1 -Force | Out-Null
}
Write-Host "[CEP] PlayerDebugMode enabled (CSXS.6..12)"

# 2) Create extensions folder
if (-not (Test-Path $cep_extensions_root)) {
    New-Item -ItemType Directory -Path $cep_extensions_root -Force | Out-Null
}

# 3) Create dev junction -> repo root
if (Test-Path $link_path) {
    Write-Host "[CEP] link already exists, skip: $link_path"
    Write-Host "[CEP] If you want to recreate it, delete the existing folder/junction manually and rerun."
    exit 0
}

New-Item -ItemType Junction -Path $link_path -Target $repo_root | Out-Null
Write-Host "[CEP] Junction created: $link_path -> $repo_root"
Write-Host "[CEP] Done. Restart Photoshop, then open: Window > Extensions (Legacy) > Mixbox Palette (CEP)"

