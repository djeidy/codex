#!/bin/bash

# Codex Web Starter Script

echo "🚀 Starting Codex Web..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env and add your OpenAI API key"
    echo "   Then run this script again."
    exit 1
fi

# Check if OpenAI API key is set
if grep -q "your-openai-api-key-here" .env; then
    echo "❌ Please update your OpenAI API key in .env file"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create data directories if they don't exist
mkdir -p data/sessions data/tsgs data/logs

echo "✅ Starting servers..."
echo "   Backend: http://localhost:3001"
echo "   Frontend: http://localhost:3002"
echo ""
echo "Press Ctrl+C to stop"

# Start the development servers
npm run dev