#!/usr/bin/env bash
set -euo pipefail
rm -rf server
npx esbuild src/index.js --bundle --platform=node --format=esm \
  --outfile=server/index.js --external:node:* 2>/dev/null || \
npx esbuild src/index.ts --bundle --platform=node --format=esm --outfile=server/index.js
npx @anthropic-ai/mcpb pack . weeek-mcp-smart.mcpb
echo "built weeek-mcp-smart.mcpb"
