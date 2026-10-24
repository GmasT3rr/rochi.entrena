// PostgreSQL real embebido: solo memoria local. No usa credenciales ni red.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../tmp/aislamiento-tools/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const A = '10000000-0000-4000-8000-000000000001';
const B = '20000000-0000-4000-8000-000000000002';
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
const datos = {
  nombre: 'Ana',
  apellido: 'Prueba',
  telefono: '',
  email: '',
  modalidad: 'Online',
  estado: 'Activo',
  fecha_ingreso: '2026-10-24',
  observaciones: '',
  configuracion_mensual: { habilitada: true, importe: 123.45, dia_vencimiento: 31 },
};
const payload = (d = datos) => `'${JSON.stringify(d).replaceAll("'", "''")}'::jsonb`;
const alta = (id, periodo, d = datos) =>
  `select public.crear_alumno_con_primera_cuota('${id}',${payload(d)},'${periodo}')`;
const rol = async (usuario, role = 'authenticated') =>
  db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${usuario}',false); set role ${role}`,
  );
async function rechaza(sql, codigo) {
  let fallo = false;
  try {
    await db.exec(sql);
  } catch (e) {
    fallo = true;
    if (codigo) assert.equal(e.code, codigo, e.message);
  }
  assert.ok(fallo, 'La operación debía fallar');
}
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to public;`);
  for (const file of [
    'rochy-propuesta.sql',
    '001-autorizacion-administrativa.sql',
    '002-guardar-alumno-configuracion.sql',
    '003-leer-cuentas-administrativas.sql',
    '004-generacion-mensual.sql',
    '005-aislamiento-por-usuario.sql',
    '006-alta-primera-cuota.sql',
  ]) {
    await db.exec(await readFile(new URL('../docs/database/' + file, import.meta.url), 'utf8'));
  }
  await db.exec(
    `insert into auth.users values('${A}','a@test.invalid'),('${B}','b@test.invalid'); insert into rochy_privado.administradores(usuario_id) values('${A}'),('${B}');`,
  );
  await rol(A);
  for (const [id, mes, vencimiento] of [
    ['feb28', '2027-02', '2027-02-28'],
    ['feb29', '2028-02', '2028-02-29'],
    ['abr', '2027-04', '2027-04-30'],
    ['dic', '9999-12', '9999-12-31'],
  ]) {
    await db.exec(alta(id, mes));
    assert.equal(
      await scalar(`select vencimiento::text from public.cuotas where alumno_id='${id}'`),
      vencimiento,
    );
    assert.equal(
      Number(await scalar(`select importe from public.cuotas where alumno_id='${id}'`)),
      123.45,
    );
    assert.equal(
      await scalar(`select count(*)::int from public.cuotas where alumno_id='${id}'`),
      1,
    );
  }
  assert.equal(await scalar('select count(*)::int from public.pagos'), 0);
  const vista = await scalar("select public.previsualizar_cuotas_mensuales('2027-02')");
  assert.ok(vista.omitidos.some((o) => o.alumnoId === 'feb28' && /existe/.test(o.motivo)));
  await rechaza(
    "insert into public.cuotas(alumno_id,concepto,periodo,importe,vencimiento) values('feb28','Cuota de entrenamiento','2027-02-01',123.45,'2027-02-28')",
    '23505',
  );
  const antes = await scalar(
    'select jsonb_agg(to_jsonb(q) order by id)::text from public.cuotas q',
  );
  await rechaza(alta('feb28', '2027-03'), '23505');
  assert.equal(
    await scalar('select jsonb_agg(to_jsonb(q) order by id)::text from public.cuotas q'),
    antes,
  );
  await db.exec(
    `select public.guardar_alumno_con_configuracion('feb28',false,${payload({ ...datos, configuracion_mensual: { ...datos.configuracion_mensual, importe: 999 } })})`,
  );
  assert.equal(
    await scalar('select jsonb_agg(to_jsonb(q) order by id)::text from public.cuotas q'),
    antes,
  );
  await db.exec(`select public.guardar_alumno_con_configuracion('sin-mensual',true,${payload({ ...datos, configuracion_mensual: null })});
    select public.guardar_alumno_con_configuracion('sin-primera',true,${payload()})`);
  assert.equal(
    await scalar(
      "select count(*)::int from public.cuotas where alumno_id in ('sin-mensual','sin-primera')",
    ),
    0,
  );
  for (const periodo of ['2026-13', '0000-01', '2026-2'])
    await rechaza(alta('invalido', periodo), '22023');
  await rechaza(
    alta('deshabilitado', '2026-10', {
      ...datos,
      configuracion_mensual: { ...datos.configuracion_mensual, habilitada: false },
    }),
    '22023',
  );
  // Forzar fallo DESPUÉS de insertar alumno/configuración para demostrar rollback.
  await db.exec(`reset role; create function public.fallar_cuota_prueba() returns trigger language plpgsql as $$ begin raise exception 'fallo de prueba' using errcode='23514'; end $$;
    create trigger fallo_prueba before insert on public.cuotas for each row execute function public.fallar_cuota_prueba();`);
  await rol(A);
  await rechaza(alta('rollback', '2026-10'), '23514');
  assert.equal(await scalar("select count(*)::int from public.alumnos where id='rollback'"), 0);
  assert.equal(
    await scalar(
      "select count(*)::int from public.configuraciones_mensuales where alumno_id='rollback'",
    ),
    0,
  );
  assert.equal(
    await scalar("select count(*)::int from rochy_privado.historial where registro_id='rollback'"),
    0,
  );
  await db.exec(
    'reset role; drop trigger fallo_prueba on public.cuotas; drop function public.fallar_cuota_prueba()',
  );
  await rol(B);
  assert.equal(await scalar('select count(*)::int from public.cuotas'), 0);
  await rechaza(alta('feb28', '2026-10'), '23505');
  await rol('');
  await rechaza(alta('sin-sesion', '2026-10'), '42501');
  await rol(A, 'anon');
  await rechaza(alta('anonimo', '2026-10'), '42501');
  await db.exec(
    `reset role; update rochy_privado.administradores set activo=false where usuario_id='${B}'`,
  );
  await rol(B);
  await rechaza(alta('no-admin', '2026-10'), '42501');
  console.log(
    'PASS: alta atómica, 28/29/30/31 días, período límite, sin pagos ni meses extra, duplicados, edición conserva historia, rollback real y autorización/RLS.',
  );
} finally {
  await db.close();
}
