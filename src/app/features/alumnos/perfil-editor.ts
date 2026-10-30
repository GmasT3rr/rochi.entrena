import { mensajeError } from '../../core/services/mensajes-usuario';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { normalizarPerfil, PerfilEntrenamiento } from '../../core/perfil-entrenamiento';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
import { ToastService } from '../../core/services/toast-service';
import { PerfilCampos } from './perfil-campos';

@Component({
  selector: 'app-perfil-editor',
  imports: [MatDialogModule, MatButtonModule, PerfilCampos],
  template: `
    <h2 mat-dialog-title>Editar perfil de entrenamiento</h2>
    <mat-dialog-content>
      <app-perfil-campos [inicial]="data.perfil" [bloqueado]="guardando()" />
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="ref.close()" [disabled]="guardando()">Cancelar</button>
      <button
        mat-flat-button
        (click)="guardar()"
        [disabled]="guardando()"
        [attr.aria-busy]="guardando()"
      >
        {{ guardando() ? 'Guardando…' : 'Guardar perfil' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PerfilEditor {
  readonly data = inject<{ alumno: string; perfil: PerfilEntrenamiento | null }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PerfilEditor>);
  private readonly repo = inject(PerfilesEntrenamientoRepository);
  private readonly toast = inject(ToastService);
  readonly campos = viewChild(PerfilCampos);
  readonly guardando = signal(false);
  readonly error = signal('');
  resultado: PerfilEntrenamiento | null = null;
  constructor() {
    inject(CambiosPendientes).proteger(
      this.ref,
      () =>
        this.campos()?.form.getRawValue() ??
        normalizarPerfil((this.data.perfil ?? {}) as Record<string, unknown>),
      () => this.guardando(),
      inject(DestroyRef),
    );
  }
  async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.error.set('');
    if (!this.campos()?.validar()) {
      this.error.set('Revisá los campos marcados en las secciones antes de guardar.');
      return;
    }
    this.guardando.set(true);
    try {
      this.resultado = await this.repo.guardar(
        this.data.alumno,
        this.campos()!.datos(),
        this.data.perfil?.actualizado_en ?? null,
      );
      this.toast.mostrar('Perfil de entrenamiento guardado.', 'exito');
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
