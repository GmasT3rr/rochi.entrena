#requires -Version 5.1
# Solo backup de lectura. Ejecutar manualmente; no restaura ni migra.
param([string]$Destino)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-validacion.ps1')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($tool in @('supabase','docker')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Falta $tool. Consultar docs/backup-logico-supabase.md; no se genero backup." }
}
$dockerReady = & docker info --format '{{.ServerVersion}}' 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Docker no esta disponible; abrir Docker Desktop con motor Linux.' }
if (-not $Destino) { $Destino = Join-Path $env:USERPROFILE ('TusCuentasFacilBackups\rochy-dev\' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$Destino = [IO.Path]::GetFullPath($Destino)
if ($Destino.Equals($repo,[StringComparison]::OrdinalIgnoreCase) -or $Destino.StartsWith($repo + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'El backup debe quedar FUERA del repositorio.' }
$ancestor = $Destino
while ($ancestor) {
  if (Test-Path -LiteralPath (Join-Path $ancestor '.git')) { throw 'Destino dentro de un repositorio Git: elegir otro directorio.' }
  $parent = Split-Path -Parent $ancestor
  if ($parent -eq $ancestor) { break }; $ancestor = $parent
}
if (Test-Path -LiteralPath $Destino) { throw 'Elegir una carpeta NUEVA; no se sobrescriben backups.' }
$source = Get-Content -Raw -LiteralPath (Join-Path $repo 'src/app/core/auth/supabase.config.ts')
$match = [regex]::Match($source, '\burl\s*:\s*[''"]https://([a-z0-9-]+)\.supabase\.co/?[''"]')
if (-not $match.Success) { throw 'No se pudo determinar el Project Ref esperado.' }
$projectRef = $match.Groups[1].Value
Write-Host 'En Supabase Connect: elegir Session pooler, puerto 5432. Copiar URI SIN contrasena.'
$plainUrl = Read-Host 'URI PostgreSQL sin contrasena (sslmode=require)'
try { $uri = [Uri]$plainUrl } catch { throw 'URI invalida.' }
$userInfo = [Uri]::UnescapeDataString($uri.UserInfo)
if ($uri.Scheme -notin @('postgres','postgresql') -or $userInfo.Contains(':') -or $plainUrl -match '(?i)password|secret|token' -or $uri.Port -ne 5432 -or $uri.Query -notmatch 'sslmode=require') { throw 'Usar URI sin password, puerto 5432 y sslmode=require.' }
$correctTarget = ($uri.Host -eq "db.$projectRef.supabase.co" -and $userInfo -eq 'postgres') -or ($uri.Host.EndsWith('.pooler.supabase.com') -and $userInfo -eq "postgres.$projectRef")
if (-not $correctTarget) { throw 'El destino no coincide con el Project Ref configurado en Angular.' }
if ((Read-Host 'Confirmar nombre del proyecto en Dashboard: escribir rochy-dev') -cne 'rochy-dev') { throw 'Destino no confirmado.' }
Write-Host 'Cerrar escrituras de la app y evitar altas/cambios Auth hasta terminar los dumps. No se bloquean escritores automaticamente.'
if ((Read-Host 'Escribir SIN_ESCRITURAS para continuar') -cne 'SIN_ESCRITURAS') { throw 'No se confirmo ventana estable.' }
$securePassword = Read-Host 'Contrasena PostgreSQL actual (oculta; NO resetearla)' -AsSecureString
$previousDb = $env:SUPABASE_DB_PASSWORD; $previousPg = $env:PGPASSWORD
$ptr = [IntPtr]::Zero
$complete = $false
try {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $env:SUPABASE_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $env:PGPASSWORD = $env:SUPABASE_DB_PASSWORD
  New-Item -ItemType Directory -Path $Destino | Out-Null
  function Invoke-Dump([string]$name,[string[]]$flags) {
    $file = Join-Path $Destino $name
    # Solo URI sin password en argumentos. No imprimir salida/error del CLI ni --debug.
    $captured = & supabase db dump --db-url $plainUrl --file $file @flags 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -eq 0) { $captured=$null; throw "Fallo al generar $name. Backup INCOMPLETO. No aplicar 005." }
    $captured=$null
  }
  Invoke-Dump 'roles.sql' @('--role-only')
  Invoke-Dump 'schema.sql' @('--schema','public,rochy_privado')
  Invoke-Dump 'auth-schema-reference.sql' @('--schema','auth')
  # Un solo pg_dump de datos: snapshot comun para negocio, historial y Auth.
  Invoke-Dump 'data.sql' @('--data-only','--use-copy','--schema','public,rochy_privado,auth')
  Test-RochyDumpSchema -Path (Join-Path $Destino 'schema.sql')
  $counts = Get-RochyCopyCounts -Path (Join-Path $Destino 'data.sql')
  $hashes = foreach ($name in @('roles.sql','schema.sql','auth-schema-reference.sql','data.sql')) {
    $file = Join-Path $Destino $name
    [pscustomobject]@{archivo=$name;bytes=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
  }
  $manifest = @{estado='ARCHIVOS_VERIFICADOS_RESTAURACION_PENDIENTE';fecha_utc=(Get-Date).ToUniversalTime().ToString('o');project_ref=$projectRef;tablas_copy=$counts;archivos=@($hashes);nota='Comparar conteos con inventario remoto; no se realizo restauracion de prueba.'}
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Destino 'manifest.json')
  $complete=$true
  Write-Host "Backup generado en $Destino. Hashes y conteos COPY en manifest.json; restauracion pendiente."
} catch {
  Write-Host 'Backup incompleto o no validado. No aplicar 005. No se imprimen detalles que puedan contener credenciales.'
  throw 'No se confirmo un respaldo completo.'
} finally {
  $env:SUPABASE_DB_PASSWORD=$previousDb; $env:PGPASSWORD=$previousPg
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($securePassword) { $securePassword.Dispose() }
}
