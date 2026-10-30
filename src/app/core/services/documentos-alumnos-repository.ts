import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import {
  carpetaAlumno,
  ConfigDocumentos,
  DocumentoAlumno,
  DOCUMENTOS_BUCKET,
  ListaDocumentos,
  validarDocumento,
} from '../documentos-alumnos';

@Injectable({ providedIn: 'root' })
export class DocumentosAlumnosRepository {
  private readonly auth = inject(AuthService);
  private readonly authorization = inject(AdminAuthorization);
  private async contexto() {
    const session = this.auth.session();
    if (
      !session ||
      this.auth.recovery() ||
      this.auth.initializationError() ||
      !(await this.authorization.verify()) ||
      !authRuntime.client ||
      this.auth.session()?.access_token !== session.access_token
    )
      throw Error('No tenés permisos para acceder a los documentos.');
    const client = authRuntime.client;
    const vigente = () => {
      if (
        this.auth.session()?.access_token !== session.access_token ||
        this.auth.recovery() ||
        this.auth.initializationError()
      )
        throw Error('La sesión cambió. Volvé a abrir la ficha.');
    };
    return { client, session, vigente };
  }
  async listar(alumno: string): Promise<ListaDocumentos> {
    const { client, vigente } = await this.contexto();
    const { data, error } = await client
      .rpc('listar_documentos_alumno', { p_alumno: alumno })
      .abortSignal(AbortSignal.timeout(20000));
    vigente();
    if (error || !data)
      throw Error(
        'No se pudieron cargar los documentos. Revisá la conexión, los permisos y la instalación de la migración 012.',
      );
    return data as ListaDocumentos;
  }
  async configuracion(): Promise<ConfigDocumentos> {
    const { client, vigente } = await this.contexto();
    const { data, error } = await client
      .rpc('obtener_configuracion_documentos')
      .abortSignal(AbortSignal.timeout(20000));
    vigente();
    if (error || !data)
      throw Error(
        'No se pudo habilitar la selección de documentos. Reintentá o adjuntalos después desde la ficha.',
      );
    return data as ConfigDocumentos;
  }
  async subir(
    alumno: string,
    file: File,
    config: ConfigDocumentos,
    operacion?: { id: string; reintento: boolean },
  ): Promise<void> {
    const ext = validarDocumento(file, config);
    const { client, session, vigente } = await this.contexto();
    const id = operacion?.id ?? crypto.randomUUID();
    const path = `${session.user.id}/${carpetaAlumno(alumno)}/${id}.${ext}`;
    const bucket = client.storage.from(DOCUMENTOS_BUCKET);
    let objetoExistente = false;
    if (operacion?.reintento) {
      const lista = await this.listar(alumno);
      vigente();
      const previo = lista.documentos.find((d) => d.storage_path === path);
      if (previo) {
        if (
          previo.nombre_original !== file.name ||
          previo.tamano_bytes !== file.size ||
          previo.tipo_mime !== config.formatos[ext]
        )
          throw Error(
            'El documento pendiente no coincide con el seleccionado. Revisalo en la ficha.',
          );
        if (previo.estado === 'disponible') return;
        objetoExistente = previo.estado === 'sin_metadatos';
      }
    }
    if (!objetoExistente) {
      // El SDK usa el MIME del Blob en multipart, no fileOptions.contentType.
      // Normalizarlo tras validar permite archivos sin MIME o con octet-stream,
      // conservando exactamente los bytes/tamaño y el nombre original en metadata.
      const contenido = file.slice(0, file.size, config.formatos[ext]);
      const { error: uploadError } = await bucket.upload(path, contenido, {
        upsert: false,
        contentType: config.formatos[ext],
        cacheControl: '0',
        metadata: { nombre_original: file.name },
      });
      // A network timeout can leave an object committed. The server listing also
      // returns objects without SQL metadata, so cleanup remains possible on reload.
      if (uploadError)
        throw Error(
          'No se confirmó la subida. Actualizá la lista antes de reintentar; si aparece un archivo pendiente, eliminá ese registro.',
        );
    }
    vigente();
    const { error } = await client.from('documentos_alumnos').insert({
      id,
      alumno_id: alumno,
      propietario_id: session.user.id,
      nombre_original: file.name,
      tipo_mime: config.formatos[ext],
      tamano_bytes: file.size,
      storage_path: path,
    });
    if (error) {
      vigente();
      // Check whether the insert committed despite a lost response before compensating.
      const probe = await client.from('documentos_alumnos').select('id').eq('id', id).maybeSingle();
      vigente();
      if (!probe.error && probe.data) return;
      if (!probe.error) {
        const cleanup = await bucket.remove([path]);
        vigente();
        if (!cleanup.error)
          throw Error(
            'No se guardaron los metadatos. Se solicitó retirar el archivo; actualizá la lista para verificar.',
          );
      }
      throw Error(
        'La subida quedó pendiente de verificación. Actualizá la lista y eliminá el documento pendiente antes de volver a adjuntarlo.',
      );
    }
    vigente();
  }
  async obtener(id: string): Promise<DocumentoAlumno> {
    const { client, vigente } = await this.contexto();
    const { data, error } = await client
      .from('documentos_alumnos')
      .select('id,alumno_id,nombre_original,tipo_mime,tamano_bytes,storage_path,creado_en')
      .eq('id', id)
      .maybeSingle();
    vigente();
    if (error || !data) throw Error('Documento no disponible o sin permiso de acceso.');
    return { ...data, estado: 'disponible' } as DocumentoAlumno;
  }
  async descargar(doc: DocumentoAlumno): Promise<Blob> {
    if (doc.estado !== 'disponible') throw Error('El archivo no está disponible.');
    const { client, vigente } = await this.contexto();
    const { data, error } = await client.storage
      .from(DOCUMENTOS_BUCKET)
      .download(doc.storage_path, {}, { cache: 'no-store' });
    vigente();
    if (error || !data)
      throw Error('No se pudo descargar el archivo. Puede no existir o no tenés permiso.');
    return data;
  }
  async eliminar(doc: DocumentoAlumno): Promise<void> {
    const { client, vigente } = await this.contexto();
    const bucket = client.storage.from(DOCUMENTOS_BUCKET);
    const { error } = await bucket.remove([doc.storage_path]);
    vigente();
    if (error)
      throw Error('No se pudo eliminar el archivo. Podés reintentar sin duplicar la operación.');
    // RPC checks object absence before deleting SQL metadata. Also handles an
    // already deleted record, so a partial delete can safely be retried.
    const result = await client.rpc('finalizar_eliminacion_documento', {
      p_alumno: doc.alumno_id,
      p_path: doc.storage_path,
    });
    vigente();
    if (result.error)
      throw Error(
        'La eliminación no se completó. Actualizá la lista y reintentá la limpieza del registro.',
      );
  }
}
