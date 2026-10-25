import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CuentasService } from '../../core/services/cuentas-service';
import { DescargasService } from '../../core/services/descargas-service';
import { CobrosDirectos } from './cobros-directos';
import { CobroDirectoForm } from './cobro-directo-form';

const cobro = {
  id: 'd',
  alumnoId: 'a',
  concepto: 'Clase extra',
  importe: 50,
  fecha: '2026-10-01',
  medio: 'Efectivo' as const,
  observaciones: 'Observación',
};
describe('Interfaz de cobros directos', () => {
  afterEach(() => TestBed.resetTestingModule());
  function preparar(data = {}) {
    const service = {
      alumnos: signal([{ id: 'a', nombre: 'Ana', apellido: 'Pérez' }]),
      hoy: signal('2026-10-25'),
      disponible: signal(true),
      guardando: signal(false),
      cobrosDirectos: signal([cobro]),
      versionCobro: vi.fn(),
      error: signal(''),
      guardarCobro: vi.fn().mockResolvedValue(true),
      ingresos: signal([
        { ...cobro, tipo: 'Cobro directo' },
        { ...cobro, id: 'p', importe: 20, tipo: 'Pago de cuota' },
      ]),
    };
    const descargar = vi.fn();
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: CuentasService, useValue: service },
        { provide: DescargasService, useValue: { descargar } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: MatDialogRef,
          useValue: {
            close,
            disableClose: false,
            backdropClick: () => EMPTY,
            keydownEvents: () => EMPTY,
          },
        },
      ],
    });
    return { service, descargar, close };
  }
  it('presenta solo los campos del cobro, valida la fecha y evita doble envío', async () => {
    const { service, close } = preparar();
    const fixture = TestBed.createComponent(CobroDirectoForm);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.form.controls.fecha.value).toBe('2026-10-25');
    expect(fixture.nativeElement.querySelector('[formControlName="periodo"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[formControlName="vencimiento"]')).toBeNull();
    c.form.patchValue({ alumnoId: 'a', concepto: 'Clase extra', importe: 0 });
    await c.guardar();
    expect(service.guardarCobro).not.toHaveBeenCalled();
    c.form.patchValue({ importe: 50, fecha: '2026-10-26' });
    await c.guardar();
    expect(service.guardarCobro).not.toHaveBeenCalled();
    c.form.patchValue({ fecha: '2026-10-25' });
    await Promise.all([c.guardar(), c.guardar()]);
    expect(service.guardarCobro).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith(true);
  });
  it('filtra la misma fuente para tabla y tarjetas y exporta ingresos sin duplicarlos', () => {
    const { descargar } = preparar();
    const fixture = TestBed.createComponent(CobrosDirectos);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.record-card').length).toBe(1);
    c.concepto.set('inexistente');
    expect(c.filas()).toEqual([]);
    c.concepto.set('clase');
    c.desde.set('2026-10-02');
    expect(c.filas()).toEqual([]);
    c.desde.set('2026-10-01');
    c.hasta.set('2026-10-01');
    expect(c.filas()).toHaveLength(1);
    c.alumnoFiltro.set('otro');
    expect(c.filas()).toHaveLength(0);
    c.exportar(true);
    const csv = descargar.mock.calls[0][1];
    expect(csv.match(/Cobro directo/g)).toHaveLength(1);
    expect(csv.match(/Pago de cuota/g)).toHaveLength(1);
  });
});
