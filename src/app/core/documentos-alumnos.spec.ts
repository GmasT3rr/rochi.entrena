import { carpetaAlumno, ConfigDocumentos, validarDocumento } from './documentos-alumnos';

export const configPrueba: ConfigDocumentos = {
  max_bytes: 10485760,
  max_archivos: 10,
  formatos: {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  },
};
describe('Validación de documentos', () => {
  it.each(Object.entries(configPrueba.formatos))('admite %s con su MIME', (ext, mime) => {
    expect(
      validarDocumento(
        new File(['contenido de prueba'], `Documento.${ext}`, { type: mime }),
        configPrueba,
      ),
    ).toBe(ext);
  });
  it.each([
    '../a.pdf',
    'a\\b.pdf',
    'a.exe.pdf',
    'a.docm',
    'a.svg',
    'a.constructor',
    'a.pdf.',
    'a?.pdf',
    'a\u202e.pdf',
    '',
    'a'.repeat(181) + '.pdf',
  ])('rechaza nombre o formato peligroso: %s', (nombre) => {
    expect(() => validarDocumento(new File(['x'], nombre), configPrueba)).toThrow();
  });
  it('rechaza vacío, exceso de tamaño y MIME diferente; admite MIME ausente o genérico', () => {
    expect(() => validarDocumento(new File([], 'a.pdf'), configPrueba)).toThrow('vacíos');
    expect(() =>
      validarDocumento(new File(['xx'], 'a.pdf'), { ...configPrueba, max_bytes: 1 }),
    ).toThrow('límite');
    expect(() =>
      validarDocumento(
        new File(['x'], 'a.pdf', { type: 'application/x-msdownload' }),
        configPrueba,
      ),
    ).toThrow('El contenido no coincide');
    expect(validarDocumento(new File(['x'], 'a.PDF'), configPrueba)).toBe('pdf');
    expect(
      validarDocumento(
        new File(['x'], 'a.pdf', { type: 'application/octet-stream' }),
        configPrueba,
      ),
    ).toBe('pdf');
  });
  it('codifica IDs históricos como un único segmento reversible sin rutas', () => {
    expect(carpetaAlumno('a/b')).toBe('612f62');
    expect(carpetaAlumno('ñ')).toBe('c3b1');
  });
});
