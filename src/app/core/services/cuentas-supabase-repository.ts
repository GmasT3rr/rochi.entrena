import { CobroDirecto, validarCobroDirecto } from '../cobros-directos';
import { inject, Injectable } from '@angular/core';
import { AlumnoRegistro } from '../alumno';
import { CuentasData, Cuota, PagoCuota, validarCuentas } from '../cuentas';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { periodoValido } from '../cuentas';
import {
  leerResultadoMensual,
  leerVistaMensual,
  ResultadoMensual,
  VistaMensualRemota,
} from '../mensual';

export type AlumnoFinanciero = Pick<
  AlumnoRegistro,
  'id' | 'nombre' | 'apellido' | 'modalidad' | 'estado'
>;
export interface VersionFinanciera {
  actualizadoEn: string;
  revision?: string;
}
export interface CuentasSnapshot extends CuentasData {
  cobrosDirectos?: CobroDirecto[];
  versionesCobros?: Record<string, VersionFinanciera>;
  alumnos: AlumnoFinanciero[];
  versionesCuotas: Record<string, VersionFinanciera>;
  versionesPagos: Record<string, VersionFinanciera>;
}
export function mapearCuentas(raw: any): CuentasSnapshot {
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.alumnos) ||
    !Array.isArray(raw.cuotas) ||
    !Array.isArray(raw.pagos)
  )
    throw { code: 'TCF_DATOS' };
  const versionesCuotas: Record<string, VersionFinanciera> = Object.create(null);
  const versionesPagos: Record<string, VersionFinanciera> = Object.create(null);
  function version(row: any, cuota: boolean): VersionFinanciera {
    if (
      typeof row.actualizado_en !== 'string' ||
      !Number.isFinite(Date.parse(row.actualizado_en)) ||
      (cuota && (typeof row.revision !== 'string' || !/^\d+$/.test(row.revision)))
    )
      throw { code: 'TCF_DATOS' };
    return { actualizadoEn: row.actualizado_en, ...(cuota ? { revision: row.revision } : {}) };
  }
  const cuotas: Cuota[] = raw.cuotas.map((c: any) => {
    if (typeof c.periodo !== 'string' || !/^\d{4}-\d{2}-01$/.test(c.periodo))
      throw { code: 'TCF_DATOS' };
    versionesCuotas[c.id] = version(c, true);
    return {
      id: c.id,
      alumnoId: c.alumno_id,
      concepto: c.concepto,
      periodo: c.periodo.slice(0, 7),
      importe: c.importe,
      vencimiento: c.vencimiento,
      observaciones: c.observaciones,
    };
  });
  const pagos: PagoCuota[] = raw.pagos.map((p: any) => {
    versionesPagos[p.id] = version(p, false);
    return {
      id: p.id,
      cuotaId: p.cuota_id,
      importe: p.importe,
      fecha: p.fecha,
      medio: p.medio,
      observaciones: p.observaciones,
    };
  });
  const result: CuentasSnapshot = {
    version: 1,
    cuotas,
    pagos,
    cobrosDirectos: (raw.cobros_directos ?? []).map((c: any) => {
      const cobro = {
        id: c.id,
        alumnoId: c.alumno_id,
        concepto: c.concepto,
        importe: c.importe,
        fecha: c.fecha,
        medio: c.medio,
        observaciones: c.observaciones,
      };
      validarCobroDirecto(cobro);
      if (!raw.alumnos.some((a: any) => a.id === cobro.alumnoId)) throw { code: 'TCF_DATOS' };
      return cobro;
    }),
    versionesCobros: Object.fromEntries(
      (raw.cobros_directos ?? []).map((c: any) => [c.id, version(c, false)]),
    ),
    alumnos: raw.alumnos,
    versionesCuotas,
    versionesPagos,
  };
  validarCuentas(result);
  const ids = new Set<string>();
  for (const a of result.alumnos) {
    if (
      !a ||
      typeof a.id !== 'string' ||
      !a.id ||
      ids.has(a.id) ||
      typeof a.nombre !== 'string' ||
      typeof a.apellido !== 'string' ||
      !['Presencial', 'Online'].includes(a.modalidad) ||
      !['Activo', 'En pausa', 'Inactivo'].includes(a.estado)
    )
      throw { code: 'TCF_DATOS' };
    ids.add(a.id);
  }
  if (cuotas.some((c) => !ids.has(c.alumnoId))) throw { code: 'TCF_DATOS' };
  return result;
}

