param(
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
# This installs and launches the app only on a disposable GitHub Actions runner.
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Run this installation smoke test on a GitHub Actions Windows runner.'
}

$installer = Get-Item -LiteralPath $InstallerPath
$versionPattern = '^' + [regex]::Escape($ExpectedVersion) + '(\.0)?$'
if ($installer.VersionInfo.ProductVersion -notmatch $versionPattern) {
    throw "Unexpected installer version: $($installer.VersionInfo.ProductVersion)"
}
$signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
if ($signature.Status -ne 'Valid' -or
    $signature.SignerCertificate.Subject -notmatch 'Impertio Studio B\.V\.') {
    throw 'The installer must have a valid Impertio Studio B.V. signature.'
}
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
$installDirectory = Join-Path $env:RUNNER_TEMP 'pile-plan-studio-smoke'
if (Test-Path -LiteralPath $installDirectory) {
    throw "Smoke-test destination already exists: $installDirectory"
}

# NSIS requires /D as the last argument, without quotes even when it has spaces.
$setup = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$installDirectory" -WindowStyle Hidden -PassThru
if (-not $setup.WaitForExit(120000)) {
    Stop-Process -Id $setup.Id
    throw 'Silent installation timed out.'
}
if ($setup.ExitCode -ne 0) {
    throw "Silent installation failed: $($setup.ExitCode)"
}
$executable = Get-Item -LiteralPath (Join-Path $installDirectory 'pile-plan-studio.exe')
if ($executable.VersionInfo.ProductVersion -notmatch $versionPattern) {
    throw "Unexpected installed product version: $($executable.VersionInfo.ProductVersion)"
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

    @"
### Windows installer smoke test
- Version: $ExpectedVersion
- Signature: valid, Impertio Studio B.V.
- SHA-256: $hash
- Silent installation: passed
- Launch: passed; installed executable started WebView2 and remained running
- Running executable: $($app.Path)
"@ | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY
} finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id }
}
