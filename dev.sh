#!/bin/bash

# Commander Deck Builder - Development Startup Script

echo "🎴 Commander Deck Builder - Starting Development Environment"
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "⚠️  Warning: Port $1 is already in use"
        return 1
    fi
    return 0
}

# Check ports
echo "Checking ports..."
check_port 3000
check_port 3001
echo ""

# Start backend
echo "🚀 Starting Backend Server (port 3001)..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
fi

if [ ! -d "dist" ]; then
    echo "🔨 Building backend..."
    npm run build
fi

npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend
echo "🎨 Starting Frontend (port 3000)..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"
cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Commander Deck Builder is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend:  http://localhost:3001"
echo ""
echo "📋 Logs:"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo ""
echo "🛑 To stop: kill $BACKEND_PID $FRONTEND_PID"
echo "   Or run:  pkill -P $$"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Save PIDs to file for easy cleanup
echo "$BACKEND_PID" > .dev-pids
echo "$FRONTEND_PID" >> .dev-pids

# Wait for user interrupt
echo ""
echo "Press Ctrl+C to stop all servers..."
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm -f .dev-pids; echo ''; echo '👋 Servers stopped'; exit 0" INT

wait
