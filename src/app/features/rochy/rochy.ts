import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

interface Corazon {
  id: number;
  x: number;
  y: number;
  dx: number;
  size: number;
  pink: boolean;
}

@Component({
  selector: 'app-rochy',
  imports: [MatButtonModule],
  templateUrl: './rochy.html',
  styleUrl: './rochy.scss',
})
export class Rochy {
  readonly corazones = signal<Corazon[]>([]);
  readonly reducido = signal(false);
  private secuencia = 0;
  private readonly pendientes = new Set<ReturnType<typeof setTimeout>>();
  private readonly media =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  constructor() {
    const actualizar = () => {
      this.reducido.set(this.media?.matches ?? false);
      if (this.reducido()) this.limpiar();
    };
    actualizar();
    this.media?.addEventListener('change', actualizar);
    const intervalo = setInterval(() => {
      if (!document.hidden) this.agregar(Math.random() * 90 + 5, 103, 1);
    }, 900);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(intervalo);
      this.media?.removeEventListener('change', actualizar);
      this.limpiar();
    });
  }

  tocar(event: PointerEvent): void {
    if (!event.isPrimary || event.button > 0) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.agregar(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
      9,
    );
  }

  lluvia(): void {
    for (let i = 0; i < 18; i++) this.agregar(Math.random() * 90 + 5, Math.random() * 65 + 30, 1);
  }

  private agregar(x: number, y: number, cantidad: number): void {
    if (this.reducido() || document.hidden) return;
    const nuevos: Corazon[] = Array.from(
      { length: Math.min(cantidad, 48 - this.corazones().length) },
      () => ({
        id: ++this.secuencia,
        x,
        y,
        dx: Math.random() * 160 - 80,
        size: 18 + Math.random() * 22,
        pink: Math.random() > 0.5,
      }),
    );
    if (!nuevos.length) return;
    this.corazones.update((actuales) => [...actuales, ...nuevos]);
    const ids = new Set(nuevos.map((c) => c.id));
    const timer = setTimeout(() => {
      this.corazones.update((actuales) => actuales.filter((c) => !ids.has(c.id)));
      this.pendientes.delete(timer);
    }, 3600);
    this.pendientes.add(timer);
  }

  private limpiar(): void {
    this.pendientes.forEach((timer) => clearTimeout(timer));
    this.pendientes.clear();
    this.corazones.set([]);
  }
}
