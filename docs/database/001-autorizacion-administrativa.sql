-- Migración incremental. Ejecutar manualmente como postgres sobre el esquema existente.
-- No crea usuarios, no modifica administradores ni políticas RLS.
begin;
create function public.es_administrador_actual()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and rochy_privado.es_administrador();
$$;
alter function public.es_administrador_actual() owner to postgres;
revoke all on function public.es_administrador_actual() from public, anon, authenticated;
grant execute on function public.es_administrador_actual() to authenticated;
comment on function public.es_administrador_actual() is
  'Solo devuelve si auth.uid() corresponde a un administrador activo. Sin argumentos.';
notify pgrst, 'reload schema';
commit;
