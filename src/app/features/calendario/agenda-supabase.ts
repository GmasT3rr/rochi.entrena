import { ErrorUsuario, mensajeError } from '../../core/services/mensajes-usuario';
import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';
import { authRuntime } from '../../core/auth/auth-runtime';
import { AgendaRepository, DatosTurno, Turno, fechasMes, minutos, turnoValido } from './agenda';
import { horaTexto } from './agenda-layout';

export function errorAgenda(error: unknown): Error {
  if (error instanceof ErrorUsuario) return error;
  const e = error as { code?: string };
  if (['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(e?.code ?? ''))
    return new ErrorUsuario('La agenda no está disponible. Intentá más tarde.');
  if (e?.code === '23P01')
    return new ErrorUsuario(
      'Un alumno ya tiene un entrenamiento en ese horario. Revisá el turno existente.',
    );
  if (e?.code === 'P0001')
    return new ErrorUsuario('Hay horarios superpuestos. Revisalos y confirmá para continuar.');
  return new ErrorUsuario(mensajeError(error));
}

export function mapearTurno(fila: Record<string, unknown>): Turno {
  const inicio = String(fila['hora_inicio'] ?? '');
  const fin = String(fila['hora_fin'] ?? '');
  const ids = fila['alumno_ids'];
  const turno: Turno = {
    id: String(fila['id'] ?? ''),
    fecha: String(fila['fecha'] ?? ''),
    inicio: inicio.slice(0, 5),
    duracion: minutos(fin.slice(0, 5)) - minutos(inicio.slice(0, 5)),
    titulo: fila['titulo'] == null ? undefined : String(fila['titulo']),
    modalidad: fila['modalidad'] as Turno['modalidad'],
    observaciones: fila['observaciones'] as string,
    estado: fila['estado'] as Turno['estado'],
    alumnoIds: Array.isArray(ids) ? [...ids] : [],
    version: fila['actualizado_en'] as string,
  };
  if (
    !turno.id ||
    !turnoValido(turno) ||
    typeof turno.observaciones !== 'string' ||
    !['programado', 'cancelado'].includes(turno.estado) ||
    typeof turno.version !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(turno.version) ||
    !/^([01]\d|2[0-3]):[0-5]\d:00(?:\.0+)?$/.test(inicio) ||
    !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00):00(?:\.0+)?$/.test(fin)
  )
    throw new Error('Respuesta de Agenda inválida.');
  return turno;
}
export function rangoAgendaValido(desde: string, hasta: string): boolean {
  const valida = (fecha: string) =>
    /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(fecha) &&
    fecha >= '1900-01-01' &&
    fecha <= '9999-12-31' &&
    fechasMes(fecha.slice(0, 7)).includes(fecha);
  if (!valida(desde) || !valida(hasta) || desde > hasta) return false;
  return (Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000 < 62;
}

@Injectable({ providedIn: 'root' })
export class AgendaApi {
  private readonly auth = inject(AuthService);
  private readonly authorization = inject(AdminAuthorization);
  private async ejecutar<T>(
    operacion: (client: NonNullable<typeof authRuntime.client>) => Promise<T>,
  ): Promise<T> {
    const token = this.auth.session()?.access_token;
    if (
      !token ||
      this.auth.recovery() ||
      this.auth.initializationError() ||
      !(await this.authorization.verify()) ||
      this.auth.session()?.access_token !== token ||
      !authRuntime.client
    )
      throw { code: '42501' };
    const resultado = await operacion(authRuntime.client);
    if (
      this.auth.session()?.access_token !== token ||
      this.auth.recovery() ||
      this.auth.initializationError()
    )
      throw { code: '42501' };
    return resultado;
  }
  async listar(desde: string, hasta: string): Promise<Turno[]> {
    if (!rangoAgendaValido(desde, hasta)) throw new Error('Intervalo de Agenda inválido.');
    return this.ejecutar(async (client) => {
      const turnos: Turno[] = [];
      for (let offset = 0; ;) {
        const { data, error, count } = await client
          .from('agenda_entrenamientos')
          .select(
            'id,fecha,hora_inicio,hora_fin,titulo,modalidad,observaciones,estado,alumno_ids,actualizado_en',
            { count: 'exact' },
          )
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .eq('estado', 'programado')
          .order('fecha')
          .order('hora_inicio')
          .order('id')
          .range(offset, offset + 499)
          .abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        if (!Array.isArray(data) || typeof count !== 'number')
          throw new Error('Respuesta inválida');
        const pagina = data.map(mapearTurno);
        if (pagina.some((t) => t.fecha < desde || t.fecha > hasta))
          throw new Error('Rango de respuesta inválido');
        turnos.push(...pagina);
        offset += data.length;
        if (offset >= count) return turnos;
        if (!data.length) throw new Error('Página incompleta');
      }
    });
  }
  async guardar(
    solicitud: string,
    datos: DatosTurno,
    dias: readonly number[],
    id: string | undefined,
    version: string | undefined,
    aceptar: boolean,
  ): Promise<number> {
    return this.ejecutar(async (client) => {
      const { data, error } = await client
        .rpc('guardar_entrenamiento_agenda', {
          p_solicitud: solicitud,
          p_periodo: datos.fecha.slice(0, 7),
          p_datos: {
            fecha: datos.fecha,
            inicio: datos.inicio,
            fin: horaTexto(minutos(datos.inicio) + datos.duracion),
            titulo: datos.titulo?.trim() || null,
            modalidad: datos.modalidad,
            observaciones: datos.observaciones,
            alumno_ids: [...datos.alumnoIds].sort(),
          },
          p_dias: [...new Set(dias)].sort(),
          p_id: id ?? null,
          p_version: version ?? null,
          p_aceptar_superposicion: aceptar,
        })
        .abortSignal(AbortSignal.timeout(30000));
      if (error) throw error;
      if (!data || !Number.isInteger(data.cantidad) || data.cantidad < 1 || data.cantidad > 31)
        throw new Error('Respuesta inválida');
      return data.cantidad;
    });
  }
  async cancelar(solicitud: string, id: string, version: string): Promise<void> {
    await this.ejecutar(async (client) => {
      const { data, error } = await client
        .rpc('cancelar_entrenamiento_agenda', {
          p_solicitud: solicitud,
          p_id: id,
          p_version: version,
        })
        .abortSignal(AbortSignal.timeout(30000));
      if (error) throw error;
      if (data?.cantidad !== 1) throw new Error('Respuesta inválida');
    });
  }
}

/** Estado por pantalla. No hay fallback a memoria ni almacenamiento local. */
@Injectable()
export class AgendaSupabase extends AgendaRepository {
  private readonly api = inject(AgendaApi);
  private readonly auth = inject(AuthService);
  private readonly datos = signal<readonly Turno[]>([]);
  private intervalo?: { desde: string; hasta: string };
  private generacion = 0;
  private solicitudes = new Map<string, string>();
  private token?: string;
  private destruido = false;
  constructor() {
    super();
    effect(() => {
      const token =
        this.auth.recovery() || this.auth.initializationError()
          ? undefined
          : this.auth.session()?.access_token;
      if (token === this.token) return;
      this.token = token;
      untracked(() => {
        this.generacion++;
        this.datos.set([]);
        this.solicitudes.clear();
        this.errorListado.set('');
        this.cargando.set(false);
        if (token && this.intervalo) void this.cargar(this.intervalo.desde, this.intervalo.hasta);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.generacion++;
      this.datos.set([]);
    });
  }
  listar(): readonly Turno[] {
    return this.datos();
  }
  override async cargar(desde: string, hasta: string): Promise<void> {
    this.intervalo = { desde, hasta };
    const generacion = ++this.generacion;
    const token = this.auth.session()?.access_token;
    this.cargando.set(true);
    this.errorListado.set('');
    this.datos.set([]);
    try {
      const turnos = await this.api.listar(desde, hasta);
      if (
        !this.destruido &&
        generacion === this.generacion &&
        token === this.auth.session()?.access_token
      )
        this.datos.set(turnos);
    } catch (e) {
      if (!this.destruido && generacion === this.generacion)
        this.errorListado.set(errorAgenda(e).message);
    } finally {
      if (!this.destruido && generacion === this.generacion) this.cargando.set(false);
    }
  }
  private async escribir<T>(
    clave: string,
    operacion: (solicitud: string) => Promise<T>,
  ): Promise<T> {
    if (this.guardando()) throw new Error('Hay una operación de Agenda en curso.');
    this.guardando.set(true);
    const token = this.auth.session()?.access_token;
    let solicitud = this.solicitudes.get(clave);
    if (!solicitud) {
      solicitud = crypto.randomUUID();
      this.solicitudes.set(clave, solicitud);
    }
    try {
      const resultado = await operacion(solicitud);
      if (this.destruido || token !== this.auth.session()?.access_token) throw { code: '42501' };
      this.solicitudes.delete(clave);
      if (this.intervalo) await this.cargar(this.intervalo.desde, this.intervalo.hasta);
      if (this.destruido || token !== this.auth.session()?.access_token) throw { code: '42501' };
      return resultado;
    } catch (e) {
      throw errorAgenda(e);
    } finally {
      this.guardando.set(false);
    }
  }
  async guardar(
    datos: DatosTurno,
    dias: readonly number[] = [],
    id?: string,
    aceptar = false,
    version?: string,
  ): Promise<number> {
    if (!turnoValido(datos) || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      throw new ErrorUsuario('Revisá los datos del entrenamiento.');
    if (id && (!version || dias.length))
      throw new ErrorUsuario('Actualizá la agenda y editá un entrenamiento por vez.');
    const normalizado = {
      ...datos,
      alumnoIds: [...datos.alumnoIds].sort(),
      titulo: datos.titulo?.trim() || '',
    };
    const clave = JSON.stringify([
      'guardar',
      normalizado,
      [...new Set(dias)].sort(),
      id,
      aceptar,
      version,
    ]);
    return this.escribir(clave, (solicitud) =>
      this.api.guardar(solicitud, normalizado, dias, id, version, aceptar),
    );
  }
  async cancelar(id: string, version?: string): Promise<void> {
    if (!version) throw new ErrorUsuario('Actualizá la agenda y volvé a abrir el entrenamiento.');
    return this.escribir(JSON.stringify(['cancelar', id, version]), (solicitud) =>
      this.api.cancelar(solicitud, id, version),
    );
  }
}
