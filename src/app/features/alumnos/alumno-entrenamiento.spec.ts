import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { AlumnoEntrenamiento } from './alumno-entrenamiento';
import { AuthService } from '../../core/auth/auth-service';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import { perfilVacio } from '../../core/perfil-entrenamiento';
import { PerfilCargaError } from '../../core/services/perfil-carga-error';
const perfil = {
  ...perfilVacio(),
  id: 'p',
  propietario_id: 'owner',
  alumno_id: 'a',
  creado_en: '2026-10-28T10:00:00Z',
  actualizado_en: '2026-10-28T10:00:00Z',
  realiza_cardio: false,
  agua_litros_dia: 0,
  ciudad: 'Rosario',
};
describe('Consulta del perfil de entrenamiento', () => {
  const obtener = vi.fn(),
    open = vi.fn(),
    session = signal<any>({ access_token: 'token' });
  beforeEach(() => {
    obtener.mockReset().mockResolvedValue(perfil);
    open.mockReset();
    session.set({ access_token: 'token' });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session } },
        { provide: PerfilesEntrenamientoRepository, useValue: { obtener } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
  });
  async function crear() {
    const f = TestBed.createComponent(AlumnoEntrenamiento);
    f.componentRef.setInput('alumno', 'a');
    await f.whenStable();
    return f;
  }
  it('muestra solo campos informados y conserva No/cero; aplica resultado de edición sin otra consulta', async () => {
    const f = await crear(),
      c = f.componentInstance;
    expect(
      c
        .secciones()
        .flatMap((s) => s.campos)
        .map((c) => c.clave),
    ).toEqual(['ciudad', 'realiza_cardio', 'agua_litros_dia']);
    expect(c.valor({ clave: 'realiza_cardio', label: 'Cardio', tipo: 'booleano' })).toBe('No');
    expect(
      c.valor({ clave: 'agua_litros_dia', label: 'Agua', tipo: 'numero', unidad: 'litros' }),
    ).toBe('0 litros');
    const cerrado = new Subject<boolean>();
    const editor = { resultado: { ...perfil, ciudad: 'Córdoba' } };
    open.mockReturnValue({ componentInstance: editor, afterClosed: () => cerrado });
    c.editar();
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { alumno: 'a', perfil } }),
    );
    cerrado.next(true);
    expect(c.perfil()?.ciudad).toBe('Córdoba');
    expect(obtener).toHaveBeenCalledTimes(1);
  });
  it('distingue perfil pendiente de error de carga y no abre edición tras un error', async () => {
    obtener.mockResolvedValueOnce(null);
    const f = await crear(),
      c = f.componentInstance;
    expect(c.cargado()).toBe(true);
    expect(c.secciones()).toEqual([]);
    await new Promise((r) => setTimeout(r, 800));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain(
      'Este alumno todavía no tiene un perfil de entrenamiento.',
    );
    expect(f.nativeElement.textContent).toContain('Completar perfil');
    expect(f.nativeElement.querySelector('[role=alert]')).toBeNull();
    obtener.mockRejectedValueOnce(Error('Red'));
    await c.cargar();
    c.editar();
    expect(c.error()).toContain('cargar');
    expect(open).not.toHaveBeenCalled();
    expect(c.perfil()).toBeNull();
  });
  it('descarta respuestas tardías al cambiar alumno y al cerrar sesión', async () => {
    const f = await crear(),
      c = f.componentInstance;
    let resolve!: (v: unknown) => void;
    obtener.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const consulta = c.cargar();
    expect(c.perfil()).toEqual(perfil);
    obtener.mockResolvedValue(null);
    f.componentRef.setInput('alumno', 'b');
    await f.whenStable();
    resolve(perfil);
    await consulta;
    expect(c.perfil()).toBeNull();
    expect(obtener).toHaveBeenLastCalledWith('b');
    session.set(null);
    await f.whenStable();
    expect(c.perfil()).toBeNull();
    expect(c.cargado()).toBe(false);
  });
  it('una actualización conserva el perfil sin reinstalar skeleton una vez cargado', async () => {
    const f = await crear(),
      c = f.componentInstance;
    await new Promise((r) => setTimeout(r, 800));
    let resolve!: (v: unknown) => void;
    obtener.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const consulta = c.cargar();
    f.detectChanges();
    expect(c.inicial()).toBe(false);
    expect(c.perfil()).toEqual(perfil);
    expect(f.nativeElement.querySelector('app-loading-layout')).toBeNull();
    resolve(perfil);
    await consulta;
  });
  it.each([
    [404, 'PGRST205'],
    [403, '42501'],
    [0, ''],
  ])('distingue error real HTTP %s / %s del perfil inexistente', async (status, codigo) => {
    obtener.mockRejectedValueOnce(new PerfilCargaError({ code: String(codigo) }, Number(status)));
    const f = await crear(),
      c = f.componentInstance;
    await new Promise((r) => setTimeout(r, 800));
    f.detectChanges();
    expect(c.diagnostico()?.http).toBe(status || null);
    expect(f.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Este alumno todavía no tiene');
    expect(f.nativeElement.textContent).toContain(String(codigo || 'TCF_RED'));
    c.editar();
    expect(open).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('Reintentar');
  });
});
