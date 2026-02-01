# start-dev.ps1 - Launch server, renderer, and controller dev servers in separate PowerShell windows

$root = Split-Path -Parent $PSScriptRoot

Write-Host "Starting dev servers in new PowerShell windows (running root scripts)..."

# Run root-level scripts so workspace lookups work correctly
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', "-Command", "Set-Location -LiteralPath '$root'; npm run dev:server"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', "-Command", "Set-Location -LiteralPath '$root'; npm run dev:renderer"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', "-Command", "Set-Location -LiteralPath '$root'; npm run dev:controller"

Write-Host "All dev terminals launched. Close windows to stop individual servers."
