import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RecuperacionCuotas } from './recuperacion-cuotas';
import { GenerarMensual } from '../cuentas/generar-mensual';
import { CuentasService } from '../../core/services/cuentas-service';

describe('Recuperación administrativa de cuotas', () => {
  it('reutiliza la generación con vista previa, bloquea cargas y evita diálogos duplicados', () => {
    const cuentas = {
      disponible: signal(false),
      errorCarga: signal(''),
      cargando: signal(false),
      refrescarSiNecesario: vi.fn(),
      recargar: vi.fn(),
    };
    const dialog = { open: vi.fn(), openDialogs: [] as any[] };
    TestBed.configureTestingModule({
      providers: [
        { provide: CuentasService, useValue: cuentas },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(RecuperacionCuotas);
    fixture.detectChanges();
    expect(cuentas.refrescarSiNecesario).toHaveBeenCalledTimes(1);
    fixture.componentInstance.abrir();
    expect(dialog.open).not.toHaveBeenCalled();
    cuentas.disponible.set(true);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(dialog.open).toHaveBeenCalledWith(
      GenerarMensual,
      expect.objectContaining({ maxHeight: '90dvh' }),
    );
    dialog.openDialogs.push({ componentInstance: Object.create(GenerarMensual.prototype) });
    fixture.componentInstance.abrir();
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });
});
