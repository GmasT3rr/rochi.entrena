import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Guia } from './guia';
import { routes } from '../../app.routes';

describe('Guía de uso', () => {
  it('permite abrir y cerrar cada explicación sin cerrar las demás', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Guia);
    await fixture.whenStable();
    const headers = [
      ...fixture.nativeElement.querySelectorAll('mat-expansion-panel-header'),
    ] as HTMLElement[];
    expect(headers[0].getAttribute('aria-expanded')).toBe('true');
    expect(headers.slice(1).every((h) => h.getAttribute('aria-expanded') === 'false')).toBe(true);
    for (const header of headers) {
      header.click();
      fixture.detectChanges();
      const expanded = header.getAttribute('aria-expanded');
      header.click();
      fixture.detectChanges();
      expect(header.getAttribute('aria-expanded')).not.toBe(expanded);
    }
    headers[1].click();
    fixture.detectChanges();
    expect(headers[0].getAttribute('aria-expanded')).toBe('true');
    expect(headers[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('enlaza a pantallas existentes y mantiene Dashboard y la dedicatoria', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Guia);
    await fixture.whenStable();
    const children = routes.find((r) => r.children)?.children ?? [];
    const paths = children.map((r) => '/' + r.path);
    for (const link of fixture.debugElement.queryAll(By.directive(RouterLink))) {
      expect(paths).toContain(link.nativeElement.getAttribute('href'));
    }
    expect(children.find((r) => r.path === '')?.redirectTo).toBe('dashboard');
    expect(await children.find((r) => r.path === 'guia')!.loadComponent!()).toBe(Guia);
    expect(children.find((r) => r.path === 'te-quiero-rochy')?.loadComponent).toBeDefined();
  });
});
