#!/usr/bin/env bash
set -e

# Detect if we're NOT running in bash/zsh
if [ -z "$BASH_VERSION" ] && [ -z "$ZSH_VERSION" ]; then
    echo "[WARN] This script requires bash. Please run: bash start.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "   Smart City Energy Regulation System"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js not found. Please install Node.js first."
    echo "        https://nodejs.org/"
    exit 1
fi

# Check npm
if ! command -v npm >/dev/null 2>&1; then
    echo "[ERROR] npm not found. Please install Node.js (includes npm)."
    exit 1
fi

NODE_VER=$(node -v)
echo "[OK] Node.js $NODE_VER"

# Install deps if needed
if [ ! -d "backend/node_modules" ]; then
    echo "[1/4] Installing backend dependencies..."
    cd backend && npm install && cd ..
else
    echo "[1/4] Backend dependencies OK."
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "[2/4] Installing frontend dependencies..."
    cd frontend && npm install && cd ..
else
    echo "[2/4] Frontend dependencies OK."
fi

# Start backend
echo "[3/4] Starting backend (port 3001)..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "       Waiting for backend..."
BACKEND_OK=false
for i in $(seq 1 15); do
    if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
        echo "       Backend is online."
        BACKEND_OK=true
        break
    fi
    sleep 1
done

if [ "$BACKEND_OK" = false ]; then
    echo ""
    echo "[ERROR] Backend failed to start within 15 seconds."
    echo "        Check the backend terminal for errors."
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Start frontend
echo "[4/4] Starting frontend (port 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

sleep 3

# Open browser
echo "       Opening browser..."
if command -v open >/dev/null 2>&1; then
    open http://localhost:5173
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:5173
fi

echo ""
echo "========================================"
echo "  All services running!"
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "========================================"
echo "  Press Ctrl+C to stop all services."
echo ""

# Trap Ctrl+C to clean up
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
