@echo off
title PrithviNet Backend Server
echo ============================================
echo  PrithviNet Backend - Starting...
echo ============================================
cd /d "C:\Users\adity\OneDrive\Desktop\e cell\Prithvinet 2 (1)\Prithvinet\backend"
if errorlevel 1 (
    echo ERROR: Could not find backend directory.
    echo Expected: C:\Users\adity\OneDrive\Desktop\e cell\Prithvinet 2 (1)\Prithvinet\backend
    pause
    exit /b 1
)
if not exist "venv\Scripts\python.exe" (
    echo ERROR: venv not found. Please run setup first.
    pause
    exit /b 1
)
echo Starting Uvicorn on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
