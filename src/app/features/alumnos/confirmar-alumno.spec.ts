import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ConfirmarAlumno } from './confirmar-alumno';

describe('Jerarquía visual de confirmaciones reutilizadas',()=>{
  for(const danger of [true,false]) {
    it(`identifica la variante destructiva con danger=${danger}`,()=>{
      TestBed.configureTestingModule({providers:[{provide:MAT_DIALOG_DATA,useValue:{titulo:'Confirmación',mensaje:'Revisá la operación.',danger}}]});
      const fixture=TestBed.createComponent(ConfirmarAlumno);fixture.detectChanges();
      const buttons=fixture.nativeElement.querySelectorAll('button');
      expect(buttons[0].classList.contains('hub-danger')).toBe(false);
      expect(buttons[1].classList.contains('hub-danger')).toBe(danger);
    });
  }
});
