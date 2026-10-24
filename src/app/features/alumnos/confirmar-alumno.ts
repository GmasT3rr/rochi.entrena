import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirmar-alumno',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.titulo }}</h2>
    <mat-dialog-content
      ><p>{{ data.mensaje }}</p></mat-dialog-content
    >
    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="false">Cancelar</button>
      <button
        mat-flat-button
        [class.hub-danger]="data.danger === true"
        [mat-dialog-close]="true"
      >
        Confirmar
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmarAlumno {
  readonly data = inject<{ titulo: string; mensaje: string; danger?: boolean }>(MAT_DIALOG_DATA);
}
