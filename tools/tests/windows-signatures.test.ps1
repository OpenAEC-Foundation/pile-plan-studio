param([Parameter(Mandatory = $true)][string]$FixtureDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\windows_signatures.ps1')

$installDirectory = Join-Path $FixtureDirectory 'installed app'
New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
$installer = Join-Path $FixtureDirectory 'studio-setup.exe'
$app = Join-Path $installDirectory 'pile-plan-studio.exe'
$uninstaller = Join-Path $installDirectory 'uninstall.exe'
foreach ($file in @($installer, $app, $uninstaller)) { Set-Content -LiteralPath $file -Value 'signature-fixture' }

# Authenticode is the external Windows trust boundary; file enumeration, presence,
# hashing and all release-policy decisions below exercise production code.
$script:InvalidFile = $null
$script:Failure = $null
function Get-AuthenticodeSignature {
    param([string]$LiteralPath)
    $invalid = $LiteralPath -eq $script:InvalidFile
    $subject = if ($invalid -and $script:Failure -eq 'publisher') { 'CN=Not Impertio Studio B.V., O=Other' } else { 'CN=Impertio Studio B.V., O=Impertio Studio B.V., C=NL' }
    $status = if ($invalid -and $script:Failure -in @('NotSigned', 'HashMismatch')) { $script:Failure } else { 'Valid' }
    [pscustomobject]@{
        Status = $status; StatusMessage = 'fixture'
        SignerCertificate = [pscustomobject]@{ Subject = $subject; Thumbprint = 'fixture-thumbprint' }
        TimeStamperCertificate = if ($invalid -and $script:Failure -eq 'timestamp') { $null } else { [pscustomobject]@{ Subject = 'CN=Timestamp fixture' } }
    }
}

$records = @(Assert-WindowsReleaseSignatures -InstallerPath $installer -InstallDirectory $installDirectory)
$names = @($records | ForEach-Object { $_.File } | Sort-Object)
if (($names -join ',') -ne 'pile-plan-studio.exe,studio-setup.exe,uninstall.exe') { throw 'All three release binaries must be checked.' }
foreach ($record in $records) {
    if ($record.Status -ne 'Valid' -or -not $record.Timestamped -or $record.SHA256.Length -ne 64) { throw 'Incomplete signature proof.' }
}
foreach ($file in @($installer, $app, $uninstaller)) {
    foreach ($failure in @('NotSigned', 'HashMismatch', 'publisher', 'timestamp')) {
        $script:InvalidFile = $file
        $script:Failure = $failure
        $rejected = $false
        try { Assert-WindowsReleaseSignatures -InstallerPath $installer -InstallDirectory $installDirectory | Out-Null }
        catch {
            if (-not $_.Exception.Message.Contains([System.IO.Path]::GetFileName($file))) { throw 'Failure must identify the rejected file.' }
            $rejected = $true
        }
        if (-not $rejected) { throw "Accepted invalid $failure signature: $file" }
    }
}
$script:InvalidFile = $null
$script:Failure = $null
Remove-Item -LiteralPath $uninstaller
$rejectedMissing = $false
try { Assert-WindowsReleaseSignatures -InstallerPath $installer -InstallDirectory $installDirectory | Out-Null }
catch { $rejectedMissing = $true }
if (-not $rejectedMissing) { throw 'A missing uninstaller must fail the release gate.' }
Write-Output 'All three binary signatures and rejection cases passed.'
