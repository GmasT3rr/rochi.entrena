import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export type PreferenciaTema = 'light' | 'dark' | 'system';
export const TEMA_KEY = 'tuscuentasfacil.apariencia.v1';
const valido = (value: unknown): value is PreferenciaTema =>
  ['light', 'dark', 'system'].includes(value as string);

@Injectable({ providedIn: 'root' })
export class AparienciaService {
  private readonly preferencia = signal<PreferenciaTema>('system');
  readonly tema = this.preferencia.asReadonly();
  readonly aviso = signal('');
  private readonly sistema =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  constructor() {
    let initial: unknown = document.documentElement.dataset['themePreference'];
    try {
      initial = localStorage.getItem(TEMA_KEY) ?? initial;
    } catch {
      /* Preferencia en memoria. */
    }
    this.preferencia.set(valido(initial) ? initial : 'system');
    this.aplicar();
    const cambio = () => this.aplicar();
    const storage = (event: StorageEvent) => {
      if (event.key === TEMA_KEY || event.key === null) {
        this.preferencia.set(valido(event.newValue) ? event.newValue : 'system');
        this.aplicar();
      }
    };
    this.sistema?.addEventListener('change', cambio);
    window.addEventListener('storage', storage);
    inject(DestroyRef).onDestroy(() => {
      this.sistema?.removeEventListener('change', cambio);
      window.removeEventListener('storage', storage);
    });
  }
  seleccionar(tema: PreferenciaTema): void {
    if (!valido(tema)) return;
    this.preferencia.set(tema);
    this.aplicar();
    this.aviso.set('');
    try {
      localStorage.setItem(TEMA_KEY, tema);
    } catch {
      this.aviso.set(
        'El tema se aplicó, pero no pudimos guardar tu preferencia para la próxima visita.',
      );
    }
  }
  private aplicar(): void {
    const tema = this.tema();
    document.documentElement.dataset['themePreference'] = tema;
    document.documentElement.dataset['theme'] =
      tema === 'system' ? (this.sistema?.matches ? 'dark' : 'light') : tema;
  }
}
