import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { AuthService, authError } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatButton, MatFormField, MatLabel, MatInput],
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  // También verifica una sesión restaurada que llegue directamente al login.
  readonly authorization = inject(AdminAuthorization);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly forgot = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.message.set('');
    const { email, password } = this.form.getRawValue();
    if ((!this.auth.recovery() && this.form.controls.email.invalid) ||
      (!this.forgot() && !password)) {
      this.error.set('Completá los campos con un correo válido y tu contraseña.');
      return;
    }
    this.busy.set(true);
    try {
      if (this.auth.recovery()) {
        await this.auth.changePassword(password);
        this.message.set('Contraseña actualizada. Iniciá sesión con tu nueva contraseña.');
      } else if (this.forgot()) {
        await this.auth.requestRecovery(email);
        this.message.set('Si el correo corresponde a una cuenta, recibirás un enlace. Abrilo en este mismo navegador.');
      } else {
        await this.auth.signIn(email, password);
        await this.router.navigateByUrl('/dashboard');
      }
    } catch (error) {
      this.error.set(authError(error));
    } finally {
      this.form.controls.password.reset();
      this.busy.set(false);
    }
  }
}
