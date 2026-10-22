-- PREPARACIÓN MANUAL OPCIONAL. Solo proyecto/cuentas de prueba.
-- No es migración. No cambia políticas ni usuarios y no borra datos.
-- Crea datos sintéticos persistentes para solicitudes HTTP entre transacciones.
-- El operador debe revisar antes de ejecutar. Guardar el ID mostrado al final.
begin;
do $$
declare fixture text := 'tcf-rls-audit-' || gen_random_uuid()::text;
begin
  insert into public.alumnos(id, nombre, apellido, modalidad, fecha_ingreso, observaciones)
  values (fixture, 'Prueba RLS', 'Desechable', 'Online', current_date, 'TCF_RLS_AUDIT_ONLY');
  insert into public.cuotas(id, alumno_id, concepto, periodo, importe, vencimiento, observaciones)
  values (fixture, fixture, 'Prueba API RLS', date_trunc('month', current_date)::date,
    100, current_date, 'TCF_RLS_AUDIT_ONLY');
  insert into public.pagos(id, cuota_id, importe, fecha, medio, observaciones)
  values (fixture, fixture, 10, current_date, 'Otro', 'TCF_RLS_AUDIT_ONLY');
  raise notice 'ID para verificar-supabase --full: %', fixture;
end;
$$;
commit;
