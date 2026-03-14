@echo off
title PrithviNet Frontend Server
echo ============================================
echo  PrithviNet Frontend - Starting...
echo ============================================
cd /d "C:\Users\adity\OneDrive\Desktop\e cell\Prithvinet 2 (1)\Prithvinet"
if not exist "package.json" (
    echo ERROR: package.json not found in current directory.
    echo Expected to be in: C:\Users\adity\OneDrive\Desktop\e cell\Prithvinet 2 (1)\Prithvinet
    pause
    exit /b 1
)
echo Starting Vite dev server on http://localhost:3000
npm run dev
pause
