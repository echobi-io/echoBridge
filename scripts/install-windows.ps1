[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\echoBridge",
  [string]$ServiceName = 'echoBridge',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 8787,
  [string]$AllowedTables = 'CUSTOMER,SALES_LEDGER,STOCK',
  [ValidateSet('hmac', 'api-key')]
  [string]$AuthMode = 'hmac',
  [string]$ClientId = 'supabase-edge',
  [string]$SharedSecret = '',
  [string]$ApiKey = '',
  [string]$OdbcConnectionString = '',
  [switch]$RegisterService,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Please install it and run the installer again."
  }
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Prompt-Value {
  param(
    [string]$Prompt,
    [string]$CurrentValue,
    [switch]$Mandatory,
    [switch]$Secret
  )

  if ($CurrentValue) {
    return $CurrentValue
  }

  if ($Secret) {
    $secureValue = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
      $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    }
    finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($Mandatory -and [string]::IsNullOrWhiteSpace($plainValue)) {
      throw "$Prompt is required."
    }
    return $plainValue
  }

  $value = Read-Host -Prompt $Prompt
  if ($Mandatory -and [string]::IsNullOrWhiteSpace($value)) {
    throw "$Prompt is required."
  }
  return $value
}

function Write-EnvFile {
  param(
    [string]$Path,
    [hashtable]$Values
  )

  $lines = @(
    "SERVICE_NAME=echoBridge",
    "NODE_ENV=production",
    "PORT=$($Values.Port)",
    "HOST=$($Values.HostName)",
    "SAGE_ODBC_CONNECTION_STRING=$($Values.OdbcConnectionString)",
    "SAGE_ALLOWED_TABLES=$($Values.AllowedTables)",
    'SAGE_DEFAULT_LIMIT=100',
    'SAGE_MAX_LIMIT=1000',
    "AUTH_MODE=$($Values.AuthMode)",
    "CONNECTOR_CLIENT_ID=$($Values.ClientId)",
    "CONNECTOR_SHARED_SECRET=$($Values.SharedSecret)",
    'ALLOWED_CLOCK_SKEW_MS=300000',
    'BODY_LIMIT_BYTES=32768',
    'REQUEST_TIMEOUT_MS=30000',
    'ENABLE_SQL_ENDPOINT=false',
    'LOG_QUERY_TEXT=false',
    'RATE_LIMIT_WINDOW_MS=60000',
    'RATE_LIMIT_MAX_REQUESTS=120',
    'TRUST_PROXY=true'
  )

  if ($Values.AuthMode -eq 'api-key') {
    $lines += "API_KEY=$($Values.ApiKey)"
  }

  Set-Content -Path $Path -Value ($lines -join [Environment]::NewLine) -Encoding ASCII
}

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Step 'Checking prerequisites'
Assert-Command -Name 'node'
Assert-Command -Name 'npm'

$OdbcConnectionString = Prompt-Value -Prompt 'Enter the Sage ODBC connection string (for example DSN=SageLine50v30;UID=manager;PWD=secret;)' -CurrentValue $OdbcConnectionString -Mandatory
$AllowedTables = Prompt-Value -Prompt 'Enter the Sage tables Supabase should be allowed to read (comma separated)' -CurrentValue $AllowedTables -Mandatory

if ($AuthMode -eq 'hmac') {
  if (-not $SharedSecret) {
    $SharedSecret = New-RandomSecret
  }
}
else {
  $ApiKey = Prompt-Value -Prompt 'Enter the API key Supabase will send as x-api-key' -CurrentValue $ApiKey -Mandatory -Secret
}

Write-Step "Preparing install directory at $InstallDir"
if (-not (Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$robocopyLog = Join-Path $env:TEMP 'echoBridge-robocopy.log'
$null = robocopy $repoRoot $InstallDir /E /NFL /NDL /NJH /NJS /NP /XD .git node_modules dist coverage /XF .env | Tee-Object -FilePath $robocopyLog
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code $LASTEXITCODE. See $robocopyLog for details."
}

Write-Step 'Installing Node dependencies'
Push-Location $InstallDir
try {
  npm install --omit=dev
}
finally {
  Pop-Location
}

$envPath = Join-Path $InstallDir '.env'
if ((Test-Path $envPath) -and (-not $Force)) {
  Write-Host ".env already exists at $envPath - leaving it unchanged. Use -Force to overwrite." -ForegroundColor Yellow
}
else {
  Write-Step 'Writing .env configuration'
  Write-EnvFile -Path $envPath -Values @{
    Port = $Port
    HostName = $HostName
    OdbcConnectionString = $OdbcConnectionString
    AllowedTables = $AllowedTables
    AuthMode = $AuthMode
    ClientId = $ClientId
    SharedSecret = $SharedSecret
    ApiKey = $ApiKey
  }
}

if ($RegisterService) {
  Write-Step 'Registering Windows service'
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if (-not $nssm) {
    throw 'NSSM was not found in PATH. Install NSSM first or rerun without -RegisterService.'
  }

  $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $existingService) {
    & $nssm.Path install $ServiceName 'node.exe' 'src/server.js' | Out-Null
  }
  & $nssm.Path set $ServiceName AppDirectory $InstallDir | Out-Null
  & $nssm.Path set $ServiceName DisplayName 'echoBridge Sage Connector' | Out-Null
  & $nssm.Path set $ServiceName Start SERVICE_AUTO_START | Out-Null
  if ($existingService -and $existingService.Status -eq 'Running') {
    Stop-Service -Name $ServiceName -Force
  }
  Start-Service -Name $ServiceName
}

Write-Step 'Install complete'
Write-Host "Install folder : $InstallDir"
Write-Host "Environment    : $envPath"
Write-Host "Health URL     : http://$HostName`:$Port/health"
Write-Host "Ready URL      : http://$HostName`:$Port/ready"
if ($AuthMode -eq 'hmac') {
  Write-Host "Client ID      : $ClientId"
  Write-Host "Shared secret  : $SharedSecret"
}
else {
  Write-Host 'API key mode enabled. Keep the key secret and pass it as x-api-key from Supabase.'
}
Write-Host "`nNext step: put HTTPS/reverse proxy in front of the connector and copy the same auth values into Supabase secrets." -ForegroundColor Green
