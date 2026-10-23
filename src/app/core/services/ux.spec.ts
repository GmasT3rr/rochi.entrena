import { TestBed } from '@angular/core/testing';
import { DestroyRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject, of } from 'rxjs';
import { ToastService } from './toast-service';
import { ordenar } from './orden-tabla';
import { clasificarPendientes } from './pendientes';
import { CuentaVista } from '../cuentas';
import { cambioReal, CambiosPendientes } from './cambios-pendientes';

describe('Notificaciones', () => {
  it('distingue tipos, permite cierre, anuncia y evita duplicados inmediatos', () => {
    const openFromComponent = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: { openFromComponent } }],
    });
    const toast = TestBed.inject(ToastService);
    toast.mostrar('Guardado.', 'exito');
    toast.mostrar('Guardado.', 'exito');
    expect(openFromComponent).toHaveBeenCalledTimes(1);
    const config = openFromComponent.mock.calls[0][1];
    expect(config.announcementMessage).toBe('Guardado.');
    expect(config.politeness).toBe('polite');
    expect(config.panelClass).toContain('hub-toast--exito');
    toast.mostrar('Revisá la conexión.', 'error');
    expect(openFromComponent.mock.calls[1][1]).toMatchObject({
      politeness: 'assertive',
      duration: 9000,
    });
    toast.mostrar('');
    expect(openFromComponent).toHaveBeenCalledTimes(2);
  });
});
describe('Ordenamiento', () => {
  it('ordena números y fechas sin mutar las filas originales', () => {
    const filas = [
      { importe: 100, fecha: '2026-10-02' },
      { importe: 9, fecha: '2025-12-31' },
    ];
    expect(
      ordenar(filas, { active: 'importe', direction: 'asc' }, (r, k) => r[k as keyof typeof r])[0]
        .importe,
    ).toBe(9);
    expect(
      ordenar(filas, { active: 'fecha', direction: 'desc' }, (r, k) => r[k as keyof typeof r])[0]
        .fecha,
    ).toBe('2026-10-02');
    expect(filas[0].importe).toBe(100);
    expect(ordenar(filas, { active: 'importe', direction: '' }, (r) => r.importe)).toEqual(filas);
  });
  it('compara texto español sin distinguir acentos o mayúsculas', () => {
    expect(
      ordenar(['Zoe', 'Ángela', 'beatriz'], { active: 'nombre', direction: 'asc' }, (r) => r),
    ).toEqual(['Ángela', 'beatriz', 'Zoe']);
  });
});
describe('Pendientes reales', () => {
  const cuota = (id: string, saldo: number, vencimiento: string, abonado = 0) =>
    ({ id, saldo, vencimiento, abonado }) as CuentaVista;
  it('excluye pagadas y clasifica sin duplicar incluso las vencidas con abonos', () => {
    const resultado = clasificarPendientes(
      [
        cuota('pagada', 0, '2026-01-01', 100),
        cuota('vencida', 0.01, '2026-10-21', 99.99),
        cuota('hoy', 100, '2026-10-22'),
        cuota('limite', 50, '2026-10-29', 50),
        cuota('parcial', 20, '2026-10-30', 80),
        cuota('futura', 100, '2026-11-01'),
      ],
      '2026-10-22',
    );
    expect(resultado.map((r) => r.categoria)).toEqual([
      'vencida',
      'proxima',
      'proxima',
      'parcial',
      'pendiente',
    ]);
    expect(new Set(resultado.map((r) => r.cuota.id)).size).toBe(5);
  });
  it('cruza mes y año y admite estados vacíos', () => {
    expect(clasificarPendientes([cuota('a', 100, '2027-01-03')], '2026-12-28')[0].categoria).toBe(
      'proxima',
    );
    expect(clasificarPendientes([], '2026-10-22')).toEqual([]);
  });
});
describe('Cambios sin guardar', () => {
  function setup() {
    const open = vi.fn().mockReturnValue({ afterClosed: () => of(false) });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const service = TestBed.inject(CambiosPendientes);
    let actual = { nombre: 'Ana', importe: 100 };
    let ocupado = false;
    const close = vi.fn(),
      backdrop = new Subject<MouseEvent>(),
      keys = new Subject<KeyboardEvent>();
    const ref = {
      close,
      disableClose: false,
      backdropClick: () => backdrop,
      keydownEvents: () => keys,
    } as unknown as MatDialogRef<unknown>;
    const destroy = TestBed.inject(DestroyRef);
    service.proteger(
      ref,
      () => ({ ...actual }),
      () => ocupado,
      destroy,
    );
    return {
      service,
      open,
      close,
      ref,
      backdrop,
      keys,
      cambiar: () => (actual = { ...actual, nombre: 'Bea' }),
      revertir: () => (actual = { nombre: 'Ana', importe: 100 }),
      ocupar: () => (ocupado = true),
    };
  }
  it('compara valores reales y reconoce una edición revertida', () => {
    expect(cambioReal({ a: 1 }, { a: 1 })).toBe(false);
    expect(cambioReal({ a: 1 }, { a: 2 })).toBe(true);
  });
  it('permite cerrar intactos y protege cancelación, Escape, fondo, rutas y recarga', async () => {
    const x = setup();
    x.cambiar();
    x.ref.close();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(x.close).not.toHaveBeenCalled();
    expect(x.open).toHaveBeenCalled();
    x.keys.next(new KeyboardEvent('keydown', { key: 'Escape' }));
    x.backdrop.next(new MouseEvent('click'));
    expect(await x.service.salir()).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    x.revertir();
    expect(await x.service.salir()).toBe(true);
    expect(x.close).toHaveBeenCalled();
  });
  it('descarta explícitamente y evita avisos después de guardar', async () => {
    const x = setup();
    x.cambiar();
    x.open.mockReturnValue({ afterClosed: () => of(true) });
    expect(await x.service.salir()).toBe(true);
    expect(x.close).toHaveBeenCalled();
  });
  it('bloquea salir durante el guardado y permite el cierre confirmado', async () => {
    const x = setup();
    x.cambiar();
    x.ocupar();
    x.ref.close();
    expect(await x.service.salir()).toBe(false);
    expect(x.open).not.toHaveBeenCalled();
    x.ref.close(true);
    expect(x.close).toHaveBeenCalledWith(true);
    expect(await x.service.salir()).toBe(true);
  });
});
