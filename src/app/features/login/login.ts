import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { AuthService, authError } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';
import { ToastService } from '../../core/services/toast-service';
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatError, MatInput],
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  readonly authorization = inject(AdminAuthorization);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly forgot = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('recuperar') === '1');
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  toggleRecovery(): void {
    if (this.busy()) return;
    this.forgot.update((value) => !value);
    this.form.controls.password.reset();
    this.error.set('');
    this.message.set('');
  }
  async submit(): Promise<void> {
    if (this.busy() || this.auth.initializationError()) return;
    this.error.set('');
    this.message.set('');
    const { email, password } = this.form.getRawValue();
    this.form.controls.email.markAsTouched();
    if (!this.forgot()) this.form.controls.password.markAsTouched();
    if (this.form.controls.email.invalid || (!this.forgot() && !password)) {
      this.error.set(
        this.forgot()
          ? 'Ingresá un correo electrónico válido.'
          : 'Completá un correo válido y tu contraseña.',
      );
      this.toast.mostrar(this.error(), 'advertencia');
      return;
    }
    this.busy.set(true);
    try {
      if (this.forgot()) {
        await this.auth.requestRecovery(email);
        this.message.set(
          'Si el correo corresponde a una cuenta, recibirás un enlace para crear o recuperar tu contraseña. Abrilo en este mismo navegador.',
        );
        this.toast.mostrar(
          'Solicitud enviada. Revisá tu correo y la carpeta de spam.',
          'informacion',
        );
      } else {
        await this.auth.signIn(email, password);
        await this.router.navigateByUrl('/dashboard');
      }
    } catch (error) {
      this.error.set(authError(error));
      this.toast.mostrar(this.error(), 'error');
    } finally {
      this.form.controls.password.reset();
      this.busy.set(false);
    }
  }
}
