// Node 24. Solo clave pública; nunca registra cuerpos de error, contraseñas o JWT.
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

const source = await readFile(new URL('../src/app/core/auth/supabase.config.ts', import.meta.url), 'utf8');
const url = source.match(/\burl\s*:\s*['"]([^'"]+)['"]/)?.[1];
const key = source.match(/\bpublishableKey\s*:\s*['"]([^'"]+)['"]/)?.[1];
if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url ?? '') || !/^sb_publishable_[\w-]+$/.test(key ?? '')) {
  console.error('Configuración pública inválida. No se hicieron solicitudes.'); process.exit(1);
}
const base = url.replace(/\/$/, '');
let failures = 0;
function report(test, status, detail = '') {
  if (status === 'FAIL') failures++;
  console.log(JSON.stringify({ test, status, detail }));
}
async function request(endpoint, { token, method = 'GET', body, schema, minimal = false } = {}) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (schema) headers[method === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = schema;
  if (method !== 'GET') headers.Prefer = minimal ? 'return=minimal' : 'return=representation';
  const response = await fetch(`${base}${endpoint}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, ok: response.ok, data, code: typeof data?.code === 'string' ? data.code : null };
}
const permissionDenied = r => [401, 403].includes(r.status) && r.code === '42501';
const privateDenied = r => permissionDenied(r) || (r.status === 406 && r.code === 'PGRST106');
async function anonymous() {
  const settings = await request('/auth/v1/settings');
  if (settings.ok && typeof settings.data?.disable_signup === 'boolean') {
    report('Auth: registro público deshabilitado', settings.data.disable_signup ? 'PASS' : 'FAIL');
    report('Auth: configuración pública observada', 'INFO', JSON.stringify({
      email: settings.data.external?.email,
      anonymousUsers: settings.data.external?.anonymous_users,
      mailerAutoconfirm: settings.data.mailer_autoconfirm,
    }));
  } else report('Auth settings', 'PENDING', `HTTP ${settings.status}`);
  const rpc = await request('/rest/v1/rpc/es_administrador_actual', { method: 'POST', body: {} });
  report('anon: RPC inaccesible', permissionDenied(rpc) ? 'PASS' : 'FAIL', `HTTP ${rpc.status}; code ${rpc.code}`);
  for (const table of ['alumnos', 'configuraciones_mensuales', 'cuotas', 'pagos']) {
    const r = await request(`/rest/v1/${table}?select=${table === 'configuraciones_mensuales' ? 'alumno_id' : 'id'}&limit=1`);
    report(`anon: lectura ${table}`, permissionDenied(r) ? 'PASS' : r.ok && Array.isArray(r.data) && r.data.length === 0 ? 'PENDING' : 'FAIL',
      `HTTP ${r.status}; code ${r.code}; una respuesta vacía no demuestra RLS`);
  }
  const privateRead = await request('/rest/v1/administradores?select=usuario_id&limit=1', { schema: 'rochy_privado' });
  report('anon: tabla privada inaccesible', privateDenied(privateRead) ? 'PASS' : 'FAIL', `HTTP ${privateRead.status}; code ${privateRead.code}`);
}
async function prompt(label, hidden = false) {
  process.stdout.write(label);
  const output = hidden ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : process.stdout;
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try { return await input.question(''); } finally { input.close(); if (hidden) process.stdout.write('\n'); }
}
async function login(label) {
  const email = await prompt(`${label} - correo: `);
  const password = await prompt(`${label} - contraseña (oculta): `, true);
  const r = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!r.ok || typeof r.data?.access_token !== 'string' || !r.data?.user?.id) throw new Error('login');
  return { token: r.data.access_token, userId: r.data.user.id };
}
const marker = 'TCF_RLS_AUDIT_ONLY';
async function snapshot(token, id) {
  const result = {};
  for (const table of ['alumnos', 'cuotas', 'pagos']) {
    const r = await request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`, { token });
    if (!r.ok || !Array.isArray(r.data) || r.data.length !== 1 || r.data[0].observaciones !== marker) throw new Error('fixture');
    result[table] = r.data[0];
  }
  if (result.cuotas.alumno_id !== id || result.pagos.cuota_id !== id) throw new Error('fixture relations');
  return result;
}
async function full() {
  if (!process.stdin.isTTY) throw new Error('Interactive terminal required');
  const admin = await login('Administrador de prueba');
  const member = await login('Usuario NO administrador');
  if (admin.userId === member.userId) throw new Error('Distinct accounts required');
  for (const [label, user, expected] of [['admin', admin, true], ['noadmin', member, false]]) {
    const r = await request('/rest/v1/rpc/es_administrador_actual', { token: user.token, method: 'POST', body: {} });
    report(`${label}: RPC booleana explícita`, r.ok && r.data === expected ? 'PASS' : 'FAIL');
    if (!r.ok || r.data !== expected) return;
  }
  const id = (await prompt('ID del fixture desechable tcf-rls-audit-UUID: ')).trim();
  if (!/^tcf-rls-audit-[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid fixture');
  const baseline = await snapshot(admin.token, id);
  report('admin: lectura positiva de tres fixtures conocidos', 'PASS');
  // Solo se permiten mutaciones dirigidas a datos sintéticos identificados y verificados.
  // Si RLS está rota, un DELETE puede eliminar un fixture. Nunca usar registros reales.
  const today = new Date().toISOString().slice(0, 10);
  const inserts = {
    alumnos: { id: `${id}-insert`, nombre: 'Prueba RLS', apellido: 'Desechable', modalidad: 'Online', fecha_ingreso: today, observaciones: marker },
    cuotas: { id: `${id}-insert`, alumno_id: id, concepto: `${id}-insert`, periodo: `${today.slice(0, 7)}-01`, importe: 100, vencimiento: today, observaciones: marker },
    pagos: { id: `${id}-insert`, cuota_id: id, importe: 1, fecha: today, medio: 'Otro', observaciones: marker },
  };
  for (const [label, token] of [['anon', undefined], ['noadmin', member.token]]) {
    for (const table of ['alumnos', 'cuotas', 'pagos']) {
      const endpoint = `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`;
      const r = await request(endpoint, { token });
      const hidden = permissionDenied(r) || (r.ok && Array.isArray(r.data) && r.data.length === 0);
      report(`${label}: SELECT ${table} con control positivo`, hidden ? 'PASS' : 'FAIL');
      if (!hidden) return;
      const insert = await request(`/rest/v1/${table}`, { token, method: 'POST', body: inserts[table] });
      // El trigger de pagos del esquema propuesto puede rechazar antes de RLS
      // porque la cuota no es visible. No aceptar otros errores como prueba válida.
      const deniedInsert = permissionDenied(insert) || (table === 'pagos' && insert.code === 'P0001' && insert.data?.message === 'La cuota no existe');
      report(`${label}: INSERT ${table}`, deniedInsert ? 'PASS' : 'FAIL', `HTTP ${insert.status}; code ${insert.code}`);
      if (!deniedInsert) return;
      for (const method of ['PATCH', 'DELETE']) {
        const changed = await request(endpoint, { token, method, body: method === 'PATCH' ? { observaciones: marker } : undefined });
        const denied = permissionDenied(changed) || (changed.ok && Array.isArray(changed.data) && changed.data.length === 0);
        // Verificar también que los tres fixtures sigan iguales con la sesión autorizada.
        const after = await snapshot(admin.token, id);
        const intact = JSON.stringify(after) === JSON.stringify(baseline);
        report(`${label}: ${method} ${table}, fixture intacto`, denied && intact ? 'PASS' : 'FAIL');
        if (!denied || !intact) return;
      }
    }
  }
  for (const [label, token] of [['anon', undefined], ['noadmin', member.token], ['admin', admin.token]]) {
    const r = await request('/rest/v1/administradores?select=usuario_id&limit=1', { token, schema: 'rochy_privado' });
    report(`${label}: esquema privado no expuesto`, r.code === 'PGRST106' && r.status === 406 ? 'PASS' : 'FAIL', `HTTP ${r.status}; code ${r.code}`);
    // Filtro imposible: no modificar miembros reales aunque haya una configuración insegura.
    for (const method of ['PATCH', 'DELETE']) {
      const r = await request('/rest/v1/administradores?usuario_id=eq.00000000-0000-0000-0000-000000000000', {
        token, schema: 'rochy_privado', method, body: method === 'PATCH' ? { activo: false } : undefined,
      });
      report(`${label}: ${method} lista privada rechazado por API`, privateDenied(r) ? 'PASS' : 'FAIL', `HTTP ${r.status}; code ${r.code}`);
    }
    const rInsert = await request('/rest/v1/administradores', { token, schema: 'rochy_privado', method: 'POST', body: { usuario_id: '00000000-0000-0000-0000-000000000000', activo: false } });
    report(`${label}: INSERT lista privada rechazado por API`, privateDenied(rInsert) ? 'PASS' : 'FAIL', `HTTP ${rInsert.status}; code ${rInsert.code}`);
  }
}
try {
  await anonymous();
  if (failures) throw new Error('Unsafe baseline');
  if (process.argv.includes('--full')) await full();
  else report('Sesiones autenticadas y mutaciones', 'PENDING', 'Ejecutar --full localmente con dos cuentas y fixtures desechables.');
} catch {
  report('Ejecución interrumpida', 'FAIL', 'No se pudo completar la comprobación; no se muestran detalles para proteger credenciales. Revisar conexión, cuentas y fixtures.');
}
process.exitCode = failures ? 1 : 0;
