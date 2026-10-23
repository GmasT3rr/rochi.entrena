import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Pendientes } from './pendientes';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaVista } from '../../core/cuentas';

describe('Centro de pendientes', () => {
  function crear() {
    const service = {
      cuentas: signal<CuentaVista[]>([]),
      hoy: signal('2026-10-22'),
      cargando: signal(true),
      guardando: signal(false),
      disponible: signal(false),
      errorCarga: signal(''),
      recargar: vi.fn(),
    };
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CuentasService, useValue: service }],
    });
    TestBed.overrideComponent(Pendientes, {
      set: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const fixture = TestBed.createComponent(Pendientes);
    fixture.detectChanges();
    return { fixture, service, open, c: fixture.componentInstance };
  }
  it('distingue carga, error recuperable y ausencia de pendientes sin cifras ficticias', () => {
    const { fixture, service } = crear();
    expect(fixture.nativeElement.querySelector('app-loading-layout')).not.toBeNull();
    service.cargando.set(false);
    service.errorCarga.set('offline');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Saldo total pendiente');
    service.errorCarga.set('');
    service.disponible.set(true);
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
    service.disponible.set(true);
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
});
