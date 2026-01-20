# Build All Plugins
# Quick script to build both plugins

Write-Host "Building D&D Campaign Hub..." -ForegroundColor Cyan
Set-Location "c:\Users\kevin\SynologyDrive\Plugins\dnd-campaign-hub"
$env:PATH = "c:\Users\kevin\SynologyDrive\Plugins\nodejs;$env:PATH"
npm run build

Write-Host "`nBuilding D&D Session Transcription..." -ForegroundColor Cyan
Set-Location "c:\Users\kevin\SynologyDrive\Plugins\dnd-session-transcription"
npm run build

Write-Host "`n✅ Both plugins built successfully!" -ForegroundColor Green
Write-Host "`nOutput files:" -ForegroundColor Yellow
Write-Host "  - dnd-campaign-hub\dist\main.js"
Write-Host "  - dnd-session-transcription\main.js"
