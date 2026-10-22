import { Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeader } from '../../shared/page-header/page-header';
import { AuthService } from '../../core/auth/auth-service';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AparienciaService } from '../../core/services/apariencia-service';
import { passwordFuerte, SeguridadCuenta } from '../../core/auth/seguridad-cuenta';

@Component({
  imports: [
    PageHeader,
    MatCard,
    MatCardContent,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  selector: 'app-configuracion',
  styleUrl: './configuracion.scss',
  templateUrl: './configuracion.html',
})
export class Configuracion implements OnDestroy {
  readonly apariencia = inject(AparienciaService);
  readonly seguridad = inject(SeguridadCuenta);
  readonly campos = [
    { key: 'actual', label: 'Contraseña actual', autocomplete: 'current-password' },
    { key: 'nueva', label: 'Nueva contraseña', autocomplete: 'new-password' },
    { key: 'confirmacion', label: 'Confirmar nueva contraseña', autocomplete: 'new-password' },
  ] as const;
  readonly visibles = signal({ actual: false, nueva: false, confirmacion: false });
  readonly passwordForm = new FormGroup({
    actual: new FormControl('', { nonNullable: true, validators: Validators.required }),
    nueva: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, (c) => (passwordFuerte(c.value) ? null : { fuerza: true })],
    }),
    confirmacion: new FormControl('', { nonNullable: true, validators: Validators.required }),
    codigo: new FormControl('', { nonNullable: true }),
  });
  private readonly auth = inject(AuthService);
  readonly correo = computed(() => this.auth.session()?.user.email ?? '');
  readonly cerrandoSesion = signal(false);
  readonly error = signal('');
  alternar(campo: 'actual' | 'nueva' | 'confirmacion'): void {
    this.visibles.update((v) => ({ ...v, [campo]: !v[campo] }));
  }
  async cambiarPassword(): Promise<void> {
    if (this.seguridad.ocupado()) return;
    this.passwordForm.markAllAsTouched();
    this.seguridad.mensaje.set('');
    this.seguridad.error.set('');
    const { actual, nueva, confirmacion, codigo } = this.passwordForm.getRawValue();
    if (this.passwordForm.invalid) {
      this.seguridad.error.set('Completá las contraseñas y revisá los requisitos de seguridad.');
      return;
    }
    if (nueva !== confirmacion) {
      this.seguridad.error.set('La contraseña nueva y su confirmación no coinciden.');
      return;
    }
    if (this.seguridad.requiereCodigo() && !codigo.trim()) {
      this.seguridad.error.set('Ingresá el código de verificación.');
      return;
    }
    try {
      await this.seguridad.cambiar(actual, nueva, codigo);
    } finally {
      this.passwordForm.reset();
      this.visibles.set({ actual: false, nueva: false, confirmacion: false });
    }
  }
  ngOnDestroy(): void {
    this.passwordForm.reset();
  }

  async cerrarSesion(): Promise<void> {
    if (this.cerrandoSesion()) return;
    this.cerrandoSesion.set(true);
    this.error.set('');
    try {
      await this.auth.signOut();
    } catch {
      this.error.set('No se pudo cerrar la sesión. Volvé a intentarlo.');
    } finally {
      this.cerrandoSesion.set(false);
    }
  }
}
