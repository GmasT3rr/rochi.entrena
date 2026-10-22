import { TestBed } from '@angular/core/testing';
import { Rochy } from './rochy';

describe('Rincón Rochy', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function crear(reducido = false) {
    vi.useFakeTimers();
    const media = { matches: reducido, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media);
    const fixture = TestBed.createComponent(Rochy);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, media };
  }
  it('genera corazones con coordenadas de mouse o toque, limita y elimina partículas', () => {
    const { fixture, component } = crear();
    const section = fixture.nativeElement.querySelector('section');
    section.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 400 });
    component.tocar({
      currentTarget: section,
      clientX: 110,
      clientY: 220,
      isPrimary: true,
      button: 0,
    } as unknown as PointerEvent);
    expect(component.corazones()).toHaveLength(9);
    expect(component.corazones()[0].x).toBe(50);
    expect(component.corazones()[0].y).toBe(50);
    for (let i = 0; i < 10; i++) component.lluvia();
    expect(component.corazones()).toHaveLength(48);
    fixture.destroy();
    vi.advanceTimersByTime(10000);
    expect(component.corazones()).toEqual([]);
  });
  it('crea un flujo suave y retira los corazones expirados', () => {
    const { component } = crear();
    vi.advanceTimersByTime(900);
    const id = component.corazones()[0].id;
    vi.advanceTimersByTime(3600);
    expect(component.corazones().some((c) => c.id === id)).toBe(false);
    expect(component.corazones().length).toBeLessThan(6);
  });
  it('respeta movimiento reducido y limpia al cambiar la preferencia', () => {
    const { component, media, fixture } = crear(true);
    component.lluvia();
    vi.advanceTimersByTime(5000);
    expect(component.corazones()).toEqual([]);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    media.matches = false;
    media.addEventListener.mock.calls[0][1]();
    component.lluvia();
    expect(component.corazones().length).toBe(18);
    media.matches = true;
    media.addEventListener.mock.calls[0][1]();
    expect(component.corazones()).toEqual([]);
  });
});
