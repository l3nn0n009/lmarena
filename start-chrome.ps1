# Start Chrome with Remote Debugging for LMArena
# This script starts a dedicated Chrome automation profile with remote debugging enabled.
# You generally don't need to run this manually anymore; the server will auto-start Chrome if needed.

Write-Host "Starting Chrome with remote debugging on port 9222..." -ForegroundColor Cyan
Write-Host ""

# Check if Chrome is already running with debugging
try {
    $response = Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing -TimeoutSec 2
    Write-Host "Chrome is already running with remote debugging!" -ForegroundColor Green
    Write-Host "You can now start the server with: npm run start" -ForegroundColor Yellow
    exit 0
} catch {
    Write-Host "Chrome not running with debugging, starting now..." -ForegroundColor Yellow
}

# By default we use your real Chrome profile (Profile 3) so you're already logged in and have any
# existing site clearance; set $useDedicatedProfile = $true to use the repo's ./chrome-profile instead.
# NOTE: Chrome can't open the same profile twice; close Chrome first if you use the system profile.
$useDedicatedProfile = $false

$profileDir = Join-Path $PSScriptRoot "chrome-profile"
if (!(Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir | Out-Null }

$systemUserDataRoot = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"

# Start Chrome with remote debugging
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$arguments = @(
    "--remote-debugging-port=9222",
    $(if ($useDedicatedProfile) { "--user-data-dir=$profileDir" } else { "--user-data-dir=$systemUserDataRoot" }),
    $(if ($useDedicatedProfile) { $null } else { "--profile-directory=Profile 3" }),
    "--no-first-run",
    "--no-default-browser-check",
    "https://lmarena.ai/?mode=direct&model=gemini-3-pro&chat-modality=text"
)
$arguments = $arguments | Where-Object { $_ -and $_.ToString().Trim().Length -gt 0 }

Write-Host "Launching Chrome for automation..." -ForegroundColor Cyan
Start-Process -FilePath $chromePath -ArgumentList $arguments

Start-Sleep -Seconds 3

# Verify it started
try {
    $response = Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing -TimeoutSec 5
    Write-Host ""
    Write-Host "SUCCESS! Chrome is running with remote debugging." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Chrome should have opened to: https://lmarena.ai/?mode=direct&model=gemini-3-pro&chat-modality=text" -ForegroundColor White
    Write-Host "  2. Complete any Cloudflare challenges if they appear" -ForegroundColor White
    Write-Host "  3. Start the server: npm run start" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "WARNING: Could not verify Chrome started correctly." -ForegroundColor Red
    Write-Host "Try running the command manually:" -ForegroundColor Yellow
    Write-Host '  & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --profile-directory="Profile 3" "https://lmarena.ai/?mode=direct&model=gemini-3-pro&chat-modality=text"' -ForegroundColor White
}
