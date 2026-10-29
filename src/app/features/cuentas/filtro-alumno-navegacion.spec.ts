import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Cuentas } from './cuentas';
import { CuentasService } from '../../core/services/cuentas-service';

@Component({ template: '' })
class OtroModulo {}

describe('Ciclo de vida del filtro Alumno', () => {
  for (const destino of ['dashboard', 'alumnos', 'configuracion', 'guia']) {
    it(`descarta el alumno al salir a ${destino} y respeta una nueva entrada explícita`, async () => {
      const service = {
        disponible: signal(true),
        alumnos: signal([{ id: 'a' }, { id: 'b' }]),
        filtros: {
          busqueda: signal(''),
          periodo: signal('2026-10'),
          estado: signal(''),
          modalidad: signal(''),
          alumnoId: signal('anterior'),
        },
        orden: signal({ active: 'saldo', direction: 'asc' }),
      };
      TestBed.overrideComponent(Cuentas, { set: { template: '' } });
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'cuentas', component: Cuentas },
            { path: destino, component: OtroModulo },
          ]),
          { provide: CuentasService, useValue: service },
        ],
      });
      const h = await RouterTestingHarness.create();
      let c = await h.navigateByUrl('/cuentas?alumno=a', Cuentas);
      TestBed.tick();
      expect(c.alumnoId()).toBe('a');
      c.alumnoId.set('b');
      service.disponible.set(false);
      TestBed.tick();
      service.disponible.set(true);
      TestBed.tick();
      expect(c.alumnoId()).toBe('b');
      c.periodo.set('2026-09');
      await h.navigateByUrl('/' + destino);
      expect(service.filtros.alumnoId()).toBe('');
      c = await h.navigateByUrl('/cuentas', Cuentas);
      TestBed.tick();
      expect(c.alumnoId()).toBe('');
      expect(c.periodo()).toBe('2026-09');
      await h.navigateByUrl('/' + destino);
      c = await h.navigateByUrl('/cuentas?alumno=a', Cuentas);
      TestBed.tick();
      expect(c.alumnoId()).toBe('a');
      // Recarga de una URL profunda: nueva instancia con los parámetros explícitos.
      await h.navigateByUrl('/' + destino);
      c = await h.navigateByUrl('/cuentas?alumno=b', Cuentas);
      TestBed.tick();
      expect(c.alumnoId()).toBe('b');
    });
  }
});
