# Windows-friendly entrypoint for the bundled Docker stack.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
pnpm deploy:stack @args
