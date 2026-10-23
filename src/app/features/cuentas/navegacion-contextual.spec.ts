import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Cuentas } from './cuentas';
import { CuentasService } from '../../core/services/cuentas-service';
import { ToastService } from '../../core/services/toast-service';
describe('Navegación contextual a cuentas', () => {
  it('espera los datos autorizados, limpia filtros incompatibles y conserva cambios posteriores', () => {
    const params = new BehaviorSubject(convertToParamMap({ alumno: 'a' }));
    const service = {
      disponible: signal(false),
      alumnos: signal([{ id: 'a' }]),
      filtros: {
        busqueda: signal('previo'),
        periodo: signal('2025-01'),
        estado: signal('Vencida'),
        modalidad: signal('Online'),
        alumnoId: signal(''),
      },
      orden: signal({ active: 'saldo', direction: 'asc' }),
    };
    const mostrar = vi.fn();
    TestBed.overrideComponent(Cuentas, { set: { template: '' } });
    TestBed.configureTestingModule({
      providers: [
        { provide: CuentasService, useValue: service },
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: ToastService, useValue: { mostrar } },
      ],
    });
    const fixture = TestBed.createComponent(Cuentas);
    TestBed.tick();
    expect(service.filtros.alumnoId()).toBe('');
    service.disponible.set(true);
    TestBed.tick();
    expect(service.filtros.alumnoId()).toBe('a');
    expect(service.filtros.periodo()).toBe('');
    expect(service.filtros.estado()).toBe('');
    service.filtros.busqueda.set('Ana');
    service.disponible.set(false);
    TestBed.tick();
    service.disponible.set(true);
    TestBed.tick();
    expect(service.filtros.busqueda()).toBe('Ana');
    params.next(convertToParamMap({ periodo: '2026-13' }));
    TestBed.tick();
    expect(mostrar).toHaveBeenCalled();
    expect(service.filtros.alumnoId()).toBe('a');
    params.next(convertToParamMap({ periodo: '2026-10' }));
    TestBed.tick();
    expect(service.filtros.periodo()).toBe('2026-10');
    expect(service.filtros.alumnoId()).toBe('');
    fixture.destroy();
  });
});
