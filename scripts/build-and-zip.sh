#!/bin/bash
set -e

echo "=== FORGE Ramplify Build ==="

# Clean previous build artifacts
rm -rf deploy.zip server/dist client/dist

# Install all dependencies
echo "Installing dependencies..."
npm run install:all

# Build client and server
echo "Building client and server..."
npm run build

# Reinstall server dependencies for Linux (ECS target platform)
# Critical for native binaries like sharp
# --omit=dev excludes devDependencies (dotenv, etc.) from production bundle
echo "Reinstalling server dependencies for Linux..."
cd server
npm install --os=linux --cpu=x64 --omit=dev
cd ..

# Create deployment zip
echo "Creating deploy.zip..."
zip -r deploy.zip \
  Procfile \
  package.json \
  package-lock.json \
  server/dist/ \
  server/package.json \
  server/package-lock.json \
  server/scripts/ \
  server/node_modules/ \
  client/dist/ \
  -x "*/node_modules/.cache/*" \
  -x "*/.DS_Store" \
  -x "server/node_modules/*/README.md" \
  -x "server/node_modules/*/README-*.md" \
  -x "server/node_modules/*/SKILL.md" \
  -x "server/node_modules/*/*/SKILL.md" \
  -x "server/node_modules/google-auth-library/build/src/auth/computeclient.js" \
  -x "server/node_modules/google-auth-library/build/src/auth/impersonated.js"

echo "=== Build complete: deploy.zip ==="
ls -lh deploy.zip
