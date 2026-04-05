#!/usr/bin/env bash
# Instalador mestre — copia o AI Dev Pack v2 a partir da raiz deste monorepo FlowOS.
# Uso: bash tools/flowos-ai-pack/install.sh /caminho/absoluto/do/outro/projeto
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: bash install.sh /caminho/absoluto/do/projeto"
  exit 1
fi

TARGET=$(cd "$1" && pwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Origem:  $SOURCE"
echo "Destino: $TARGET"

mkdir -p "$TARGET/.cursor" "$TARGET/.claude/agents" "$TARGET/.claude/commands" "$TARGET/.claude/hooks" "$TARGET/scripts"

cp "$SOURCE/.cursor/mcp.json" "$TARGET/.cursor/mcp.json"
cp "$SOURCE/.mcp.json" "$TARGET/.mcp.json"
cp "$SOURCE/scripts/mcp-run.cjs" "$TARGET/scripts/mcp-run.cjs"

cp "$SOURCE/.cursor/cursor-mcp-rules-v2.md" "$TARGET/.cursor/"
cp "$SOURCE/CLAUDE.md" "$TARGET/"
cp "$SOURCE/.env.mcp.example" "$TARGET/.env.mcp.example" 2>/dev/null || true

cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
cp -R "$SOURCE/.claude/agents/." "$TARGET/.claude/agents/"
cp -R "$SOURCE/.claude/commands/." "$TARGET/.claude/commands/"
cp -R "$SOURCE/.claude/hooks/." "$TARGET/.claude/hooks/"

OS=$(uname -s 2>/dev/null || echo unknown)
if [[ "$OS" != MINGW* && "$OS" != CYGWIN* && "$OS" != MSYS* && "$OS" != unknown ]]; then
  chmod +x "$TARGET/.claude/hooks/"*.sh
fi

echo "Feito. Copie .env a partir de .env.example; opcional .env.mcp a partir de .env.mcp.example."
echo "MCPs usam node scripts/mcp-run.cjs — defina DATABASE_URL, GITHUB_PERSONAL_ACCESS_TOKEN, MAGIC_21ST_API_KEY conforme necessário. Reinicie o Cursor."
