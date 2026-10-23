import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AuthService, authError } from '../../core/auth/auth-service';
import { PasswordFlow, PASSWORD_LINK_ERROR } from '../../core/auth/auth-callback';
import { passwordFuerte } from '../../core/auth/password-policy';
import { ToastService } from '../../core/services/toast-service';

@Component({
  selector: 'app-nueva-contrasena',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  templateUrl: './nueva-contrasena.html',
  styleUrl: './login.scss',
})
export class NuevaContrasena {
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly checking = signal(false);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal('');
  readonly visible = signal(false);
  private readonly verifiedFlow = signal<PasswordFlow | null>(null);
  readonly valid = computed(
    () =>
      !!this.verifiedFlow() &&
      this.verifiedFlow() === this.auth.passwordFlow() &&
      this.auth.recovery() &&
      this.auth.session()?.user.id === this.verifiedFlow()?.userId,
  );
  readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          (control) => (passwordFuerte(control.value) ? null : { strength: true }),
        ],
      }),
      confirmation: new FormControl('', { nonNullable: true, validators: Validators.required }),
    },
    {
      validators: (form) =>
        form.get('password')?.value === form.get('confirmation')?.value ? null : { mismatch: true },
    },
  );
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.form.reset();
    });
    void this.verify();
  }
  async verify(): Promise<void> {
    if (this.busy() || this.checking()) return;
    this.checking.set(true);
    this.verifiedFlow.set(null);
    this.error.set('');
    const flow = this.auth.passwordFlow();
    try {
      if (!flow || this.auth.passwordLinkError()) throw { code: 'invalid_password_session' };
      await this.auth.validatePasswordSession();
      if (!this.destroyed && flow === this.auth.passwordFlow()) this.verifiedFlow.set(flow);
    } catch (error) {
      if (!this.destroyed) {
        this.error.set(this.auth.passwordLinkError() || authError(error));
        this.toast.mostrar(this.error(), 'error');
      }
    } finally {
      if (!this.destroyed) this.checking.set(false);
    }
  }
  async submit(): Promise<void> {
    if (this.busy() || this.checking() || this.saved()) return;
    this.form.markAllAsTouched();
    if (!this.valid()) {
      this.error.set(PASSWORD_LINK_ERROR);
      this.toast.mostrar(this.error(), 'error');
      return;
    }
    if (this.form.invalid) {
      this.error.set(
        this.form.hasError('mismatch')
          ? 'Las contraseñas no coinciden.'
          : 'Revisá los requisitos de la contraseña antes de guardar.',
      );
      this.toast.mostrar(this.error(), 'advertencia');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.changePassword(this.form.controls.password.value);
      this.saved.set(true);
      this.form.reset();
      this.visible.set(false);
      this.toast.mostrar('Contraseña guardada. Iniciá sesión con tu nueva contraseña.', 'exito');
      await this.closeSession();
    } catch (error) {
      this.error.set(authError(error));
      this.toast.mostrar(this.error(), 'error');
    } finally {
      this.busy.set(false);
    }
  }
  private async closeSession(): Promise<void> {
    try {
      await this.auth.signOut();
    } catch {
      this.error.set(
        'Tu contraseña se guardó, pero no pudimos cerrar la sesión. Pulsá «Ir al inicio de sesión» para reintentar.',
      );
      this.toast.mostrar(this.error(), 'advertencia');
    }
  }
  async goToLogin(recover = false): Promise<void> {
    if (this.busy() || this.checking()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signOut();
      if (recover) await this.router.navigate(['/login'], { queryParams: { recuperar: '1' } });
    } catch (error) {
      this.error.set(authError(error));
      this.toast.mostrar(this.error(), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
