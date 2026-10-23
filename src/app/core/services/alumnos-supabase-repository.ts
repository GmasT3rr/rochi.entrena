import { inject, Injectable } from '@angular/core';
import { AlumnoRegistro, ConfiguracionMensual, esAlumno } from '../alumno';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';

const seleccion =
  'id,nombre,apellido,telefono,email,modalidad,estado,fecha_ingreso,observaciones,proxima_cuota_original,configuracion_mensual:configuraciones_mensuales!configuraciones_mensuales_alumno_id_fkey(importe,dia_vencimiento,habilitada)';

export function mapearAlumno(fila: Record<string, any>): AlumnoRegistro {
  let config = fila['configuracion_mensual'];
  if (Array.isArray(config)) {
    if (config.length > 1) throw new Error('Configuración ambigua');
    config = config[0];
  }
  const alumno = {
    id: fila['id'],
    nombre: fila['nombre'],
    apellido: fila['apellido'],
    telefono: fila['telefono'],
    email: fila['email'],
    modalidad: fila['modalidad'],
    estado: fila['estado'],
    fechaIngreso: fila['fecha_ingreso'],
    observaciones: fila['observaciones'],
    ...(fila['proxima_cuota_original'] == null
      ? {}
      : { proximaCuota: fila['proxima_cuota_original'] }),
    ...(config == null
      ? {}
      : {
          configuracionMensual: {
            importe: config.importe,
            diaVencimiento: config.dia_vencimiento,
            habilitada: config.habilitada,
          },
        }),
  };
  if (!esAlumno(alumno)) throw new Error('Respuesta de alumnos inválida');
  return alumno;
}

@Injectable({ providedIn: 'root' })
export class AlumnosSupabaseRepository {
  private readonly auth = inject(AuthService);
  private readonly authorization = inject(AdminAuthorization);
  private async ejecutar<T>(
    operacion: (client: NonNullable<typeof authRuntime.client>) => PromiseLike<T>,
  ): Promise<T> {
    const token = this.auth.session()?.access_token;
    if (
      !token ||
      this.auth.recovery() ||
      this.auth.initializationError() ||
      !(await this.authorization.verify())
    )
      throw { code: '42501' };
    if (this.auth.session()?.access_token !== token || !authRuntime.client) throw { code: '42501' };
    const result = await operacion(authRuntime.client);
    if (this.auth.session()?.access_token !== token) throw { code: '42501' };
    return result;
  }
  async listar(): Promise<AlumnoRegistro[]> {
    return this.ejecutar(async (client) => {
      const alumnos: AlumnoRegistro[] = [];
      for (let inicio = 0; ;) {
        const { data, error, count } = await client
          .from('alumnos')
          .select(seleccion, { count: 'exact' })
          .order('id')
          .range(inicio, inicio + 499)
          .abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        if (!Array.isArray(data) || typeof count !== 'number')
          throw { code: 'TCF_RESPUESTA_INVALIDA' };
        alumnos.push(...data.map(mapearAlumno));
        inicio += data.length;
        if (inicio >= count) return alumnos;
        if (data.length === 0) throw { code: 'TCF_RESPUESTA_INVALIDA' };
      }
    });
  }
  async obtener(id: string): Promise<AlumnoRegistro | null> {
    return this.ejecutar(async (client) => {
      const { data, error } = await client
        .from('alumnos')
        .select(seleccion)
        .eq('id', id)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle();
      if (error) throw error;
      return data ? mapearAlumno(data) : null;
    });
  }
  async guardar(alumno: AlumnoRegistro, crear: boolean): Promise<AlumnoRegistro> {
    return this.ejecutar(async (client) => {
      const { data, error } = await client
        .rpc('guardar_alumno_con_configuracion', {
          p_id: alumno.id,
          p_crear: crear,
          p_datos: {
            nombre: alumno.nombre,
            apellido: alumno.apellido,
            telefono: alumno.telefono,
            email: alumno.email,
            modalidad: alumno.modalidad,
            estado: alumno.estado,
            fecha_ingreso: alumno.fechaIngreso,
            observaciones: alumno.observaciones,
            configuracion_mensual: alumno.configuracionMensual
              ? {
                  importe: alumno.configuracionMensual.importe,
                  dia_vencimiento: alumno.configuracionMensual.diaVencimiento,
                  habilitada: alumno.configuracionMensual.habilitada,
                }
              : null,
          },
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (!data || Array.isArray(data) || typeof data !== 'object')
        throw new Error('Respuesta inválida');
      const guardado = mapearAlumno(data);
      if (guardado.id !== alumno.id) throw new Error('ID de respuesta inválido');
      return guardado;
    });
  }
  async cambiarEstado(id: string, estado: 'Activo' | 'Inactivo'): Promise<AlumnoRegistro> {
    return this.ejecutar(async (client) => {
      const { data, error } = await client
        .from('alumnos')
        .update({ estado })
        .eq('id', id)
        .select(seleccion)
        .abortSignal(AbortSignal.timeout(15000))
        .single();
      if (error) throw error;
      return mapearAlumno(data);
    });
  }
  async consultarConfiguracion(id: string): Promise<ConfiguracionMensual | undefined> {
    return (await this.obtener(id))?.configuracionMensual;
  }
}
