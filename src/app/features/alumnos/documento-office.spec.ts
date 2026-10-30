import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { MatSelect } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { DocumentoOffice } from './documento-office';
import { AuthService } from '../../core/auth/auth-service';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { DescargasService } from '../../core/services/descargas-service';

const lectores = vi.hoisted(() => ({ parse: vi.fn(), render: vi.fn(), excel: vi.fn() }));
vi.mock('docx-preview', () => ({ parseAsync: lectores.parse, renderDocument: lectores.render }));
vi.mock('read-excel-file/browser', () => ({ default: lectores.excel }));
describe('Pestaña Office privada', () => {
  const session = signal<any>({ user: { id: 'owner' }, access_token: 'token' });
  const obtener = vi.fn(),
    descargar = vi.fn(),
    descargarBlob = vi.fn(),
    listar = vi.fn();
  const doc = {
    id: 'id',
    nombre_original: 'Informe.docx',
    estado: 'disponible',
    storage_path: 'owner/id.docx',
  };
  beforeEach(() => {
    session.set({ user: { id: 'owner' }, access_token: 'token' });
    obtener.mockReset().mockResolvedValue(doc);
    descargar.mockReset().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) });
    descargarBlob.mockReset();
    listar.mockReset();
    lectores.parse.mockReset().mockResolvedValue({});
    lectores.render.mockReset().mockImplementation(async () => [document.createElement('section')]);
    lectores.excel.mockReset().mockResolvedValue([
      { sheet: 'Enero', data: [['Cuota', 1200]] },
      { sheet: 'Febrero', data: [['<script>no ejecutar</script>', false]] },
    ]);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:word-local');
        static override revokeObjectURL = vi.fn();
      },
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'id' })) } },
        { provide: AuthService, useValue: { session } },
        { provide: DocumentosAlumnosRepository, useValue: { obtener, descargar, listar } },
        { provide: DescargasService, useValue: { descargarBlob } },
      ],
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  async function crear() {
    const f = TestBed.createComponent(DocumentoOffice);
    await f.whenStable();
    await vi.waitFor(() => expect(f.componentInstance.cargando()).toBe(false));
    await f.whenStable();
    f.detectChanges();
    return f;
  }
  it('renderiza Word en sandbox y bloquea contenido activo; no lista ni descarga automáticamente', async () => {
    const f = await crear();
    const frame = f.nativeElement.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('src')).toBe('blob:word-local');
    expect(lectores.parse).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ breakPages: true, renderAltChunks: false, useBase64URL: true }),
    );
    expect(listar).not.toHaveBeenCalled();
    expect(descargarBlob).not.toHaveBeenCalled();
    session.set({ user: { id: 'owner' }, access_token: 'refrescado' });
    await f.whenStable();
    expect(obtener).toHaveBeenCalledTimes(1);
    session.set(null);
    await f.whenStable();
    expect(f.componentInstance.wordUrl()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:word-local');
  });
  it('permite navegar entre hojas sin volver a descargar y escapa las celdas', async () => {
    obtener.mockResolvedValue({ ...doc, nombre_original: 'Planilla.xlsx' });
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('1200');
    const select = f.debugElement.query(By.directive(MatSelect)).componentInstance as MatSelect;
    select.selectionChange.emit({ value: 1, source: select });
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('<script>no ejecutar</script>');
    expect(f.nativeElement.querySelector('script')).toBeNull();
    expect(descargar).toHaveBeenCalledTimes(1);
    expect(listar).not.toHaveBeenCalled();
  });
  it('permite elegir la hoja con teclado y cerrar la pestaña', async () => {
    obtener.mockResolvedValue({ ...doc, nombre_original: 'Planilla.xlsx' });
    const f = await crear();
    const select = f.nativeElement.querySelector('mat-select') as HTMLElement;
    const tecla = (key: string, keyCode: number) =>
      select.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
    select.focus();
    tecla('Enter', 13);
    await f.whenStable();
    expect(document.querySelector('[role=listbox]')).not.toBeNull();
    tecla('ArrowDown', 40);
    tecla('Enter', 13);
    await f.whenStable();
    expect(f.componentInstance.indice()).toBe(1);
    expect(f.componentInstance.hoja()?.nombre).toBe('Febrero');
    const cerrar = vi.spyOn(window, 'close').mockImplementation(() => {});
    f.componentInstance.cerrar();
    expect(cerrar).toHaveBeenCalled();
    expect(f.componentInstance.hojas()).toEqual([]);
    cerrar.mockRestore();
  });
  it('ofrece descarga autenticada si la previsualización falla', async () => {
    lectores.parse.mockRejectedValue(Error('contenido inválido'));
    const f = await crear();
    expect(f.componentInstance.error()).toContain('descargá el original');
    await f.componentInstance.descargar();
    expect(descargar).toHaveBeenCalledTimes(2);
    expect(descargarBlob).toHaveBeenCalledWith(doc.nombre_original, expect.anything());
  });
  it('no accede sin sesión ni muestra respuestas tardías al cerrar', async () => {
    session.set(null);
    const f = await crear();
    expect(obtener).not.toHaveBeenCalled();
    session.set({ user: { id: 'owner' }, access_token: 'token' });
    let resolve!: (value: unknown) => void;
    descargar.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await f.whenStable();
    const cerrar = vi.spyOn(window, 'close').mockImplementation(() => {});
    f.componentInstance.cerrar();
    resolve({ arrayBuffer: async () => new ArrayBuffer(0) });
    await f.whenStable();
    expect(f.componentInstance.wordUrl()).toBeNull();
    expect(cerrar).toHaveBeenCalled();
    cerrar.mockRestore();
  });
});
