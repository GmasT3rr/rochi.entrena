import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { CuentaVista } from '../../core/cuentas';
import { CuentasService } from '../../core/services/cuentas-service';
import { confirmarEliminarCuota, ConfirmarEliminarCuota } from './confirmar-eliminar-cuota';
import { HistorialPagos } from './historial-pagos';

const cuota = {
  id: 'c',
  alumno: 'Ana Pérez',
  alumnoId: 'a',
  concepto: 'Entrenamiento',
  periodo: '2026-10',
  importe: 100,
  abonado: 0,
  saldo: 100,
  pagos: [],
  estado: 'Pendiente',
  vencimiento: '2026-10-31',
  observaciones: '',
} as unknown as CuentaVista;

describe('Eliminar cuota desde acciones', () => {
  function preparar() {
    const respuesta = new Subject<boolean>();
    const version = { actualizadoEn: '2026-10-01T00:00:00Z', revision: '1' };
    const service = {
      tieneDatos: signal(true),
      disponible: signal(true),
      versionCuota: vi.fn(() => version),
      eliminarCuota: vi.fn().mockResolvedValue(true),
    };
    const dialog = { open: vi.fn(() => ({ afterClosed: () => respuesta })) };
    return {
      respuesta,
      version,
      service,
      dialog,
      ejecutar: (c = cuota) =>
        confirmarEliminarCuota(
          dialog as unknown as MatDialog,
          service as unknown as CuentasService,
          c,
        ),
    };
  }
  it('cancela sin borrar y muestra los datos completos de la cuota', async () => {
    const { ejecutar, respuesta, service, dialog } = preparar();
    const resultado = ejecutar();
    expect(dialog.open.mock.calls[0]).toBeDefined();
    respuesta.next(false);
    expect(await resultado).toBe(false);
    expect(service.eliminarCuota).not.toHaveBeenCalled();
    TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: cuota }] });
    const fixture = TestBed.createComponent(ConfirmarEliminarCuota);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(cuota.alumno);
    expect(fixture.nativeElement.textContent).toContain(cuota.concepto);
    expect(fixture.nativeElement.textContent).toContain('2026');
    expect(fixture.nativeElement.textContent).toContain('Eliminar');
  });
  it('espera la respuesta del servicio y conserva la version vista antes de confirmar', async () => {
    const { ejecutar, respuesta, service, version } = preparar();
    let resolver!: (valor: boolean) => void;
    service.eliminarCuota.mockReturnValue(new Promise<boolean>((r) => (resolver = r)));
    let termino = false;
    const resultado = ejecutar().then((ok) => {
      termino = true;
      return ok;
    });
    respuesta.next(true);
    await Promise.resolve();
    expect(service.eliminarCuota).toHaveBeenCalledWith('c', version);
    expect(termino).toBe(false);
    resolver(true);
    expect(await resultado).toBe(true);
  });
  it('bloquea cuotas con pagos y conserva rechazo por conflicto concurrente', async () => {
    const { ejecutar, respuesta, service, dialog } = preparar();
    expect(await ejecutar({ ...cuota, pagos: [{}] } as CuentaVista)).toBe(false);
    expect(dialog.open).not.toHaveBeenCalled();
    service.eliminarCuota.mockResolvedValue(false);
    const resultado = ejecutar();
    respuesta.next(true);
    expect(await resultado).toBe(false);
  });
  it('el historial integrado conserva el estado vacío sin consultas adicionales', () => {
    const f = TestBed.createComponent(HistorialPagos);
    f.componentRef.setInput('pagos', []);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No hay pagos registrados');
  });
});