@Injectable({ providedIn: 'root' })
export class CuentasSupabaseRepository {
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
  async cargar(): Promise<CuentasSnapshot> {
    return this.ejecutar(async (client) => {
      const { data, error } = await client
        .rpc('leer_cuentas_administrativas')
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      return mapearCuentas(data);
    });
  }
  async previsualizarMensual(periodo: string): Promise<VistaMensualRemota> {
    if (!periodoValido(periodo)) throw { code: 'TCF_MENSUAL_PERIODO' };
    return this.ejecutar(async (client) => {
      const { data, error } = await client
        .rpc('previsualizar_cuotas_mensuales', { p_periodo: periodo })
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw error.code === 'PGRST202' ? { code: 'TCF_MENSUAL_RPC' } : error;
      const vista = leerVistaMensual(data);
      if (vista.periodo !== periodo) throw { code: 'TCF_MENSUAL_DATOS' };
      return vista;
    });
  }
  async generarMensual(periodo: string, huella: string): Promise<ResultadoMensual> {
    if (!periodoValido(periodo) || !/^[a-f0-9]{32}$/.test(huella))
      throw { code: 'TCF_MENSUAL_PERIODO' };
    return this.ejecutar(async (client) => {
      // El cliente no envía importes ni IDs para insertar: el servidor decide el lote.
      const { data, error } = await client
        .rpc('generar_cuotas_mensuales', { p_periodo: periodo, p_huella: huella })
        .abortSignal(AbortSignal.timeout(30000));
      if (error) {
        if (error.code === 'PGRST202') throw { code: 'TCF_MENSUAL_RPC' };
        if (error.code === 'P0001' && error.message === 'VISTA_MENSUAL_DESACTUALIZADA')
          throw { code: 'TCF_MENSUAL_DESACTUALIZADA' };
        throw error;
      }
      const resultado = leerResultadoMensual(data);
      if (resultado.periodo !== periodo) throw { code: 'TCF_MENSUAL_DATOS' };
      return resultado;
    });
  }
  private async escribir(
    tabla: 'cuotas' | 'pagos' | 'cobros_directos',
    id: string,
    payload: object | null,
    crear: boolean,
    version?: VersionFinanciera,
  ): Promise<void> {
    return this.ejecutar(async (client) => {
      if (!crear && !version) throw { code: 'TCF_CONFLICTO' };
      if (!crear && tabla === 'cuotas' && !version?.revision) throw { code: 'TCF_CONFLICTO' };
      let query = crear
        ? client.from(tabla).insert({ id, ...payload })
        : payload === null
          ? client.from(tabla).delete().eq('id', id)
          : client.from(tabla).update(payload).eq('id', id);
      if (!crear && version) {
        query = query.eq('actualizado_en', version.actualizadoEn);
        if (tabla === 'cuotas') query = query.eq('revision', version.revision);
      }
      const { data, error } = await query.select('id').abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== 1 || data[0].id !== id)
        throw { code: 'TCF_CONFLICTO' };
    });
  }
  guardarCuota(c: Cuota, crear: boolean, version?: VersionFinanciera): Promise<void> {
    return this.escribir(
      'cuotas',
      c.id,
      {
        alumno_id: c.alumnoId,
        concepto: c.concepto,
        periodo: `${c.periodo}-01`,
        importe: c.importe,
        vencimiento: c.vencimiento,
        observaciones: c.observaciones,
      },
      crear,
      version,
    );
  }
  guardarPago(p: PagoCuota, crear: boolean, version?: VersionFinanciera): Promise<void> {
    return this.escribir(
      'pagos',
      p.id,
      {
        cuota_id: p.cuotaId,
        importe: p.importe,
        fecha: p.fecha,
        medio: p.medio,
        observaciones: p.observaciones,
      },
      crear,
      version,
    );
  }
  guardarCobro(c: CobroDirecto, crear: boolean, version?: VersionFinanciera): Promise<void> {
    return this.escribir(
      'cobros_directos',
      c.id,
      {
        alumno_id: c.alumnoId,
        concepto: c.concepto,
        importe: c.importe,
        fecha: c.fecha,
        medio: c.medio,
        observaciones: c.observaciones,
      },
      crear,
      version,
    );
  }
  eliminarCobro(id: string, version?: VersionFinanciera): Promise<void> {
    return this.escribir('cobros_directos', id, null, false, version);
  }
  eliminarCuota(id: string, version?: VersionFinanciera): Promise<void> {
    return this.escribir('cuotas', id, null, false, version);
  }
  eliminarPago(id: string, version?: VersionFinanciera): Promise<void> {
    return this.escribir('pagos', id, null, false, version);
  }
}
