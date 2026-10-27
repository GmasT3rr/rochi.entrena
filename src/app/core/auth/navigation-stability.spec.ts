import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';
import { AdminShell } from '../../layout/admin-shell/admin-shell';
import { AdminAuthorization } from './admin-authorization';
import { authRuntime } from './auth-runtime';
import { sessionGuard } from './auth-guard';
import { routes } from '../../app.routes';

let created = 0;
let destroyed = 0;
@Component({ template: '<p class="protected-probe">Protected content</p>' })
class Probe {
  constructor() {
    created++;
    inject(DestroyRef).onDestroy(() => destroyed++);
  }
}
@Component({ template: '<p>Access blocked</p>' })
class Blocked {}

describe('Estabilidad del outlet protegido', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    created = destroyed = 0;
    authRuntime.session.set({ access_token: 'test', user: { id: 'test' } } as Session);
    authRuntime.recovery.set(false);
    authRuntime.error.set('');
    rpc.mockReset().mockReturnValue({ abortSignal: async () => ({ data: true, error: null }) });
    authRuntime.client = { rpc } as never;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: AdminShell,
            canActivateChild: [sessionGuard],
            children: [
              { path: 'one', component: Probe },
              { path: 'two', component: Probe },
            ],
          },
          { path: 'acceso-no-autorizado', component: Blocked },
          { path: 'login', component: Blocked },
        ]),
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    authRuntime.session.set(null);
    authRuntime.client = null;
  });

  it('mantiene el nodo y la instancia durante revalidación, y activa destino solo al confirmar', async () => {
    const harness = await RouterTestingHarness.create('/one');
    await harness.fixture.whenStable();
    const shell = harness.routeNativeElement!;
    const outlet = shell.querySelector('main router-outlet');
    const screen = shell.querySelector('.protected-probe');
    expect(created).toBe(1);
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValue({ abortSignal: () => new Promise((r) => (resolve = r)) });
    const navigation = TestBed.inject(Router).navigateByUrl('/two');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    harness.detectChanges();
    expect(TestBed.inject(AdminAuthorization).verifying()).toBe(true);
    expect(shell.querySelector('main router-outlet')).toBe(outlet);
    expect(shell.querySelector('.protected-probe')).toBe(screen);
    expect(created).toBe(1);
    expect(destroyed).toBe(0);
    expect(TestBed.inject(Router).url).toBe('/one');
    resolve({ data: true, error: null });
    expect(await navigation).toBe(true);
    harness.detectChanges();
    expect(harness.routeNativeElement).toBe(shell);
    expect(shell.querySelector('main router-outlet')).toBe(outlet);
    expect(created).toBe(2);
    expect(destroyed).toBe(1);
  });

  it('no monta contenido en la entrada inicial sin autorización confirmada', async () => {
    const harness = await RouterTestingHarness.create();
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValue({ abortSignal: () => new Promise((r) => (resolve = r)) });
    const navigation = TestBed.inject(Router).navigateByUrl('/one');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    expect(created).toBe(0);
    resolve({ data: false, error: null });
    await navigation;
    harness.detectChanges();
    expect(created).toBe(0);
    expect(TestBed.inject(Router).url).toBe('/acceso-no-autorizado');
  });

  it('retira contenido ante denegación de una revalidación de repositorio', async () => {
    const harness = await RouterTestingHarness.create('/one');
    rpc.mockReturnValue({ abortSignal: async () => ({ data: false, error: null }) });
    expect(await TestBed.inject(AdminAuthorization).verify()).toBe(false);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.protected-probe')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).not.toBeNull();
    expect(destroyed).toBe(1);
  });

  it('configura una sola comprobación de navegación que cubre todos los hijos protegidos', () => {
    const shell = routes.find((r) => r.component === AdminShell)!;
    expect(shell.canActivate).toBeUndefined();
    expect(shell.canActivateChild).toEqual([sessionGuard]);
    expect(shell.children!.filter((r) => !r.redirectTo).length).toBeGreaterThan(0);
  });
});
