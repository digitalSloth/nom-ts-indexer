#!/bin/bash

# Zenon Network Indexer - Quick Setup Script

set -e

echo "🌟 Zenon Network Indexer - Setup"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker is installed"
echo "✓ Docker Compose is installed"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.docker .env
    echo "✓ .env file created (edit it to customize your setup)"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "🐳 Starting Docker services..."
echo ""

# Start services
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check service health
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "Services running:"
    docker-compose ps
    echo ""
    echo "📊 View indexer logs:"
    echo "   docker-compose logs -f indexer"
    echo ""
    echo "🗄️  Access PostgreSQL:"
    echo "   docker-compose exec postgres psql -U zenon -d nom_indexer"
    echo ""
    echo "🛑 Stop all services:"
    echo "   docker-compose down"
    echo ""
else
    echo "❌ Something went wrong. Check logs:"
    echo "   docker-compose logs"
fi
