param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$Cargo = "cargo",
    [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "THIRD_PARTY_LICENSES.md")
)

$ErrorActionPreference = "Stop"
$rows = New-Object System.Collections.Generic.List[object]

$cargoJson = & $Cargo metadata --manifest-path (Join-Path $ProjectRoot "src-tauri\Cargo.toml") --format-version 1 2>$null
if ($LASTEXITCODE -ne 0) { throw "cargo metadata failed" }
$cargoData = $cargoJson | ConvertFrom-Json
foreach ($package in $cargoData.packages) {
    if ($package.name -eq "personal-workspace") { continue }
    $rows.Add([pscustomobject]@{
        Ecosystem = "Rust"
        Package = $package.name
        Version = $package.version
        License = if ($package.license) { $package.license } else { "Not declared in metadata" }
    })
}

$nodeRoot = Join-Path $ProjectRoot "node_modules"
if (Test-Path -LiteralPath $nodeRoot) {
    foreach ($file in Get-ChildItem -LiteralPath $nodeRoot -Filter package.json -File -Recurse -ErrorAction SilentlyContinue) {
        try {
            $package = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
            if (-not $package.name -or -not $package.version) { continue }
            $license = if ($package.license -is [string]) { $package.license } elseif ($package.licenses) { ($package.licenses | ForEach-Object { $_.type }) -join " OR " } else { "Not declared in package.json" }
            $rows.Add([pscustomobject]@{ Ecosystem = "Node"; Package = $package.name; Version = $package.version; License = $license })
        } catch { }
    }
}

$unique = $rows | Sort-Object Ecosystem,Package,Version -Unique
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# Personal Place Third-Party License Inventory")
$lines.Add("")
$lines.Add("Generated from locked Cargo metadata and installed Node packages. Regenerate from a clean dependency install before publication and distribute the applicable license texts with the installer.")
$lines.Add("")
$lines.Add("Generated at (UTC): $([DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'))")
$lines.Add("")
$lines.Add("| Ecosystem | Package | Version | Declared license |")
$lines.Add("|---|---|---:|---|")
foreach ($row in $unique) {
    $name = ([string]$row.Package).Replace("|", "\|")
    $license = ([string]$row.License).Replace("|", "\|")
    $lines.Add("| $($row.Ecosystem) | $name | $($row.Version) | $license |")
}
$lines | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output "Wrote $($unique.Count) package entries to $OutputPath"
