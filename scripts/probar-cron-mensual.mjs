// Valida PostgreSQL real en memoria local. NO valida el scheduler pg_cron de Supabase.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../tmp/aislamiento-tools/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const A = '10000000-0000-4000-8000-000000000001',
  B = '20000000-0000-4000-8000-000000000002';
const read = (file) => readFile(new URL('../docs/database/' + file, import.meta.url), 'utf8');
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
const rol = async (id, role = 'authenticated') =>
  db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`);
const datos = (extras = {}) => ({
  nombre: 'Ana',
  apellido: 'Prueba',
  telefono: '',
  email: '',
  modalidad: 'Online',
  estado: 'Activo',
  fecha_ingreso: '2026-10-01',
  observaciones: '',
  configuracion_mensual: {
    habilitada: true,
    importe: 100,
    dia_vencimiento: 31,
    periodo_inicio: '2026-10',
  },
  ...extras,
});
const payload = (d) => `'${JSON.stringify(d).replaceAll("'", "''")}'::jsonb`;
const guardar = async (id, d = datos(), crear = true) =>
  db.exec(`select public.guardar_alumno_con_configuracion('${id}',${crear},${payload(d)})`);
const ejecutar = async (instante, origen = 'cron') =>
  scalar(`select rochy_privado.ejecutar_mensual('${instante}'::timestamptz,'${origen}')`);
