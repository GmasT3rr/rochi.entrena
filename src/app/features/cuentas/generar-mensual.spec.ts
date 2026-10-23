import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { GenerarMensual } from './generar-mensual';
import { CuentasService } from '../../core/services/cuentas-service';
import { AuthService } from '../../core/auth/auth-service';
import { VistaMensualRemota } from '../../core/mensual';

const vista = (): VistaMensualRemota => ({
  periodo: '2028-02',
  huella: 'a'.repeat(32),
  cuotas: [
    {
      alumnoId: 'a',
      alumno: 'Ana Pérez',
      concepto: 'Cuota de entrenamiento',
      periodo: '2028-02',
      importe: 10000,
      vencimiento: '2028-02-29',
      observaciones: '',
    },
  ],
  omitidos: [],
});
describe('Diálogo mensual de PostgreSQL', () => {
  const previsualizarMensual = vi.fn();
  const generarMensual = vi.fn();
  beforeEach(() => {
    previsualizarMensual.mockReset().mockResolvedValue(vista());
    generarMensual.mockReset();
  });
  function dialogo() {
    const service = {
      hoy: signal('2028-02-01'),
      disponible: signal(true),
      guardando: signal(false),
      cargando: signal(false),
      error: signal(''),
      previsualizarMensual,
      generarMensual,
      recargar: vi.fn(),
    };
    const ref = { disableClose: false };
    const session = signal<any>({ access_token: 'test' });
    TestBed.configureTestingModule({
      imports: [GenerarMensual],
      providers: [
        { provide: CuentasService, useValue: service },
        { provide: MatDialogRef, useValue: ref },
        { provide: AuthService, useValue: { session } },
      ],
    });
    const fixture = TestBed.createComponent(GenerarMensual);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service, ref, session };
  }
  it('exige vista previa y confirmación; no genera al elegir período ni previsualizar', async () => {
    const { component, fixture } = dialogo();
    await component.generar();
    expect(generarMensual).not.toHaveBeenCalled();
    await component.previsualizar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ana Pérez');
    expect(fixture.nativeElement.textContent).toContain('29/02/2028');
    await component.generar();
    expect(generarMensual).not.toHaveBeenCalled();
    component.confirmado.set(true);
    generarMensual.mockResolvedValue({
      periodo: '2028-02',
      estado: 'confirmada',
      generadas: 1,
      omitidas: 0,
      fallidas: 0,
      detalleOmitidos: [],
    });
    await component.generar();
    fixture.detectChanges();
    expect(generarMensual).toHaveBeenCalledTimes(1);
    expect(component.vista()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('1 cuotas generadas');
    await component.generar();
    expect(generarMensual).toHaveBeenCalledTimes(1);
  });
  it('cambiar período invalida la vista y no admite una previsualización de otro mes', async () => {
    const { component } = dialogo();
    await component.previsualizar();
    component.confirmado.set(true);
    component.periodo.setValue('2028-03');
    expect(component.vista()).toBeNull();
    expect(component.confirmado()).toBe(false);
    await component.generar();
    expect(generarMensual).not.toHaveBeenCalled();
  });
  it('mantiene el diálogo abierto y bloquea doble confirmación hasta recibir resultado', async () => {
    const { component, ref } = dialogo();
    await component.previsualizar();
    component.confirmado.set(true);
    let resolve!: (value: null) => void;
    generarMensual.mockReturnValue(new Promise((r) => (resolve = r)));
    const pendiente = component.generar();
    expect(ref.disableClose).toBe(true);
    await component.generar();
    expect(generarMensual).toHaveBeenCalledTimes(1);
    resolve(null);
    await pendiente;
    expect(component.resultado()).toBeNull();
    expect(component.error()).toContain('No se recibió');
    expect(ref.disableClose).toBe(false);
  });
  it('no muestra falsos ceros ante errores de RPC o de conexión', async () => {
    const { component } = dialogo();
    previsualizarMensual.mockRejectedValue({ code: 'TCF_MENSUAL_RPC' });
    await component.previsualizar();
    expect(component.error()).toContain('no está disponible');
    expect(component.error()).not.toMatch(/RPC|004|PostgreSQL/);
    expect(component.vista()).toBeNull();
    expect(component.resultado()).toBeNull();
  });
  it('descarta una vista recibida después de cambiar la sesión', async () => {
    const { component, session } = dialogo();
    let resolve!: (value: VistaMensualRemota) => void;
    previsualizarMensual.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = component.previsualizar();
    session.set({ access_token: 'other' });
    resolve(vista());
    await pending;
    expect(component.vista()).toBeNull();
  });
});
