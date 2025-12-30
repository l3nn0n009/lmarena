# Grove AI Studio - Surge Deployment Script
# This script:
# 1. Starts the backend server
# 2. Creates a cloudflared tunnel for the backend
# 3. Builds the frontend with the backend URL
# 4. Deploys frontend to Surge.sh with static URL
# 5. Reports the final URL

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tempDir = Join-Path $scriptDir "temp"

# Surge domain - you can customize this
$SURGE_DOMAIN = "grove-ai-studio.surge.sh"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Grove AI Studio - Production Deploy  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create temp dir
if (!(Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }

# Step 1: Cleanup old processes
Write-Host "[1/6] Cleaning up old processes..." -ForegroundColor Yellow
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Step 2: Start backend server
Write-Host "[2/6] Starting backend server..." -ForegroundColor Yellow
$serverLog = Join-Path $tempDir "server.log"
$serverProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run server > `"$serverLog`" 2>&1" -WorkingDirectory $scriptDir -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3

# Step 3: Create cloudflared tunnel for backend
Write-Host "[3/6] Creating backend tunnel..." -ForegroundColor Yellow
$backendTunnelLog = Join-Path $tempDir "backend_tunnel.log"
$backendTunnel = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "localhost:3000", "--ha-connections", "1" -RedirectStandardError $backendTunnelLog -WindowStyle Hidden -PassThru

# Wait for backend tunnel URL
Write-Host "     Waiting for backend tunnel URL..." -ForegroundColor Gray
$backendUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $backendTunnelLog) {
        $logContent = Get-Content $backendTunnelLog -Raw -ErrorAction SilentlyContinue
        if ($logContent -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $backendUrl = $matches[0]
            Write-Host "     Backend URL: $backendUrl" -ForegroundColor Green
            break
        }
    }
}

if (-not $backendUrl) {
    Write-Host "     ERROR: Could not get backend tunnel URL!" -ForegroundColor Red
    exit 1
}

# Step 4: Configure frontend with backend URL
Write-Host "[4/6] Configuring frontend..." -ForegroundColor Yellow
$envFile = Join-Path $scriptDir "client\.env"
Set-Content -Path $envFile -Value "VITE_BACKEND_URL=$backendUrl"
Write-Host "     Set VITE_BACKEND_URL=$backendUrl" -ForegroundColor Gray

# Step 5: Build frontend for production
Write-Host "[5/6] Building frontend for production..." -ForegroundColor Yellow
Set-Location (Join-Path $scriptDir "client")
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "     ERROR: Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "     Build complete!" -ForegroundColor Green

# Step 6: Deploy to Surge
Write-Host "[6/6] Deploying to Surge.sh..." -ForegroundColor Yellow
Write-Host "     Domain: $SURGE_DOMAIN" -ForegroundColor Gray

# Add 200.html for SPA routing (Surge requirement)
$distDir = Join-Path $scriptDir "client\dist"
Copy-Item (Join-Path $distDir "index.html") (Join-Path $distDir "200.html") -Force

# Run surge deployment
try {
    & npx surge $distDir $SURGE_DOMAIN 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "     Surge deployment may have issues. Check output above." -ForegroundColor Yellow
    }
} catch {
    Write-Host "     ERROR: Surge deployment failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Set-Location $scriptDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!                 " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend URL: https://$SURGE_DOMAIN" -ForegroundColor Cyan
Write-Host "  Backend URL:  $backendUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  IMPORTANT: Keep this window open!" -ForegroundColor Yellow
Write-Host "  The backend server must stay running." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Press Ctrl+C to stop backend server." -ForegroundColor Gray
Write-Host ""

# Register cleanup for Ctrl+C
$cleanup = {
    Write-Host "`nShutting down..." -ForegroundColor Yellow
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    if ($serverProcess -and !$serverProcess.HasExited) { $serverProcess.Kill() }
    if ($backendTunnel -and !$backendTunnel.HasExited) { $backendTunnel.Kill() }
}

try {
    [Console]::TreatControlCAsInput = $true
    while ($true) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if (($key.Modifiers -band [ConsoleModifiers]::Control) -and ($key.Key -eq "C")) {
                & $cleanup
                break
            }
        }
        Start-Sleep -Milliseconds 200
    }
} finally {
    & $cleanup
}
