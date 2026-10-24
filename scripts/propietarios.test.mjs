import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('mapas: ninguna asignación automática, validación completa y escape SQL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tcf-mapas-'));
  const inventario = join(dir, 'inventario.private.json'),
    mapas = join(dir, 'mapas.private.json'),
    sql = join(dir, '005.private.sql');
  const uuid = '10000000-0000-4000-8000-000000000001';
  const inv = {
    version: 1,
    usuarios: [{ usuario_id: uuid, email: 'a@test.invalid', administrador_activo: true }],
    alumnos: [{ alumno_id: "id'con-comilla" }],
    historial: [{ historial_id: '1' }],
  };
  const run = (...args) =>
    spawnSync(process.execPath, ['scripts/preparar-propietarios.mjs', ...args], {
      encoding: 'utf8',
    });
  try {
    writeFileSync(inventario, JSON.stringify(inv));
    assert.equal(run('plantilla', inventario, mapas).status, 0);
    const plantilla = JSON.parse(readFileSync(mapas, 'utf8'));
    assert.equal(plantilla.alumnos[0].propietario_id, null);
    assert.equal(plantilla.historial[0].propietario_id, null);
    assert.notEqual(run('validar', inventario, mapas).status, 0);
    for (const lista of [plantilla.alumnos, plantilla.historial])
      for (const fila of lista) fila.propietario_id = uuid;
    writeFileSync(mapas, JSON.stringify(plantilla));
    assert.equal(run('validar', inventario, mapas, sql).status, 0);
    assert.ok(readFileSync(sql, 'utf8').includes("id''con-comilla"));
    assert.notEqual(run('validar', inventario, mapas, sql).status, 0); // no sobrescribe
    inv.usuarios[0].administrador_activo = false;
    writeFileSync(inventario, JSON.stringify(inv));
    assert.notEqual(run('validar', inventario, mapas).status, 0);
  } finally {
    for (const file of [inventario, mapas, sql])
      try {
        unlinkSync(file);
      } catch {}
    rmdirSync(dir);
  }
});
