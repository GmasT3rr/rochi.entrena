import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Alumnos } from './alumnos';
import { AlumnoFicha } from './alumno-ficha';
import { AlumnoRegistro } from '../../core/alumno';
import { AuthService } from '../../core/auth/auth-service';
import { AlumnosService } from '../../core/services/alumnos-service';
import { AlumnosSupabaseRepository } from '../../core/services/alumnos-supabase-repository';
import { ToastService } from '../../core/services/toast-service';

describe('Alumnos: carga y recuperación de errores', () => {
  it('conserva listado, filtros y ABM al fallar la red y permite reintentar sin Toast duplicado', async () => {
    const ana: AlumnoRegistro = {
      id: 'a',
      nombre: 'Ana',
      apellido: 'Pérez',
      telefono: '',
      email: '',
      modalidad: 'Online',
      estado: 'Activo',
      fechaIngreso: '2026-10-01',
      observaciones: '',
    };
    let registros = [ana, { ...ana, id: 'b', nombre: 'Bea', modalidad: 'Presencial' as const }];
    const repo = {
      listar: vi.fn(async () => registros),
      guardar: vi.fn(async (a: AlumnoRegistro) => {
        registros = registros.some((r) => r.id === a.id)
          ? registros.map((r) => (r.id === a.id ? a : r))
          : [...registros, a];
        return a;
      }),
      cambiarEstado: vi.fn(async (id: string, estado: 'Activo' | 'Inactivo') => {
        registros = registros.map((r) => (r.id === id ? { ...r, estado } : r));
        return registros.find((r) => r.id === id)!;
      }),
    };
    const mostrar = vi.fn();
    const open = vi.fn(() => ({ afterClosed: () => of(false) }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { session: signal({ access_token: 'token-test' }) } },
        { provide: AlumnosSupabaseRepository, useValue: repo },
        { provide: ToastService, useValue: { mostrar } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(Alumnos);
    await fixture.whenStable();
    const service = TestBed.inject(AlumnosService),
      c = fixture.componentInstance;
    expect(service.alumnos()).toHaveLength(2);
    c.busqueda.set('pérez');
    c.modalidad.set('Online');
    c.estado.set('Activo');
    fixture.detectChanges();
    expect(c.alumnos().map((a) => a.id)).toEqual(['a']);
    repo.listar.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await service.recargar();
    fixture.detectChanges();
    expect(service.alumnos()).toHaveLength(2);
    expect(service.cargando()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('[role=alert]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(mostrar).not.toHaveBeenCalled();
    const reintentar = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.trim() === 'Reintentar')!;
    reintentar.click();
    await fixture.whenStable();
    expect(service.errorListado()).toBe('');
    expect(c.busqueda()).toBe('pérez');
    expect(c.modalidad()).toBe('Online');
    expect(c.estado()).toBe('Activo');
    expect(await service.guardar({ ...ana, nombre: 'Ana editada' }, ana.id)).toBe(true);
    expect(c.alumnos()[0].nombre).toBe('Ana editada');
    expect(await service.guardar({ ...ana, nombre: 'Nueva' }, undefined, 'nueva')).toBe(true);
    expect(service.alumnos()).toHaveLength(3);
    expect(await service.cambiarEstado(ana.id, 'Inactivo')).toBe(true);
    expect(c.alumnos().some((a) => a.id === ana.id)).toBe(false);
    c.ficha(service.alumnos().find((a) => a.id === ana.id)!);
    expect(open).toHaveBeenCalledWith(AlumnoFicha, expect.objectContaining({ data: ana.id }));
    fixture.destroy();
    const recargada = TestBed.createComponent(Alumnos);
    await recargada.whenStable();
    expect(recargada.componentInstance.busqueda()).toBe('pérez');
    expect(service.alumnos()).toHaveLength(3);
  });
});
