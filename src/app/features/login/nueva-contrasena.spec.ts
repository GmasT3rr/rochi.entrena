import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth-service';
import { ToastService } from '../../core/services/toast-service';
import { PasswordFlow } from '../../core/auth/auth-callback';
import { NuevaContrasena } from './nueva-contrasena';

describe('Pantalla de creación de contraseña', () => {
  const password = 'NuevaClave!123456';
  async function create(validate?: Promise<string>, missing = false) {
    const flow: PasswordFlow = {
      kind: 'invite',
      userId: 'invitada',
      expiresAt: Date.now() + 60000,
    };
    const auth = {
      passwordFlow: signal<PasswordFlow | null>(missing ? null : flow),
      passwordLinkError: signal(''),
      recovery: signal(true),
      session: signal({ user: { id: 'invitada' } }),
      validatePasswordSession: vi.fn().mockReturnValue(validate ?? Promise.resolve('invitada')),
      changePassword: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    const mostrar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: { mostrar } },
      ],
    });
    const fixture = TestBed.createComponent(NuevaContrasena);
    fixture.detectChanges();
    if (!validate) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return { fixture, c: fixture.componentInstance, auth, mostrar };
  }
  it('espera validar la sesión antes de mostrar campos y distingue invitación', async () => {
    let resolve!: (value: string) => void;
    const validation = new Promise<string>((r) => (resolve = r));
    const { fixture, c } = await create(validation);
    expect(c.checking()).toBe(true);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    resolve('invitada');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Creá tu contraseña');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(2);
  });
  it('no habilita guardado sin enlace y ofrece solicitar otro correo', async () => {
    const { fixture, c, auth } = await create(undefined, true);
    expect(c.valid()).toBe(false);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Solicitar otro enlace');
    c.form.setValue({ password, confirmation: password });
    await c.submit();
    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(auth.validatePasswordSession).not.toHaveBeenCalled();
  });
  it('valida fortaleza y confirmación sin enviar contraseñas inválidas', async () => {
    const { c, auth } = await create();
    c.form.setValue({ password: 'corta', confirmation: 'corta' });
    await c.submit();
    expect(auth.changePassword).not.toHaveBeenCalled();
    c.form.setValue({ password, confirmation: 'OtraClave!12345' });
    await c.submit();
    expect(c.error()).toContain('no coinciden');
    expect(auth.changePassword).not.toHaveBeenCalled();
  });
  it('espera confirmación antes del éxito, impide doble envío y limpia los campos', async () => {
    const { c, auth, mostrar } = await create();
    let resolve!: () => void;
    auth.changePassword.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    c.form.setValue({ password, confirmation: password });
    const pending = c.submit();
    await c.submit();
    expect(c.busy()).toBe(true);
    expect(auth.changePassword).toHaveBeenCalledOnce();
    expect(c.saved()).toBe(false);
    expect(mostrar).not.toHaveBeenCalled();
    resolve();
    await pending;
    expect(c.saved()).toBe(true);
    expect(mostrar).toHaveBeenCalledWith(expect.stringContaining('Contraseña guardada'), 'exito');
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(c.form.controls.password.value).toBe('');
    expect(c.form.controls.confirmation.value).toBe('');
  });
  it('mantiene el formulario y muestra error traducido si updateUser falla', async () => {
    const { c, auth, mostrar } = await create();
    auth.changePassword.mockRejectedValue({ code: 'weak_password', message: 'secret' });
    c.form.setValue({ password, confirmation: password });
    await c.submit();
    expect(c.saved()).toBe(false);
    expect(c.error()).not.toContain('secret');
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(mostrar).not.toHaveBeenCalledWith(expect.any(String), 'exito');
  });
  it('un fallo de cierre después de guardar no repite updateUser ni informa contraseña fallida', async () => {
    const { c, auth } = await create();
    auth.signOut.mockRejectedValue(new Error('offline'));
    c.form.setValue({ password, confirmation: password });
    await c.submit();
    expect(c.saved()).toBe(true);
    expect(c.error()).toContain('se guardó');
    await c.submit();
    expect(auth.changePassword).toHaveBeenCalledOnce();
    auth.signOut.mockResolvedValue(undefined);
    await c.goToLogin();
    expect(auth.changePassword).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });
  it('retira los campos si la sesión cambia de identidad', async () => {
    const { fixture, c, auth } = await create();
    auth.session.set({ user: { id: 'otra' } });
    fixture.detectChanges();
    expect(c.valid()).toBe(false);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});
