# PrithviNet Launcher - Bulletproof Edition
# Right-click this file -> "Run with PowerShell"

$PROJECT  = "C:\Users\adity\OneDrive\Desktop\e cell\Prithvinet 2 (1)\Prithvinet"
$BACKEND  = "$PROJECT\backend"
$PYTHON   = "$BACKEND\venv\Scripts\python.exe"
$DOCKER   = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"

function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "[$n] $msg" -ForegroundColor Yellow
}

function Write-OK($msg)  { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-ERR($msg) { Write-Host "    ERR $msg" -ForegroundColor Red }
function Write-INFO($msg){ Write-Host "    ... $msg" -ForegroundColor Cyan }

Clear-Host
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   PrithviNet - Full Stack Launcher             " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ── 1. Docker check ───────────────────────────────────────────────────────────
Write-Step 1 "Checking Docker Desktop..."
if (-not (Test-Path $DOCKER)) {
    Write-ERR "Docker not found at expected path."
    Write-Host "    Please install Docker Desktop from https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    Read-Host "`nPress Enter to exit"
    exit 1
}
$dockerTest = & $DOCKER info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-ERR "Docker Desktop is installed but not running."
    Write-INFO "Opening Docker Desktop now - please wait 30 seconds for it to start..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-INFO "Waiting 30 seconds for Docker to start..."
    Start-Sleep -Seconds 30
    $dockerTest = & $DOCKER info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-ERR "Docker still not ready. Please open Docker Desktop manually and wait for the whale icon, then re-run this script."
        Read-Host "`nPress Enter to exit"
        exit 1
    }
}
Write-OK "Docker is running."

# ── 2. Start containers ───────────────────────────────────────────────────────
Write-Step 2 "Starting Postgres + Redis containers..."
& $DOCKER compose -f "$PROJECT\docker-compose.yml" up -d 2>&1 | Out-Null
Start-Sleep -Seconds 4

$ps = & $DOCKER ps --format "{{.Names}}|{{.Status}}" 2>&1
$dbUp    = ($ps | Where-Object { $_ -match "prithvinet-db" -and $_ -match "healthy|Up" }) -ne $null
$redisUp = ($ps | Where-Object { $_ -match "prithvinet-redis" -and $_ -match "healthy|Up" }) -ne $null

if ($dbUp)    { Write-OK "prithvinet-db is up." }    else { Write-ERR "prithvinet-db failed to start." }
if ($redisUp) { Write-OK "prithvinet-redis is up." } else { Write-ERR "prithvinet-redis failed to start." }

if (-not $dbUp -or -not $redisUp) {
    Write-Host "`n    Some containers failed. Try running: docker compose up -d" -ForegroundColor Red
    Read-Host "`nPress Enter to exit"
    exit 1
}

# ── 3. Check Python venv ──────────────────────────────────────────────────────
Write-Step 3 "Checking Python environment..."
if (-not (Test-Path $PYTHON)) {
    Write-ERR "Python venv not found at: $PYTHON"
    Write-INFO "Please run: cd backend && python -m venv venv && venv\Scripts\python.exe -m pip install -r requirements.txt"
    Read-Host "`nPress Enter to exit"
    exit 1
}
Write-OK "Python venv found."

# ── 4. Kill any old process on port 8000 ─────────────────────────────────────
Write-Step 4 "Checking port 8000..."
$old8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($old8000) {
    Write-INFO "Port 8000 already in use - killing old process..."
    $old8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Write-OK "Cleared old process on port 8000."
} else {
    Write-OK "Port 8000 is free."
}

# ── 5. Start backend ──────────────────────────────────────────────────────────
Write-Step 5 "Starting Backend server (port 8000)..."
$backendCmd = "cd `"$BACKEND`"; Write-Host '--- PrithviNet Backend ---' -ForegroundColor Cyan; venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload; Read-Host 'Server stopped. Press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# Wait and poll until backend responds
Write-INFO "Waiting for backend to be ready..."
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Write-Host "    waiting... ($($i*2)s)" -ForegroundColor DarkGray
}

if ($ready) {
    Write-OK "Backend is live at http://localhost:8000"
} else {
    Write-ERR "Backend did not start within 40 seconds."
    Write-Host "    Check the backend PowerShell window for error messages." -ForegroundColor Red
    Read-Host "`nPress Enter to exit"
    exit 1
}

# ── 6. Kill any old process on port 3000 ─────────────────────────────────────
Write-Step 6 "Checking port 3000..."
$old3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($old3000) {
    Write-INFO "Port 3000 already in use - killing old process..."
    $old3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Write-OK "Cleared old process on port 3000."
} else {
    Write-OK "Port 3000 is free."
}

# ── 7. Start frontend ─────────────────────────────────────────────────────────
Write-Step 7 "Starting Frontend server (port 3000)..."
$frontendCmd = "cd `"$PROJECT`"; Write-Host '--- PrithviNet Frontend ---' -ForegroundColor Cyan; npm run dev; Read-Host 'Server stopped. Press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

# Wait and poll until frontend responds
Write-INFO "Waiting for frontend to be ready..."
$fready = $false
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $fready = $true; break }
    } catch {}
    Write-Host "    waiting... ($($i*2)s)" -ForegroundColor DarkGray
}

if ($fready) {
    Write-OK "Frontend is live at http://localhost:3000"
} else {
    Write-ERR "Frontend did not start within 30 seconds."
    Write-Host "    Check the frontend PowerShell window for error messages." -ForegroundColor Red
    Read-Host "`nPress Enter to exit"
    exit 1
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   Everything is running!                       " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Open your browser and go to:" -ForegroundColor White
Write-Host "   http://localhost:3000"         -ForegroundColor Yellow
Write-Host ""
Write-Host "   Login:" -ForegroundColor White
Write-Host "   Email:    admin@cecb.gov.in"  -ForegroundColor Cyan
Write-Host "   Password: password123"         -ForegroundColor Cyan
Write-Host ""
Write-Host "   Keep the backend + frontend windows OPEN."  -ForegroundColor White
Write-Host "   Close them to stop the servers."            -ForegroundColor DarkGray
Write-Host ""

# Auto-open browser
Start-Process "http://127.0.0.1:3000"

Read-Host "Press Enter to close this launcher"
