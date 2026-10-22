import { computed, inject, Injectable, signal } from '@angular/core';
import {
  AlumnoRegistro,
  ConfiguracionMensual,
  configuracionMensualValida,
  DatosAlumno,
  esAlumno,
} from '../alumno';
import { AlumnosRepository } from './alumnos-repository';
import { MockData } from './mock-data';

@Injectable({ providedIn: 'root' })
export class AlumnosLocalService {
  private readonly repository = inject(AlumnosRepository);
  private readonly datos = signal<readonly AlumnoRegistro[]>([]);
  readonly alumnos = this.datos.asReadonly();
  readonly activos = computed(() => this.alumnos().filter((a) => a.estado === 'Activo').length);
  readonly error = signal('');
  private disponible = true;

  constructor() {
    const mock = inject(MockData);
    try {
      const almacenados = this.repository.cargar();
      if (almacenados !== null) {
        this.datos.set(almacenados);
      } else {
        const ejemplos: AlumnoRegistro[] = mock.alumnos.map((a) => ({
          id: a.id,
          nombre: a.nombre.split(' ')[0],
          apellido: a.nombre.split(' ').slice(1).join(' '),
          telefono: '',
          email: '',
          modalidad: a.modalidad,
          estado: a.estado,
          fechaIngreso: '2026-10-01',
          observaciones: '',
          proximaCuota: `${a.proximaCuota.getFullYear()}-${String(a.proximaCuota.getMonth() + 1).padStart(2, '0')}-${String(a.proximaCuota.getDate()).padStart(2, '0')}`,
        }));
        this.repository.guardar(ejemplos);
        this.datos.set(ejemplos);
      }
    } catch {
      this.disponible = false;
      this.error.set(
        'No se pudieron leer los alumnos guardados. Revisá el almacenamiento del navegador y recargá la página. No se sobrescribieron tus datos.',
      );
    }
  }

  guardar(datos: DatosAlumno, id?: string): boolean {
    const limpio = Object.fromEntries(
      Object.entries(datos).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
    ) as unknown as DatosAlumno;
    const anterior = id ? this.alumnos().find((a) => a.id === id) : undefined;
    if (id && !anterior) return false;
    const alumno: AlumnoRegistro = { ...anterior, ...limpio, id: id ?? crypto.randomUUID() };
    if (!esAlumno(alumno)) return false;
    return this.persistir(
      id ? this.alumnos().map((a) => (a.id === id ? alumno : a)) : [...this.alumnos(), alumno],
    );
  }

  configurarMensual(id: string, configuracion: ConfiguracionMensual): boolean {
    if (!configuracionMensualValida(configuracion) || !this.alumnos().some((a) => a.id === id))
      return false;
    return this.persistir(
      this.alumnos().map((a) =>
        a.id === id ? { ...a, configuracionMensual: { ...configuracion } } : a,
      ),
    );
  }

  cambiarEstado(id: string, estado: 'Activo' | 'Inactivo'): boolean {
    if (!this.alumnos().some((a) => a.id === id)) return false;
    return this.persistir(this.alumnos().map((a) => (a.id === id ? { ...a, estado } : a)));
  }

  private persistir(alumnos: readonly AlumnoRegistro[]): boolean {
    if (!this.disponible) return false;
    try {
      this.repository.guardar(alumnos);
      this.datos.set(alumnos);
      this.error.set('');
      return true;
    } catch {
      this.error.set(
        'No se pudo guardar el cambio. Verificá el espacio y los permisos de almacenamiento e intentá nuevamente.',
      );
      return false;
    }
  }

  // Se invoca después de persistir el conjunto completo.
  actualizarTrasRestauracion(alumnos: AlumnoRegistro[]): void {
    this.datos.set(alumnos);
    this.disponible = true;
    this.error.set('');
  }
}
