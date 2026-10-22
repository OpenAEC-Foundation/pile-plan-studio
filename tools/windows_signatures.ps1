function Assert-WindowsFileSignature {
    param([Parameter(Mandatory = $true)][string]$Path)

    $file = Get-Item -LiteralPath $Path -ErrorAction Stop
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid') {
        throw "$($file.Name): invalid signature ($($signature.Status))."
    }
    if ($signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)CN=Impertio Studio B\.V\.(?:,|$)') {
        throw "$($file.Name): unexpected publisher ($($signature.SignerCertificate.Subject))."
    }
    if (-not $signature.TimeStamperCertificate) {
        throw "$($file.Name): signature has no trusted timestamp."
    }
    [pscustomobject]@{
        File = $file.Name
        Path = $file.FullName
        Status = $signature.Status.ToString()
        Publisher = $signature.SignerCertificate.Subject
        CertificateThumbprint = $signature.SignerCertificate.Thumbprint
        Timestamped = $true
        SHA256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
}

function Assert-WindowsReleaseSignatures {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerPath,
        [Parameter(Mandatory = $true)][string]$InstallDirectory
    )

    foreach ($path in @($InstallerPath, (Join-Path $InstallDirectory 'pile-plan-studio.exe'), (Join-Path $InstallDirectory 'uninstall.exe'))) {
        Assert-WindowsFileSignature -Path $path
    }
}
