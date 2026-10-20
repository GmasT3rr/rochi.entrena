import { TestBed } from '@angular/core/testing';
import { AlumnosService } from './alumnos-service';
import { AlumnosRepository, ALUMNOS_STORAGE_KEY } from './alumnos-repository';
import { DatosAlumno } from '../alumno';

const datos: DatosAlumno = {
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: '+54 11 1234',
  email: 'ana@example.com',
  modalidad: 'Online',
  estado: 'Activo',
  fechaIngreso: '2026-10-20',
  observaciones: 'Prueba',
};

describe('AlumnosService y persistencia', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });
  afterEach(() => localStorage.clear());

  it('carga ejemplos solo la primera vez y conserva un listado vacío almacenado', () => {
    const service = TestBed.inject(AlumnosService);
    expect(service.alumnos().length).toBe(8);
    expect(service.activos()).toBe(6);
    expect(localStorage.getItem(ALUMNOS_STORAGE_KEY)).not.toBeNull();
    TestBed.resetTestingModule();
    localStorage.setItem(ALUMNOS_STORAGE_KEY, '[]');
    expect(TestBed.inject(AlumnosService).alumnos()).toEqual([]);
  });

  it('agrega, edita, da de baja y reactiva sin perder datos; persiste al recrear el servicio', () => {
    const service = TestBed.inject(AlumnosService);
    expect(service.guardar(datos)).toBe(true);
    const alumno = service.alumnos().find((a) => a.email === datos.email)!;
    expect(service.activos()).toBe(7);
    expect(
      service.guardar({ ...datos, nombre: '  Ana María  ', estado: 'En pausa' }, alumno.id),
    ).toBe(true);
    expect(service.activos()).toBe(6);
    expect(service.cambiarEstado(alumno.id, 'Inactivo')).toBe(true);
    expect(service.alumnos().find((a) => a.id === alumno.id)?.nombre).toBe('Ana María');
    expect(service.cambiarEstado(alumno.id, 'Activo')).toBe(true);
    expect(service.activos()).toBe(7);
    TestBed.resetTestingModule();
    const recargado = TestBed.inject(AlumnosService);
    expect(recargado.activos()).toBe(7);
    expect(recargado.alumnos().find((a) => a.id === alumno.id)).toMatchObject({
      ...datos,
      nombre: 'Ana María',
    });
  });

  it('no reemplaza datos corruptos por ejemplos ni permite sobrescribirlos', () => {
    localStorage.setItem(ALUMNOS_STORAGE_KEY, '{corrupto');
    const service = TestBed.inject(AlumnosService);
    expect(service.error()).toBeTruthy();
    expect(service.guardar(datos)).toBe(false);
    expect(localStorage.getItem(ALUMNOS_STORAGE_KEY)).toBe('{corrupto');
  });

  it('no actualiza memoria ni contador cuando falla una escritura', () => {
    const service = TestBed.inject(AlumnosService);
    const previos = service.alumnos();
    vi.spyOn(TestBed.inject(AlumnosRepository), 'guardar').mockImplementation(() => {
      throw new Error('Quota');
    });
    expect(service.guardar(datos)).toBe(false);
    expect(service.alumnos()).toBe(previos);
    expect(service.activos()).toBe(6);
    expect(service.error()).toBeTruthy();
  });

  it('rechaza nombres vacíos y operaciones sobre alumnos inexistentes', () => {
    const service = TestBed.inject(AlumnosService);
    expect(service.guardar({ ...datos, nombre: '   ' })).toBe(false);
    expect(service.guardar(datos, 'inexistente')).toBe(false);
    expect(service.cambiarEstado('inexistente', 'Inactivo')).toBe(false);
    expect(service.alumnos()).toHaveLength(8);
  });
});
