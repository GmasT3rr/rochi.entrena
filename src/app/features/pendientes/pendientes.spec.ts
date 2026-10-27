import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Pendientes } from './pendientes';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaVista } from '../../core/cuentas';
import { CategoriaPendiente } from '../../core/services/pendientes';
import { CuentaForm } from '../cuentas/cuenta-form';
import { routes } from '../../app.routes';

describe('Centro de pendientes', () => {
  function crear() {
    const service = {
      cuentas: signal<CuentaVista[]>([]),
      hoy: signal('2026-10-22'),
      cargandoInicial: signal(true),
      cargando: signal(true),
      guardando: signal(false),
      tieneDatos: signal(false),
      disponible: signal(false),
      errorCarga: signal(''),
      recargar: vi.fn(),
      refrescarSiNecesario: vi.fn(),
      filtrosPendientes: { categoria: signal<CategoriaPendiente | ''>(''), busqueda: signal('') },
      filtros: {
        periodo: signal('2026-10'),
        busqueda: signal(''),
        estado: signal('Vencida'),
        modalidad: signal('Online'),
      },
    };
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CuentasService, useValue: service }],
    });
    TestBed.overrideComponent(Pendientes, {
      set: { providers: [{ provide: MatDialog, useValue: { open, openDialogs: [] } }] },
    });
    const fixture = TestBed.createComponent(Pendientes);
    fixture.detectChanges();
    return { fixture, service, open, c: fixture.componentInstance };
  }
  it('distingue carga, error recuperable y ausencia de pendientes sin cifras ficticias', () => {
    const { fixture, service } = crear();
    expect(fixture.nativeElement.querySelector('app-loading-layout')).not.toBeNull();
    service.cargando.set(false);
    service.cargandoInicial.set(false);
    service.errorCarga.set('offline');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Saldo total pendiente');
    service.errorCarga.set('');
    service.disponible.set(true);
    service.tieneDatos.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Estás al día');
  });
  it('filtra sin duplicar y abre las operaciones existentes con la cuota elegida', () => {
    const { fixture, service, open, c } = crear();
    const cuota = {
      id: 'c',
      alumno: 'Ángela Pérez',
      concepto: 'Mensual',
      saldo: 70,
      abonado: 30,
      vencimiento: '2026-10-21',
      periodo: '2026-10',
    } as CuentaVista;
    service.cuentas.set([cuota]);
    service.cargando.set(false);
    service.cargandoInicial.set(false);
    service.disponible.set(true);
    service.tieneDatos.set(true);
    fixture.detectChanges();
    expect(c.total()).toBe(70);
    expect(c.contar('vencida')).toBe(1);
    expect(c.contar('parcial')).toBe(0);
    c.busqueda.set('angela');
    expect(c.visibles()).toHaveLength(1);
    c.categoria.set('proxima');
    expect(c.visibles()).toHaveLength(0);
    c.pagar(cuota);
    expect(open.mock.calls[0][1].data).toEqual({ tipo: 'pago', cuota });
    c.detalle(cuota);
    expect(open.mock.calls[1][1].data).toBe('c');
    service.disponible.set(false);
    c.pagar(cuota);
    expect(open).toHaveBeenCalledTimes(2);
  });
  it('incluye todos los meses, cuenta cada cuota una vez y conserva la marca de pago parcial vencido', () => {
    const { c, service, fixture } = crear();
    const cuota = (
      id: string,
      saldo: number,
      vencimiento: string,
      abonado = 0,
      periodo = '2026-09',
    ) =>
      ({
        id,
        alumno: 'Ángela',
        concepto: 'Entrenamiento',
        saldo,
        vencimiento,
        abonado,
        periodo,
      }) as CuentaVista;
    service.cuentas.set([
      cuota('vencida', 70.25, '2026-09-10', 29.75),
      cuota('hoy', 10.1, '2026-10-22'),
      cuota('limite', 20, '2026-10-29', 10),
      cuota('parcial', 30, '2026-11-01', 10),
      cuota('otro', 40, '2026-11-02'),
      cuota('pagada', 0, '2026-09-01', 100),
    ]);
    service.cargando.set(false);
    service.cargandoInicial.set(false);
    service.disponible.set(true);
    service.tieneDatos.set(true);
    fixture.detectChanges();
    expect(c.total()).toBe(170.35);
    expect(c.pendientes()).toHaveLength(5);
    expect(c.categorias.map((cat) => c.contar(cat.id))).toEqual([1, 2, 1, 1]);
    expect(c.categorias.reduce((n, cat) => n + c.contar(cat.id), 0)).toBe(c.pendientes().length);
    expect(fixture.nativeElement.textContent).toContain('Con pagos parciales');
    c.categoria.set('vencida');
    c.busqueda.set('entrenamiento');
    expect(c.visibles().map((p) => p.cuota.id)).toEqual(['vencida']);
    expect(c.total()).toBe(170.35);
    service.filtros.periodo.set('2027-01');
    expect(c.total()).toBe(170.35);
  });
  it('conserva filtros propios al recrearse la pantalla sin modificar los de Cuotas y cobros', () => {
    const { c, service, fixture } = crear();
    c.categoria.set('parcial');
    c.busqueda.set('Ana');
    fixture.destroy();
    service.cargando.set(false);
    service.cargandoInicial.set(false);
    service.disponible.set(true);
    service.tieneDatos.set(true);
    const nueva = TestBed.createComponent(Pendientes);
    nueva.detectChanges();
    expect(service.refrescarSiNecesario).toHaveBeenCalledTimes(2);
    expect(nueva.componentInstance.categoria()).toBe('parcial');
    expect(nueva.componentInstance.busqueda()).toBe('Ana');
    expect(service.filtros.periodo()).toBe('2026-10');
    expect(service.filtros.estado()).toBe('Vencida');
    expect(service.filtros.modalidad()).toBe('Online');
    expect(service.filtros.busqueda()).toBe('');
    expect(nueva.nativeElement.querySelector('a[href="/dashboard"]')).not.toBeNull();
  });
  it('conserva la ruta existente y bloquea cobros sobre cuotas pagadas o un formulario ya abierto', async () => {
    const ruta = routes.find((r) => r.children)?.children?.find((r) => r.path === 'pendientes');
    expect(await ruta!.loadComponent!()).toBe(Pendientes);
    expect(ruta?.title).toBe('Centro de pendientes');
    const { c, service, open, fixture } = crear();
    const cuota = { id: 'c', saldo: 0 } as CuentaVista;
    service.cargando.set(false);
    service.cargandoInicial.set(false);
    service.disponible.set(true);
    service.tieneDatos.set(true);
    service.cuentas.set([cuota]);
    c.pagar(cuota);
    expect(open).not.toHaveBeenCalled();
    service.cuentas.set([{ ...cuota, saldo: 20 }]);
    const dialog = fixture.debugElement.injector.get(MatDialog);
    dialog.openDialogs.push({ componentInstance: Object.create(CuentaForm.prototype) } as any);
    c.pagar(cuota);
    expect(open).not.toHaveBeenCalled();
  });
});
