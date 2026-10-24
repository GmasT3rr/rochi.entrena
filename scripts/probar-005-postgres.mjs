// PostgreSQL real embebido (PGlite), exclusivamente memoria local. No red ni credenciales.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../tmp/aislamiento-tools/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const A = '10000000-0000-4000-8000-000000000001',
  B = '20000000-0000-4000-8000-000000000002';
const read = (name) => readFile(new URL('../docs/database/' + name, import.meta.url), 'utf8');
const query = async (sql) => (await db.query(sql)).rows;
const scalar = async (sql) => Object.values((await query(sql))[0])[0];
const owner = async (id) =>
  db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`,
  );
async function denied(sql, codes = ['42501']) {
  try {
    await db.exec(sql);
    assert.fail('Escritura no rechazada');
  } catch (e) {
    assert.ok(codes.includes(e.code), `Error esperado ${codes}, recibido ${e.code}: ${e.message}`);
  }
}
try {
  console.log('Motor:', await scalar('select version()'));
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
  ])
    await db.exec(await read(file));
  await db.exec(`insert into auth.users values('${A}','a@test.invalid'),('${B}','b@test.invalid'); insert into rochy_privado.administradores(usuario_id) values('${A}'),('${B}');
 insert into public.alumnos(id,nombre,apellido,modalidad,fecha_ingreso) values('a','Ana','Prueba','Online','2025-01-01'),('b','Bea','Prueba','Presencial','2025-01-01');
 insert into public.configuraciones_mensuales values('a',true,100,31),('b',true,200,31);
 insert into public.cuotas(id,alumno_id,concepto,periodo,importe,vencimiento) values('ca','a','Inicial','2025-01-01',100,'2025-01-31'),('cb','b','Inicial','2025-01-01',200,'2025-01-31');
 insert into public.pagos(id,cuota_id,importe,fecha,medio) values('pa','ca',10,'2025-01-10','Otro'),('pb','cb',20,'2025-01-10','Otro');`);
  const before = {};
  for (const table of [
    'alumnos',
    'configuraciones_mensuales',
    'cuotas',
    'pagos',
    'rochy_privado.historial',
  ])
    before[table] = await query(
      `select to_jsonb(t) as fila from ${table.includes('.') ? table : 'public.' + table} t order by 1::text`,
    );
  const migration = await read('005-aislamiento-por-usuario.sql');
  try {
    await db.exec(migration);
    assert.fail('Mapa vacio aceptado');
  } catch (e) {
    assert.match(e.message, /Asignaci/);
    await db.exec('rollback');
  }
  assert.equal(
    await scalar(
      "select count(*)::integer from information_schema.columns where table_schema='public' and table_name='alumnos' and column_name='propietario_id'",
    ),
    0,
  );
  const mapaAlumnos = JSON.stringify([
    { alumno_id: 'a', propietario_id: A },
    { alumno_id: 'b', propietario_id: B },
  ]);
  const ownerIds = new Map([
    ['a', A],
    ['ca', A],
    ['pa', A],
    ['b', B],
    ['cb', B],
    ['pb', B],
  ]);
  const historial = await query(
    'select id::text,registro_id from rochy_privado.historial order by id',
  );
  const mapaHistoria = JSON.stringify(
    historial.map((h) => ({ historial_id: h.id, propietario_id: ownerIds.get(h.registro_id) })),
  );
  const populated = migration
    .replace("jsonb_to_recordset('[]'::jsonb)", `jsonb_to_recordset('${mapaAlumnos}'::jsonb)`)
    .replace("jsonb_to_recordset('[]'::jsonb)", `jsonb_to_recordset('${mapaHistoria}'::jsonb)`);
  await db.exec(`update rochy_privado.administradores set activo=false where usuario_id='${B}'`);
  try {
    await db.exec(populated);
    assert.fail('Mapa con usuario no autorizado aceptado');
  } catch (e) {
    assert.match(e.message, /administradores activos/);
    await db.exec('rollback');
  }
  await db.exec(`update rochy_privado.administradores set activo=true where usuario_id='${B}'`);
  await db.exec(populated);
  for (const table of Object.keys(before)) {
    const after = await query(
      `select to_jsonb(t)-'propietario_id' as fila from ${table.includes('.') ? table : 'public.' + table} t order by 1::text`,
    );
    assert.deepEqual(after, before[table], 'Backfill altera negocio: ' + table);
  }
  console.log(
    'PASS: 001–005 ejecutadas; mapas vacios abortan; backfill conserva datos/timestamps/revisiones/historial',
  );
  const payload = JSON.stringify({
    nombre: 'Nueva',
    apellido: 'Prueba',
    telefono: null,
    email: null,
    modalidad: 'Online',
    estado: 'Activo',
    fecha_ingreso: '2025-01-01',
    observaciones: null,
    configuracion_mensual: { habilitada: true, importe: 50, dia_vencimiento: 31 },
  });
  for (const [uid, other, id, foreign] of [
    [A, B, 'a', 'b'],
    [B, A, 'b', 'a'],
  ]) {
    await owner(uid);
    assert.equal(await scalar('select public.es_administrador_actual()'), true);
    for (const t of [
      'alumnos',
      'configuraciones_mensuales',
      'cuotas',
      'pagos',
      'rochy_privado.historial',
    ]) {
      const name = t.includes('.') ? t : 'public.' + t;
      assert.ok((await scalar(`select count(*)::integer from ${name}`)) > 0);
      assert.equal(
        await scalar(`select count(*)::integer from ${name} where propietario_id<>'${uid}'`),
        0,
      );
    }
    assert.equal(
      (await query(`update public.alumnos set nombre='No' where id='${foreign}' returning id`))
        .length,
      0,
    );
    assert.equal(
      (await query(`delete from public.pagos where id='p${foreign}' returning id`)).length,
      0,
    );
    await denied(`update public.alumnos set propietario_id='${other}' where id='${id}'`);
    await denied(
      `insert into public.alumnos(id,propietario_id,nombre,apellido,modalidad,fecha_ingreso) values('ataque-${id}','${other}','No','No','Online','2025-01-01')`,
    );
    await denied(
      `insert into public.cuotas(alumno_id,concepto,periodo,importe,vencimiento) values('${foreign}','Cruce','2025-02-01',10,'2025-02-28')`,
      ['23503'],
    );
    await denied(
      `insert into public.pagos(cuota_id,importe,fecha,medio) values('c${foreign}',1,'2025-01-10','Otro')`,
      ['P0001', '42501', '23503'],
    );
    await denied(
      `select public.guardar_alumno_con_configuracion('${foreign}',false,'${payload}'::jsonb)`,
    );
    await db.exec(
      `select public.guardar_alumno_con_configuracion('nuevo-${id}',true,'${payload}'::jsonb)`,
    );
    const snapshot = await scalar('select public.leer_cuentas_administrativas()');
    assert.ok(snapshot.alumnos.some((a) => a.id === id));
    assert.ok(!snapshot.alumnos.some((a) => a.id === foreign));
    assert.ok(snapshot.cuotas.every((c) => c.propietario_id === uid));
    assert.ok(snapshot.pagos.every((p) => p.propietario_id === uid));
    const vista = await scalar("select public.previsualizar_cuotas_mensuales('2025-02')");
    assert.ok(vista.cuotas.some((c) => c.alumnoId === id));
    assert.ok(!vista.cuotas.some((c) => c.alumnoId === foreign));
    assert.equal(vista.cuotas.find((c) => c.alumnoId === id).vencimiento, '2025-02-28');
    const resultado = await scalar(
      `select public.generar_cuotas_mensuales('2025-02','${vista.huella}')`,
    );
    assert.equal(resultado.estado, 'confirmada');
    assert.ok(resultado.generadas > 0);
    await denied(`select public.generar_cuotas_mensuales('2025-02','${vista.huella}')`, ['P0001']);
    await denied(
      `insert into public.pagos(cuota_id,importe,fecha,medio) values('c${id}',999,'2025-01-10','Otro')`,
      ['P0001'],
    );
    await denied(`update public.cuotas set importe=1 where id='c${id}'`, ['P0001']);
    await denied(`delete from public.cuotas where id='c${id}'`, ['23503', '23001']);
    await denied(`update rochy_privado.administradores set activo=false`);
  }
  console.log(
    'PASS: dos identidades SQL authenticated aisladas; RPC, generación, historial, FK, sobrepago y restricciones',
  );
  await db.exec('reset role');
  await db.exec(`update rochy_privado.administradores set activo=false where usuario_id='${B}'`);
  await owner(B);
  assert.equal(await scalar('select public.es_administrador_actual()'), false);
  assert.equal(await scalar('select count(*)::integer from public.alumnos'), 0);
  await denied('select public.leer_cuentas_administrativas()');
  console.log('PASS: administrador desactivado queda bloqueado.');
  await db.exec('reset role');
  await db.exec(`update rochy_privado.administradores set activo=true where usuario_id='${B}'`);
  const inventario = await db.exec(await read('inventario-propietarios.sql'));
  assert.ok(inventario.some((r) => r.rows?.[0]?.inventario?.version === 1));
  let demo = await read('demo-seis-meses.sql');
  try {
    await db.exec(demo);
    assert.fail('DEMO sin UUID/confirmacion aceptado');
  } catch (e) {
    assert.match(e.message, /Confirmar/);
    await db.exec('rollback');
  }
  const bAntes = await scalar(
    `select count(*)::integer from public.cuotas where propietario_id='${B}'`,
  );
  demo = demo
    .replace("set local tcf.demo.usuario_id = '';", `set local tcf.demo.usuario_id = '${A}';`)
    .replace(
      "set local tcf.demo.confirmacion = '';",
      "set local tcf.demo.confirmacion = 'GENERAR_DEMO_EN_COPIA_AISLADA';",
    );
  await db.exec(demo);
  await db.exec('reset role');
  for (const [table, expected] of [
    ['alumnos', 8],
    ['cuotas', 48],
    ['pagos', 48],
  ]) {
    assert.equal(
      await scalar(
        `select count(*)::integer from public.${table} where propietario_id='${A}' and observaciones like 'DEMO_6_MESES:%'`,
      ),
      expected,
    );
  }
  assert.equal(
    await scalar(`select count(*)::integer from public.cuotas where propietario_id='${B}'`),
    bAntes,
  );
  assert.equal(
    await scalar(
      `select count(distinct periodo)::integer from public.cuotas where observaciones like 'DEMO_6_MESES:%'`,
    ),
    6,
  );
  console.log(
    'PASS: inventario y DEMO ejecutados; 6 meses, cantidades correctas, cero cambios al otro propietario.',
  );
  console.log('LIMITES: no Supabase Auth real/HTTP ni concurrencia multiconexion.');
} finally {
  await db.close();
}
