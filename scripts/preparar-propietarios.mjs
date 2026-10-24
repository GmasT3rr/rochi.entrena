// Sin red. No elige propietarios: crea plantilla vacía o valida decisiones explícitas.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const [modo, origen, mapaPath, salida] = process.argv.slice(2);
const json = async (path) => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const privado = (path) => {
  assert.match(
    path ?? '',
    /\.private\.(json|sql)$/i,
    'La salida debe ser .private.json o .private.sql',
  );
  return path;
};
try {
  const inventario = await json(origen);
  assert.equal(inventario.version, 1);
  assert.ok(Array.isArray(inventario.usuarios));
  if (modo === 'plantilla') {
    const mapa = {
      alumnos: inventario.alumnos.map((a) => ({ alumno_id: a.alumno_id, propietario_id: null })),
      historial: inventario.historial.map((h) => ({
        historial_id: String(h.historial_id),
        propietario_id: null,
      })),
    };
    await writeFile(privado(mapaPath), JSON.stringify(mapa, null, 2) + '\n', { flag: 'wx' });
    console.log(
      'Plantilla privada creada: completar TODOS los UUID manualmente. No se asignó ninguno.',
    );
  } else if (modo === 'validar') {
    const mapa = await json(mapaPath);
    const usuarios = new Map(inventario.usuarios.map((u) => [u.usuario_id, u]));
    for (const [table, key] of [
      ['alumnos', 'alumno_id'],
      ['historial', 'historial_id'],
    ]) {
      assert.ok(Array.isArray(mapa[table]));
      const ids = new Set(inventario[table].map((x) => String(x[key]))),
        vistos = new Set();
      for (const fila of mapa[table]) {
        const id = String(fila[key]);
        assert.ok(ids.has(id) && !vistos.has(id), 'ID inexistente o duplicado en ' + table);
        vistos.add(id);
        assert.equal(typeof fila.propietario_id, 'string', 'Falta propietario en ' + table);
        const usuario = usuarios.get(fila.propietario_id);
        assert.ok(
          usuario && usuario.email && usuario.administrador_activo === true,
          'Propietario no es usuario Auth con email y administrador activo del inventario',
        );
      }
      assert.equal(vistos.size, ids.size, 'Mapa incompleto: ' + table);
    }
    console.log(
      'Mapas completos. Antes de ejecutar, cotejar UUID/email con el operador; el inventario no prueba vigencia remota.',
    );
    if (salida) {
      let sql = await readFile(
        new URL('../docs/database/005-aislamiento-por-usuario.sql', import.meta.url),
        'utf8',
      );
      for (const table of ['alumnos', 'historial']) {
        const payload = JSON.stringify(mapa[table]).replaceAll("'", "''");
        assert.ok(sql.includes("jsonb_to_recordset('[]'::jsonb)"), 'No se encontró marcador');
        sql = sql.replace(
          "jsonb_to_recordset('[]'::jsonb)",
          () => `jsonb_to_recordset('${payload}'::jsonb)`,
        );
      }
      await writeFile(privado(salida), sql, { flag: 'wx' });
      console.log('Copia SQL privada preparada. No se ejecutó ni se modificó 005 original.');
    }
  } else throw Error('modo');
} catch {
  console.error(
    'No se generó una asignación válida. Uso: node scripts/preparar-propietarios.mjs plantilla inventario.private.json mapas.private.json | validar inventario.private.json mapas.private.json [005-revisada.private.sql]. Revisar IDs, UUID, cobertura y autorización. No se sobrescriben archivos.',
  );
  process.exitCode = 1;
}
