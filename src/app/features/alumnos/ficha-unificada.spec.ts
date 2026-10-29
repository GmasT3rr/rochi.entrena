import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Alumnos } from './alumnos';
import { AlumnoFicha } from './alumno-ficha';
import { AlumnoForm } from './alumno-form';
import { ConfirmarAlumno } from './confirmar-alumno';
import { CambiosPendientes, DescartarCambios } from '../../core/services/cambios-pendientes';
import { AuthService } from '../../core/auth/auth-service';
import { AlumnosService } from '../../core/services/alumnos-service';
import { AlumnosSupabaseRepository } from '../../core/services/alumnos-supabase-repository';
import { CuentasService } from '../../core/services/cuentas-service';
import { ToastService } from '../../core/services/toast-service';
import { AlumnoRegistro } from '../../core/alumno';
import { firstValueFrom } from 'rxjs';

describe('Ficha como único acceso de gestión: diálogos reales y repositorio simulado', () => {
  it('conserva ficha/filtros al editar, cancelar, recargar y cambiar estado', async () => {
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
    let registros = [ana];
    const repo = {
      listar: vi.fn(async () => registros),
      guardar: vi.fn(async (a: AlumnoRegistro) => {
        registros = [a];
        return a;
      }),
      cambiarEstado: vi.fn(async (id: string, estado: 'Activo' | 'Inactivo') => {
        registros = [{ ...registros[0]!, estado }];
        return registros[0]!;
      }),
    };
    const mostrar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { session: signal({ access_token: 'token-test' }) } },
        { provide: AlumnosSupabaseRepository, useValue: repo },
        { provide: ToastService, useValue: { mostrar } },
        {
          provide: CuentasService,
          useValue: {
            hoy: signal('2026-10-28'),
            cuotasAlumno: () => [],
            refrescarSiNecesario: vi.fn(),
            cargandoInicial: signal(false),
            errorCarga: signal(''),
            tieneDatos: signal(true),
            cargando: signal(false),
            saldoAlumno: () => 0,
          },
        },
      ],
    });
    const f = TestBed.createComponent(Alumnos);
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 800));
    f.detectChanges();
    const service = TestBed.inject(AlumnosService),
      dialog = TestBed.inject(MatDialog);
    f.componentInstance.busqueda.set('ana');
    f.componentInstance.modalidad.set('Online');
    f.componentInstance.estado.set('Activo');
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Editar alumno');
    expect(f.nativeElement.querySelector('[mattooltip="Editar alumno"]')).toBeNull();
    const cancelarBaja = f.componentInstance.estadoAcciones.cambiar(ana);
    await f.whenStable();
    dialog.openDialogs.find((d) => d.componentInstance instanceof ConfirmarAlumno)!.close(false);
    await cancelarBaja;
    expect(repo.cambiarEstado).not.toHaveBeenCalled();
    f.componentInstance.ficha(ana);
    await f.whenStable();
    const ficha = dialog.openDialogs.find((d) => d.componentInstance instanceof AlumnoFicha)!;
    expect(ficha).toBeDefined();
    f.componentInstance.ficha(ana);
    expect(
      dialog.openDialogs.filter((d) => d.componentInstance instanceof AlumnoFicha),
    ).toHaveLength(1);
    ficha.componentInstance.editar('adicional');
    await f.whenStable();
    let editor = dialog.openDialogs.find((d) => d.componentInstance instanceof AlumnoForm)!;
    editor.componentInstance.form.controls.email.setValue('descartar@example.com');
    editor.close();
    await f.whenStable();
    let aviso = dialog.openDialogs.find((d) => d.componentInstance instanceof DescartarCambios)!;
    expect(aviso).toBeDefined();
    const descartado = firstValueFrom(editor.afterClosed());
    aviso.close(true);
    await descartado;
    await f.whenStable();
    expect(repo.guardar).not.toHaveBeenCalled();
    expect(ficha.componentInstance.alumno().email).toBe('');
    ficha.componentInstance.editar('adicional');
    await f.whenStable();
    editor = dialog.openDialogs.find((d) => d.componentInstance instanceof AlumnoForm)!;
    editor.componentInstance.form.controls.email.setValue('ana@example.com');
    const guardado = firstValueFrom(editor.afterClosed());
    await editor.componentInstance.guardar();
    await guardado;
    await f.whenStable();
    expect(dialog.openDialogs).toContain(ficha);
    expect(ficha.componentInstance.alumno().email).toBe('ana@example.com');
    expect(mostrar).toHaveBeenCalledWith(expect.any(String), 'exito');
    await service.recargar();
    await f.whenStable();
    expect(ficha.componentInstance.alumno().email).toBe('ana@example.com');
    expect(dialog.openDialogs).toContain(ficha);
    const cambiar = ficha.componentInstance.cambiarEstado();
    await f.whenStable();
    const confirmacion = dialog.openDialogs.find(
      (d) => d.componentInstance instanceof ConfirmarAlumno,
    )!;
    expect(confirmacion).toBeDefined();
    confirmacion.close(true);
    await cambiar;
    await f.whenStable();
    expect(ficha.componentInstance.alumno().estado).toBe('Inactivo');
    expect(dialog.openDialogs).toContain(ficha);
    expect(repo.cambiarEstado).toHaveBeenCalledWith('a', 'Inactivo');
    const fichaCerrada = firstValueFrom(ficha.afterClosed());
    ficha.close();
    await fichaCerrada;
    await f.whenStable();
    expect(f.componentInstance.fichaAbierta()).toBe(false);
    expect(f.componentInstance.busqueda()).toBe('ana');
    expect(f.componentInstance.modalidad()).toBe('Online');
    expect(f.componentInstance.estado()).toBe('Activo');
    expect(dialog.openDialogs).toHaveLength(0);
    f.componentInstance.cambiarEstado(service.alumnos()[0]!);
    await f.whenStable();
    const reactivacion = dialog.openDialogs.find(
      (d) => d.componentInstance instanceof ConfirmarAlumno,
    )!;
    const reactivado = firstValueFrom(reactivacion.afterClosed());
    reactivacion.close(true);
    await reactivado;
    await f.whenStable();
    expect(repo.cambiarEstado).toHaveBeenLastCalledWith('a', 'Activo');
    expect(service.alumnos()[0]!.estado).toBe('Activo');
    expect(await TestBed.inject(CambiosPendientes).salir()).toBe(true);
  });
});
