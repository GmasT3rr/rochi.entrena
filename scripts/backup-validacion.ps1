# Validadores offline: no ejecutan SQL ni se conectan a bases de datos.
function Test-RochyDumpSchema {
  param([Parameter(Mandatory=$true)][string]$Path)
  $sql = [IO.File]::ReadAllText($Path)
  # Quitar comentarios de línea para no dar por válidos objetos comentados por el CLI.
  $sql = [regex]::Replace($sql, '(?m)^\s*--[^\r\n]*', '')
  $sql = $sql.Replace('"','')
  $tables = @('public.alumnos','public.configuraciones_mensuales','public.cuotas','public.pagos','rochy_privado.administradores','rochy_privado.historial')
  foreach ($table in $tables) {
    $name = [regex]::Escape($table)
    if ($sql -notmatch "(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?$name\s*\(") { throw "Falta CREATE TABLE de $table." }
    if ($sql -notmatch "(?im)^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?$name\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;") { throw "Falta RLS habilitada para $table." }
  }
  foreach ($table in @('public.alumnos','public.configuraciones_mensuales','public.cuotas','public.pagos','rochy_privado.historial')) {
    $name = [regex]::Escape($table)
    if ($sql -notmatch "(?ims)^\s*CREATE\s+POLICY\s+[^;]+?\s+ON\s+$name(?:\s|;)") { throw "Falta politica RLS de $table." }
  }
  foreach ($table in @('public.alumnos','public.configuraciones_mensuales','public.cuotas','public.pagos')) {
    $name = [regex]::Escape($table)
    if ($sql -notmatch "(?ims)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+[^;]+?\s+ON\s+$name\s") { throw "Falta trigger de $table." }
  }
  foreach ($function in @('public.es_administrador_actual','public.guardar_alumno_con_configuracion','public.leer_cuentas_administrativas','public.previsualizar_cuotas_mensuales','public.generar_cuotas_mensuales','rochy_privado.auditar','rochy_privado.es_administrador','rochy_privado.normalizar_concepto','rochy_privado.validar_pago','rochy_privado.validar_importe_cuota','rochy_privado.marcar_actualizacion')) {
    $name = [regex]::Escape($function)
    if ($sql -notmatch "(?im)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+$name\s*\(") { throw "Falta funcion $function." }
  }
}

function Get-RochyCopyCounts {
  param([Parameter(Mandatory=$true)][string]$Path)
  $counts = @{}; $table = $null
  $reader = [IO.File]::OpenText($Path)
  try {
    while ($null -ne ($line = $reader.ReadLine())) {
      if ($null -ne $table) {
        if ($line -ceq '\.') { $table=$null } else { $counts[$table] = [long]$counts[$table] + 1 }
        continue
      }
      if ($line.Replace('"','') -match '(?i)^\s*COPY\s+(?<tabla>[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\([^;]*\)\s+FROM\s+stdin;\s*$') {
        $table=$Matches.tabla.ToLowerInvariant()
        if ($counts.ContainsKey($table)) { throw "Bloque COPY duplicado para $table." }
        $counts[$table]=[long]0
      } elseif ($line -match '(?i)^\s*COPY\b') { throw 'Cabecera COPY no reconocida; no validar este dump automaticamente.' }
    }
    if ($null -ne $table) { throw "COPY truncado de ${table}: falta terminador." }
  } finally { $reader.Dispose() }
  foreach ($required in @('public.alumnos','public.configuraciones_mensuales','public.cuotas','public.pagos','rochy_privado.administradores','rochy_privado.historial','auth.users','auth.identities')) {
    if (-not $counts.ContainsKey($required)) { throw "Falta COPY de $required." }
  }
  return $counts
}
