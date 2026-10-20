import { TestBed } from '@angular/core/testing';
import { CuentasService } from './cuentas-service';
import { CuentasRepository, CUENTAS_STORAGE_KEY } from './cuentas-repository';
import { AlumnosService } from './alumnos-service';
import { ALUMNOS_STORAGE_KEY } from './alumnos-repository';
import { DatosCuota, DatosPago, fechaValida } from '../cuentas';

const vacio = () =>
  localStorage.setItem(CUENTAS_STORAGE_KEY, JSON.stringify({ version: 1, cuotas: [], pagos: [] }));
const cuota = (service: CuentasService, cambios: Partial<DatosCuota> = {}) => {
  const alumnoId = TestBed.inject(AlumnosService).alumnos()[0].id;
  expect(
    service.guardarCuota({
      alumnoId,
      concepto: 'Entrenamiento',
      periodo: '2026-10',
      importe: 50000,
      vencimiento: '2026-10-25',
      observaciones: '',
      ...cambios,
    }),
  ).toBe(true);
  return service.cuotas().at(-1)!;
};
const pago = (cuotaId: string, importe: number, cambios: Partial<DatosPago> = {}): DatosPago => ({
  cuotaId,
  importe,
  fecha: '2026-10-20',
  medio: 'Transferencia',
  observaciones: '',
  ...cambios,
});

