import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { TestBed } from '@angular/core/testing';
import { GraficoDashboard } from './grafico-dashboard';

describe('Gráficos del Dashboard', () => {
  it('presenta importes exactos, tooltips y botones accesibles para mouse, teclado y toque', async () => {
    const fixture = TestBed.createComponent(GraficoDashboard);
    fixture.componentRef.setInput('titulo', 'Cobros');
    fixture.componentRef.setInput('monetario', true);
    fixture.componentRef.setInput('datos', [
      { label: '2026-10', valor: 125.25 },
      { label: '2026-11', valor: 0 },
    ]);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-label')).toContain('125,25');
    const tooltip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tooltip.message).toContain('125,25');
    const toggle = vi.spyOn(tooltip, 'toggle').mockImplementation(() => {});
    buttons[0].click();
    expect(toggle).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.maximo()).toBe(125.25);
  });
  it('representa donas con cantidades, porcentajes y segmentos excluyentes', () => {
    const fixture = TestBed.createComponent(GraficoDashboard);
    fixture.componentRef.setInput('titulo', 'Estados');
    fixture.componentRef.setInput('datos', [
      { label: 'Pagadas', valor: 2 },
      { label: 'Parciales', valor: 1 },
      { label: 'Pendientes', valor: 0 },
      { label: 'Vencidas', valor: 1 },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.donut-segment')).toHaveLength(3);
    expect(fixture.componentInstance.segmentos().map((s) => s.porcentaje)).toEqual([50, 25, 0, 25]);
    expect(fixture.componentInstance.segmentos().map((s) => s.offset)).toEqual([0, 50, 75, 75]);
    expect(fixture.nativeElement.querySelector('.legend').textContent).toContain('50.0%');
    fixture.componentRef.setInput('datos', [
      { label: 'Presencial', valor: 3 },
      { label: 'Online', valor: 1 },
    ]);
    fixture.detectChanges();
    expect(fixture.componentInstance.segmentos().map((s) => s.porcentaje)).toEqual([75, 25]);
    expect(fixture.nativeElement.querySelectorAll('.legend-item')).toHaveLength(2);
  });
  it('dibuja una linea con puntos exactos y actualiza su geometria', () => {
    const fixture = TestBed.createComponent(GraficoDashboard);
    fixture.componentRef.setInput('titulo', 'Ingresos');
    fixture.componentRef.setInput('monetario', true);
    fixture.componentRef.setInput('datos', [
      { label: '2026-09', valor: 0 },
      { label: '2026-10', valor: 100 },
    ]);
    fixture.detectChanges();
    expect(fixture.componentInstance.linea()).toBe('10,78 96,12');
    expect(fixture.nativeElement.querySelector('polyline').getAttribute('points')).toBe(
      '10,78 96,12',
    );
    fixture.componentRef.setInput('datos', [{ label: '2026-10', valor: 0 }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.linea()).toBe('52,78');
    expect(fixture.nativeElement.textContent).toContain('No hay cobros');
  });
  it('mantiene estados vacios sin divisiones por cero', () => {
    const fixture = TestBed.createComponent(GraficoDashboard);
    fixture.componentRef.setInput('titulo', 'Estados');
    fixture.componentRef.setInput('datos', [{ label: 'Pagadas', valor: 0 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin registros');
    expect(fixture.componentInstance.detalle({ label: 'Pagadas', valor: 0 })).toContain('0.0%');
    expect(fixture.componentInstance.maximo()).toBe(1);
  });
});
