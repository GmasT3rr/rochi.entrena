import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { AdminShell } from './admin-shell';
import { AuthService } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';

describe('Usuario del encabezado compartido', () => {
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
