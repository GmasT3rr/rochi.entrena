import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';
import { PERIODO_DASHBOARD_KEY } from '../../core/services/resumen-dashboard';
import { signal } from '@angular/core';
import { Dashboard } from './dashboard';
import { CuentasService } from '../../core/services/cuentas-service';
import { ResumenDashboard } from '../../core/services/resumen-dashboard';

describe('Dashboard remoto', () => {
  beforeEach(() => localStorage.removeItem(PERIODO_DASHBOARD_KEY));
  afterEach(() => {
    localStorage.removeItem(PERIODO_DASHBOARD_KEY);
    vi.restoreAllMocks();
  });
  function crear() {
    const views = [
      {
        id: 'c1',
        alumnoId: 'a',
        alumno: 'Ana',
        concepto: 'Cuota',
        periodo: '2026-10',
        importe: 100,
        abonado: 30,
        saldo: 70,
        vencimiento: '2026-10-31',
        estado: 'Parcial',
      },
      {
        id: 'c2',
        alumnoId: 'a',
        alumno: 'Ana',
        concepto: 'Cuota',
        periodo: '2026-10',
        importe: 200,
        abonado: 200,
        saldo: 0,
        vencimiento: '2026-10-20',
        estado: 'Pagada',
      },
      {
        id: 'c3',
        alumnoId: 'b',
        alumno: 'Bea',
        concepto: 'Cuota',
        periodo: '2026-10',
        importe: 50,
        abonado: 20,
        saldo: 30,
        vencimiento: '2026-10-10',
        estado: 'Vencida',
      },
      {
        id: 'c4',
        alumnoId: 'b',
        alumno: 'Bea',
        concepto: 'Cuota',
        periodo: '2026-09',
        importe: 500,
        abonado: 10,
        saldo: 490,
        vencimiento: '2026-11-10',
        estado: 'Parcial',
      },
    ];
    const cuentas = {
      hoy: signal('2026-10-22'),
      alumnos: signal([
        { estado: 'Activo', modalidad: 'Presencial' },
        { estado: 'Activo', modalidad: 'Online' },
        { estado: 'Inactivo', modalidad: 'Online' },
      ]),
      cuotas: signal(views),
      cuentas: signal(views),
      pagos: signal([
        { fecha: '2026-10-02', importe: 30 },
        { fecha: '2026-09-01', importe: 100 },
        { fecha: '2026-10-03', importe: 100 },
        { fecha: '2026-10-04', importe: 20 },
        { fecha: '2026-10-05', importe: 10 },
      ]),
      disponible: signal(true),
      cargando: signal(false),
      guardando: signal(false),
      errorCarga: signal(''),
      recargar: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [{ provide: CuentasService, useValue: cuentas }],
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    return { fixture, cuentas, resumen: TestBed.inject(ResumenDashboard) };
  }
  it('usa pagos efectivamente recibidos, saldos y estados del servicio financiero', () => {
    const { resumen } = crear();
    expect(resumen.activos()).toHaveLength(2);
    expect(resumen.presenciales()).toBe(1);
    expect(resumen.online()).toBe(1);
    expect(resumen.ingresos()).toBe(160);
    expect(resumen.pendiente()).toBe(100);
    expect(resumen.pagadas()).toBe(1);
    expect(resumen.vencidas()).toBe(1);
    expect(resumen.parciales()).toBe(2);
    expect(resumen.deudas().map((c) => c.id)).toEqual(['c3', 'c1']);
    resumen.elegirPeriodo('2026-09');
    expect(resumen.ingresos()).toBe(100);
    expect(resumen.pendiente()).toBe(490);
  });
  it('navega sin registros y cruza anios sin inventar movimientos', async () => {
    const { fixture, resumen } = crear();
    expect(resumen.periodo()).toBe('2026-10');
    const mes = fixture.debugElement.query(By.directive(MatSelect)).componentInstance as MatSelect;
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mes.value).toBe('10');
    expect(mes.triggerValue).toBe('Octubre');
    mes.selectionChange.emit({ source: mes, value: '03' });
    expect(resumen.periodo()).toBe('2026-03');
    const input = fixture.nativeElement.querySelector('input[type=number]');
    input.value = '2025';
    input.dispatchEvent(new Event('input'));
    input.value = '1800';
    input.dispatchEvent(new Event('input'));
    expect(resumen.periodo()).toBe('2025-03');
    expect(resumen.ingresos()).toBe(0);
    expect(resumen.pendiente()).toBe(0);
    expect(resumen.deudas()).toEqual([]);
    resumen.elegirPeriodo('2027-01');
    expect(resumen.ingresos()).toBe(0);
    resumen.elegirPeriodo('2026-13');
    expect(resumen.periodo()).toBe('2027-01');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay saldos pendientes');
  });
  it('restaura solo la preferencia del periodo al recargar y al recrear la vista', async () => {
    const { fixture, resumen } = crear();
    resumen.elegirPeriodo('2025-03');
    expect(localStorage.getItem(PERIODO_DASHBOARD_KEY)).toBe('2025-03');
    fixture.destroy();
    const otra = TestBed.createComponent(Dashboard);
    otra.detectChanges();
    await otra.whenStable();
    otra.detectChanges();
    expect(otra.componentInstance.resumen.periodo()).toBe('2025-03');
    expect(otra.debugElement.query(By.directive(MatSelect)).componentInstance.triggerValue).toBe(
      'Marzo',
    );
    TestBed.resetTestingModule();
    const recargado = crear();
    expect(recargado.resumen.periodo()).toBe('2025-03');
    expect(recargado.resumen.ingresos()).toBe(0);
  });
  it('ignora preferencias invalidas y funciona con almacenamiento bloqueado', () => {
    localStorage.setItem(PERIODO_DASHBOARD_KEY, '2026-00');
    const { resumen } = crear();
    expect(resumen.periodo()).toBe('2026-10');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    resumen.elegirPeriodo('2027-01');
    expect(resumen.periodo()).toBe('2027-01');
  });
  it('mantiene el periodo visual y las cifras juntos ante cambios rapidos y llegada de datos', () => {
    const { fixture, resumen, cuentas } = crear();
    for (const p of ['2026-09', '2027-01', '2025-03', '2026-10', '2026-09'])
      resumen.elegirPeriodo(p);
    cuentas.pagos.set([
      { fecha: '2026-10-10', importe: 999 },
      { fecha: '2026-09-01', importe: 12 },
    ]);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MatSelect)).componentInstance.triggerValue).toBe(
      'Septiembre',
    );
    expect(resumen.ingresos()).toBe(12);
    expect(resumen.pendiente()).toBe(490);
    expect(cuentas.recargar).not.toHaveBeenCalled();
    expect(resumen.activos()).toHaveLength(2);
  });
  it('usa el mes argentino del servicio sin conversion a indices de JavaScript', () => {
    localStorage.removeItem(PERIODO_DASHBOARD_KEY);
    const { cuentas } = crear();
    TestBed.resetTestingModule();
    cuentas.hoy.set('2027-01-01');
    TestBed.configureTestingModule({ providers: [{ provide: CuentasService, useValue: cuentas }] });
    expect(TestBed.inject(ResumenDashboard).periodo()).toBe('2027-01');
  });
  it('diferencia carga y error sin mostrar importes inventados', () => {
    const { fixture, cuentas } = crear();
    cuentas.cargando.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Actualizando resumen');
    expect(fixture.nativeElement.querySelector('app-stat-card')).toBeNull();
    cuentas.cargando.set(false);
    cuentas.errorCarga.set('offline');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-stat-card')).toBeNull();
  });
  it('muestra estado vacío y refleja cambios remotos al actualizar', () => {
    const { fixture, cuentas, resumen } = crear();
    cuentas.pagos.set([{ fecha: '2026-10-22', importe: 42 }]);
    expect(resumen.ingresos()).toBe(42);
    cuentas.alumnos.set([]);
    cuentas.cuentas.set([]);
    cuentas.cuotas.set([]);
    cuentas.pagos.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay datos');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(cuentas.recargar).not.toHaveBeenCalled();
  });
});
