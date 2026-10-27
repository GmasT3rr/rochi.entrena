import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Skeleton } from './skeleton';
import { LoadingLayout } from './loading-layout';
import { Alumnos } from '../../features/alumnos/alumnos';
import { Cuentas } from '../../features/cuentas/cuentas';
import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { MatDialog } from '@angular/material/dialog';

describe('Skeleton loading', () => {
  it('permite formas y dimensiones sin exponer decoración a lectores de pantalla', () => {
    const fixture = TestBed.createComponent(Skeleton);
    fixture.componentRef.setInput('shape', 'circle');
    fixture.componentRef.setInput('width', '80px');
    fixture.componentRef.setInput('height', '80px');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.classList.contains('circle')).toBe(true);
    expect(fixture.nativeElement.style.width).toBe('80px');
  });
  it('reproduce indicadores, línea, donas y deudas sin valores financieros', () => {
    const fixture = TestBed.createComponent(LoadingLayout);
    fixture.componentRef.setInput('variant', 'dashboard');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-busy')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.metrics .metric')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('app-skeleton.circle')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).not.toContain('$0');
    expect(fixture.nativeElement.querySelector('.income')).not.toBeNull();
  });
  for (const tipo of ['alumnos', 'cuentas'] as const) {
    it(`${tipo}: permanece durante la espera y se retira ante error o resultado vacío`, () => {
      const service = {
        orden: signal({ active: 'nombre', direction: 'asc' as const }),
        cargandoInicial: signal(true),
        cargando: signal(true),
        listadoCargado: signal(false),
        refrescarSiNecesario: vi.fn(),
        guardando: signal(false),
        alumnos: signal([]),
        cuotas: signal([]),
        pagos: signal([]),
        ingresos: signal([]),
        cobrosDirectos: signal([]),
        hoy: signal('2026-10-24'),
        cuentas: signal([]),
        error: signal(''),
        errorListado: signal(''),
        detalleErrorListado: signal(null),
        errorCarga: signal(''),
        mensaje: signal(''),
        tieneDatos: signal(false),
        disponible: signal(false),
        filtros: {
          busqueda: signal(''),
          periodo: signal(''),
          alumnoId: signal(''),
          estado: signal(''),
          modalidad: signal(''),
        },
      };
      const component = tipo === 'alumnos' ? Alumnos : Cuentas;
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AlumnosService, useValue: service },
          { provide: CuentasService, useValue: service },
          { provide: MatDialog, useValue: {} },
        ],
      });
      const fixture = TestBed.createComponent<Alumnos | Cuentas>(component);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-loading-layout')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('table')).toBeNull();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-loading-layout')).not.toBeNull();
      service.cargando.set(false);
      service.cargandoInicial.set(false);
      service.error.set('Sin conexión');
      service.errorListado.set('Sin conexión');
      service.errorCarga.set('Sin conexión');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-loading-layout')).toBeNull();
      expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain(
        'Sin conexión',
      );
      service.error.set('');
      service.errorListado.set('');
      service.errorCarga.set('');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-loading-layout')).toBeNull();
      expect(fixture.nativeElement.querySelector('table')).not.toBeNull();
    });
  }
});
