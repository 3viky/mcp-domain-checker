#!/usr/bin/env bash
#
# @mcp/domain-checker Setup Script
#
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Setting up @mcp/domain-checker..."
echo ""

# No environment variables required for this package

# Install and build
echo "Installing dependencies..."
pnpm install --silent
echo "Building..."
pnpm build

echo ""
echo "✓ Setup complete!"
echo ""
echo "Add to Claude Code:"
echo "  claude mcp add domain-checker node $(pwd)/dist/index.js"
