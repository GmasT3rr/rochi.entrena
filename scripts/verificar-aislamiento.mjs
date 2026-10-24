// Ejecución EXPLÍCITA en proyecto aislado después de instalar 005 manualmente.
// Node 24. Solo publishable key + sesiones reales. Nunca imprime JWT/contraseñas/cuerpos.
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import assert from 'node:assert/strict';

if (!process.argv.includes('--confirmar-proyecto-pruebas') || !process.stdin.isTTY) {
  console.error(
    'Solo terminal interactiva: node scripts/verificar-aislamiento.mjs --confirmar-proyecto-pruebas',
  );
  process.exit(1);
}
const source = await readFile(
  new URL('../src/app/core/auth/supabase.config.ts', import.meta.url),
  'utf8',
);
const urlOriginal = source.match(/\burl\s*:\s*['"]([^'"]+)['"]/)?.[1];
const url = await prompt('URL del proyecto AISLADO (no rochy-dev): ');
const key = await prompt('Publishable key del proyecto AISLADO: ', true);
assert.match(url, /^https:\/\/[^/]+\.supabase\.co\/?$/);
assert.match(key, /^sb_publishable_[\w-]+$/);
assert.ok(
  urlOriginal && new URL(url).hostname !== new URL(urlOriginal).hostname,
  'Se proh?be ejecutar contra el proyecto configurado en Angular',
);
const base = url.replace(/\/$/, '');
const sesiones = [];
async function prompt(label, hidden = false) {
  process.stdout.write(label);
  const output = hidden
    ? new Writable({
        write(_c, _e, done) {
          done();
        },
      })
    : process.stdout;
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const value = await input.question('');
    return hidden ? value : value.trim();
  } finally {
    input.close();
    if (hidden) process.stdout.write('\n');
  }
}
async function req(path, token, method = 'GET', body, schema) {
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (schema) headers[method === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = schema;
  const r = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, code: data?.code, data };
}
function check(ok, name) {
  assert.equal(Boolean(ok), true, name);
  console.log('PASS: ' + name);
}
const rpc = (name, user, body = {}) => req('/rest/v1/rpc/' + name, user.token, 'POST', body);
const tablas = ['alumnos', 'configuraciones_mensuales', 'cuotas', 'pagos'];
function endpoint(table, id) {
  return (
    '/rest/v1/' +
    table +
    '?' +
    (table === 'configuraciones_mensuales' ? 'alumno_id' : 'id') +
    '=eq.' +
    encodeURIComponent(id) +
    '&select=*'
  );
}
async function snapshot(user) {
  const result = {};
  for (const table of tablas) {
    const r = await req(endpoint(table, user.fixture), user.token);
    check(
      r.ok && Array.isArray(r.data) && r.data.length === 1 && r.data[0].propietario_id === user.id,
      user.label + ': control positivo ' + table,
    );
    result[table] = r.data;
  }
  check(
    result.alumnos[0].observaciones === 'TCF_RLS_AUDIT_ONLY' &&
      result.cuotas[0].observaciones === 'TCF_RLS_AUDIT_ONLY' &&
      result.pagos[0].observaciones === 'TCF_RLS_AUDIT_ONLY',
    'Solo fixtures desechables marcados',
  );
  return result;
}
try {
  for (const label of ['A', 'B']) {
    const email = await prompt(label + ' correo: ');
    const password = await prompt(label + ' contraseña (oculta): ', true);
    const login = await req('/auth/v1/token?grant_type=password', undefined, 'POST', {
      email,
      password,
    });
    check(login.ok && login.data?.access_token && login.data?.user?.id, label + ': login real');
    const user = { label, token: login.data.access_token, id: login.data.user.id };
    sesiones.push(user);
    const admin = await rpc('es_administrador_actual', user);
    check(admin.ok && admin.data === true, label + ': administrador activo');
    user.fixture = await prompt(label + ' ID del fixture creado manualmente: ');
    assert.match(user.fixture, /^tcf-rls-audit-[0-9a-f-]{36}$/);
  }
  const [a, b] = sesiones;
  check(a.id !== b.id && a.fixture !== b.fixture, 'Dos usuarios y fixtures distintos');
  const periodo = await prompt('Período de prueba para previsualización YYYY-MM (sin generar): ');
  assert.match(periodo, /^\d{4}-(0[1-9]|1[0-2])$/);
  const baseline = new Map();
  for (const user of sesiones) baseline.set(user.id, await snapshot(user));
  for (const [own, other] of [
    [a, b],
    [b, a],
  ]) {
    for (const table of tablas) {
      const hidden = await req(endpoint(table, other.fixture), own.token);
      check(
        hidden.ok && Array.isArray(hidden.data) && hidden.data.length === 0,
        own.label + ': oculta ' + table + ' ajena con control positivo',
      );
      for (const method of ['PATCH', 'DELETE']) {
        const body = method === 'PATCH' ? { propietario_id: own.id } : undefined;
        const result = await req(endpoint(table, other.fixture), own.token, method, body);
        check(
          result.code === '42501' ||
            (result.ok && Array.isArray(result.data) && !result.data.length),
          own.label + ': ' + method + ' ajeno ' + table,
        );
      }
      const payload = { ...baseline.get(own.id)[table][0], propietario_id: other.id };
      delete payload.creado_en;
      delete payload.actualizado_en;
      delete payload.concepto_clave;
      delete payload.revision;
      if (table !== 'configuraciones_mensuales') payload.id = crypto.randomUUID();
      const forgery = await req('/rest/v1/' + table, own.token, 'POST', payload);
      check(
        !forgery.ok && forgery.code === '42501',
        own.label + ': INSERT propietario falsificado ' + table,
      );
      const transfer = await req(endpoint(table, own.fixture), own.token, 'PATCH', {
        propietario_id: other.id,
      });
      check(
        !transfer.ok && transfer.code === '42501',
        own.label + ': propietario inmutable ' + table,
      );
    }
    for (const table of ['cuotas', 'pagos']) {
      const data = { ...baseline.get(own.id)[table][0], id: crypto.randomUUID() };
      delete data.creado_en;
      delete data.actualizado_en;
      delete data.concepto_clave;
      delete data.revision;
      if (table === 'cuotas') data.alumno_id = other.fixture;
      else data.cuota_id = other.fixture;
      const cross = await req('/rest/v1/' + table, own.token, 'POST', data);
      check(
        !cross.ok &&
          (['42501', '23503'].includes(cross.code) ||
            (table === 'pagos' &&
              cross.code === 'P0001' &&
              cross.data?.message === 'La cuota no existe')),
        own.label + ': vínculo cruzado ' + table,
      );
    }
    const read = await rpc('leer_cuentas_administrativas', own);
    check(
      read.ok && read.data?.version === 1 && read.data.alumnos.some((x) => x.id === own.fixture),
      own.label + ': RPC financiera control positivo',
    );
    check(
      !read.data.alumnos.some((x) => x.id === other.fixture) &&
        read.data.cuotas.every((x) => x.propietario_id === own.id) &&
        read.data.pagos.every((x) => x.propietario_id === own.id),
      own.label + ': RPC financiera aislada',
    );
    const vista = await rpc('previsualizar_cuotas_mensuales', own, { p_periodo: periodo });
    check(
      vista.ok &&
        [...vista.data.cuotas, ...vista.data.omitidos].some((x) => x.alumnoId === own.fixture) &&
        ![...vista.data.cuotas, ...vista.data.omitidos].some((x) => x.alumnoId === other.fixture),
      own.label + ': vista mensual aislada',
    );
    const vistaAjena = await rpc('previsualizar_cuotas_mensuales', other, { p_periodo: periodo });
    const gen = await rpc('generar_cuotas_mensuales', own, {
      p_periodo: periodo,
      p_huella: vistaAjena.data.huella,
    });
    check(
      !gen.ok && gen.data?.message === 'VISTA_MENSUAL_DESACTUALIZADA',
      own.label + ': rechaza huella mensual ajena sin insertar',
    );
    const alumno = baseline.get(other.id).alumnos[0];
    const save = await rpc('guardar_alumno_con_configuracion', own, {
      p_id: other.fixture,
      p_crear: false,
      p_datos: Object.fromEntries(
        [
          'nombre',
          'apellido',
          'telefono',
          'email',
          'modalidad',
          'estado',
          'fecha_ingreso',
          'observaciones',
        ].map((k) => [k, alumno[k]]),
      ),
    });
    check(!save.ok && save.code === '42501', own.label + ': RPC no edita alumno ajeno');
    for (const table of ['administradores', 'historial']) {
      const privateRead = await req(
        '/rest/v1/' + table + '?select=*&limit=1',
        own.token,
        'GET',
        undefined,
        'rochy_privado',
      );
      check(
        !privateRead.ok && ['PGRST106', '42501'].includes(privateRead.code),
        own.label + ': esquema privado no expuesto ' + table,
      );
    }
  }
  for (const user of sesiones)
    check(
      JSON.stringify(await snapshot(user)) === JSON.stringify(baseline.get(user.id)),
      user.label + ': datos intactos después de intentos cruzados',
    );
  console.log(
    'PASS: aislamiento HTTP de dos administradores. Generación propia/concurrencia y RLS del historial: completar guion manual.',
  );
} catch {
  console.error(
    'FAIL: comprobación interrumpida. Revisar cuentas, instalación 005 y fixtures; no se imprimen respuestas ni credenciales.',
  );
  process.exitCode = 1;
} finally {
  for (const user of sesiones) {
    try {
      await req('/auth/v1/logout?scope=local', user.token, 'POST');
    } catch {}
  }
}
