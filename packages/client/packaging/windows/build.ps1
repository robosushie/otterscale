# Build the Otterscale installers. The installed app is otterscale.exe.
# Outputs: dist\otterscale-installer.msi and dist\otterscale-installer.exe.
$ErrorActionPreference = "Stop"
$env:GOTOOLCHAIN = "go1.25.3"

$here = $PSScriptRoot
$client = (Resolve-Path (Join-Path $here "..\..")).Path
$dist = Join-Path $here "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Push-Location $client
try {
    go build -o (Join-Path $dist "tailscaled.exe") tailscale.com/cmd/tailscaled
    if ($LASTEXITCODE -ne 0) { throw "tailscaled build failed" }
    go build -tags production -ldflags="-H windowsgui" -o (Join-Path $dist "otterscale.exe") ./cmd/desktop
    if ($LASTEXITCODE -ne 0) { throw "otterscale build failed" }
    $bin = Join-Path $dist "bin"
    New-Item -ItemType Directory -Force -Path $bin | Out-Null
    go build -o (Join-Path $bin "otterscale.exe") ./cmd/otterscale
    if ($LASTEXITCODE -ne 0) { throw "otterscale cli build failed" }
}
finally {
    Pop-Location
}

$tools = Join-Path $env:USERPROFILE ".dotnet\tools"
if (Test-Path $tools) {
    $env:PATH = "$tools;$env:PATH"
}
$wixVersion = "5.0.2"
$listed = dotnet tool list --global | Out-String
if ($listed -match '(?m)^wix\s+(\S+)') {
    if ($Matches[1] -ne $wixVersion) {
        dotnet tool uninstall --global wix
        if ($LASTEXITCODE -ne 0) { throw "could not replace WiX $($Matches[1])" }
        dotnet tool install --global wix --version $wixVersion
    }
} else {
    dotnet tool install --global wix --version $wixVersion
}
if ($LASTEXITCODE -ne 0) { throw "could not install WiX $wixVersion" }
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    throw "WiX $wixVersion is not on PATH. Install it with: dotnet tool install --global wix --version $wixVersion"
}

Push-Location $here
try {
    wix extension add "WixToolset.Util.wixext/$wixVersion"
    if ($LASTEXITCODE -ne 0) { throw "could not add the WiX util extension" }
    wix extension add "WixToolset.Bal.wixext/$wixVersion"
    if ($LASTEXITCODE -ne 0) { throw "could not add the WiX bootstrapper extension" }
    $utilDll = Get-ChildItem -Recurse -Filter "WixToolset.Util.wixext.dll" (Join-Path $here ".wix") | Select-Object -First 1
    $balDll = Get-ChildItem -Recurse -Filter "WixToolset.BootstrapperApplications.wixext.dll" (Join-Path $here ".wix") | Select-Object -First 1
    if (-not $utilDll) { throw "WiX util extension was not downloaded" }
    if (-not $balDll) { throw "WiX bootstrapper extension was not downloaded" }
    wix build -arch x64 -ext $utilDll.FullName -o (Join-Path $dist "otterscale-installer.msi") (Join-Path $here "Package.wxs")
    if ($LASTEXITCODE -ne 0) { throw "wix build failed" }
    wix build -arch x64 -ext $balDll.FullName -o (Join-Path $dist "otterscale-installer.exe") (Join-Path $here "Bundle.wxs")
    if ($LASTEXITCODE -ne 0) { throw "wix bundle build failed" }
}
finally {
    Pop-Location
}

Write-Host "Installed app name: otterscale.exe"
Write-Host "Built $(Join-Path $dist 'otterscale-installer.msi')"
Write-Host "Built $(Join-Path $dist 'otterscale-installer.exe')"
