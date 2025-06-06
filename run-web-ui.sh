#!/bin/bash

echo "Starting MTR Log Analyzer Web UI..."
echo "================================"

# Start the web server in the background
echo "Starting MTR Web Server on port 3001..."
node codex-cli/bin/mtr.js --web-server &
SERVER_PID=$!

# Give the server a moment to start
sleep 2

# Start the React development server
echo "Starting React development server on port 3002..."
cd codex-web && pnpm dev

# When the React server exits, also kill the web server
kill $SERVER_PID 2>/dev/null