async function rechaza(sql, code) {
  let fallo = false;
  try {
    await db.exec(sql);
  } catch (e) {
    fallo = true;
    assert.equal(e.code, code, e.message);
  }
  assert.ok(fallo, 'Debia rechazar');
}
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to public;`);
  for (const file of [
    'rochy-propuesta.sql',
    '001-autorizacion-administrativa.sql',
    '002-guardar-alumno-configuracion.sql',
    '003-leer-cuentas-administrativas.sql',
    '004-generacion-mensual.sql',
    '005-aislamiento-por-usuario.sql',
    '006-alta-primera-cuota.sql',
  ])
    await db.exec(await read(file));
  await db.exec(
    `insert into auth.users values('${A}','a@test.invalid'),('${B}','b@test.invalid');insert into rochy_privado.administradores(usuario_id) values('${A}'),('${B}');`,
  );
  await rol(A);
  await guardar(
    'legacy',
    datos({ configuracion_mensual: { habilitada: true, importe: 100, dia_vencimiento: 31 } }),
  );
  await db.exec(
    `select public.crear_alumno_con_primera_cuota('legacy-futura',${payload(datos({ configuracion_mensual: { habilitada: true, importe: 100, dia_vencimiento: 31 } }))},'2030-01')`,
  );
  await db.exec('reset role');
  await db.exec(await read('007-automatizacion-mensual.sql'));
  await db.exec(await read('008-motor-mensual-cron.sql'));
  assert.equal((await ejecutar('2026-11-01T03:05:00Z')).estado, 'deshabilitada');
  assert.equal(await scalar('select count(*)::int from public.cuotas'), 1);
  assert.equal(
    await scalar(
      "select periodo_inicio::text from public.configuraciones_mensuales where alumno_id='legacy-futura'",
    ),
    '2030-01-01',
  );
  assert.ok(
    await scalar(
      "select periodo_inicio>=date_trunc('month',timezone('America/Argentina/Buenos_Aires',clock_timestamp()))::date from public.configuraciones_mensuales where alumno_id='legacy'",
    ),
  );
  await db.exec(
    "update public.configuraciones_mensuales set habilitada=false where alumno_id='legacy'",
  );
  await db.exec('update rochy_privado.automatizacion_mensual set habilitada=true where id');
  await rol(A);
  await guardar('activa');
  await guardar('pausa', datos({ estado: 'En pausa' }));
  await guardar('inactiva', datos({ estado: 'Inactivo' }));
  await guardar(
    'deshabilitada',
    datos({ configuracion_mensual: { ...datos().configuracion_mensual, habilitada: false } }),
  );
  await guardar(
    'futura',
    datos({
      configuracion_mensual: { ...datos().configuracion_mensual, periodo_inicio: '2026-12' },
    }),
  );
  await guardar('sin-config', datos({ configuracion_mensual: null }));
  await guardar('ingreso-futuro', datos({ fecha_ingreso: '2027-06-01' }));
  await rol(B);
  await guardar('otra-cuenta');
  await db.exec('reset role');
  // Todavia es octubre en Argentina, aunque en UTC ya sea noviembre.
  let r = await ejecutar('2026-11-01T02:59:00Z');
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.generadas, 2);
  assert.equal(
    await scalar("select count(*)::int from public.cuotas where periodo='2026-11-01'"),
    0,
  );
  r = await ejecutar('2026-11-01T03:05:00Z');
  assert.equal(r.generadas, 2);
  assert.equal(
    await scalar(
      "select count(*)::int from public.cuotas where alumno_id in('pausa','inactiva','deshabilitada','futura','sin-config','ingreso-futuro')",
    ),
    0,
  );
  assert.equal((await ejecutar('2026-11-01T03:05:00Z')).generadas, 0);
  // Garantia UNIQUE real, incluido el concepto compartido con generacion manual.
  await rechaza(
    `insert into public.cuotas(propietario_id,alumno_id,concepto,periodo,importe,vencimiento) values('${A}','activa','Cuota de entrenamiento','2026-11-01',100,'2026-11-30')`,
    '23505',
  );
  await rol(A);
  await db.exec(
    "insert into public.pagos(cuota_id,importe,fecha,medio) select id,20,timezone('America/Argentina/Buenos_Aires',clock_timestamp())::date,'Efectivo' from public.cuotas where alumno_id='activa' and periodo='2026-11-01'",
  );
  const historico = await scalar(
    "select jsonb_agg(to_jsonb(c) order by id)::text from public.cuotas c where periodo in ('2026-10-01','2026-11-01')",
  );
  const pagos = await scalar('select jsonb_agg(to_jsonb(p) order by id)::text from public.pagos p');
  await guardar('nueva');
  await guardar(
    'activa',
    datos({ configuracion_mensual: { ...datos().configuracion_mensual, importe: 777 } }),
    false,
  );
  // Alta con primera cuota futura: persiste su inicio, no genera antes de diciembre.
  await db.exec(
    `select public.crear_alumno_con_primera_cuota('primera-futura',${payload(datos())},'2026-12')`,
  );
  assert.equal(
    await scalar(
      "select periodo_inicio::text from public.configuraciones_mensuales where alumno_id='primera-futura'",
    ),
    '2026-12-01',
  );
  await db.exec('reset role');
  r = await ejecutar('2026-11-15T03:15:00Z', 'recuperacion');
  assert.equal(r.generadas, 1);
  assert.equal(
    await scalar(
      "select count(*)::int from public.cuotas where alumno_id='primera-futura' and periodo='2026-11-01'",
    ),
    0,
  );
  assert.equal(
    Number(
      await scalar(
        "select importe from public.cuotas where alumno_id='activa' and periodo='2026-11-01'",
      ),
    ),
    100,
  );
  // Mes omitido por pausa del servidor: recupera el mes actual y no inventa los anteriores.
  r = await ejecutar('2027-02-15T03:15:00Z', 'recuperacion');
  assert.ok(r.generadas > 0);
  assert.equal(
    await scalar("select count(*)::int from public.cuotas where periodo='2027-01-01'"),
    0,
  );
  for (const [instante, vencimiento] of [
    ['2027-02-01T03:05:00Z', '2027-02-28'],
    ['2028-02-01T03:05:00Z', '2028-02-29'],
    ['2028-04-01T03:05:00Z', '2028-04-30'],
    ['2028-12-01T03:05:00Z', '2028-12-31'],
  ]) {
    await ejecutar(instante);
    const mes = vencimiento.slice(0, 7) + '-01';
    assert.equal(
      await scalar(
        `select vencimiento::text from public.cuotas where alumno_id='activa' and periodo='${mes}'`,
      ),
      vencimiento,
    );
    assert.equal(
      Number(
        await scalar(
          `select importe from public.cuotas where alumno_id='activa' and periodo='${mes}'`,
        ),
      ),
      777,
    );
  }
  await db.exec(`create function public.fallo_cron_prueba() returns trigger language plpgsql as $$begin raise exception 'Fallo controlado' using errcode='23514';end$$;
    create trigger fallo_cron before insert on public.cuotas for each row execute function public.fallo_cron_prueba()`);
  r = await ejecutar('2028-06-01T03:05:00Z');
  assert.equal(r.estado, 'error');
  assert.equal(r.generadas, 0);
  assert.ok(r.fallidas > 0);
  assert.equal(
    await scalar("select count(*)::int from public.cuotas where periodo='2028-06-01'"),
    0,
  );
  assert.equal(
    await scalar(
      'select codigo_error from rochy_privado.ejecuciones_mensuales order by id desc limit 1',
    ),
    '23514',
  );
  await db.exec(
    'drop trigger fallo_cron on public.cuotas;drop function public.fallo_cron_prueba()',
  );
  r = await ejecutar('2028-06-02T03:15:00Z', 'recuperacion');
  assert.equal(r.estado, 'confirmada');
  assert.ok(r.generadas > 0);
  assert.equal((await ejecutar('2028-06-02T03:15:00Z', 'recuperacion')).generadas, 0);
  assert.equal(
    await scalar(
      'select count(*)::int from rochy_privado.ejecuciones_mensuales where finalizada_en is null',
    ),
    0,
  );
  await rol(A);
  assert.equal(
    await scalar(
      "select jsonb_agg(to_jsonb(c) order by id)::text from public.cuotas c where periodo in ('2026-10-01','2026-11-01') and alumno_id<>'nueva'",
    ),
    historico,
  );
  assert.equal(
    await scalar('select jsonb_agg(to_jsonb(p) order by id)::text from public.pagos p'),
    pagos,
  );
  const snapshot = await scalar('select public.leer_cuentas_administrativas()');
  assert.ok(snapshot.cuotas.some((c) => c.alumno_id === 'activa' && c.periodo === '2028-06-01'));
  assert.ok(!snapshot.cuotas.some((c) => c.alumno_id === 'otra-cuenta'));
  await rechaza('select rochy_privado.ejecutar_mensual()', '42501');
  await rechaza('select * from rochy_privado.ejecuciones_mensuales', '42501');
  await rol('', 'anon');
  await rechaza('select rochy_privado.ejecutar_mensual()', '42501');
  console.log(
    'PASS: zona Argentina, idempotencia/UNIQUE, estados/inicio/altas, importes, 28/29/30/31 dias, rollback/log/reintento, historia y pagos intactos, snapshot de pendientes y permisos. pg_cron remoto pendiente.',
  );
} catch (e) {
  console.error(e.code ?? '', e.message);
  if (e.query && e.position)
    console.error(e.query.slice(Math.max(0, Number(e.position) - 120), Number(e.position) + 100));
  process.exitCode = 1;
} finally {
  await db.close();
}
