import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { AdminShell } from './admin-shell';
import { AuthService } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';

describe('Usuario del encabezado compartido', () => {
  it('abre el menú móvil, lo cierra al elegir una pantalla y marca la guía activa', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'guia', component: AdminShell }]),
        { provide: AuthService, useValue: { session: signal(null), signOut: vi.fn() } },
        { provide: AdminAuthorization, useValue: { status: signal('authorized') } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: true }) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    expect(fixture.componentInstance.sidenavMode()).toBe('over');
    expect(fixture.componentInstance.sidenavOpened()).toBe(false);
    fixture.nativeElement.querySelector('.topbar__menu').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.sidenavOpened()).toBe(true);
    const link = fixture.nativeElement.querySelector('a[href="/guia"]') as HTMLAnchorElement;
    link.click();
    expect(fixture.componentInstance.sidenavOpened()).toBe(false);
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/guia');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.classList.contains('nav-item--active')).toBe(true);
  });

  it.each([false, true])(
    'mantiene el menu superpuesto y cerrado al entrar (movil: %s)',
    async (mobile) => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'otra', component: AdminShell }]),
          { provide: AuthService, useValue: { session: signal(null), signOut: vi.fn() } },
          { provide: AdminAuthorization, useValue: { status: signal('authorized') } },
          { provide: BreakpointObserver, useValue: { observe: () => of({ matches: mobile }) } },
        ],
      });
      const fixture = TestBed.createComponent(AdminShell);
      await fixture.whenStable();
      const component = fixture.componentInstance;
      const toggle = fixture.nativeElement.querySelector('.topbar__menu');
      expect(component.sidenavMode()).toBe('over');
      expect(component.sidenavOpened()).toBe(false);
      toggle.click();
      await fixture.whenStable();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      toggle.click();
      await fixture.whenStable();
      expect(component.sidenavOpened()).toBe(false);
      toggle.click();
      await fixture.whenStable();
      fixture.nativeElement.querySelector('.mat-drawer-backdrop').click();
      await fixture.whenStable();
      expect(component.sidenavOpened()).toBe(false);
      toggle.click();
      await fixture.whenStable();
      fixture.nativeElement
        .querySelector('mat-sidenav')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await fixture.whenStable();
      expect(component.sidenavOpened()).toBe(false);
      toggle.click();
      await fixture.whenStable();
      fixture.nativeElement.querySelector('.sidebar__close').click();
      await fixture.whenStable();
      expect(component.sidenavOpened()).toBe(false);
      expect(fixture.nativeElement.querySelectorAll('mat-sidenav button')).toHaveLength(1);
      component.toggleSidenav();
      await TestBed.inject(Router).navigateByUrl('/otra');
      await fixture.whenStable();
      expect(component.sidenavOpened()).toBe(false);
    },
  );

  it('resalta exclusivamente la ruta activa en todas las opciones, incluso con filtros', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: AuthService, useValue: { session: signal(null), signOut: vi.fn() } },
        { provide: AdminAuthorization, useValue: { status: signal('authorized') } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    for (const item of fixture.componentInstance.navItems) {
      await router.navigateByUrl(item.path + '?filtro=activo#seccion');
      await fixture.whenStable();
      const activos = fixture.nativeElement.querySelectorAll('.nav-item--active');
      expect(activos).toHaveLength(1);
      expect(activos[0].getAttribute('href')).toBe(item.path);
      expect(activos[0].getAttribute('aria-current')).toBe('page');
      expect(fixture.nativeElement.querySelectorAll('.nav a[aria-current="page"]')).toHaveLength(1);
    }
  });

  it('refleja cambios de sesión y borra el correo anterior al salir sin consultas', () => {
    const session = signal<{ user: { email: string } } | null>({
      user: { email: 'admin@example.test' },
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { session, signOut: vi.fn() } },
        { provide: AdminAuthorization, useValue: { status: signal('authorized') } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();
    expect(fixture.componentInstance.navItems.map((item) => item.label)).toEqual([
      'Dashboard',
      'Calendario',
      'Alumnos',
      'Cuotas y cobros',
      'Pendientes',
      'Guía de uso',
      'Configuración',
      'Te quiero, Rochi ❤️',
    ]);
    expect(fixture.nativeElement.querySelector('.user__email').textContent).toBe(
      'admin@example.test',
    );
    expect(fixture.nativeElement.querySelector('.user__role').textContent).toBe('Administrador');
    session.set({ user: { email: 'otra@example.test' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.user__email').textContent).toBe(
      'otra@example.test',
    );
    expect(fixture.nativeElement.querySelector('.user__avatar').textContent).toBe('OT');
    session.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.user')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('otra@example.test');
  });
});
