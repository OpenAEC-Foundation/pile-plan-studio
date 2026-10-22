param(
    [string]$ToolRoot = (Join-Path $env:LOCALAPPDATA 'TrustedSigning'),
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
foreach ($required in @('AZURE_ENDPOINT', 'AZURE_ACCOUNT', 'AZURE_PROFILE')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($required))) {
        throw "Missing signing metadata: $required"
    }
}
$signtool = Get-ChildItem -LiteralPath $ToolRoot -Recurse -Filter signtool.exe -File |
    Where-Object { $_.FullName -match '[\\/]x64[\\/]' } | Sort-Object FullName -Descending | Select-Object -First 1
$dlib = Get-ChildItem -LiteralPath $ToolRoot -Recurse -Filter Azure.CodeSigning.Dlib.dll -File |
    Where-Object { $_.FullName -match '[\\/]x64[\\/]' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool -or -not $dlib) { throw 'Azure signing tools missing: x64 signtool.exe and Azure.CodeSigning.Dlib.dll are required.' }

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$metadataPath = Join-Path $output 'trusted-signing-metadata.json'
@{
    Endpoint = $env:AZURE_ENDPOINT
    CodeSigningAccountName = $env:AZURE_ACCOUNT
    CertificateProfileName = $env:AZURE_PROFILE
} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

# Tauri replaces %1 with each binary's path, including the patched app and NSIS
# uninstaller. Arguments remain separate, so tool and project paths may contain spaces.
$config = @{ bundle = @{ windows = @{ signCommand = @{
    cmd = $signtool.FullName
    args = @('sign', '/v', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com', '/td', 'SHA256',
             '/dlib', $dlib.FullName, '/dmdf', $metadataPath, '%1')
} } } }
$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'tauri.windows-signing.json') -Encoding utf8
Write-Output 'Configured Tauri signing for the app, uninstaller and installer.'
