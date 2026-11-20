param(
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion,
    [switch]$UnsignedProof,
    [string]$UpgradeFromVersion
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows_signatures.ps1')
# This installs and launches the app only on a disposable GitHub Actions runner.
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Run this installation smoke test on a GitHub Actions Windows runner.'
}

$installer = Get-Item -LiteralPath $InstallerPath
$versionPattern = '^' + [regex]::Escape($ExpectedVersion) + '(\.0)?$'
if ($installer.VersionInfo.ProductVersion -notmatch $versionPattern) {
    throw "Unexpected installer version: $($installer.VersionInfo.ProductVersion)"
}
if (-not $UnsignedProof) { Assert-WindowsFileSignature -Path $installer.FullName | Out-Null }
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
$signatureSummary = if ($UnsignedProof) { 'unsigned workflow proof; not a signed release' } else { 'app, uninstaller and installer valid, timestamped, Impertio Studio B.V.' }
$installDirectory = Join-Path $env:RUNNER_TEMP 'pile-plan-studio-smoke'
if (Test-Path -LiteralPath $installDirectory) {
    throw "Smoke-test destination already exists: $installDirectory"
}

function Invoke-SilentInstaller([string]$Path, [string]$Arguments) {
    $setup = Start-Process -FilePath $Path -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    if (-not $setup.WaitForExit(120000)) {
        Stop-Process -Id $setup.Id
        throw "Silent installation timed out: $Path"
    }
    if ($setup.ExitCode -ne 0) {
        throw "Silent installer exited with $($setup.ExitCode): $Path"
    }
}

function Get-VersionedExecutable([string]$InstallDirectory, [string]$VersionPattern) {
    $file = Get-Item -LiteralPath (Join-Path $InstallDirectory 'pile-plan-studio.exe')
    if ($file.VersionInfo.ProductVersion -notmatch $VersionPattern) {
        throw "Unexpected installed product version: $($file.VersionInfo.ProductVersion)"
    }
    $file
}

if ($UpgradeFromVersion) {
    if ($UpgradeFromVersion -notmatch '^\d{4}\.\d{1,2}\.(0|[1-9]\d*)$' -or
        [version]$UpgradeFromVersion -ge [version]$ExpectedVersion) {
        throw 'The Windows upgrade source must be an older published YYYY.W.N version.'
    }
    $previousName = "Open.Pile.Plan.Studio_${UpgradeFromVersion}_x64-setup.exe"
    $previousPath = Join-Path $env:RUNNER_TEMP $previousName
    $previousUrl = "https://github.com/OpenAEC-Foundation/pile-plan-studio/releases/download/v$UpgradeFromVersion/$previousName"
    Invoke-WebRequest -Uri $previousUrl -OutFile $previousPath -TimeoutSec 120
    Assert-WindowsFileSignature -Path $previousPath | Out-Null
    $previousPattern = '^' + [regex]::Escape($UpgradeFromVersion) + '(\.0)?$'
    if ((Get-Item -LiteralPath $previousPath).VersionInfo.ProductVersion -notmatch $previousPattern) {
        throw 'Unexpected version in the previous installer.'
    }
    # NSIS requires /D last, without quotes even when the path has spaces.
    Invoke-SilentInstaller $previousPath "/S /D=$installDirectory"
    Get-VersionedExecutable $installDirectory $previousPattern | Out-Null
    # Supply no /D on update to exercise the normal existing-installation lookup.
    Invoke-SilentInstaller $installer.FullName '/S /UPDATE'
    Get-VersionedExecutable $installDirectory $versionPattern | Out-Null
    "- In-place update from ${UpgradeFromVersion}: passed" | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY
    # Run the uninstaller directly so the process we wait on does the removal.
    Invoke-SilentInstaller (Join-Path $installDirectory 'uninstall.exe') "/S _?=$installDirectory"
    if (Test-Path -LiteralPath (Join-Path $installDirectory 'pile-plan-studio.exe')) {
        throw 'The upgraded executable remained after uninstall.'
    }
}

Invoke-SilentInstaller $installer.FullName "/S /D=$installDirectory"
$executable = Get-VersionedExecutable $installDirectory $versionPattern
$signatureProof = @()
if (-not $UnsignedProof) {
    $signatureProof = @(Assert-WindowsReleaseSignatures -InstallerPath $installer.FullName -InstallDirectory $installDirectory)
    $signatureProof | Format-Table File, Status, Timestamped, Publisher
}

$app = Start-Process -FilePath $executable.FullName -WorkingDirectory $installDirectory -WindowStyle Hidden -PassThru
try {
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $app.Refresh()
        if ($app.HasExited) { throw 'The installed application exited during startup.' }
        $webview = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($app.Id) AND Name = 'msedgewebview2.exe'"
    } while (-not $webview -and (Get-Date) -lt $deadline)
    if (-not $webview) { throw 'The installed application did not start its WebView2 browser.' }
    if ($app.Path -ne $executable.FullName) { throw "Unexpected running executable: $($app.Path)" }
    Start-Sleep -Seconds 10
    $app.Refresh()
    if ($app.HasExited) { throw 'The installed application exited after startup.' }

    $proofDirectory = Join-Path $env:RUNNER_TEMP 'pile-plan-windows-proof'
    if (Test-Path -LiteralPath $proofDirectory) { throw "Proof destination already exists: $proofDirectory" }
    New-Item -ItemType Directory -Path $proofDirectory | Out-Null
    foreach ($proofFile in @($installer.FullName, $executable.FullName, (Join-Path $installDirectory 'uninstall.exe'))) {
        Copy-Item -LiteralPath $proofFile -Destination $proofDirectory
    }
    [pscustomobject]@{
        Version = $ExpectedVersion
        Signed = -not $UnsignedProof
        Files = $signatureProof
        InstalledExecutable = $app.Path
        LaunchPassed = $true
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $proofDirectory 'signatures.json') -Encoding utf8

    @"
### Windows installer smoke test
- Version: $ExpectedVersion
- Signature: $signatureSummary
- SHA-256: $hash
- Silent installation: passed
- Launch: passed; installed executable started WebView2 and remained running
- Running executable: $($app.Path)
"@ | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY
} finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id }
}
