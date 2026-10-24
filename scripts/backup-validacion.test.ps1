# Pruebas exclusivamente offline; no requiere CLI, Docker ni credenciales.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'backup-validacion.ps1')
$dir=Join-Path (Join-Path $PSScriptRoot '../tmp') ('backup-validation-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$schemaFile=Join-Path $dir 'schema.sql';$dataFile=Join-Path $dir 'data.sql'
function Must-Fail([scriptblock]$action,[string]$label) {
  $failed=$false;try { & $action | Out-Null } catch { $failed=$true }
  if (-not $failed) { throw "No rechazo: $label" }; Write-Output "PASS: $label"
}
$tables=@('public.alumnos','public.configuraciones_mensuales','public.cuotas','public.pagos','rochy_privado.administradores','rochy_privado.historial')
$functions=@('public.es_administrador_actual','public.guardar_alumno_con_configuracion','public.leer_cuentas_administrativas','public.previsualizar_cuotas_mensuales','public.generar_cuotas_mensuales','rochy_privado.auditar','rochy_privado.es_administrador','rochy_privado.normalizar_concepto','rochy_privado.validar_pago','rochy_privado.validar_importe_cuota','rochy_privado.marcar_actualizacion')
try {
  # Formato textual de pg_dump: identificadores citados y objetos terminados en ;.
  $schema=''
  foreach($table in $tables) {
    $qualified='"'+$table.Replace('.','"."')+'"'
    $schema+="CREATE TABLE $qualified (id text);`nALTER TABLE $qualified ENABLE ROW LEVEL SECURITY;`n"
    if($table -ne 'rochy_privado.administradores') { $schema+="CREATE POLICY leer ON $qualified FOR SELECT USING (true);`n" }
    if($table.StartsWith('public.')) { $schema+="CREATE TRIGGER auditar AFTER INSERT ON $qualified FOR EACH ROW EXECUTE FUNCTION rochy_privado.auditar();`n" }
  }
  foreach($name in $functions) { $schema+='CREATE FUNCTION "'+$name.Replace('.','"."')+'"() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;' + "`n" }
  [IO.File]::WriteAllText($schemaFile,$schema)
  Test-RochyDumpSchema $schemaFile;Write-Output 'PASS: CREATE FUNCTION de pg_dump, tablas, triggers y RLS citados'
  [IO.File]::WriteAllText($schemaFile,$schema.Replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').Replace('CREATE TRIGGER','CREATE OR REPLACE TRIGGER'))
  Test-RochyDumpSchema $schemaFile;Write-Output 'PASS: CREATE OR REPLACE de Supabase CLI'
  foreach($missing in @('CREATE FUNCTION "public"."leer_cuentas_administrativas"','CREATE TRIGGER auditar AFTER INSERT ON "public"."pagos"','ALTER TABLE "public"."alumnos" ENABLE ROW LEVEL SECURITY','CREATE POLICY leer ON "rochy_privado"."historial"','CREATE TABLE "public"."cuotas"')) {
    [IO.File]::WriteAllText($schemaFile,$schema.Replace($missing,'-- '+$missing))
    Must-Fail { Test-RochyDumpSchema $schemaFile } ('objeto requerido ausente: '+$missing)
  }
  $data="-- PostgreSQL database dump`nSET session_replication_role = replica;`n"
  foreach($table in ($tables+@('auth.users','auth.identities'))) {
    $qualified='"'+$table.Replace('.','"."')+'"'
    $data+="COPY $qualified (id, observaciones) FROM stdin;`n"
    if($table -ne 'auth.identities') { $data+='1' + "`t" + 'texto\ncon\t escapes' + "`n"; $data+='2' + "`t" + '\N' + "`n" }
    $data+='\.'+"`n`n"
  }
  $data+='SELECT pg_catalog.setval(''public.secuencia'', 3, true);'+"`nRESET ALL;`n"
  foreach($crlf in @($false,$true)) {
    $sample=if($crlf){$data.Replace("`n","`r`n")}else{$data}
    [IO.File]::WriteAllText($dataFile,$sample)
    $counts=Get-RochyCopyCounts $dataFile
    if($counts['rochy_privado.historial'] -ne 2 -or $counts['auth.users'] -ne 2 -or $counts['auth.identities'] -ne 0){throw 'Conteo incorrecto'}
  }
  Write-Output 'PASS: COPY citado, LF/CRLF, tablas vacias y escapes sin contar cabecera/terminador'
  [IO.File]::WriteAllText($dataFile,$data.Replace('"',''))
  $counts=Get-RochyCopyCounts $dataFile
  if($counts['public.pagos'] -ne 2){throw 'COPY sin comillas incorrecto'}
  Write-Output 'PASS: COPY sin comillas'
  [IO.File]::WriteAllText($dataFile,$data+"COPY public.alumnos (id) FROM stdin;`n")
  Must-Fail {Get-RochyCopyCounts $dataFile} 'COPY duplicado'
  [IO.File]::WriteAllText($dataFile,$data+"COPY public.extra (id) FROM stdin;`n1`n")
  Must-Fail {Get-RochyCopyCounts $dataFile} 'COPY truncado'
  [IO.File]::WriteAllText($dataFile,$data.Replace('COPY "auth"."users" (id, observaciones) FROM stdin;','-- cabecera ausente'))
  Must-Fail {Get-RochyCopyCounts $dataFile} 'Auth ausente'
  $main=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'backup-rochy-dev.ps1')
  foreach($required in @("@('--schema','public,rochy_privado')","@('--schema','auth')","@('--data-only','--use-copy','--schema','public,rochy_privado,auth')")) { if(-not $main.Contains($required)){throw 'Cambio inesperado en flags de exportacion'} }
  Write-Output 'PASS: esquemas explicitos y un solo dump de datos con COPY'
} finally {
  foreach($file in @($schemaFile,$dataFile)) { if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file} }
  Remove-Item -LiteralPath $dir
}
