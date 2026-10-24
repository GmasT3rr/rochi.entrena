import { Component, input, output } from '@angular/core';
import { Sort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
@Component({
  selector: 'app-mobile-sort',
  imports: [MatFormFieldModule, MatSelectModule, MatButtonModule],
  template: `<mat-form-field appearance="outline" subscriptSizing="dynamic"
      ><mat-label>Ordenar por</mat-label
      ><mat-select
        [value]="value().active"
        (selectionChange)="
          change.emit({ active: $event.value, direction: value().direction || 'asc' })
        "
      >
        @for (option of options(); track option.id) {
          <mat-option [value]="option.id">{{ option.label }}</mat-option>
        }
      </mat-select></mat-form-field
    ><button
      mat-stroked-button
      type="button"
      (click)="
        change.emit({
          active: value().active,
          direction: value().direction === 'asc' ? 'desc' : 'asc',
        })
      "
      [attr.aria-label]="value().direction === 'asc' ? 'Orden descendente' : 'Orden ascendente'"
    >
      {{
        value().direction === 'asc'
          ? 'Ascendente ↑'
          : value().direction === 'desc'
            ? 'Descendente ↓'
            : 'Sin ordenar ↕'
      }}
    </button>`,
  styles: [
    `
      :host {
        display: flex;
        flex-wrap: wrap;
        gap: var(--hub-space-3);
        margin-bottom: var(--hub-space-4);
        align-items: center;
      }
      mat-form-field {
        flex: 1 1 150px;
        min-width: 0;
      }
      button {
        flex: 0 1 auto;
      }
    `,
  ],
})
export class MobileSort {
  readonly value = input.required<Sort>();
  readonly options = input.required<readonly { id: string; label: string }[]>();
  readonly change = output<Sort>();
}
