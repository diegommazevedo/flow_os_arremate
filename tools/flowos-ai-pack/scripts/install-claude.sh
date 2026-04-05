#!/usr/bin/env bash
# Instala apenas ficheiros Claude Code (.claude/, CLAUDE.md, .mcp.json) e scripts/mcp-run.cjs.
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Uso: bash install-claude.sh /caminho/absoluto/do/projeto"
  exit 1
fi
TARGET=$(cd "$1" && pwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$(cd "$SCRIPT_DIR/../../.." && pwd)"
mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/commands" "$TARGET/.claude/hooks" "$TARGET/scripts"
cp "$SOURCE/.mcp.json" "$TARGET/.mcp.json"
cp "$SOURCE/scripts/mcp-run.cjs" "$TARGET/scripts/mcp-run.cjs"
cp "$SOURCE/CLAUDE.md" "$TARGET/"
cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
cp -R "$SOURCE/.claude/agents/." "$TARGET/.claude/agents/"
cp -R "$SOURCE/.claude/commands/." "$TARGET/.claude/commands/"
cp -R "$SOURCE/.claude/hooks/." "$TARGET/.claude/hooks/"
OS=$(uname -s 2>/dev/null || echo unknown)
if [[ "$OS" != MINGW* && "$OS" != CYGWIN* && "$OS" != MSYS* && "$OS" != unknown ]]; then
  chmod +x "$TARGET/.claude/hooks/"*.sh
fi
echo "Claude Code pack instalado em $TARGET (MCP via .env / .env.mcp + scripts/mcp-run.cjs)"
