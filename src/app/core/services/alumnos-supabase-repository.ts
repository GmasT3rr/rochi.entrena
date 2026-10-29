import { inject, Injectable } from '@angular/core';
import { AlumnoRegistro, ConfiguracionMensual, esAlumno } from '../alumno';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { fechaArgentina } from './cuentas-remotas-service';
import { CuentasSnapshot, mapearCuentas, VersionFinanciera } from './cuentas-supabase-repository';

export interface AjusteMensualActual {
  periodo: string;
  cuotaId: string | null;
  versionCuota?: VersionFinanciera;
  versionConfiguracion: string | null;
}

const seleccion =
  'id,nombre,apellido,telefono,email,modalidad,estado,fecha_ingreso,observaciones,proxima_cuota_original,configuracion_mensual:configuraciones_mensuales!configuraciones_mensuales_alumno_id_fkey(*)';

function errorOperacion(
  error: { code?: string; message?: string },
  status: number | undefined,
  operacion: string,
  recurso: string,
) {
  return { ...error, status, operacion, recurso };
}

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
            ...(typeof config.actualizado_en === 'string'
              ? { actualizadoEn: config.actualizado_en }
              : {}),
            ...(config.periodo_inicio == null
              ? {}
              : { periodoInicio: config.periodo_inicio.slice(0, 7) }),
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
  private inicioMensualDisponible: boolean | undefined;
  // Solo se consulta al guardar una configuración que solicita el campo nuevo.
  // Un fallo de Auth/RLS/red nunca se interpreta como una columna opcional ausente.
  private async admiteInicioMensual(
    client: NonNullable<typeof authRuntime.client>,
  ): Promise<boolean> {
    if (this.inicioMensualDisponible !== undefined) return this.inicioMensualDisponible;
    const { error, status } = await client
      .from('configuraciones_mensuales')
      .select('periodo_inicio')
      .limit(0)
      .abortSignal(AbortSignal.timeout(15000));
    if (error) {
      if (error.code === '42703' && error.message.includes('periodo_inicio')) {
        this.inicioMensualDisponible = false;
        return false;
      }
      throw errorOperacion(error, status, 'Comprobar inicio mensual', 'configuraciones_mensuales');
    }
    this.inicioMensualDisponible = true;
    return true;
  }
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
        const { data, error, count, status } = await client
          .from('alumnos')
          .select(seleccion, { count: 'exact' })
          .order('id')
          .range(inicio, inicio + 499)
          .abortSignal(AbortSignal.timeout(15000));
        if (error)
          throw errorOperacion(
            error,
            status,
            'Listar alumnos',
            'alumnos / configuraciones_mensuales',
          );
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
      const { data, error, status } = await client
        .from('alumnos')
        .select(seleccion)
        .eq('id', id)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle();
      if (error)
        throw errorOperacion(
          error,
          status,
          'Obtener alumno',
          'alumnos / configuraciones_mensuales',
        );
      return data ? mapearAlumno(data) : null;
    });
  }
  async guardar(
    alumno: AlumnoRegistro,
    crear: boolean,
    primerPeriodo?: string,
  ): Promise<AlumnoRegistro> {
    if (
      primerPeriodo !== undefined &&
      (!crear ||
        !alumno.configuracionMensual?.habilitada ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(primerPeriodo) ||
        primerPeriodo < '1900-01' ||
        primerPeriodo > '9999-12')
    )
      throw { code: '22023' };
    return this.ejecutar(async (client) => {
      const inicio = alumno.configuracionMensual?.periodoInicio;
      const enviarInicio = inicio !== undefined && (await this.admiteInicioMensual(client));
      // En el esquema anterior el mes de la primera cuota sigue viajando por p_periodo.
      // No descartar silenciosamente un inicio distinto del predeterminado sin esa RPC.
      if (
        inicio !== undefined &&
        !enviarInicio &&
        primerPeriodo === undefined &&
        inicio !== fechaArgentina().slice(0, 7)
      ) {
        throw {
          code: 'TCF_ESQUEMA_MENSUAL',
          message: 'El esquema actual no permite guardar un período de inicio personalizado.',
          operacion: 'Guardar configuración mensual',
          recurso: 'configuraciones_mensuales.periodo_inicio',
        };
      }
      const { data, error, status } = await client
        .rpc(
          primerPeriodo === undefined
            ? 'guardar_alumno_con_configuracion'
            : 'crear_alumno_con_primera_cuota',
          {
            p_id: alumno.id,
            ...(primerPeriodo === undefined ? { p_crear: crear } : { p_periodo: primerPeriodo }),
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
                    ...(enviarInicio
                      ? { periodo_inicio: alumno.configuracionMensual.periodoInicio }
                      : {}),
                  }
                : null,
            },
          },
        )
        .abortSignal(AbortSignal.timeout(15000));
      if (error)
        throw errorOperacion(
          error,
          status,
          'Guardar alumno',
          primerPeriodo === undefined
            ? 'guardar_alumno_con_configuracion'
            : 'crear_alumno_con_primera_cuota',
        );
      if (!data || Array.isArray(data) || typeof data !== 'object')
        throw new Error('Respuesta inválida');
      const guardado = mapearAlumno(data);
      if (guardado.id !== alumno.id) throw new Error('ID de respuesta inválido');
      return guardado;
    });
  }
  async cambiarEstado(id: string, estado: 'Activo' | 'Inactivo'): Promise<AlumnoRegistro> {
    return this.ejecutar(async (client) => {
      const { data, error, status } = await client
        .from('alumnos')
        .update({ estado })
        .eq('id', id)
        .select(seleccion)
        .abortSignal(AbortSignal.timeout(15000))
        .single();
      if (error) throw errorOperacion(error, status, 'Cambiar estado del alumno', 'alumnos');
      return mapearAlumno(data);
    });
  }
  async ajustarMensual(
    id: string,
    config: ConfiguracionMensual,
    ajuste: AjusteMensualActual,
  ): Promise<{ alumno: AlumnoRegistro; cuentas: CuentasSnapshot }> {
    return this.ejecutar(async (client) => {
      const { data, error, status } = await client
        .rpc('ajustar_configuracion_y_cuota_actual', {
          p_alumno: id,
          p_configuracion: {
            habilitada: config.habilitada,
            importe: config.importe,
            dia_vencimiento: config.diaVencimiento,
            ...(config.periodoInicio ? { periodo_inicio: config.periodoInicio } : {}),
          },
          p_periodo: ajuste.periodo,
          p_version_configuracion: ajuste.versionConfiguracion,
          p_cuota: ajuste.cuotaId,
          p_actualizado_cuota: ajuste.versionCuota?.actualizadoEn ?? null,
          p_revision_cuota: ajuste.versionCuota?.revision ?? null,
        })
        .abortSignal(AbortSignal.timeout(20000));
      if (error)
        throw errorOperacion(
          error,
          status,
          'Ajustar configuración y cuota actual',
          'ajustar_configuracion_y_cuota_actual',
        );
      if (!data || typeof data !== 'object' || !data.alumno || !data.cuentas)
        throw { code: 'TCF_RESPUESTA_INVALIDA' };
      const alumno = mapearAlumno(data.alumno);
      if (alumno.id !== id) throw { code: 'TCF_RESPUESTA_INVALIDA' };
      return { alumno, cuentas: mapearCuentas(data.cuentas) };
    });
  }
  async consultarConfiguracion(id: string): Promise<ConfiguracionMensual | undefined> {
    return (await this.obtener(id))?.configuracionMensual;
  }
}
