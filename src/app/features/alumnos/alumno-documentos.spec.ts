import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AlumnoDocumentos } from './alumno-documentos';
import { AuthService } from '../../core/auth/auth-service';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { DescargasService } from '../../core/services/descargas-service';
import { ToastService } from '../../core/services/toast-service';
import { DocumentoAlumno } from '../../core/documentos-alumnos';

const config = {
  max_bytes: 10485760,
  max_archivos: 10,
  formatos: {
    pdf: 'application/pdf',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
  },
};
const doc: DocumentoAlumno = {
  id: 'd',
  alumno_id: 'a',
  nombre_original: 'Un documento con nombre muy largo.pdf',
  tipo_mime: 'application/pdf',
  tamano_bytes: 2048,
  storage_path: 'owner/61/d.pdf',
  creado_en: '2026-10-28T10:00:00Z',
  estado: 'disponible',
};
const selection = (files: File[]) => ({ files, value: 'seleccion' }) as unknown as HTMLInputElement;
describe('Documentos en ficha: interacción y respuestas tardías', () => {
  const listar = vi.fn(),
    subir = vi.fn(),
    eliminar = vi.fn(),
    descargar = vi.fn(),
    mostrar = vi.fn(),
    descargarBlob = vi.fn(),
    open = vi.fn();
  const session = signal<any>({ access_token: 'token' });
  beforeEach(() => {
    for (const fn of [listar, subir, eliminar, descargar, mostrar, descargarBlob, open])
      fn.mockReset();
    session.set({ access_token: 'token' });
    listar.mockResolvedValue({ config, documentos: [doc] });
    subir.mockResolvedValue(undefined);
    eliminar.mockResolvedValue(undefined);
    open.mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session } },
        { provide: DocumentosAlumnosRepository, useValue: { listar, subir, eliminar, descargar } },
        { provide: ToastService, useValue: { mostrar } },
        { provide: DescargasService, useValue: { descargarBlob } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
  });
  async function crear() {
    const f = TestBed.createComponent(AlumnoDocumentos);
    f.componentRef.setInput('alumno', 'a');
    await f.whenStable();
    return f;
  }
  it('lista y descarga con nombre original, carga varios formatos y evita doble envío', async () => {
    const f = await crear();
    const c = f.componentInstance;
    expect(listar).toHaveBeenCalledWith('a');
    const blob = new Blob(['contenido']);
    descargar.mockResolvedValue(blob);
    await c.descargar(doc);
    expect(descargarBlob).toHaveBeenCalledWith(doc.nombre_original, blob);
    let finish!: () => void;
    subir.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const files = [
      new File(['pdf'], 'a.pdf'),
      new File(['word'], 'a.doc'),
      new File(['sheet'], 'a.xlsx'),
      new File(['image'], 'a.png'),
    ];
    const input = selection(files);
    const pending = c.seleccionar(input);
    expect(c.ocupado()).toBe(true);
    expect(input.value).toBe('');
    await c.seleccionar(selection(files));
    expect(subir).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(subir).toHaveBeenCalledTimes(4);
    expect(mostrar).toHaveBeenCalledWith('4 documento(s) adjuntado(s).', 'exito');
    expect(c.ocupado()).toBe(false);
  });
  it('valida toda la selección antes de subir e informa cargas parciales sin éxito falso', async () => {
    const c = (await crear()).componentInstance;
    await c.seleccionar(selection([new File(['x'], 'a.pdf'), new File(['x'], 'a.exe')]));
    expect(subir).not.toHaveBeenCalled();
    expect(c.error()).toContain('permitido');
    await c.seleccionar(selection(Array.from({ length: 11 }, () => new File(['x'], 'a.pdf'))));
    expect(c.error()).toContain('10 archivos');
    subir.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('Error de red'));
    await c.seleccionar(selection([new File(['x'], 'a.pdf'), new File(['x'], 'b.pdf')]));
    expect(c.error()).toContain('1 de 2');
    expect(c.error()).toContain('Error de red');
    expect(mostrar).not.toHaveBeenCalled();
    expect(listar).toHaveBeenCalledTimes(2);
  });
  it('pide confirmación, maneja cancelación y no anuncia eliminación ante fallo parcial', async () => {
    const c = (await crear()).componentInstance;
    open.mockReturnValueOnce({ afterClosed: () => of(false) });
    await c.eliminar(doc);
    expect(eliminar).not.toHaveBeenCalled();
    expect(listar).toHaveBeenCalledTimes(1);
    eliminar.mockRejectedValueOnce(Error('La eliminación no se completó'));
    await c.eliminar(doc);
    expect(c.error()).toContain('no se completó');
    expect(mostrar).not.toHaveBeenCalled();
    await c.eliminar(doc);
    expect(mostrar).toHaveBeenCalledWith('Documento eliminado.', 'exito');
  });
  it('descarta consultas del alumno anterior, conserva filas al refrescar y limpia al cerrar sesión', async () => {
    const f = await crear();
    const c = f.componentInstance;
    await new Promise((resolve) => setTimeout(resolve, 800));
    let resolve!: (value: unknown) => void;
    listar.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const old = c.cargar();
    expect(c.documentos()).toEqual([doc]);
    expect(c.inicial()).toBe(false);
    listar.mockResolvedValue({ config, documentos: [] });
    f.componentRef.setInput('alumno', 'b');
    await f.whenStable();
    expect(listar).toHaveBeenLastCalledWith('b');
    expect(c.documentos()).toEqual([]);
    resolve({ config, documentos: [doc] });
    await old;
    expect(c.documentos()).toEqual([]);
    session.set(null);
    await f.whenStable();
    expect(c.documentos()).toEqual([]);
    expect(c.config()).toBeNull();
  });
  it('mantiene loading inicial, muestra vacío y permite recuperar error', async () => {
    listar.mockRejectedValueOnce(Error('Sin permisos'));
    const f = await crear();
    const c = f.componentInstance;
    expect(c.errorCarga()).toContain('permisos');
    expect(c.documentos()).toEqual([]);
    listar.mockResolvedValue({ config, documentos: [] });
    await c.cargar();
    expect(c.errorCarga()).toBe('');
    expect(c.documentos()).toEqual([]);
    expect(f.nativeElement.querySelector('input[type=file]').multiple).toBe(true);
  });
});