describe('Cuentas: cuotas, pagos y persistencia', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    TestBed.configureTestingModule({});
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('inicializa una demostración coherente sin modificar alumnos existentes y no la repite', () => {
    const alumnos = TestBed.inject(AlumnosService);
    alumnos.guardar({
      nombre: 'Alumno',
      apellido: 'Existente',
      email: '',
      telefono: '',
      modalidad: 'Online',
      estado: 'Activo',
      fechaIngreso: '2026-10-01',
      observaciones: '',
    });
    const original = localStorage.getItem(ALUMNOS_STORAGE_KEY);
    const service = TestBed.inject(CuentasService);
    expect(service.cuotas()).toHaveLength(3);
    expect(service.pagos()).toHaveLength(2);
    expect(service.cuotas().every((c) => alumnos.alumnos().some((a) => a.id === c.alumnoId))).toBe(
      true,
    );
    expect(localStorage.getItem(ALUMNOS_STORAGE_KEY)).toBe(original);
    const guardado = localStorage.getItem(CUENTAS_STORAGE_KEY);
    TestBed.resetTestingModule();
    expect(TestBed.inject(CuentasService).cuotas()).toHaveLength(3);
    expect(localStorage.getItem(CUENTAS_STORAGE_KEY)).toBe(guardado);
  });
  it('conserva un conjunto vacío almacenado', () => {
    vacio();
    expect(TestBed.inject(CuentasService).cuotas()).toEqual([]);
  });
  it('crea cuota, admite varios pagos, completa el saldo y actualiza indicadores', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    expect(s.cuentas()[0].estado).toBe('Pendiente');
    expect(s.guardarPago(pago(c.id, 30000))).toBe(true);
    expect(s.cuentas()[0]).toMatchObject({ estado: 'Parcial', abonado: 30000, saldo: 20000 });
    expect(s.guardarPago(pago(c.id, 20000))).toBe(true);
    expect(s.cuentas()[0]).toMatchObject({ estado: 'Pagada', abonado: 50000, saldo: 0 });
    expect(s.ingresosMes()).toBe(50000);
    expect(s.pendientes()).toHaveLength(0);
    expect(s.proximos()).toHaveLength(0);
    TestBed.resetTestingModule();
    expect(TestBed.inject(CuentasService).cuentas()[0].saldo).toBe(0);
    expect(TestBed.inject(CuentasService).pagos()).toHaveLength(2);
  });
  it('admite pago completo y rechaza un sobrepago posterior', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    expect(s.guardarPago(pago(c.id, 50000))).toBe(true);
    expect(s.guardarPago(pago(c.id, 0.01))).toBe(false);
    expect(s.pagos()).toHaveLength(1);
  });
  it('edita un pago descontando su importe anterior y lo elimina', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    s.guardarPago(pago(c.id, 30000));
    const id = s.pagos()[0].id;
    s.guardarPago(pago(c.id, 20000));
    expect(s.guardarPago(pago(c.id, 40000), id)).toBe(false);
    expect(s.guardarPago(pago(c.id, 10000, { medio: 'Efectivo' }), id)).toBe(true);
    expect(s.cuentas()[0].saldo).toBe(20000);
    expect(s.ingresosMes()).toBe(30000);
    expect(s.eliminarPago(id)).toBe(true);
    expect(s.cuentas()[0].saldo).toBe(30000);
    expect(s.ingresosMes()).toBe(20000);
  });
  it('permite editar cuotas y evita reducir el importe por debajo de lo abonado', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    s.guardarPago(pago(c.id, 30000));
    expect(s.guardarCuota({ ...c, importe: 29999 }, c.id)).toBe(false);
    expect(s.guardarCuota({ ...c, importe: 60000, concepto: 'Cuota ajustada' }, c.id)).toBe(true);
    expect(s.cuentas()[0]).toMatchObject({
      importe: 60000,
      saldo: 30000,
      concepto: 'Cuota ajustada',
    });
  });
  it('elimina únicamente cuotas sin pagos', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    s.guardarPago(pago(c.id, 100));
    expect(s.eliminarCuota(c.id)).toBe(false);
    s.eliminarPago(s.pagos()[0].id);
    expect(s.eliminarCuota(c.id)).toBe(true);
    expect(s.cuotas()).toHaveLength(0);
  });
  it('evita cuotas duplicadas, incluso con diferencias de espacios, acentos y mayúsculas', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s, { concepto: 'Cuota Física' });
    expect(s.guardarCuota({ ...c, concepto: '  cuota   fisica  ' })).toBe(false);
    expect(s.guardarCuota({ ...c, periodo: '2026-11' })).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, 0.001, 1000000000])(
    'rechaza importes inválidos (%s) en cuotas y pagos',
    (importe) => {
      vacio();
      const s = TestBed.inject(CuentasService);
      const c = cuota(s);
      expect(s.guardarCuota({ ...c, importe, periodo: '2026-11' })).toBe(false);
      expect(s.guardarPago(pago(c.id, importe))).toBe(false);
      expect(s.pagos()).toHaveLength(0);
    },
  );
  it('calcula dinero en centavos sin dejar saldos residuales', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s, { importe: 0.3 });
    s.guardarPago(pago(c.id, 0.1));
    s.guardarPago(pago(c.id, 0.2));
    expect(s.cuentas()[0]).toMatchObject({ saldo: 0, estado: 'Pagada' });
  });
  it('valida fechas reales, períodos, alumnos y referencias de pagos', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    expect(fechaValida('2026-02-30')).toBe(false);
    expect(fechaValida('2024-02-29')).toBe(true);
    expect(s.guardarCuota({ ...c, periodo: '2026-13' })).toBe(false);
    expect(s.guardarCuota({ ...c, alumnoId: 'inexistente' })).toBe(false);
    expect(s.guardarCuota({ ...c, vencimiento: '2026-02-30' }, c.id)).toBe(false);
    expect(s.guardarPago(pago('inexistente', 10))).toBe(false);
    expect(s.guardarPago(pago(c.id, 10, { fecha: '2026-10-21' }))).toBe(false);
  });
  it('calcula vencimiento por fecha local, incluyendo pagos parciales y el cambio de día', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s, { vencimiento: '2026-10-20' });
    s.guardarPago(pago(c.id, 100));
    expect(s.cuentas()[0].estado).toBe('Parcial');
    vi.setSystemTime(new Date(2026, 9, 21, 0, 0));
    vi.advanceTimersByTime(30000);
    expect(s.cuentas()[0]).toMatchObject({ estado: 'Vencida', abonado: 100 });
    s.guardarPago(pago(c.id, 49900, { fecha: '2026-10-21' }));
    expect(s.cuentas()[0].estado).toBe('Pagada');
  });
  it('calcula ingresos desde fechas de pago, saldos y próximos vencimientos desde hoy hasta el séptimo día', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s, { vencimiento: '2026-10-27' });
    s.guardarPago(pago(c.id, 100, { fecha: '2026-09-30' }));
    s.guardarPago(pago(c.id, 200, { fecha: '2026-10-01' }));
    expect(s.ingresosMes()).toBe(200);
    expect(s.proximos()).toHaveLength(1);
    expect(s.proximaCuota(c.alumnoId)).toBe('2026-10-27');
    expect(s.saldoAlumno(c.alumnoId)).toBe(49700);
    s.guardarCuota({ ...c, vencimiento: '2026-10-28' }, c.id);
    expect(s.proximos()).toHaveLength(0);
  });
  it('refleja cambios de nombre y modalidad sin duplicar información ni perder deudas tras la baja del alumno', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    const alumnos = TestBed.inject(AlumnosService);
    const a = alumnos.alumnos().find((a) => a.id === c.alumnoId)!;
    alumnos.guardar({ ...a, nombre: 'Nuevo', modalidad: 'Online' }, a.id);
    alumnos.cambiarEstado(a.id, 'Inactivo');
    expect(s.cuentas()[0]).toMatchObject({
      alumno: `Nuevo ${a.apellido}`,
      modalidad: 'Online',
      saldo: 50000,
    });
    expect(s.cuotas()[0]).not.toHaveProperty('alumno');
  });
  it('no sobrescribe almacenamiento corrupto ni relaciones huérfanas', () => {
    localStorage.setItem(CUENTAS_STORAGE_KEY, '{corrupto');
    const s = TestBed.inject(CuentasService);
    expect(s.disponible()).toBe(false);
    expect(localStorage.getItem(CUENTAS_STORAGE_KEY)).toBe('{corrupto');
    TestBed.resetTestingModule();
    const raw = JSON.stringify({
      version: 1,
      cuotas: [],
      pagos: [
        {
          id: 'p',
          cuotaId: 'no-existe',
          importe: 1,
          fecha: '2026-10-20',
          medio: 'Otro',
          observaciones: '',
        },
      ],
    });
    localStorage.setItem(CUENTAS_STORAGE_KEY, raw);
    expect(TestBed.inject(CuentasService).disponible()).toBe(false);
    expect(localStorage.getItem(CUENTAS_STORAGE_KEY)).toBe(raw);
  });
  it('mantiene saldos y pagos en memoria cuando falla el guardado', () => {
    vacio();
    const s = TestBed.inject(CuentasService);
    const c = cuota(s);
    vi.spyOn(TestBed.inject(CuentasRepository), 'guardar').mockImplementation(() => {
      throw Error('Sin espacio');
    });
    expect(s.guardarPago(pago(c.id, 100))).toBe(false);
    expect(s.cuentas()[0].saldo).toBe(50000);
    expect(s.pagos()).toHaveLength(0);
    expect(s.error()).toBeTruthy();
  });
});
