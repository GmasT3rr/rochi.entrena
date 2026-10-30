import { ErrorUsuario, mensajeError } from '../../core/services/mensajes-usuario';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ConfigDocumentos, validarDocumento } from '../../core/documentos-alumnos';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';

export interface ArchivoAlta {
  id: string;
  archivo: File;
  estado: 'pendiente' | 'subiendo' | 'guardado' | 'error';
  error: string;
  intentado: boolean;
}
@Component({
  selector: 'app-documentos-alta',
  imports: [DecimalPipe, MatButtonModule, LoadingLayout],
  template: `
    <p>Los archivos se subirán después de crear al alumno. Podés omitir este paso.</p>
    @if (cargando()) {
      <app-loading-layout variant="pagos" label="Preparando selección de documentos" />
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (config(); as c) {
      <p>
        PDF, Word, Excel, JPG, PNG y WebP. Hasta
        {{ c.max_bytes / 1024 / 1024 | number: '1.0-1' }} MB por archivo y
        {{ c.max_archivos }} archivos.
      </p>
      <input
        type="file"
        hidden
        multiple
        #selector
        [accept]="accept"
        (change)="seleccionar(selector)"
      />
      <button
        mat-stroked-button
        type="button"
        (click)="selector.click()"
        [disabled]="bloqueado() || creado()"
      >
        Seleccionar documentos
      </button>
    } @else if (!cargando()) {
      <button mat-stroked-button type="button" (click)="cargar()" [disabled]="bloqueado()">
        Reintentar selección de documentos
      </button>
    }
    <ul class="files" aria-label="Archivos seleccionados">
      @for (f of archivos(); track f.id) {
        <li>
          <div>
            <strong>{{ f.archivo.name }}</strong>
            <p role="status">
              {{
                f.estado === 'guardado'
                  ? 'Adjuntado'
                  : f.estado === 'subiendo'
                    ? 'Subiendo…'
                    : f.estado === 'error'
                      ? 'No confirmado'
                      : 'Pendiente de guardar'
              }}
            </p>
            @if (f.error) {
              <p role="alert">{{ f.error }}</p>
            }
          </div>
          @if (!creado()) {
            <button
              mat-button
              type="button"
              (click)="quitar(f.id)"
              [disabled]="bloqueado()"
              [attr.aria-label]="'Quitar de la selección ' + f.archivo.name"
            >
              Quitar
            </button>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .files {
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: start;
      gap: var(--hub-space-2);
      padding-block: var(--hub-space-2);
      border-bottom: 1px solid var(--hub-border);
    }
    li > div {
      flex: 1 1 180px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    p {
      margin-block: var(--hub-space-2);
    }
  `,
})
export class DocumentosAlta {
  readonly bloqueado = input(false);
  readonly creado = input(false);
  readonly archivos = signal<ArchivoAlta[]>([]);
  readonly config = signal<ConfigDocumentos | null>(null);
  readonly cargando = signal(false);
  readonly error = signal('');
  private readonly repo = inject(DocumentosAlumnosRepository);
  private alive = true;
  constructor() {
    inject(DestroyRef).onDestroy(() => (this.alive = false));
    void this.cargar();
  }
  get accept(): string {
    return Object.keys(this.config()?.formatos ?? {})
      .map((e) => '.' + e)
      .join(',');
  }
  async cargar(): Promise<void> {
    if (this.cargando()) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const c = await this.repo.configuracion();
      if (this.alive) this.config.set(c);
    } catch {
      if (this.alive)
        this.error.set(
          'No se pudo habilitar la selección de documentos. Podés guardar al alumno y adjuntarlos después desde su ficha.',
        );
    } finally {
      if (this.alive) this.cargando.set(false);
    }
  }
  seleccionar(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const c = this.config();
    if (!c || this.bloqueado() || this.creado()) return;
    this.error.set('');
    try {
      if (files.length + this.archivos().length > c.max_archivos)
        throw new ErrorUsuario(`Seleccioná hasta ${c.max_archivos} archivos en total.`);
      for (const f of files) validarDocumento(f, c);
      this.archivos.update((prev) => [
        ...prev,
        ...files.map((archivo) => ({
          id: crypto.randomUUID(),
          archivo,
          estado: 'pendiente' as const,
          error: '',
          intentado: false,
        })),
      ]);
    } catch (e) {
      this.error.set(mensajeError(e));
    }
  }
  quitar(id: string): void {
    if (!this.bloqueado() && !this.creado())
      this.archivos.update((fs) => fs.filter((f) => f.id !== id));
  }
  async subir(alumno: string): Promise<boolean> {
    if (!this.archivos().length) return true;
    // Confirmar los límites vigentes y recuperar resultados inciertos por ID antes
    // de repetir una carga. Nunca vuelve a crear al alumno ni a subir confirmados.
    let config: ConfigDocumentos;
    try {
      config = (await this.repo.listar(alumno)).config;
    } catch {
      this.error.set(
        'El alumno ya está creado. No se pudieron verificar los documentos; reintentá solo su subida.',
      );
      return false;
    }
    for (const f of this.archivos().filter((f) => f.estado !== 'guardado')) {
      if (!this.alive) return false;
      this.actualizar(f.id, { estado: 'subiendo', error: '' });
      try {
        await this.repo.subir(alumno, f.archivo, config, { id: f.id, reintento: f.intentado });
        if (this.alive) this.actualizar(f.id, { estado: 'guardado', intentado: true });
      } catch (e) {
        if (this.alive)
          this.actualizar(f.id, { estado: 'error', intentado: true, error: mensajeError(e) });
      }
    }
    return this.archivos().every((f) => f.estado === 'guardado');
  }
  private actualizar(id: string, patch: Partial<ArchivoAlta>): void {
    this.archivos.update((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
}
