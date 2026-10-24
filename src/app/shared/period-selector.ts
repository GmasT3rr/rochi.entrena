import { Component, forwardRef, input, output, signal, Input, effect } from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  NG_VALIDATORS,
  Validator,
  AbstractControl,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { periodoValido } from '../core/cuentas';

@Component({
  selector: 'app-period-selector',
  imports: [MatFormFieldModule, MatSelectModule, MatInputModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PeriodSelector), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PeriodSelector), multi: true },
  ],
  template: `<fieldset [disabled]="disabled()">
    <legend [class.sr-only]="compact()">{{ label() }}</legend>
    <div
      class="period-controls"
      [class.period-controls--compact]="compact()"
      [class.period-controls--all]="allowAll() && !month()"
    >
      <mat-form-field appearance="outline" subscriptSizing="dynamic"
        ><mat-label>Mes</mat-label
        ><mat-select
          [value]="month()"
          [disabled]="disabled() || readonly()"
          (selectionChange)="chooseMonth($event.value)"
          (closed)="touch()"
        >
          @if (allowAll()) {
            <mat-option value="">Todos los períodos</mat-option>
          }
          @for (month of months; track month; let i = $index) {
            <mat-option [value]="(i + 1).toString().padStart(2, '0')">{{ month }}</mat-option>
          }
        </mat-select></mat-form-field
      >
      @if (month() || !allowAll()) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic"
          ><mat-label>Año</mat-label
          ><input
            matInput
            type="number"
            min="1900"
            max="9999"
            step="1"
            inputmode="numeric"
            [value]="year()"
            [readonly]="readonly()"
            [disabled]="disabled()"
            (input)="chooseYear($any($event.target).value)"
            (blur)="touch()"
        /></mat-form-field>
      }
    </div>
    @if (invalid()) {
      <p class="hub-field-error" role="alert">Elegí un mes y un año entre 1900 y 9999.</p>
    }
  </fieldset>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      fieldset {
        min-width: 0;
        border: 0;
        margin: 0;
        padding: 0;
      }
      legend {
        color: var(--hub-muted);
        font-size: var(--hub-text-small);
        padding: 0;
        margin-bottom: var(--hub-space-2);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        clip-path: inset(50%);
        white-space: nowrap;
        overflow: hidden;
      }
      .period-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(6.5rem, 0.7fr);
        gap: var(--hub-space-3);
      }
      .period-controls--compact {
        grid-template-columns: minmax(0, 1fr) minmax(6.5rem, 0.7fr);
      }
      .period-controls.period-controls--all {
        grid-template-columns: minmax(0, 1fr);
      }
      mat-form-field {
        width: 100%;
        min-width: 0;
      }
      @media (max-width: 359px) {
        .period-controls:not(.period-controls--compact) {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class PeriodSelector implements ControlValueAccessor, Validator {
  readonly label = input('Período');
  readonly compact = input(false);
  readonly allowAll = input(false);
  readonly readonly = input(false);
  readonly periodChange = output<string>();
  readonly month = signal('');
  readonly year = signal('');
  readonly disabled = signal(false);
  readonly invalid = signal(false);
  readonly months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  @Input() set value(value: string) {
    this.writeValue(value);
  }
  private change: (value: string) => void = () => {};
  private touched: () => void = () => {};
  private validatorChange: () => void = () => {};
  constructor() {
    effect(() => {
      this.allowAll();
      this.validatorChange();
    });
  }
  registerOnValidatorChange(fn: () => void): void {
    this.validatorChange = fn;
  }
  writeValue(value: string | null): void {
    this.month.set(value?.slice(5) ?? '');
    this.year.set(value?.slice(0, 4) ?? '');
    this.invalid.set(false);
  }
  registerOnChange(fn: (value: string) => void): void {
    this.change = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }
  setDisabledState(value: boolean): void {
    this.disabled.set(value);
  }
  validate(control: AbstractControl) {
    return (this.allowAll() && control.value === '') || periodoValido(control.value)
      ? null
      : { periodo: true };
  }
  chooseMonth(month: string): void {
    if (this.disabled() || this.readonly()) return;
    this.month.set(month);
    if (month && !this.year()) this.year.set(String(new Date().getFullYear()));
    this.emit();
  }
  chooseYear(year: string): void {
    if (this.disabled() || this.readonly()) return;
    this.year.set(year);
    this.emit();
  }
  private emit(): void {
    const value = this.allowAll() && !this.month() ? '' : this.year() + '-' + this.month();
    this.invalid.set(value !== '' && !periodoValido(value));
    this.change(value);
    if (!this.invalid()) this.periodChange.emit(value);
  }
  touch(): void {
    this.touched();
    this.invalid.set(
      !((this.allowAll() && !this.month()) || periodoValido(this.year() + '-' + this.month())),
    );
  }
}
