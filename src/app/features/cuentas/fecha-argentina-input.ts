import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Solo presentación: los controles y validadores conservan fechas ISO civiles. */
@Directive({
  selector: 'input[appFechaArgentina]',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FechaArgentinaInput), multi: true },
  ],
  host: { '(input)': 'entrada()', '(blur)': 'tocado()' },
})
export class FechaArgentinaInput implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private cambiar: (valor: string) => void = () => {};
  tocado: () => void = () => {};
  writeValue(valor: string | null): void {
    this.input.nativeElement.value =
      valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? valor.split('-').reverse().join('/')
        : (valor ?? '');
  }
  entrada(): void {
    const valor = this.input.nativeElement.value;
    this.cambiar(
      /^\d{2}\/\d{2}\/\d{4}$/.test(valor) ? valor.split('/').reverse().join('-') : valor,
    );
  }
  registerOnChange(fn: (valor: string) => void): void {
    this.cambiar = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.tocado = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.input.nativeElement.disabled = disabled;
  }
}
