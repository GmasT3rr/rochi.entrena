import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSelect } from '@angular/material/select';
import { PeriodSelector } from './period-selector';

@Component({
  imports: [PeriodSelector, ReactiveFormsModule],
  template: '<app-period-selector [formControl]="period" />',
})
class FormHost {
  readonly period = new FormControl('2024-02', { nonNullable: true });
}

describe('Selector compartido de períodos', () => {
  it('recupera el valor inicial y sincroniza cambios y touched con un formulario reactivo', async () => {
    const fixture = TestBed.createComponent(FormHost);
    await fixture.whenStable();
    const selector = fixture.debugElement.query(By.directive(PeriodSelector))
      .componentInstance as PeriodSelector;
    const month = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;
    expect(month.triggerValue).toBe('Febrero');
    expect(selector.year()).toBe('2024');
    const values = vi.fn();
    fixture.componentInstance.period.valueChanges.subscribe(values);
    fixture.componentInstance.period.setValue('2025-03');
    fixture.detectChanges();
    expect(selector.month()).toBe('03');
    expect(values).toHaveBeenCalledTimes(1);
    month.selectionChange.emit({ source: month, value: '12' });
    expect(fixture.componentInstance.period.value).toBe('2025-12');
    const year: HTMLInputElement = fixture.nativeElement.querySelector('input');
    year.value = '2031';
    year.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.period.value).toBe('2031-12');
    year.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.period.touched).toBe(true);
    fixture.componentInstance.period.disable();
    fixture.detectChanges();
    expect(month.disabled).toBe(true);
    expect(year.disabled).toBe(true);
    selector.chooseYear('2040');
    expect(fixture.componentInstance.period.value).toBe('2031-12');
    fixture.componentInstance.period.enable();
    fixture.detectChanges();
    expect(month.disabled).toBe(false);
  });
  it('propaga los errores al formulario y acepta los límites de años sin una lista fija', async () => {
    const fixture = TestBed.createComponent(FormHost);
    await fixture.whenStable();
    const selector = fixture.debugElement.query(By.directive(PeriodSelector))
      .componentInstance as PeriodSelector;
    for (const year of ['1899', '10000', '20', '']) {
      selector.chooseYear(year);
      expect(fixture.componentInstance.period.invalid).toBe(true);
    }
    for (const year of ['1900', '9999', '1973', '2075']) {
      selector.chooseYear(year);
      expect(fixture.componentInstance.period.valid).toBe(true);
    }
    selector.chooseMonth('13');
    expect(fixture.componentInstance.period.invalid).toBe(true);
  });
  it('solo ofrece Todos cuando está permitido y emite YYYY-MM sin convertirlo a fecha', async () => {
    const fixture = TestBed.createComponent(PeriodSelector);
    fixture.componentRef.setInput('allowAll', true);
    fixture.componentRef.setInput('value', '2026-10');
    await fixture.whenStable();
    const selector = fixture.componentInstance,
      change = vi.fn();
    selector.periodChange.subscribe(change);
    selector.chooseMonth('');
    expect(change).toHaveBeenLastCalledWith('');
    expect(selector.validate(new FormControl(''))).toBeNull();
    selector.chooseMonth('02');
    selector.chooseYear('2024');
    expect(change).toHaveBeenLastCalledWith('2024-02');
    selector.chooseYear('1800');
    expect(change).not.toHaveBeenLastCalledWith('1800-02');
    fixture.componentRef.setInput('allowAll', false);
    fixture.detectChanges();
    expect(selector.validate(new FormControl(''))).toEqual({ periodo: true });
  });
  it('no emite al precargar o cambiar readonly', async () => {
    const fixture = TestBed.createComponent(PeriodSelector);
    fixture.componentRef.setInput('value', '2026-10');
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    const change = vi.fn();
    fixture.componentInstance.periodChange.subscribe(change);
    fixture.componentInstance.writeValue('2020-01');
    fixture.componentInstance.chooseYear('2024');
    fixture.componentInstance.chooseMonth('05');
    expect(change).not.toHaveBeenCalled();
    expect(fixture.componentInstance.year()).toBe('2020');
  });
});
