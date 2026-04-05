/**
 * Launcher MCP para Cursor: carrega `.env` e `.env.mcp` na raiz do repo e inicia o servidor stdio.
 * O Cursor não expande variáveis a partir do .env no mcp.json — este script é o ponte.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

/**
 * Parser mínimo estilo dotenv (KEY=VAL por linha).
 * @param {boolean} override se true, sobrepõe process.env (usado em .env.mcp)
 */
function loadEnvFile(rel, override) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) return
  const text = fs.readFileSync(full, 'utf8')
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!key) continue
    if (override || process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}

loadEnvFile('.env', false)
loadEnvFile('.env.mcp', true)

const server = process.argv[2]
if (!server) {
  console.error('Uso: node scripts/mcp-run.cjs <nome-do-servidor>')
  process.exit(1)
}

const isWin = process.platform === 'win32'
const npx = isWin ? 'npx.cmd' : 'npx'

function run(argv) {
  const child = spawn(argv[0], argv.slice(1), {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: isWin,
  })
  child.on('error', (err) => {
    console.error(err)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    if (signal) process.exit(1)
    process.exit(code ?? 0)
  })
}

switch (server) {
  case 'context7':
    run([npx, '-y', '@upstash/context7-mcp@latest'])
    break
  case 'sequential-thinking':
    run([npx, '-y', '@modelcontextprotocol/server-sequential-thinking'])
    break
  case '21st-magic': {
    const key =
      process.env.MAGIC_21ST_API_KEY || process.env.MAGIC_API_KEY || process.env.TWENTY_FIRST_API_KEY || ''
    if (!key) {
      console.error(
        '[mcp-run] Defina MAGIC_21ST_API_KEY (ou MAGIC_API_KEY) em .env ou .env.mcp — ver .env.example',
      )
      process.exit(1)
    }
    run([npx, '-y', '@21st-dev/magic@latest', `API_KEY=${key}`])
    break
  }
  case 'playwright':
    run([npx, '-y', '@playwright/mcp@latest', '--headless'])
    break
  case 'filesystem': {
    const dir = (process.env.MCP_FILESYSTEM_ROOT || root).replace(/\//g, path.sep)
    run([npx, '-y', '@modelcontextprotocol/server-filesystem', dir])
    break
  }
  case 'postgres': {
    const url = process.env.MCP_POSTGRES_URL || process.env.DATABASE_URL || ''
    if (!url || url.includes('PREENCHA_')) {
      console.error(
        '[mcp-run] Defina DATABASE_URL (Prisma) ou MCP_POSTGRES_URL em .env — ver .env.example',
      )
      process.exit(1)
    }
    run([npx, '-y', '@modelcontextprotocol/server-postgres', url])
    break
  }
  case 'github': {
    const tok =
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      ''
    if (!tok) {
      console.error(
        '[mcp-run] Defina GITHUB_PERSONAL_ACCESS_TOKEN (ou GITHUB_TOKEN) em .env ou .env.mcp',
      )
      process.exit(1)
    }
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = tok
    run([npx, '-y', '@modelcontextprotocol/server-github'])
    break
  }
  case 'semgrep':
    run([npx, '-y', '@semgrep/mcp'])
    break
  default:
    console.error('[mcp-run] Servidor desconhecido:', server)
    process.exit(1)
}
