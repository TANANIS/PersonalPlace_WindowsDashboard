param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"

$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
if (-not (Test-Path -LiteralPath $signtool)) {
    $found = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match 'x64' } | Select-Object -First 1
    if ($found) { $signtool = $found.FullName }
}
if (-not (Test-Path -LiteralPath $signtool)) {
    throw "signtool.exe not found"
}

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -like "*JSrad Personal Place*" } | Select-Object -First 1
if (-not $cert) {
    throw "Code signing certificate 'JSrad Personal Place' not found in CurrentUser\My"
}

$baseArgs = @("sign", "/fd", "SHA256", "/sha1", $cert.Thumbprint)
$withTimestamp = $baseArgs + @("/tr", "http://timestamp.digicert.com", "/td", "SHA256", $Path)
& $signtool @withTimestamp 2>&1 | ForEach-Object { Write-Output "signtool: $_" }
if ($LASTEXITCODE -ne 0) {
    Write-Output "timestamped signing failed, retrying without timestamp"
    $noTimestamp = $baseArgs + @($Path)
    & $signtool @noTimestamp 2>&1 | ForEach-Object { Write-Output "signtool: $_" }
    if ($LASTEXITCODE -ne 0) {
        throw "signtool sign failed with exit code $LASTEXITCODE"
    }
}