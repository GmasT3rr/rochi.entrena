import { mensajeError } from './mensajes-usuario';
import { MinimumLoading } from '../../shared/skeleton/minimum-loading';
import { Sort } from '@angular/material/sort';
import { ToastService } from './toast-service';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
  Injector,
  isDevMode,
} from '@angular/core';
import { AlumnoRegistro, ConfiguracionMensual, DatosAlumno, esAlumno } from '../alumno';
import { AuthService } from '../auth/auth-service';
import { AlumnosSupabaseRepository, AjusteMensualActual } from './alumnos-supabase-repository';
import { CuentasService } from './cuentas-service';
import { CuentasSnapshot } from './cuentas-supabase-repository';

type DiagnosticoAlumno = {
  codigo?: string;
  mensaje?: string;
  operacion?: string;
  recurso?: string;
  estadoHttp?: number;
};

@Injectable({ providedIn: 'root' })
export class AlumnosService {
  private readonly injector = inject(Injector);
  readonly orden = signal<Sort>({ active: 'nombre', direction: 'asc' });
  private readonly toast = inject(ToastService);
  private readonly repository = inject(AlumnosSupabaseRepository);
  private readonly auth = inject(AuthService);
  private readonly datos = signal<readonly AlumnoRegistro[]>([]);
  readonly alumnos = this.datos.asReadonly();
  readonly activos = computed(() => this.alumnos().filter((a) => a.estado === 'Activo').length);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly errorListado = signal('');
  readonly detalleError = signal<DiagnosticoAlumno | null>(null);
  readonly detalleErrorListado = signal<DiagnosticoAlumno | null>(null);
  readonly mensaje = signal('');
  readonly listadoCargado = signal(false);
  readonly filtros = {
    busqueda: signal(''),
    modalidad: signal<import('../alumno').ModalidadAlumno | ''>(''),
    estado: signal<import('../alumno').EstadoRegistroAlumno | ''>(''),
  };
  private ultimaCarga = 0;
  private ultimoIntento = 0;
  private generation = 0;
  private sessionToken: string | undefined;
  private readonly loading = new MinimumLoading();
  readonly cargandoInicial = this.loading.visible.asReadonly();
  refrescarSiNecesario(): void {
    if (!this.auth.session() || this.cargando() || this.guardando()) return;
    const ahora = Date.now();
    if (this.listadoCargado() && ahora - this.ultimaCarga < 60000) return;
    if (this.errorListado() && ahora - this.ultimoIntento < 30000) return;
    void this.recargar();
  }
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.loading.cancel();
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (token === this.sessionToken) return;
      this.sessionToken = token;
      untracked(() => {
        this.generation++;
        this.loading.cancel();
        this.listadoCargado.set(false);
        this.ultimaCarga = 0;
        this.ultimoIntento = 0;
        this.cargando.set(false);
        this.datos.set([]);
        this.error.set('');
        this.errorListado.set('');
        this.detalleError.set(null);
        this.detalleErrorListado.set(null);
        this.mensaje.set('');
        if (token) void this.recargar();
        else this.cargando.set(false);
      });
    });
  }
  async recargar(): Promise<void> {
    if (this.guardando() || this.cargando()) return;
    this.ultimoIntento = Date.now();
    const generation = ++this.generation;
    const finalizarVisual = this.loading.begin(!this.listadoCargado());
    this.cargando.set(true);
    this.errorListado.set('');
    this.detalleErrorListado.set(null);
    this.mensaje.set('');
    try {
      const alumnos = await this.repository.listar();
      if (generation === this.generation) {
        this.datos.set(alumnos);
        this.listadoCargado.set(true);
        this.ultimaCarga = Date.now();
      }
    } catch (error) {
      if (generation === this.generation) {
        if ((error as { code?: string })?.code === '42501') {
          this.datos.set([]);
          this.listadoCargado.set(false);
        }
        this.fallo(error, false, true);
      }
    } finally {
      finalizarVisual();
      if (generation === this.generation) this.cargando.set(false);
    }
  }
  async obtener(id: string): Promise<AlumnoRegistro | null> {
    try {
      return await this.repository.obtener(id);
    } catch (error) {
      this.fallo(error, false);
      return null;
    }
  }
  async guardar(
    datos: DatosAlumno,
    id?: string,
    nuevoId?: string,
    primerPeriodo?: string,
  ): Promise<boolean> {
    if (this.guardando() || this.cargando()) return false;
    this.error.set('');
    this.detalleError.set(null);
    if (primerPeriodo !== undefined && (id || !datos.configuracionMensual?.habilitada)) {
      this.error.set(
        'La primera cuota solo se puede crear al agregar un alumno con cobro mensual.',
      );
      return false;
    }
    const anterior = id ? this.alumnos().find((a) => a.id === id) : undefined;
    if (id && !anterior) {
      this.error.set('El alumno no está disponible. Actualizá el listado.');
      return false;
    }
    const limpio = Object.fromEntries(
      Object.entries(datos).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
    );
    const alumno = {
      ...anterior,
      ...limpio,
      id: id ?? nuevoId ?? crypto.randomUUID(),
    } as AlumnoRegistro;
    if (!esAlumno(alumno)) {
      this.error.set('Revisá los datos del alumno y su configuración mensual.');
      return false;
    }
    return this.persistir(
      () =>
        primerPeriodo === undefined
          ? this.repository.guardar(alumno, !id)
          : this.repository.guardar(alumno, !id, primerPeriodo),
      id
        ? 'Alumno actualizado'
        : primerPeriodo === undefined
          ? 'Alumno guardado'
          : 'Alumno y primera cuota creados',
    );
  }
  async configurarMensual(id: string, configuracion: ConfiguracionMensual): Promise<boolean> {
    const alumno = this.alumnos().find((a) => a.id === id);
    if (!alumno) return false;
    return this.guardar({ ...alumno, configuracionMensual: configuracion }, id);
  }
  async guardarMensualConCuota(
    id: string,
    config: ConfiguracionMensual,
    ajuste: AjusteMensualActual,
  ): Promise<boolean> {
    if (this.guardando() || this.cargando()) return false;
    const cuentas = this.injector.get(CuentasService);
    if (!cuentas.disponible()) {
      this.error.set('Actualizá las finanzas antes de guardar.');
      return false;
    }
    if (ajuste.cuotaId && !cuentas.validarImporteCuota(ajuste.cuotaId, config.importe)) {
      this.error.set(cuentas.error());
      return false;
    }
    cuentas.guardando.set(true);
    let snapshot!: CuentasSnapshot;
    try {
      return await this.persistir(
        async () => {
          const resultado = await this.repository.ajustarMensual(id, config, ajuste);
          snapshot = resultado.cuentas;
          return resultado.alumno;
        },
        ajuste.cuotaId
          ? 'Configuración y cuota actual actualizadas. Se conservaron los pagos y el vencimiento.'
          : 'Configuración actualizada. No existe cuota mensual actual; no se creó ninguna.',
        () => cuentas.aplicarSnapshotConfirmado(snapshot),
      );
    } finally {
      cuentas.guardando.set(false);
    }
  }
  async cambiarEstado(id: string, estado: 'Activo' | 'Inactivo'): Promise<boolean> {
    return this.persistir(
      () => this.repository.cambiarEstado(id, estado),
      estado === 'Activo' ? 'Alumno reactivado' : 'Alumno dado de baja',
    );
  }
  private async persistir(
    operacion: () => Promise<AlumnoRegistro>,
    mensaje = 'Alumno guardado',
    alConfirmar?: () => void,
  ): Promise<boolean> {
    if (this.guardando() || this.cargando()) return false;
    const generation = this.generation;
    this.guardando.set(true);
    this.error.set('');
    this.detalleError.set(null);
    this.mensaje.set('');
    try {
      const alumno = await operacion();
      if (generation !== this.generation) return false;
      alConfirmar?.();
      this.datos.update((alumnos) =>
        alumnos.some((a) => a.id === alumno.id)
          ? alumnos.map((a) => (a.id === alumno.id ? alumno : a))
          : [...alumnos, alumno],
      );
      this.mensaje.set(mensaje);
      this.toast.mostrar(mensaje, 'exito');
      this.ultimaCarga = 0;
      return true;
    } catch (error) {
      if (generation === this.generation) this.fallo(error);
      return false;
    } finally {
      this.guardando.set(false);
    }
  }
  private fallo(error: unknown, guardado = true, listado = false): void {
    const tecnico = error as {
      code?: string;
      message?: string;
      status?: number;
      operacion?: string;
      recurso?: string;
    };
    const code = tecnico?.code;
    const diagnostico = listado ? this.detalleErrorListado : this.detalleError;
    const destino = listado ? this.errorListado : this.error;
    diagnostico.set(
      isDevMode()
        ? {
            codigo: code,
            mensaje: 'Se omitió el contenido del error por privacidad.',
            estadoHttp: tecnico?.status,
            operacion: tecnico?.operacion,
            recurso: tecnico?.recurso,
          }
        : null,
    );
    if (code === '23505') {
      destino.set(
        'El alumno o la cuota ya existe. Actualizá el listado y revisá sus cuotas antes de reintentar.',
      );
      return;
    }
    destino.set(
      tecnico?.recurso === 'ajustar_configuracion_y_cuota_actual'
        ? code === '40001'
          ? 'La configuración, la cuota o sus pagos cambiaron. Cerrá la edición y actualizá antes de reintentar. No se guardaron cambios.'
          : code === 'PGRST202' || tecnico.status === 404
            ? 'Esta opción no está disponible. No se guardaron cambios.'
            : code === '23514'
              ? 'No se puede aplicar ese importe a la cuota: revisá el total abonado y si ya está pagada. No se guardaron cambios.'
              : 'No se pudo confirmar la operación conjunta. Actualizá la ficha antes de reintentar; no repitas el guardado sin verificar su estado.'
        : tecnico?.recurso === 'crear_alumno_con_primera_cuota' &&
            (code === 'PGRST202' || tecnico.status === 404)
          ? 'No se pudo crear el alumno con su primera cuota. Intentá más tarde.'
          : code === 'TCF_ESQUEMA_MENSUAL'
            ? 'Esta opción no está disponible. No se guardaron cambios.'
            : code === '42501'
              ? 'Acceso denegado. Verificá tu sesión y autorización administrativa.'
              : [
                    'PGRST202',
                    'PGRST200',
                    'PGRST201',
                    '42703',
                    'PGRST205',
                    '42P01',
                    'PGRST103',
                    'TCF_RESPUESTA_INVALIDA',
                  ].includes(code ?? '')
                ? 'No pudimos completar la consulta. Reintentá; si el problema continúa, contactá al administrador.'
                : mensajeError(error),
    );
    // La pantalla o el formulario ya muestran el error de esta operación.
  }
}
