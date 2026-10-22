import { TestBed } from '@angular/core/testing';
import { AparienciaService, TEMA_KEY } from './apariencia-service';

describe('Preferencia de apariencia', () => {
  let media: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    localStorage.removeItem(TEMA_KEY);
    delete document.documentElement.dataset['themePreference'];
    media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(media));
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(TEMA_KEY);
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['themePreference'];
    vi.unstubAllGlobals();
  });
  it('aplica claro/oscuro y recupera la preferencia al recrear la aplicación', () => {
    let s = TestBed.inject(AparienciaService);
    s.seleccionar('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(TEMA_KEY)).toBe('dark');
    TestBed.resetTestingModule();
    s = TestBed.inject(AparienciaService);
    expect(s.tema()).toBe('dark');
    s.seleccionar('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
  it('escucha el sistema solo en modo automático', () => {
    const s = TestBed.inject(AparienciaService);
    const listener = media.addEventListener.mock.calls[0][1];
    media.matches = true;
    listener();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    s.seleccionar('light');
    listener();
    expect(document.documentElement.dataset['theme']).toBe('light');
    s.seleccionar('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
  it('permite cambiar el tema aunque guardar preferencias falle y escucha otras pestañas', () => {
    const s = TestBed.inject(AparienciaService);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('blocked');
    });
    try {
      s.seleccionar('dark');
      expect(s.aviso()).toBeTruthy();
      expect(document.documentElement.dataset['theme']).toBe('dark');
    } finally {
      set.mockRestore();
    }
    window.dispatchEvent(new StorageEvent('storage', { key: TEMA_KEY, newValue: 'light' }));
    expect(s.tema()).toBe('light');
  });
});
