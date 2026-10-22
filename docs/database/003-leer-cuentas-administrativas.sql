-- Incremental para REVISIÓN y ejecución MANUAL como postgres. Sin cambios en tablas/RLS.
-- Lectura consistente de todo el conjunto financiero en una única sentencia.
begin;
create function public.leer_cuentas_administrativas()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'version', 1,
      'alumnos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nombre', a.nombre, 'apellido', a.apellido,
        'modalidad', a.modalidad, 'estado', a.estado) order by a.id) from public.alumnos a), '[]'::jsonb),
      'cuotas', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('revision', c.revision::text)
        order by c.id) from public.cuotas c), '[]'::jsonb),
      'pagos', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.pagos p), '[]'::jsonb)
    )
  );
end;
$$;
alter function public.leer_cuentas_administrativas() owner to postgres;
revoke all on function public.leer_cuentas_administrativas() from public, anon, authenticated;
grant execute on function public.leer_cuentas_administrativas() to authenticated;
notify pgrst, 'reload schema';
commit;
