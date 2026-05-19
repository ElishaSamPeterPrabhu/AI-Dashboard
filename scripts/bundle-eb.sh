#!/usr/bin/env bash
# Build NestJS BFF and zip for Elastic Beanstalk upload.
# Usage: ./scripts/bundle-eb.sh   →  writes bff-deploy.zip at repo root

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building server…"
npm ci
npm run build -w ai-dashboard-server

BUNDLE="$ROOT/eb-bundle"
rm -rf "$BUNDLE" "$ROOT/bff-deploy.zip"
mkdir -p "$BUNDLE"

cp -r server/dist "$BUNDLE/dist"
cp server/package.json server/Procfile "$BUNDLE/"
if [ -d server/.ebextensions ]; then
  cp -r server/.ebextensions "$BUNDLE/"
fi

echo "Installing production dependencies in bundle…"
(cd "$BUNDLE" && npm install --omit=dev --no-package-lock)

echo "Creating bff-deploy.zip…"
(cd "$BUNDLE" && zip -r "$ROOT/bff-deploy.zip" .)

echo "Done: $ROOT/bff-deploy.zip"
ls -lh "$ROOT/bff-deploy.zip"
