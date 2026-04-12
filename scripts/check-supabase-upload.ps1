param(
  [string]$SupabaseUrl,
  [string]$SupabaseAnonKey,
  [string]$UserEmail,
  [string]$UserPassword,
  [string]$AccessToken,
  [string]$UploadUrl = "https://flowos-web-production.up.railway.app/api/media/upload",
  [string]$EnvFile = ".env",
  [string]$AltEnvFile = "env_olution.yaml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-KeyValueFile {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    if ($line.StartsWith("//")) { return }
    if ($line -notmatch "^[A-Za-z_][A-Za-z0-9_]*=") { return }

    $parts = $line -split "=", 2
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim("'").Trim('"')
    $map[$key] = $value
  }

  return $map
}

function Resolve-Value {
  param(
    [string]$Current,
    [hashtable]$Primary,
    [hashtable]$Secondary,
    [string[]]$Keys
  )

  if ($Current) { return $Current }
  foreach ($k in $Keys) {
    if ($Primary.ContainsKey($k) -and $Primary[$k]) { return $Primary[$k] }
    if ($Secondary.ContainsKey($k) -and $Secondary[$k]) { return $Secondary[$k] }
  }
  return $null
}

$envPrimary = Read-KeyValueFile -Path $EnvFile
$envAlt = Read-KeyValueFile -Path $AltEnvFile

$SupabaseUrl = Resolve-Value -Current $SupabaseUrl -Primary $envPrimary -Secondary $envAlt -Keys @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL"
)
$SupabaseAnonKey = Resolve-Value -Current $SupabaseAnonKey -Primary $envPrimary -Secondary $envAlt -Keys @(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
)
$UserEmail = Resolve-Value -Current $UserEmail -Primary $envPrimary -Secondary $envAlt -Keys @(
  "TEST_USER_EMAIL",
  "FLOWOS_TEST_USER_EMAIL",
  "SUPABASE_TEST_EMAIL"
)
$UserPassword = Resolve-Value -Current $UserPassword -Primary $envPrimary -Secondary $envAlt -Keys @(
  "TEST_USER_PASSWORD",
  "FLOWOS_TEST_USER_PASSWORD",
  "SUPABASE_TEST_PASSWORD"
)
$AccessToken = Resolve-Value -Current $AccessToken -Primary $envPrimary -Secondary $envAlt -Keys @(
  "SUPABASE_ACCESS_TOKEN"
)

if (-not $AccessToken) {
  if (-not $SupabaseUrl) {
    throw "Supabase URL ausente. Defina -SupabaseUrl ou NEXT_PUBLIC_SUPABASE_URL."
  }
  if (-not $SupabaseAnonKey) {
    throw "Supabase anon key ausente. Defina -SupabaseAnonKey ou NEXT_PUBLIC_SUPABASE_ANON_KEY."
  }
  if (-not $UserEmail -or -not $UserPassword) {
    throw "Credenciais de teste ausentes. Defina -UserEmail/-UserPassword ou TEST_USER_EMAIL/TEST_USER_PASSWORD."
  }

  $authUrl = "$SupabaseUrl/auth/v1/token?grant_type=password"
  $authHeaders = @{
    "apikey" = $SupabaseAnonKey
    "Content-Type" = "application/json"
  }
  $authBody = @{
    email = $UserEmail
    password = $UserPassword
  } | ConvertTo-Json -Compress

  try {
    $authResp = Invoke-RestMethod -Method Post -Uri $authUrl -Headers $authHeaders -Body $authBody
  } catch {
    throw "Falha ao autenticar no Supabase: $($_.Exception.Message)"
  }

  if (-not $authResp.access_token) {
    throw "Supabase não retornou access_token."
  }
  $AccessToken = $authResp.access_token
}

$tinyPngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Wl9sAAAAASUVORK5CYII="
$tmpFile = Join-Path $PWD ".tmp-upload-check.png"
[System.IO.File]::WriteAllBytes($tmpFile, [Convert]::FromBase64String($tinyPngB64))

try {
  $responsePath = Join-Path $PWD ".tmp-upload-response.txt"
  $status = & curl.exe -sS -o $responsePath -w "%{http_code}" `
    $UploadUrl `
    -H "Authorization: Bearer $AccessToken" `
    -F "file=@$tmpFile"

  $body = ""
  if (Test-Path -LiteralPath $responsePath) {
    $body = (Get-Content -LiteralPath $responsePath -Raw).Trim()
    Remove-Item -LiteralPath $responsePath -Force -ErrorAction SilentlyContinue
  }

  Write-Output "HTTP_STATUS=$status"
  if ($body) {
    Write-Output "RESPONSE_BODY=$body"
  }
} finally {
  Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
}
