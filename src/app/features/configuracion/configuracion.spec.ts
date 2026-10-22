import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Configuracion } from './configuracion';
import { AuthService } from '../../core/auth/auth-service';
import { SeguridadCuenta } from '../../core/auth/seguridad-cuenta';
import { AparienciaService } from '../../core/services/apariencia-service';

describe('Configuración: apariencia y seguridad', () => {
  function crear() {
    const seguridad = {
      ocupado: signal(false),
      error: signal(''),
      mensaje: signal(''),
      requiereCodigo: signal(false),
      cambiar: vi.fn().mockResolvedValue(true),
      enviarCodigo: vi.fn(),
    };
    const signOut = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [Configuracion],
      providers: [
        {
          provide: AuthService,
          useValue: { session: signal({ user: { email: 'cuenta@example.com' } }), signOut },
        },
        { provide: SeguridadCuenta, useValue: seguridad },
        {
          provide: AparienciaService,
          useValue: { tema: signal('light'), aviso: signal(''), seleccionar: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(Configuracion);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, seguridad, signOut };
  }
  it('muestra acciones reales, sin datos técnicos ni respaldos antiguos', () => {
    const { fixture } = crear();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Apariencia');
    expect(text).toContain('Seguridad de la cuenta');
    expect(text).toContain('Sesión');
    expect(text).not.toMatch(/PostgreSQL|localStorage|Negocio administrado|restaurar|CSV|JSON/i);
    expect(fixture.nativeElement.querySelectorAll('input[type=password]')).toHaveLength(3);
  });
  it('valida fuerza, coincidencia y alterna la visibilidad', async () => {
    const { component, seguridad, fixture } = crear();
    component.passwordForm.patchValue({
      actual: 'Anterior!12345',
      nueva: 'NuevaSegura!12345',
      confirmacion: 'OtraSegura!12345',
    });
    await component.cambiarPassword();
    expect(seguridad.cambiar).not.toHaveBeenCalled();
    expect(seguridad.error()).toContain('no coinciden');
    component.alternar('nueva');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form').querySelectorAll('input')[1].type).toBe(
      'text',
    );
    component.passwordForm.controls.confirmacion.setValue('NuevaSegura!12345');
    await component.cambiarPassword();
    expect(seguridad.cambiar).toHaveBeenCalledOnce();
    expect(component.passwordForm.controls.actual.value).toBe('');
    expect(component.passwordForm.controls.nueva.value).toBe('');
    seguridad.ocupado.set(true);
    await component.cambiarPassword();
    expect(seguridad.cambiar).toHaveBeenCalledOnce();
  });
  it('conserva el cierre de sesión y muestra errores claros', async () => {
    const { component, signOut, fixture } = crear();
    signOut.mockRejectedValue(new Error('internal details'));
    await component.cerrarSesion();
    fixture.detectChanges();
    expect(component.error()).toContain('No se pudo cerrar');
    expect(fixture.nativeElement.textContent).not.toContain('internal details');
    signOut.mockResolvedValue(undefined);
    await component.cerrarSesion();
    expect(component.error()).toBe('');
  });
});
