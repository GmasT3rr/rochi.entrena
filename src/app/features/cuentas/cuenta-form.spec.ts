import { EMPTY } from 'rxjs';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { CuentaForm } from './cuenta-form';
import { CuentasService } from '../../core/services/cuentas-service';

const cuota = {
  id: 'c',
  alumnoId: 'a',
  concepto: 'Cuota',
  periodo: '2026-10',
  importe: 100,
  vencimiento: '2026-10-31',
  observaciones: '',
};
describe('Formulario de cuotas y pagos remotos', () => {
  async function form(data: any) {
    const close = vi.fn();
    const confirmar = new Subject<boolean>();
    const version = { actualizadoEn: '2026-10-01T00:00:00Z', revision: '1' };
    const service = {
      hoy: signal('2026-10-22'),
      disponible: signal(true),
      guardando: signal(false),
      cargando: signal(false),
      error: signal(''),
      alumnos: signal([
        { id: 'a', nombre: 'Ana', apellido: 'Pérez', modalidad: 'Online', estado: 'Activo' },
      ]),
      cuentas: signal([
        { ...cuota, alumno: 'Ana Pérez', abonado: 0, saldo: 100, pagos: [] as any[] },
      ]),
      versionCuota: () => version,
      versionPago: () => version,
      guardarCuota: vi.fn().mockResolvedValue(true),
      guardarPago: vi.fn().mockResolvedValue(true),
      recargar: vi.fn(),
    };
    const open = vi.fn().mockReturnValue({ afterClosed: () => confirmar });
    TestBed.configureTestingModule({
      imports: [CuentaForm],
      providers: [
        { provide: CuentasService, useValue: service },
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
        { provide: MatDialog, useValue: { open } },
      ],
    });
    TestBed.overrideComponent(CuentaForm, {
      set: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const fixture = TestBed.createComponent(CuentaForm);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      service,
      close,
      confirmar,
      open,
      version,
    };
  }
  it('inicia en el periodo argentino y sincroniza mes y anio con el payload ISO', async () => {
    const { component, fixture, service } = await form({ tipo: 'cuota' });
    await fixture.whenStable();
    fixture.detectChanges();
    const selects = fixture.debugElement.queryAll(By.directive(MatSelect));
    const mes = selects[1].componentInstance as MatSelect;
    expect(mes.triggerValue).toBe('Octubre');
    expect(component.cuotaForm.controls.periodo.value).toBe('2026-10');
    mes.selectionChange.emit({ source: mes, value: '03' });
    const anio = fixture.nativeElement.querySelector('input[type=number][min="1900"]');
    anio.value = '2025';
    anio.dispatchEvent(new Event('input'));
    expect(component.cuotaForm.controls.periodo.value).toBe('2025-03');
    component.cuotaForm.patchValue({ alumnoId: 'a', concepto: 'Mensual', importe: 100 });
    await component.guardar();
    expect(service.guardarCuota.mock.calls[0][0].periodo).toBe('2025-03');
    anio.value = '1800';
    anio.dispatchEvent(new Event('input'));
    await component.guardar();
    expect(service.guardarCuota).toHaveBeenCalledTimes(1);
  });
  it('conserva el periodo historico al editar y convierte fechas argentinas sin cambiar validaciones', async () => {
    const { component, fixture } = await form({
      tipo: 'cuota',
      cuota: { ...cuota, periodo: '2024-02' },
    });
    expect(component.cuotaForm.controls.periodo.value).toBe('2024-02');
    const fecha = fixture.nativeElement.querySelector('input[formControlName=vencimiento]');
    expect(fecha.value).toBe('31/10/2026');
    fecha.value = '29/02/2024';
    fecha.dispatchEvent(new Event('input'));
    expect(component.cuotaForm.controls.vencimiento.value).toBe('2024-02-29');
    expect(component.cuotaForm.controls.vencimiento.valid).toBe(true);
    fecha.value = '31/02/2024';
    fecha.dispatchEvent(new Event('input'));
    expect(component.cuotaForm.controls.vencimiento.invalid).toBe(true);
  });
  it('solo muestra alumnos remotos y no cierra antes de la confirmación del servidor', async () => {
    localStorage.setItem('rochy.alumnos.v1', 'datos locales no utilizados');
    try {
      const { component, fixture, service, close } = await form({ tipo: 'cuota' });
      component.cuotaForm.patchValue(cuota);
      let resolve!: (result: boolean) => void;
      service.guardarCuota.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
      const pending = component.guardar();
      expect(close).not.toHaveBeenCalled();
      resolve(true);
      await pending;
      expect(close).toHaveBeenCalledWith(true);
      expect(component.alumnos.alumnos()[0].id).toBe('a');
      expect(fixture.nativeElement.textContent).toContain('Alumno');
      expect(localStorage.getItem('rochy.alumnos.v1')).toBe('datos locales no utilizados');
    } finally {
      localStorage.removeItem('rochy.alumnos.v1');
    }
  });
  it('bloquea traslado de cuota y conserva versión original e ID de alta para reintentos', async () => {
    const { component, service, version } = await form({ tipo: 'cuota', cuota });
    expect(component.cuotaForm.controls.alumnoId.disabled).toBe(true);
    service.guardarCuota.mockResolvedValue(false);
    await component.guardar();
    await component.guardar();
    expect(service.guardarCuota.mock.calls[0][3]).toEqual(version);
    expect(service.guardarCuota.mock.calls[0][2]).toBe(service.guardarCuota.mock.calls[1][2]);
  });
  it('la edición de pago requiere confirmación y no cierra cuando se cancela', async () => {
    const pago = {
      id: 'p',
      cuotaId: 'c',
      importe: 10,
      fecha: '2026-10-10',
      medio: 'Efectivo',
      observaciones: '',
    };
    const { component, service, close, confirmar, open } = await form({
      tipo: 'pago',
      cuota,
      pago,
    });
    await component.guardar();
    expect(open).toHaveBeenCalled();
    expect(service.guardarPago).not.toHaveBeenCalled();
    confirmar.next(false);
    expect(service.guardarPago).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('no envía pagos si la consulta no está disponible o el importe es inválido', async () => {
    const { component, service } = await form({ tipo: 'pago', cuota });
    component.pagoForm.controls.importe.setValue(0.001);
    await component.guardar();
    component.pagoForm.controls.importe.setValue(10);
    service.disponible.set(false);
    await component.guardar();
    expect(service.guardarPago).not.toHaveBeenCalled();
  });
  it('precarga el saldo y la fecha argentina, permite un cobro parcial y muestra el saldo resultante', async () => {
    const { component, service, fixture, close } = await form({ tipo: 'pago', cuota });
    expect(component.pagoForm.getRawValue()).toMatchObject({
      importe: 100,
      fecha: '2026-10-22',
      medio: 'Transferencia',
    });
    expect(component.saldoResultante).toBe(0);
    component.pagoForm.controls.importe.setValue(30.25);
    expect(component.saldoResultante).toBe(69.75);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ana Pérez');
    await component.guardar();
    expect(service.guardarPago.mock.calls[0][0]).toMatchObject({ cuotaId: 'c', importe: 30.25 });
    expect(close).toHaveBeenCalledWith(true);
  });
  it('rechaza sobrepagos y cuotas pagadas antes de enviarlos', async () => {
    const { component, service } = await form({ tipo: 'pago', cuota });
    component.pagoForm.controls.importe.setValue(101);
    await component.guardar();
    expect(component.error()).toContain('supera');
    service.cuentas.update((cs) => cs.map((c) => ({ ...c, abonado: 100, saldo: 0 })));
    component.pagoForm.controls.importe.setValue(1);
    await component.guardar();
    expect(component.error()).toContain('ya está pagada');
    expect(service.guardarPago).not.toHaveBeenCalled();
  });
  it('bloquea el doble envío y espera la confirmación del cobro completo', async () => {
    const { component, service, close } = await form({ tipo: 'pago', cuota });
    let resolver!: (ok: boolean) => void;
    service.guardarPago.mockReturnValue(new Promise<boolean>((resolve) => (resolver = resolve)));
    const guardado = component.guardar();
    await component.guardar();
    expect(service.guardarPago).toHaveBeenCalledTimes(1);
    expect(component.enviando()).toBe(true);
    expect(close).not.toHaveBeenCalled();
    resolver(true);
    await guardado;
    expect(close).toHaveBeenCalledWith(true);
    expect(component.enviando()).toBe(false);
  });
  it('conserva campos e ID al fallar y permite reintentar', async () => {
    const { component, service, close } = await form({ tipo: 'pago', cuota });
    component.pagoForm.patchValue({ importe: 25, medio: 'Efectivo', observaciones: 'Seña' });
    const valores = component.pagoForm.getRawValue();
    service.error.set('Sin conexión. Actualizá los datos.');
    service.guardarPago.mockResolvedValueOnce(false);
    await component.guardar();
    expect(close).not.toHaveBeenCalled();
    expect(component.error()).toContain('Sin conexión');
    expect(component.pagoForm.getRawValue()).toEqual(valores);
    await component.guardar();
    expect(service.guardarPago.mock.calls[0][2]).toBe(service.guardarPago.mock.calls[1][2]);
    expect(close).toHaveBeenCalledWith(true);
  });
  it('usa el medio del pago más reciente y un predeterminado si no es válido', async () => {
    const { component, service } = await form({ tipo: 'cuota' });
    service.cuentas.update((cs) =>
      cs.map((c) => ({
        ...c,
        pagos: [
          { id: 'p1', fecha: '2026-10-10', medio: 'Transferencia' },
          { id: 'p2', fecha: '2026-10-20', medio: 'Efectivo' },
        ],
      })),
    );
    // Comprobar la selección al crear otro diálogo con los mismos datos confirmados.
    TestBed.inject(MAT_DIALOG_DATA).tipo = 'pago';
    TestBed.inject(MAT_DIALOG_DATA).cuota = cuota;
    const segundo = TestBed.createComponent(CuentaForm).componentInstance;
    expect(segundo.pagoForm.controls.medio.value).toBe('Efectivo');
    service.cuentas.update((cs) =>
      cs.map((c) => ({ ...c, pagos: [{ id: 'p3', fecha: '2026-10-21', medio: 'Inválido' }] })),
    );
    expect(
      TestBed.createComponent(CuentaForm).componentInstance.pagoForm.controls.medio.value,
    ).toBe('Transferencia');
  });
});
