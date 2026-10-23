import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';
import { ToastService } from '../../core/services/toast-service';
import { Login } from './login';

describe('Login y solicitud de recuperación', () => {
  function create() {
    const auth = {
      initializationError: signal(''),
      requestRecovery: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
    };
    const mostrar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: AdminAuthorization, useValue: {} },
        { provide: ToastService, useValue: { mostrar } },
      ],
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, auth, mostrar };
  }
  it('muestra Olvidaste tu contraseña sin opción de registro público y conserva inicio de sesión', async () => {
    const { fixture, c, auth } = create();
    expect(fixture.nativeElement.textContent).toContain('¿Olvidaste tu contraseña?');
    expect(fixture.nativeElement.textContent).not.toContain('Registrarse');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    c.form.setValue({ email: 'invitada@example.com', password: 'Actual!123456' });
    await c.submit();
    expect(auth.signIn).toHaveBeenCalledWith('invitada@example.com', 'Actual!123456');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    expect(c.form.controls.password.value).toBe('');
  });
  it('valida correo sin exigir contraseña al solicitar recuperación', async () => {
    const { c, auth, mostrar } = create();
    c.toggleRecovery();
    c.form.controls.email.setValue('no-es-correo');
    await c.submit();
    expect(auth.requestRecovery).not.toHaveBeenCalled();
    c.form.controls.email.setValue('invitada@example.com');
    await c.submit();
    expect(auth.requestRecovery).toHaveBeenCalledWith('invitada@example.com');
    expect(c.message()).toContain('Si el correo');
    expect(mostrar).toHaveBeenCalledWith(
      expect.stringContaining('Solicitud enviada'),
      'informacion',
    );
  });
  it('no anuncia envío antes del servidor y bloquea duplicados mientras espera', async () => {
    const { c, auth, mostrar } = create();
    c.toggleRecovery();
    c.form.controls.email.setValue('invitada@example.com');
    let resolve!: () => void;
    auth.requestRecovery.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const pending = c.submit();
    await c.submit();
    expect(auth.requestRecovery).toHaveBeenCalledOnce();
    expect(c.busy()).toBe(true);
    expect(mostrar).not.toHaveBeenCalled();
    resolve();
    await pending;
    expect(c.busy()).toBe(false);
  });
  it('presenta errores de red y rate limit sin revelar detalles del servidor', async () => {
    const { c, auth, mostrar } = create();
    c.toggleRecovery();
    c.form.controls.email.setValue('invitada@example.com');
    auth.requestRecovery.mockRejectedValue({
      code: 'over_email_send_rate_limit',
      message: 'internal secret',
    });
    await c.submit();
    expect(c.message()).toBe('');
    expect(c.error()).toContain('Demasiados');
    expect(c.error()).not.toContain('secret');
    expect(mostrar).toHaveBeenCalledWith(c.error(), 'error');
  });
});
