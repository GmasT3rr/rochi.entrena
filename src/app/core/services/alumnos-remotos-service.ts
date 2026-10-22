import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AlumnoRegistro, ConfiguracionMensual, DatosAlumno, esAlumno } from '../alumno';
import { AuthService } from '../auth/auth-service';
import { AlumnosSupabaseRepository } from './alumnos-supabase-repository';

@Injectable({ providedIn: 'root' })
export class AlumnosService {
  private readonly repository = inject(AlumnosSupabaseRepository);
  private readonly auth = inject(AuthService);
  private readonly datos = signal<readonly AlumnoRegistro[]>([]);
  readonly alumnos = this.datos.asReadonly();
  readonly activos = computed(() => this.alumnos().filter(a => a.estado === 'Activo').length);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly errorListado = signal('');
  readonly mensaje = signal('');
  private generation = 0;
  constructor() {
    effect(() => {
      const token = this.auth.session()?.access_token;
      untracked(() => {
        this.generation++;
        this.datos.set([]); this.error.set(''); this.errorListado.set(''); this.mensaje.set('');
        if (token) void this.recargar();
        else this.cargando.set(false);
      });
    });
  }
  async recargar(): Promise<void> {
    if (this.guardando()) return;
    const generation = ++this.generation;
    this.cargando.set(true); this.error.set(''); this.errorListado.set(''); this.mensaje.set('');
    try {
      const alumnos = await this.repository.listar();
      if (generation === this.generation) this.datos.set(alumnos);
    } catch (error) {
      if (generation === this.generation) { this.datos.set([]); this.fallo(error, false); this.errorListado.set(this.error()); }
    } finally { if (generation === this.generation) this.cargando.set(false); }
  }
  async obtener(id: string): Promise<AlumnoRegistro | null> {
    try { return await this.repository.obtener(id); }
    catch (error) { this.fallo(error, false); return null; }
  }
  async guardar(datos: DatosAlumno, id?: string, nuevoId?: string): Promise<boolean> {
    const anterior = id ? this.alumnos().find(a => a.id === id) : undefined;
    if (id && !anterior) { this.error.set('El alumno no está disponible. Actualizá el listado.'); return false; }
    const limpio = Object.fromEntries(Object.entries(datos).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
    const alumno = { ...anterior, ...limpio, id: id ?? nuevoId ?? crypto.randomUUID() } as AlumnoRegistro;
    if (!esAlumno(alumno)) { this.error.set('Revisá los datos del alumno y su configuración mensual.'); return false; }
    return this.persistir(() => this.repository.guardar(alumno, !id));
  }
  async configurarMensual(id: string, configuracion: ConfiguracionMensual): Promise<boolean> {
    const alumno = this.alumnos().find(a => a.id === id);
    if (!alumno) return false;
    return this.guardar({ ...alumno, configuracionMensual: configuracion }, id);
  }
  async cambiarEstado(id: string, estado: 'Activo' | 'Inactivo'): Promise<boolean> {
    return this.persistir(() => this.repository.cambiarEstado(id, estado));
  }
  private async persistir(operacion: () => Promise<AlumnoRegistro>): Promise<boolean> {
    if (this.guardando() || this.cargando()) return false;
    const generation = this.generation;
    this.guardando.set(true); this.error.set(''); this.mensaje.set('');
    try {
      const alumno = await operacion();
      if (generation !== this.generation) return false;
      this.datos.update(alumnos => alumnos.some(a => a.id === alumno.id)
        ? alumnos.map(a => a.id === alumno.id ? alumno : a) : [...alumnos, alumno]);
      this.mensaje.set('Cambio confirmado en PostgreSQL.');
      return true;
    } catch (error) { if (generation === this.generation) this.fallo(error); return false; }
    finally { this.guardando.set(false); }
  }
  private fallo(error: unknown, guardado = true): void {
    const code = (error as { code?: string })?.code;
    this.error.set(code === '42501' ? 'Acceso denegado. Verificá tu sesión y autorización administrativa.'
      : code === 'PGRST202' && guardado ? 'La API no encuentra guardar_alumno_con_configuracion(p_id, p_crear, p_datos). Revisá la migración 002 y la caché de esquema. No se confirmó ningún cambio.'
      : code === 'PGRST200' ? 'No se encuentra la relación entre alumnos y configuraciones_mensuales (PGRST200). Revisá la FK y la caché de esquema; no es un listado vacío.'
      : code === 'PGRST201' ? 'La relación de configuración mensual es ambigua (PGRST201). Revisá las relaciones instaladas.'
      : code === '42703' ? 'La consulta utiliza una columna que no existe en el esquema instalado (42703). Revisá las columnas de alumnos y configuraciones_mensuales.'
      : code === 'PGRST205' || code === '42P01' ? 'La API no encuentra una tabla requerida. Revisá alumnos, configuraciones_mensuales y la caché de esquema.'
      : code === 'PGRST103' ? 'Supabase rechazó el rango de paginación (PGRST103). Actualizá el listado para reintentar.'
      : code === 'TCF_RESPUESTA_INVALIDA' ? 'La respuesta del listado no tiene el formato o conteo esperado. No se considera una tabla vacía.'
      : 'No se pudo confirmar la operación con Supabase. Revisá la conexión y actualizá el listado antes de reintentar.');
  }
}
