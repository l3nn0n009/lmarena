# LMArena Remote Access Startup Script
Write-Host "========================================"
Write-Host "  LMArena Remote Access Startup Script"
Write-Host "========================================"
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Create temp directory
$tempDir = Join-Path $scriptDir "temp"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

# Kill existing cloudflared processes
Write-Host "[1/6] Cleaning up old processes..."
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start the backend server
Write-Host "[2/6] Starting backend server..."
$serverLog = Join-Path $tempDir "server.log"
$serverProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run server" -WorkingDirectory $scriptDir -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3

# Start cloudflared tunnel for backend
Write-Host "[3/6] Creating backend tunnel..."
$backendTunnelLog = Join-Path $tempDir "backend_tunnel.log"
$backendTunnel = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "localhost:3000" -WindowStyle Hidden -PassThru -RedirectStandardError $backendTunnelLog

# Wait for backend tunnel URL
Write-Host "     Waiting for backend tunnel URL..."
$backendUrl = $null
$attempts = 0
while (-not $backendUrl -and $attempts -lt 60) {
    Start-Sleep -Seconds 1
    $attempts++
    if (Test-Path $backendTunnelLog) {
        $content = Get-Content $backendTunnelLog -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $backendUrl = $Matches[1]
        }
    }
}

if (-not $backendUrl) {
    Write-Host "ERROR: Failed to get backend tunnel URL after 60 seconds" -ForegroundColor Red
    exit 1
}

Write-Host "     Backend tunnel: $backendUrl" -ForegroundColor Green

# Update client .env file
Write-Host "[4/6] Configuring client environment..."
$envFile = Join-Path $scriptDir "client\.env"
"VITE_BACKEND_URL=$backendUrl" | Out-File -FilePath $envFile -Encoding utf8 -NoNewline

# Start the client
Write-Host "[5/6] Starting frontend client..."
$clientLog = Join-Path $tempDir "client.log"
$clientProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run client" -WorkingDirectory $scriptDir -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3

# Start cloudflared tunnel for client
Write-Host "[6/6] Creating frontend tunnel..."
$clientTunnelLog = Join-Path $tempDir "client_tunnel.log"
$clientTunnel = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "localhost:5173" -WindowStyle Hidden -PassThru -RedirectStandardError $clientTunnelLog

# Wait for client tunnel URL
Write-Host "     Waiting for frontend tunnel URL..."
$clientUrl = $null
$attempts = 0
while (-not $clientUrl -and $attempts -lt 60) {
    Start-Sleep -Seconds 1
    $attempts++
    if (Test-Path $clientTunnelLog) {
        $content = Get-Content $clientTunnelLog -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $clientUrl = $Matches[1]
        }
    }
}

if (-not $clientUrl) {
    Write-Host "ERROR: Failed to get frontend tunnel URL after 60 seconds" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  All services started successfully!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "  Go to: " -NoNewline
Write-Host $clientUrl -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend: $backendUrl" -ForegroundColor DarkGray
Write-Host ""
Write-Host "========================================"
Write-Host "  Press any key to stop all services..."
Write-Host "========================================"

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
Write-Host ""
Write-Host "Shutting down..."
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if ($serverProcess -and -not $serverProcess.HasExited) { $serverProcess.Kill() }
if ($clientProcess -and -not $clientProcess.HasExited) { $clientProcess.Kill() }
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Done!" -ForegroundColor Green
