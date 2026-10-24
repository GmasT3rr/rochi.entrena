import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const sql = readFileSync(
  new URL('../docs/database/005-aislamiento-por-usuario.sql', import.meta.url),
  'utf8',
);
test('005 es una transacción única con asignación explícita y aborta ante huecos', () => {
  assert.equal((sql.match(/^begin;/gm) ?? []).length, 1);
  assert.doesNotMatch(sql, /\bdo\s+\$(?!\$)/i);
  assert.equal((sql.match(/^commit;/gm) ?? []).length, 1);
  assert.match(sql, /asignacion_alumnos/);
  assert.match(sql, /asignacion_historial/);
  assert.match(sql, /where propietario_id is null/);
  assert.doesNotMatch(sql, /disable row level security|truncate|delete from|on delete cascade/i);
});
test('conserva firmas de RPC y comprueba aislamiento además de RLS', () => {
  for (const name of [
    'guardar_alumno_con_configuracion',
    'leer_cuentas_administrativas',
    'previsualizar_cuotas_mensuales',
    'generar_cuotas_mensuales',
  ]) {
    assert.equal(
      (sql.match(new RegExp('create or replace function public\\.' + name + '\\(', 'g')) ?? [])
        .length,
      1,
    );
  }
  assert.match(sql, /as restrictive for all/);
  assert.match(sql, /auth\.uid\(\)::text \|\| ':' \|\| p_periodo/);
  assert.match(sql, /c\.propietario_id = auth\.uid\(\) order by c\.alumno_id for update/);
  assert.match(sql, /on conflict on constraint cuotas_alumno_periodo_concepto_unique do nothing/);
});
test('blinda relaciones, auditoría y cambio de dueño', () => {
  for (const relation of ['propietario_id,alumno_id', 'propietario_id,cuota_id'])
    assert.ok(sql.includes('foreign key(' + relation + ')'));
  assert.match(sql, /NEW\.propietario_id is distinct from OLD\.propietario_id/);
  assert.match(sql, /historial_aislamiento/);
  assert.match(sql, /auth\.uid\(\),coalesce\(despues->>'propietario_id'/);
});
// Revisión estática solamente: NO ejecuta PostgreSQL ni prueba el comportamiento real de RLS.
