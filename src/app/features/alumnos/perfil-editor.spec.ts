import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PerfilEditor } from './perfil-editor';
import { PerfilCampos } from './perfil-campos';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import { ToastService } from '../../core/services/toast-service';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
import { CAMPOS_PERFIL, perfilVacio } from '../../core/perfil-entrenamiento';
const perfil = {
  ...perfilVacio(),
  id: 'p',
  alumno_id: 'a',
  propietario_id: 'owner',
  creado_en: '2026-10-28T10:00:00Z',
  actualizado_en: '2026-10-28T10:00:00Z',
  objetivos: 'Fuerza',
  compromiso_asistencia: false,
};
describe('Controles y edición del perfil compartidos con el alta', () => {
  const guardar = vi.fn(),
    close = vi.fn(),
    mostrar = vi.fn();
  beforeEach(() => {
    guardar.mockReset().mockResolvedValue(perfil);
    close.mockReset();
    mostrar.mockReset();
  });
  async function editor(inicial: any = perfil) {
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { alumno: 'a', perfil: inicial } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: PerfilesEntrenamientoRepository, useValue: { guardar } },
        { provide: ToastService, useValue: { mostrar } },
        { provide: CambiosPendientes, useValue: { proteger: vi.fn() } },
      ],
    });
    const f = TestBed.createComponent(PerfilEditor);
    await f.whenStable();
    return f;
  }
  it('inicia sin valores inventados y valida el mismo formulario en alta/edición', async () => {
    const f = TestBed.createComponent(PerfilCampos);
    await f.whenStable();
    const c = f.componentInstance;
    expect(c.datos()).toEqual(perfilVacio());
    expect(c.validar()).toBe(true);
    expect(Object.keys(c.form.controls)).toHaveLength(17);
    c.form.get('altura_cm')!.setValue(0);
    expect(c.validar()).toBe(false);
    c.form.get('altura_cm')!.setValue(null);
    expect(c.validar()).toBe(true);
  });
  it('carga los valores existentes, permite limpiar opcionales y envía la versión leída', async () => {
    const f = await editor(),
      c = f.componentInstance,
      campos = c.campos()!;
    expect(campos.datos().compromiso_asistencia).toBe(false);
    expect(campos.datos().objetivos).toBe('Fuerza');
    campos.form.get('objetivos')!.setValue('');
    await c.guardar();
    expect(guardar).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ objetivos: null, compromiso_asistencia: false }),
      perfil.actualizado_en,
    );
    expect(close).toHaveBeenCalledWith(true);
  });
  it('guarda un perfil completo con todos los campos opcionales sin duplicar tiempo entrenando', async () => {
    const f = await editor(null),
      c = f.componentInstance;
    for (const campo of CAMPOS_PERFIL) {
      const valor =
        campo.tipo === 'numero'
          ? campo.min! > 0
            ? campo.min!
            : 1
          : campo.tipo === 'booleano'
            ? false
            : campo.tipo === 'selector'
              ? campo.opciones![0]!
              : 'Declarado por el alumno';
      c.campos()!.form.get(campo.clave)!.setValue(valor);
    }
    await c.guardar();
    expect(guardar).toHaveBeenCalledWith('a', expect.anything(), null);
    expect(Object.values(guardar.mock.calls[0][1]).every((v) => v !== null)).toBe(true);
  });
  it('no cierra ni borra los valores si falla el guardado y bloquea el doble envío', async () => {
    const f = await editor(),
      c = f.componentInstance;
    let resolve!: (v: any) => void;
    guardar.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const pending = c.guardar();
    await c.guardar();
    expect(guardar).toHaveBeenCalledTimes(1);
    resolve(perfil);
    await pending;
    guardar.mockRejectedValueOnce(Error('Conflicto de versión'));
    close.mockClear();
    mostrar.mockClear();
    await c.guardar();
    expect(c.error()).toBe('Ocurrió un error. Intentá nuevamente.');
    expect(c.campos()!.datos().objetivos).toBe('Fuerza');
    expect(close).not.toHaveBeenCalled();
    expect(mostrar).not.toHaveBeenCalled();
  });
});
