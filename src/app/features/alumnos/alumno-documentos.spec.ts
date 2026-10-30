import { TestBed } from '@angular/core/testing';
import { provideRouter, withHashLocation } from '@angular/router';
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
  const session = signal<any>({ user: { id: 'owner' }, access_token: 'token' });
  beforeEach(() => {
    for (const fn of [listar, subir, eliminar, descargar, mostrar, descargarBlob, open])
      fn.mockReset();
    session.set({ user: { id: 'owner' }, access_token: 'token' });
    listar.mockResolvedValue({ config, documentos: [doc] });
    descargar.mockResolvedValue(new Blob(['original'], { type: 'application/pdf' }));
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:local-documento');
        static override revokeObjectURL = vi.fn();
      },
    );
    subir.mockResolvedValue(undefined);
    eliminar.mockResolvedValue(undefined);
    open.mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([], withHashLocation()),
        { provide: AuthService, useValue: { session } },
        {
          provide: DocumentosAlumnosRepository,
          useValue: { listar, subir, eliminar, descargar },
        },
        { provide: ToastService, useValue: { mostrar } },
        { provide: DescargasService, useValue: { descargarBlob } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  async function crear() {
    const f = TestBed.createComponent(AlumnoDocumentos);
    f.componentRef.setInput('alumno', 'a');
    await f.whenStable();
    return f;
  }
  it('abre el original desde desktop y mobile sin navegar por Angular ni descargar el PDF', async () => {
    const f = await crear();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await f.whenStable();
    f.detectChanges();
    const replace = vi.fn(),
      close = vi.fn();
    const ventana = { opener: {}, location: { replace }, close, closed: false };
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    try {
      const botones = f.nativeElement.querySelectorAll(
        '.document-open',
      ) as NodeListOf<HTMLButtonElement>;
      expect(botones.length).toBe(2);
      for (const boton of Array.from(botones)) {
        boton.click();
        expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
        await f.whenStable();
      }
      expect(abrir.mock.invocationCallOrder[0]).toBeLessThan(descargar.mock.invocationCallOrder[0]);
      expect(ventana.opener).toBeNull();
      expect(replace).toHaveBeenCalledWith('blob:local-documento');
      expect(close).not.toHaveBeenCalled();
      expect(descargar).toHaveBeenCalledTimes(2);
      expect(listar).toHaveBeenCalledTimes(1);
      expect(f.componentInstance.documentos()).toEqual([doc]);
      expect(f.componentInstance.inicial()).toBe(false);
      expect(descargarBlob).not.toHaveBeenCalled();
      expect(f.nativeElement.querySelector('[routerLink], iframe, app-documento-visor')).toBeNull();
    } finally {
      abrir.mockRestore();
    }
  });
  it('informa ventanas bloqueadas y cierra la pestaña vacía si falla el acceso', async () => {
    const c = (await crear()).componentInstance;
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      await c.abrir(doc);
      expect(c.error()).toContain('bloque');
      expect(descargar).not.toHaveBeenCalled();
      const close = vi.fn(),
        replace = vi.fn();
      abrir.mockReturnValue({
        opener: {},
        close,
        closed: false,
        location: { replace },
      } as unknown as Window);
      descargar.mockRejectedValueOnce(Error('Sin acceso al archivo'));
      await c.abrir(doc);
      expect(close).toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(c.error()).toContain('permisos');
      expect(c.ocupado()).toBe(false);
    } finally {
      abrir.mockRestore();
    }
  });
  it('descarta la apertura pendiente y cierra la pestaña al salir de sesión', async () => {
    const f = await crear();
    const close = vi.fn(),
      replace = vi.fn();
    const abrir = vi.spyOn(window, 'open').mockReturnValue({
      opener: {},
      close,
      closed: false,
      location: { replace },
    } as unknown as Window);
    let resolve!: (blob: Blob) => void;
    descargar.mockReturnValueOnce(new Promise<Blob>((r) => (resolve = r)));
    try {
      const pendiente = f.componentInstance.abrir(doc);
      session.set(null);
      await f.whenStable();
      expect(close).toHaveBeenCalled();
      resolve(new Blob(['privado']));
      await pendiente;
      expect(replace).not.toHaveBeenCalled();
    } finally {
      abrir.mockRestore();
    }
  });
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
    expect(mostrar).toHaveBeenCalledWith('4 documentos adjuntados', 'exito');
    expect(c.ocupado()).toBe(false);
  });
  it('conserva listado y skeleton al abrir, descargar, reenfocar y renovar token del mismo usuario', async () => {
    const f = await crear();
    const c = f.componentInstance;
    await new Promise((resolve) => setTimeout(resolve, 800));
    await f.whenStable();
    const lista = c.documentos(),
      configuracion = c.config();
    const ventana = { opener: null, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    try {
      for (let i = 0; i < 3; i++) {
        await c.abrir(doc);
        await c.descargar(doc);
        session.set({ user: { id: 'owner' }, access_token: 'token-' + i });
        window.dispatchEvent(new Event('focus'));
        await f.whenStable();
        expect(c.documentos()).toBe(lista);
        expect(c.config()).toBe(configuracion);
        expect(c.cargando()).toBe(false);
        expect(c.inicial()).toBe(false);
      }
      expect(listar).toHaveBeenCalledTimes(1);
      expect(descargar).toHaveBeenCalledTimes(6);
      await c.cargar();
      expect(listar).toHaveBeenCalledTimes(2);
    } finally {
      abrir.mockRestore();
    }
  });
  it.each(['doc', 'xls'])(
    'descarga %s nativamente sin pestaña ni recarga de listado',
    async (ext) => {
      const c = (await crear()).componentInstance;
      const abrir = vi.spyOn(window, 'open');
      try {
        await c.abrir({ ...doc, nombre_original: 'Archivo.' + ext });
        expect(abrir).not.toHaveBeenCalled();
        expect(descargarBlob).toHaveBeenCalledWith('Archivo.' + ext, expect.any(Blob));
        expect(listar).toHaveBeenCalledTimes(1);
      } finally {
        abrir.mockRestore();
      }
    },
  );
  it('revoca la URL al cerrar la pestaña y al destruir la ficha, sin revocarla prematuramente', async () => {
    const f = await crear();
    vi.useFakeTimers();
    const ventana = { opener: null, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    try {
      await f.componentInstance.abrir(doc);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      ventana.closed = true;
      vi.advanceTimersByTime(1000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-documento');
      ventana.closed = false;
      await f.componentInstance.abrir(doc);
      f.destroy();
      expect(ventana.close).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    } finally {
      abrir.mockRestore();
      vi.useRealTimers();
    }
  });
  it.each(['docx', 'xlsx'])(
    'abre %s en una pestaña interna sin consultar ni refrescar documentos',
    async (ext) => {
      const c = (await crear()).componentInstance;
      const replace = vi.fn(),
        close = vi.fn();
      const ventana = { opener: {}, closed: false, close, location: { replace } };
      const abrir = vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
      const lista = c.documentos();
      try {
        await c.abrir({ ...doc, nombre_original: 'Informe.' + ext });
        await c.abrir({ ...doc, nombre_original: 'Informe.' + ext });
        expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
        expect(ventana.opener).toBeNull();
        expect(replace).toHaveBeenCalledWith(expect.stringContaining('/#/documentos/d'));
        expect(descargar).not.toHaveBeenCalled();
        expect(descargarBlob).not.toHaveBeenCalled();
        expect(listar).toHaveBeenCalledTimes(1);
        expect(c.documentos()).toBe(lista);
        expect(close).not.toHaveBeenCalled();
      } finally {
        abrir.mockRestore();
      }
    },
  );
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
    expect(c.error()).toBe('1 de 2 archivos confirmados. Ocurrió un error. Intentá nuevamente.');
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
    expect(c.error()).toBe('Ocurrió un error. Intentá nuevamente.');
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
