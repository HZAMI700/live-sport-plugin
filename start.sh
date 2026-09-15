#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed!"
    echo "Please download and install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[Nuvio] Installing dependencies if needed..."
npm install

echo ""
echo "[Nuvio] Starting the server..."
npm start
