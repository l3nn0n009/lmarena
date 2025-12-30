Write-Host "========================================"
Write-Host "  Grove AI Studio - Setup Wizard"
Write-Host "========================================"
Write-Host ""
Write-Host "This script will launch Chrome in manual mode."
Write-Host "Please use this window to:"
Write-Host "  1. Log in to LMArena"
Write-Host "  2. Accept Terms of Service"
Write-Host "  3. Verify you can send messages"
Write-Host ""
Write-Host "When done, close Chrome and press Enter in this window."

node server/setup.js

Write-Host "Setup complete. You can now run .\deploy.ps1"
Read-Host "Press Enter to exit"
