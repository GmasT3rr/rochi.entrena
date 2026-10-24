-- SOLO MANUAL, proyecto aislado, después de 005 y fixtures para dos administradores.
-- Complementa HTTP: demuestra RLS privada, no sustituye las llamadas API.
begin;
set local tcf.prueba.usuario_a = ''; -- UUID explícito A
set local tcf.prueba.usuario_b = ''; -- UUID explícito B
set local tcf.prueba.periodo = '2026-10'; -- Elegir período aislado con candidatos de A y B.
do $$ declare a uuid:=nullif(current_setting('tcf.prueba.usuario_a'),'')::uuid;
 b uuid:=nullif(current_setting('tcf.prueba.usuario_b'),'')::uuid;
begin
 if a is null or b is null or a=b then raise exception 'Completar dos UUID diferentes'; end if;
 if (select count(*) from rochy_privado.administradores where usuario_id in(a,b) and activo)<>2 then
   raise exception 'Deben ser administradores activos existentes'; end if;
 if not exists(select 1 from rochy_privado.historial where propietario_id=a)
   or not exists(select 1 from rochy_privado.historial where propietario_id=b) then
   raise exception 'Se requiere historial positivo de ambos usuarios'; end if;
end $$;
set local role authenticated;
do $$ declare usuario uuid; otro uuid; vista jsonb; resultado jsonb; total integer;
begin
 foreach usuario in array array[current_setting('tcf.prueba.usuario_a')::uuid,current_setting('tcf.prueba.usuario_b')::uuid] loop
   otro:=case when usuario=current_setting('tcf.prueba.usuario_a')::uuid then current_setting('tcf.prueba.usuario_b')::uuid else current_setting('tcf.prueba.usuario_a')::uuid end;
   perform set_config('request.jwt.claim.sub',usuario::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
   if public.es_administrador_actual() is distinct from true then raise exception 'No administrador'; end if;
   if not exists(select 1 from rochy_privado.historial where propietario_id=usuario)
      or exists(select 1 from rochy_privado.historial where propietario_id<>usuario) then
     raise exception 'Historial no aislado o sin control positivo';
   end if;
   -- SELECT propio es necesario; una consulta ajena vacía no alcanza.
   if not exists(select 1 from public.alumnos where propietario_id=usuario) then raise exception 'Faltan datos propios'; end if;
   if exists(select 1 from public.alumnos where propietario_id=otro)
      or exists(select 1 from public.cuotas where propietario_id=otro)
      or exists(select 1 from public.pagos where propietario_id=otro)
      or exists(select 1 from public.configuraciones_mensuales where propietario_id=otro) then raise exception 'Fuga entre propietarios'; end if;
   begin
     update rochy_privado.administradores set activo=false where usuario_id=otro;
     raise exception 'Permiso inesperado administradores';
   exception when insufficient_privilege then null; end;
   vista:=public.previsualizar_cuotas_mensuales(current_setting('tcf.prueba.periodo'));
   if jsonb_array_length(vista->'cuotas')=0 then raise exception 'Elegir un período con candidatos: no aceptar prueba vacía'; end if;
   select count(*) into total from public.cuotas;
   resultado:=public.generar_cuotas_mensuales(current_setting('tcf.prueba.periodo'),vista->>'huella');
   if resultado->>'estado'<>'confirmada' or (resultado->>'generadas')::integer<=0 then raise exception 'Generación sin control positivo'; end if;
   if (select count(*) from public.cuotas)<>total+(resultado->>'generadas')::integer then raise exception 'Recuentos inconsistentes'; end if;
   if exists(select 1 from public.cuotas where propietario_id<>usuario) then raise exception 'Generación cruzada'; end if;
 end loop;
end $$;
-- Verificación privilegiada final: FK, historial y dueños consistentes después de ambos lotes.
reset role;
do $$ begin
 if exists(select 1 from public.cuotas c join public.alumnos a on a.id=c.alumno_id where c.propietario_id<>a.propietario_id)
 or exists(select 1 from public.pagos p join public.cuotas c on c.id=p.cuota_id where p.propietario_id<>c.propietario_id) then
   raise exception 'Relaciones inconsistentes'; end if;
end $$;
rollback;
