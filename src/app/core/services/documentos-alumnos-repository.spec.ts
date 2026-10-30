import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { DocumentosAlumnosRepository } from './documentos-alumnos-repository';
import { DocumentoAlumno } from '../documentos-alumnos';
import { StorageClient } from '@supabase/storage-js';

const config = { max_bytes: 10485760, max_archivos: 10, formatos: { pdf: 'application/pdf' } };
const documento: DocumentoAlumno = {
  id: 'id',
  alumno_id: 'a',
  nombre_original: 'Original.pdf',
  tipo_mime: 'application/pdf',
  tamano_bytes: 1,
  storage_path: 'owner/61/id.pdf',
  creado_en: '2026-10-28T10:00:00Z',
  estado: 'disponible',
};
describe('Documentos: protocolo Storage/SQL con SDK simulado (no prueba RLS real)', () => {
  const upload = vi.fn(),
    remove = vi.fn(),
    download = vi.fn(),
    insert = vi.fn(),
    rpc = vi.fn(),
    maybeSingle = vi.fn(),
    verify = vi.fn();
  const session = signal<any>({ user: { id: 'owner' }, access_token: 'token' });
  let repo: DocumentosAlumnosRepository;
  beforeEach(() => {
    for (const fn of [upload, remove, download, insert, rpc, maybeSingle, verify]) fn.mockReset();
    session.set({ user: { id: 'owner' }, access_token: 'token' });
    verify.mockResolvedValue(true);
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    insert.mockResolvedValue({ error: null });
    maybeSingle.mockResolvedValue({ error: null, data: null });
    rpc.mockResolvedValue({ error: null });
    const query: any = { insert, maybeSingle };
    query.select = () => query;
    query.eq = () => query;
    authRuntime.client = {
      storage: { from: () => ({ upload, remove, download }) },
      from: () => query,
      rpc,
    } as never;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { session, recovery: signal(false), initializationError: signal('') },
        },
        { provide: AdminAuthorization, useValue: { verify } },
      ],
    });
    repo = TestBed.inject(DocumentosAlumnosRepository);
  });
  afterEach(() => {
    authRuntime.client = null;
  });
  it('obtiene solo los metadatos solicitados bajo autorización, sin RPC de listado', async () => {
    maybeSingle.mockResolvedValueOnce({ data: documento, error: null });
    expect(await repo.obtener(documento.id)).toEqual(documento);
    expect(rpc).not.toHaveBeenCalled();
    verify.mockResolvedValueOnce(false);
    await expect(repo.obtener(documento.id)).rejects.toThrow('permisos');
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(repo.obtener('inexistente')).rejects.toThrow('disponible');
  });
  it.each(['pdf', 'png', 'docx', 'xlsx'])(
    'obtiene %s con download autenticado sin consultas de listado',
    async (ext) => {
      const blob = new Blob(['original']);
      download.mockResolvedValue({ data: blob, error: null });
      expect(await repo.descargar({ ...documento, nombre_original: 'Original.' + ext })).toBe(blob);
      expect(download).toHaveBeenCalledWith(documento.storage_path, {}, { cache: 'no-store' });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it('rechaza descargas sin sesion, permisos, archivo o si cambia la sesion', async () => {
    session.set(null);
    await expect(repo.descargar(documento)).rejects.toThrow('permisos');
    session.set({ user: { id: 'owner' }, access_token: 'token' });
    verify.mockResolvedValueOnce(false);
    await expect(repo.descargar(documento)).rejects.toThrow('permisos');
    await expect(repo.descargar({ ...documento, estado: 'sin_archivo' })).rejects.toThrow(
      'disponible',
    );
    expect(download).not.toHaveBeenCalled();
    download.mockImplementationOnce(async () => {
      session.set(null);
      return { data: new Blob(['privado']), error: null };
    });
    await expect(repo.descargar(documento)).rejects.toThrow(/cambi/);
  });
  it('el SDK solicita bytes por la ruta privada con Authorization y sin cache ni firma', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const storage = new StorageClient(
      'https://storage.example.test/storage/v1',
      { Authorization: 'Bearer synthetic-test-credential' },
      async (url, init) => {
        requests.push({ url: String(url), init: init! });
        return new Response('synthetic-file', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
    );
    download.mockImplementationOnce((path, options, parameters) =>
      storage.from('documentos-alumnos').download(path, options, parameters),
    );
    const blob = await repo.descargar(documento);
    expect(blob.type).toBe('application/pdf');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      'https://storage.example.test/storage/v1/object/documentos-alumnos/' + documento.storage_path,
    );
    expect(new Headers(requests[0].init.headers).get('Authorization')).toBe(
      'Bearer synthetic-test-credential',
    );
    expect(requests[0].init.cache).toBe('no-store');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('usa ruta UUID sin nombre original, upsert false y luego inserta metadatos', async () => {
    await repo.subir('a/b', new File(['x'], 'Original.pdf', { type: 'application/pdf' }), config);
    const [path, archivo, options] = upload.mock.calls[0];
    expect(path).toMatch(/^owner\/612f62\/[0-9a-f-]{36}\.pdf$/);
    expect(path).not.toContain('Original');
    expect(options.upsert).toBe(false);
    expect(options.metadata).toEqual({ nombre_original: 'Original.pdf' });
    expect(options.contentType).toBe('application/pdf');
    expect(archivo.size).toBe(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_path: path,
        nombre_original: 'Original.pdf',
        alumno_id: 'a/b',
        propietario_id: 'owner',
        tipo_mime: options.contentType,
        tamano_bytes: archivo.size,
      }),
    );
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(insert.mock.invocationCallOrder[0]);
  });
  it('compensa un error SQL y conserva una recuperación si también falla Storage', async () => {
    insert.mockResolvedValue({ error: { code: 'network' } });
    await expect(repo.subir('a', new File(['x'], 'a.pdf'), config)).rejects.toThrow(
      'No se pudo adjuntar el documento',
    );
    expect(remove).toHaveBeenCalledOnce();
    remove.mockResolvedValue({ error: { message: 'offline' } });
    await expect(repo.subir('a', new File(['x'], 'a.pdf'), config)).rejects.toThrow('pendiente');
  });
  it.each(['', 'application/octet-stream', 'application/pdf'])(
    'el multipart real del SDK conserva bytes, metadata y MIME compatible (origen=%s)',
    async (tipo) => {
      const peticiones: { url: string; init: RequestInit }[] = [];
      const storage = new StorageClient(
        'https://storage.example.test/storage/v1',
        {},
        async (url, init) => {
          peticiones.push({ url: String(url), init: init! });
          return new Response(JSON.stringify({ Key: 'documentos-alumnos/prueba', Id: 'id' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      );
      upload.mockImplementation((path, body, opciones) =>
        storage.from('documentos-alumnos').upload(path, body, opciones),
      );
      const file = new File([new Uint8Array([1, 2, 3, 255])], 'Original.pdf', { type: tipo });
      await repo.subir('a/b', file, config);
      expect(peticiones).toHaveLength(1);
      const cuerpo = peticiones[0].init.body as FormData;
      const archivo = cuerpo.get('') as File;
      expect(archivo.type).toBe('application/pdf');
      expect(archivo.size).toBe(file.size);
      const leer = (blob: Blob) =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as ArrayBuffer);
          r.onerror = () => reject(r.error);
          r.readAsArrayBuffer(blob);
        });
      expect(new Uint8Array(await leer(archivo))).toEqual(new Uint8Array(await leer(file)));
      expect(JSON.parse(cuerpo.get('metadata') as string)).toEqual({ nombre_original: file.name });
      expect(peticiones[0].url).toMatch(
        /\/object\/documentos-alumnos\/owner\/612f62\/[0-9a-f-]{36}\.pdf$/,
      );
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          alumno_id: 'a/b',
          tamano_bytes: 4,
          tipo_mime: archivo.type,
          nombre_original: file.name,
        }),
      );
    },
  );
  it('no borra un archivo si el INSERT se confirmó pese a perderse la respuesta', async () => {
    insert.mockResolvedValue({ error: {} });
    maybeSingle.mockResolvedValue({ data: { id: 'id' }, error: null });
    await repo.subir('a', new File(['x'], 'a.pdf'), config);
    expect(remove).not.toHaveBeenCalled();
  });
  it('no borra cuando no puede determinar si el INSERT se confirmó', async () => {
    insert.mockResolvedValue({ error: {} });
    maybeSingle.mockResolvedValue({ data: null, error: {} });
    await expect(repo.subir('a', new File(['x'], 'a.pdf'), config)).rejects.toThrow('pendiente');
    expect(remove).not.toHaveBeenCalled();
  });
  it('reconoce un archivo confirmado en un reintento sin volver a subir ni insertar', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    vi.spyOn(repo, 'listar').mockResolvedValue({
      config,
      documentos: [{ ...documento, id, storage_path: `owner/61/${id}.pdf` }],
    });
    await repo.subir('a', new File(['x'], 'Original.pdf'), config, { id, reintento: true });
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
  it('completa metadatos de una carga interrumpida reutilizando el objeto, sin sobrescribir', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    vi.spyOn(repo, 'listar').mockResolvedValue({
      config,
      documentos: [
        { ...documento, id, storage_path: `owner/61/${id}.pdf`, estado: 'sin_metadatos' },
      ],
    });
    await repo.subir('a', new File(['x'], 'Original.pdf'), config, { id, reintento: true });
    expect(upload).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });
  it('detiene SQL si falla la subida y avisa de posible respuesta perdida', async () => {
    upload.mockResolvedValue({ error: {} });
    await expect(repo.subir('a', new File(['x'], 'a.pdf'), config)).rejects.toThrow('Actualizá');
    expect(insert).not.toHaveBeenCalled();
  });
  it('elimina primero el objeto, finaliza por RPC y permite repetir la operación', async () => {
    await repo.eliminar(documento);
    await repo.eliminar(documento);
    expect(remove).toHaveBeenCalledWith([documento.storage_path]);
    expect(rpc).toHaveBeenCalledWith('finalizar_eliminacion_documento', {
      p_alumno: 'a',
      p_path: documento.storage_path,
    });
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });
  it('no confirma eliminación si falla Storage o la finalización SQL', async () => {
    remove.mockResolvedValueOnce({ error: {} });
    await expect(repo.eliminar(documento)).rejects.toThrow('eliminar');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: {} });
    await expect(repo.eliminar(documento)).rejects.toThrow('no se completó');
  });
  it('descarga autenticada devuelve el Blob original y maneja falta de acceso', async () => {
    const blob = new Blob(['original']);
    download.mockResolvedValueOnce({ data: blob, error: null });
    expect(await repo.descargar(documento)).toBe(blob);
    download.mockResolvedValueOnce({ data: null, error: {} });
    await expect(repo.descargar(documento)).rejects.toThrow('permiso');
  });
  it('bloquea operaciones sin autorización y al cambiar sesión durante la subida', async () => {
    verify.mockResolvedValueOnce(false);
    await expect(repo.eliminar(documento)).rejects.toThrow('permisos');
    expect(remove).not.toHaveBeenCalled();
    upload.mockImplementation(async () => {
      session.set(null);
      return { error: null };
    });
    await expect(repo.subir('a', new File(['x'], 'a.pdf'), config)).rejects.toThrow('sesión');
    expect(insert).not.toHaveBeenCalled();
  });
});
