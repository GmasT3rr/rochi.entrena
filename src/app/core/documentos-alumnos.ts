export const DOCUMENTOS_BUCKET = 'documentos-alumnos';
export interface ConfigDocumentos {
  max_bytes: number;
  max_archivos: number;
  formatos: Record<string, string>;
}
export interface DocumentoAlumno {
  id: string;
  alumno_id: string;
  nombre_original: string;
  tipo_mime: string;
  tamano_bytes: number;
  storage_path: string;
  creado_en: string;
  estado: 'disponible' | 'sin_archivo' | 'sin_metadatos';
}
export interface ListaDocumentos {
  config: ConfigDocumentos;
  documentos: DocumentoAlumno[];
}
export function validarDocumento(file: File, config: ConfigDocumentos): string {
  const nombre = file.name;
  if (
    !nombre.trim() ||
    nombre.length > 180 ||
    /[\x00-\x1f\x7f/\\<>:"|?*\u202a-\u202e\u2066-\u2069]/u.test(nombre) ||
    nombre.includes('..') ||
    /[. ]$/.test(nombre)
  )
    throw Error(
      'El nombre del archivo no es válido (máximo 180 caracteres, sin rutas ni caracteres especiales).',
    );
  const ext = nombre.split('.').pop()!.toLowerCase();
  const mime = Object.hasOwn(config.formatos, ext) ? config.formatos[ext] : undefined;
  if (!mime || /\.(exe|com|bat|cmd|ps1|js|vbs|scr|msi|html|svg|docm|xlsm)(\.|$)/i.test(nombre))
    throw Error('Formato de archivo no permitido.');
  if (!Number.isSafeInteger(file.size) || file.size <= 0)
    throw Error('No se permiten archivos vacíos.');
  if (file.size > config.max_bytes) throw Error('El archivo supera el límite permitido.');
  if (file.type && file.type !== 'application/octet-stream' && file.type.toLowerCase() !== mime)
    throw Error('El tipo MIME no coincide con la extensión del archivo.');
  return ext;
}
export function carpetaAlumno(alumno: string): string {
  return Array.from(new TextEncoder().encode(alumno), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
}
