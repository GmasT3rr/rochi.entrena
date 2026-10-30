import { ErrorUsuario, ERROR_DESCONOCIDO, mensajeError } from './mensajes-usuario';
import { errorAgenda } from '../../features/calendario/agenda-supabase';
import { errorFinanciero } from './cuentas-remotas-service';

describe('Mensajes seguros para usuarios', () => {
  it.each([
    null,
    undefined,
    'SQL privado',
    new Error('token privado'),
    new TypeError('dato privado'),
    { message: 'Storage privado', stack: 'secreto' },
  ])('oculta errores desconocidos: %s', (error) =>
    expect(mensajeError(error)).toBe(ERROR_DESCONOCIDO),
  );
  it.each([
    [{ code: '42501' }, 'permisos'],
    [{ status: 403 }, 'permisos'],
    [{ code: '23505' }, 'ya existe'],
    [{ code: '40001' }, 'Los datos cambiaron'],
    [{ code: '23514' }, 'Revisá'],
    [new TypeError('Failed to fetch'), 'conexión'],
    [{ name: 'TimeoutError' }, 'conexión'],
  ])('traduce errores conocidos sin mostrar texto del servidor', (error, texto) => {
    expect(mensajeError(error)).toContain(texto);
  });
  it('conserva las validaciones controladas de la aplicación', () => {
    expect(mensajeError(new ErrorUsuario('Elegí al menos un alumno.'))).toBe(
      'Elegí al menos un alumno.',
    );
  });
  it.each(['23514', '22023', 'P0001', '23P01', '23505', '40001', '42P01', 'desconocido'])(
    'Agenda no expone mensajes técnicos para %s',
    (code) => {
      const mensaje = errorAgenda({ code, message: 'SQL token privado' }).message;
      expect(mensaje).not.toMatch(/SQL|token|privado/);
    },
  );
  it('Finanzas oculta errores desconocidos', () => {
    expect(errorFinanciero(new Error('SQL privado'))).toBe(ERROR_DESCONOCIDO);
  });
});
