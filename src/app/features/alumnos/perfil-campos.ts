import { Component, effect, input, viewChildren } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  DatosPerfilEntrenamiento,
  CAMPOS_PERFIL,
  normalizarPerfil,
  SECCIONES_PERFIL,
} from '../../core/perfil-entrenamiento';

@Component({
  selector: 'app-perfil-campos',
  imports: [
    ReactiveFormsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <p>
      Todos los datos son opcionales. Registrá solo información proporcionada por el alumno, con su
      autorización. No incluyas información médica.
    </p>
    <p>
      La edad declarada corresponde al momento de completar la ficha; no se actualiza
      automáticamente.
    </p>
    <div [formGroup]="form">
      <mat-accordion multi>
        @for (seccion of secciones; track seccion.titulo) {
          <mat-expansion-panel class="hub-filter-extra">
            <mat-expansion-panel-header
              ><mat-panel-title>{{ seccion.titulo }}</mat-panel-title></mat-expansion-panel-header
            >
            <div class="form-grid">
              @for (c of seccion.campos; track c.clave) {
                <mat-form-field appearance="outline" [class.full-width]="c.tipo === 'area'">
                  <mat-label>{{ c.label }}{{ c.unidad ? ' (' + c.unidad + ')' : '' }}</mat-label>
                  @switch (c.tipo) {
                    @case ('numero') {
                      <input
                        matInput
                        type="number"
                        [formControlName]="c.clave"
                        [min]="c.min!"
                        [max]="c.max!"
                        [step]="c.paso!"
                      />
                    }
                    @case ('booleano') {
                      <mat-select [formControlName]="c.clave"
                        ><mat-option [value]="null">Sin responder</mat-option
                        ><mat-option [value]="true">Sí</mat-option
                        ><mat-option [value]="false">No</mat-option></mat-select
                      >
                    }
                    @case ('selector') {
                      <mat-select [formControlName]="c.clave"
                        ><mat-option [value]="null">Sin responder</mat-option>
                        @for (opcion of c.opciones; track opcion) {
                          <mat-option [value]="opcion">{{ opcion }}</mat-option>
                        }
                      </mat-select>
                    }
                    @case ('area') {
                      <textarea
                        matInput
                        rows="3"
                        [formControlName]="c.clave"
                        [maxlength]="c.longitud!"
                      ></textarea>
                    }
                    @default {
                      <input matInput [formControlName]="c.clave" [maxlength]="c.longitud!" />
                    }
                  }
                  <mat-error>{{
                    c.tipo === 'numero'
                      ? 'Ingresá un valor entre ' +
                        c.min +
                        ' y ' +
                        c.max +
                        (c.paso === 1 ? ', sin decimales.' : ', con hasta dos decimales.')
                      : 'Revisá este valor y su longitud máxima.'
                  }}</mat-error>
                </mat-form-field>
              }
            </div>
          </mat-expansion-panel>
        }
      </mat-accordion>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-expansion-panel {
      margin-bottom: var(--hub-space-2);
    }
  `,
})
export class PerfilCampos {
  readonly inicial = input<DatosPerfilEntrenamiento | null>(null);
  readonly bloqueado = input(false);
  readonly secciones = SECCIONES_PERFIL;
  private readonly paneles = viewChildren(MatExpansionPanel);
  readonly form = new FormGroup(
    Object.fromEntries(
      CAMPOS_PERFIL.map((c) => {
        const validadores: ValidatorFn[] = [];
        if (c.tipo === 'numero')
          validadores.push(Validators.min(c.min!), Validators.max(c.max!), (control) => {
            if (control.value === null || control.value === '') return null;
            try {
              normalizarPerfil({ [c.clave]: control.value });
              return null;
            } catch {
              return { numero: true };
            }
          });
        if (c.longitud) validadores.push(Validators.maxLength(c.longitud));
        if (c.tipo === 'selector' || c.tipo === 'booleano')
          validadores.push((control) => {
            try {
              normalizarPerfil({ [c.clave]: control.value });
              return null;
            } catch {
              return { opcion: true };
            }
          });
        return [c.clave, new FormControl<string | number | boolean | null>(null, validadores)];
      }),
    ),
  );
  constructor() {
    effect(() =>
      this.form.reset(
        { ...normalizarPerfil((this.inicial() ?? {}) as Record<string, unknown>) },
        {
          emitEvent: false,
        },
      ),
    );
    effect(() => {
      if (this.bloqueado()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }
  datos(): DatosPerfilEntrenamiento {
    return normalizarPerfil(this.form.getRawValue());
  }
  validar(): boolean {
    this.form.markAllAsTouched();
    this.secciones.forEach((s, i) => {
      if (s.campos.some((c) => this.form.get(c.clave)?.invalid)) this.paneles()[i]?.open();
    });
    return this.form.valid;
  }
}
