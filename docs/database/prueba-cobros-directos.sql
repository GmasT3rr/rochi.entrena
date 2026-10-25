-- SOLO MANUAL en proyecto de prueba con 011 aplicada. Todo se revierte.
-- Completar administradores activos distintos, ambos con al menos un alumno.
begin;
set local tcf.prueba.usuario_a = '';
set local tcf.prueba.usuario_b = '';
do $$ begin
 if nullif(current_setting('tcf.prueba.usuario_a'),'') is null
 or nullif(current_setting('tcf.prueba.usuario_b'),'') is null
 or current_setting('tcf.prueba.usuario_a')=current_setting('tcf.prueba.usuario_b') then
 raise exception 'Completar dos administradores diferentes'; end if;
end $$;
set local role authenticated;
do $$ declare usuario uuid; alumno text; ajeno text; ident text:=gen_random_uuid()::text;
 cuotas bigint; pagos bigint; eventos bigint; filas bigint;
begin
 usuario:=current_setting('tcf.prueba.usuario_a')::uuid;
 perform set_config('request.jwt.claim.sub',usuario::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
 if public.es_administrador_actual() is distinct from true then raise exception 'A no autorizado'; end if;
 select id into alumno from public.alumnos limit 1;
 if alumno is null then raise exception 'Falta alumno de A'; end if;
 select count(*) into cuotas from public.cuotas;
 select count(*) into pagos from public.pagos;
 insert into public.cobros_directos(id,alumno_id,concepto,importe,fecha,medio)
 values(ident,alumno,'Evaluación de prueba',20,current_date-1,'Efectivo');
 -- Repetición legítima: otro ID con mismo concepto y fecha.
 insert into public.cobros_directos(alumno_id,concepto,importe,fecha,medio)
 values(alumno,'Evaluación de prueba',20,current_date-1,'Efectivo');
 begin
   insert into public.cobros_directos(alumno_id,concepto,importe,fecha,medio)
   values(alumno,'Inválido',0,current_date-1,'Efectivo');
   raise exception 'Aceptó cero';
 exception when check_violation then null; end;
 begin
   insert into public.cobros_directos(alumno_id,concepto,importe,fecha,medio)
   values(alumno,'Inválido',-1,current_date-1,'Efectivo');
   raise exception 'Aceptó negativo';
 exception when check_violation then null; end;
 begin
   insert into public.cobros_directos(alumno_id,concepto,importe,fecha,medio)
   values(alumno,'Inválido',1,current_date+2,'Efectivo');
   raise exception 'Aceptó fecha futura';
 exception when check_violation then null; end;
 update public.cobros_directos set importe=25 where id=ident;
 if not exists(select 1 from public.cobros_directos where id=ident and importe=25) then
 raise exception 'No persistió corrección'; end if;
 if not exists(select 1 from jsonb_array_elements(public.leer_cuentas_administrativas()->'cobros_directos') c where c->>'id'=ident) then
 raise exception 'RPC omitió cobro'; end if;
 -- B administrador: no puede consultar, modificar, borrar ni asociar un alumno de A.
 usuario:=current_setting('tcf.prueba.usuario_b')::uuid;
 perform set_config('request.jwt.claim.sub',usuario::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
 if public.es_administrador_actual() is distinct from true then raise exception 'B no autorizado'; end if;
 if exists(select 1 from public.cobros_directos where id=ident) then raise exception 'Fuga entre propietarios'; end if;
 update public.cobros_directos set importe=99 where id=ident;
 get diagnostics filas=row_count;
 if filas<>0 then raise exception 'Update cruzado'; end if;
 delete from public.cobros_directos where id=ident;
 get diagnostics filas=row_count;
 if filas<>0 then raise exception 'Delete cruzado'; end if;
 begin
   insert into public.cobros_directos(alumno_id,concepto,importe,fecha,medio)
   values(alumno,'Cruce',1,current_date-1,'Efectivo');
   raise exception 'Aceptó alumno ajeno';
 exception when foreign_key_violation then null; end;
 usuario:=current_setting('tcf.prueba.usuario_a')::uuid;
 perform set_config('request.jwt.claim.sub',usuario::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
 delete from public.cobros_directos where id=ident;
 select count(*) into eventos from rochy_privado.historial where tabla='cobros_directos' and registro_id=ident;
 if eventos<>3 then raise exception 'Falta auditoría alta/corrección/baja'; end if;
 if (select count(*) from public.cuotas)<>cuotas or (select count(*) from public.pagos)<>pagos then
 raise exception 'Cambió cuotas o pagos'; end if;
 -- Identidad autenticada sin autorización: ningún dato visible ni escritura permitida.
 usuario:=gen_random_uuid();
 perform set_config('request.jwt.claim.sub',usuario::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
 if exists(select 1 from public.cobros_directos) then raise exception 'Fuga sin autorización'; end if;
 begin
   insert into public.cobros_directos(alumno_id,concepto,importe,fecha,medio)
   values(alumno,'Sin autorización',1,current_date-1,'Efectivo');
   raise exception 'Escritura sin autorización';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
   perform id from public.cobros_directos;
   raise exception 'Lectura anónima permitida';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
