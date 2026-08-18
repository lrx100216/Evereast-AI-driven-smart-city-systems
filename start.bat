@echo off
title Smart City System
cd /d "%~dp0"

:: Set console to UTF-8
reg query HKLM\SYSTEM\CurrentControlSet\Control\Nls\CodePage /v ACP 2>nul | find "936" >nul
if %errorlevel% neq 0 chcp 65001 >nul 2>nul

cls
echo ============================================
echo     Smart City - Energy Regulation System
echo     Hack Harvard 2026 - Shenzhen Model
echo ============================================
echo.

:: Check Node
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo         https://nodejs.org/
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node %NODE_VER%

:: Shenzhen time
for /f %%t in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().AddHours(8).ToString('HH:mm:ss')"') do set SZ_TIME=%%t
echo [SZ] Shenzhen Time: %SZ_TIME%
echo.

:: Install backend deps
if not exist "backend\node_modules" (
    echo [1/4] Installing backend dependencies...
    cd backend
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Backend npm install failed.
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [1/4] Backend dependencies OK.
)

:: Install frontend deps
if not exist "frontend\node_modules" (
    echo [2/4] Installing frontend dependencies...
    cd frontend
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend npm install failed.
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [2/4] Frontend dependencies OK.
)

:: Start backend
echo [3/4] Starting backend (port 3001)...
start "Backend" /min cmd /c "cd /d %~dp0backend && npm run dev"

:: Wait for backend
echo        Waiting for backend...
set WAIT=0
:wait_loop
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if %errorlevel% equ 0 goto backend_ready
set /a WAIT+=1
if %WAIT% geq 15 (
    echo [WARN] Backend startup timeout. Check backend window.
    goto backend_ready
)
goto wait_loop
:backend_ready
echo [OK] Backend is online.

:: Start frontend
echo [4/4] Starting frontend (port 5173)...
start "Frontend" /min cmd /c "cd /d %~dp0frontend && npm run dev"
timeout /t 5 /nobreak >nul

:: Open browser
start http://localhost:5173

cls
echo ============================================
echo     All Services Running!
echo ============================================
echo.
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:3001
echo.
echo   Shenzhen:  %SZ_TIME%
echo   Traffic:   Synced to Shenzhen local time
echo   Weather:   Open-Meteo API (Shenzhen)
echo.
echo ============================================
echo   Close the background windows to stop,
echo   or press Ctrl+C in this window.
echo ============================================
echo.
pause
