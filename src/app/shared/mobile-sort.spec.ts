import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';
import { TestBed } from '@angular/core/testing';
import { MobileSort } from './mobile-sort';

describe('Ordenamiento de tarjetas móviles', () => {
  it('emite el campo y sentido sin mantener una segunda copia del orden', () => {
    const fixture = TestBed.createComponent(MobileSort);
    fixture.componentRef.setInput('value', { active: 'estado', direction: 'asc' });
    fixture.componentRef.setInput('options', [
      { id: 'nombre', label: 'Nombre' },
      { id: 'estado', label: 'Estado' },
    ]);
    fixture.detectChanges();
    const emit = vi.fn();
    fixture.componentInstance.change.subscribe((sort) => {
      emit(sort);
      fixture.componentRef.setInput('value', sort);
    });
    const select = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;
    expect(select.value).toBe('estado');
    select.selectionChange.emit({ source: select, value: 'nombre' });
    expect(emit).toHaveBeenLastCalledWith({ active: 'nombre', direction: 'asc' });
    fixture.detectChanges();
    fixture.componentRef.setInput('value', { active: 'estado', direction: 'asc' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(emit).toHaveBeenLastCalledWith({ active: 'estado', direction: 'desc' });
    fixture.componentRef.setInput('value', { active: 'estado', direction: 'desc' });
    fixture.detectChanges();
    expect(select.value).toBe('estado');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Descendente');
  });
});
