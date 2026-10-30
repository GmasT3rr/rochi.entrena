import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../core/auth/auth-service';
import { DocumentoAlumno } from '../../core/documentos-alumnos';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { DescargasService } from '../../core/services/descargas-service';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { HojaLectura, leerExcel, renderizarWord } from './documento-office-render';

@Component({
  selector: 'app-documento-office',
  imports: [MatButtonModule, MatFormFieldModule, MatSelectModule, LoadingLayout],
  template: `
    <main [attr.aria-busy]="cargando()">
      <header>
        <h1>{{ documento()?.nombre_original || 'Documento' }}</h1>
        <div class="hub-actions">
          <button
            mat-stroked-button
            (click)="descargar()"
            [disabled]="!documento() || descargando()"
          >
            Descargar
          </button>
          <button mat-button (click)="cerrar()">Cerrar</button>
        </div>
      </header>
      @if (cargando()) {
        <app-loading-layout variant="pagos" label="Preparando documento" />
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (wordUrl()) {
        <iframe
          class="word"
          sandbox=""
          referrerpolicy="no-referrer"
          [src]="wordUrl()"
          title="Documento Word en modo lectura"
        ></iframe>
      }
      @if (hojas().length) {
        <mat-form-field appearance="outline"
          ><mat-label>Hoja</mat-label>
          <mat-select [value]="indice()" (selectionChange)="indice.set($event.value)">
            @for (h of hojas(); track $index) {
              <mat-option [value]="$index">{{ h.nombre }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (hoja(); as h) {
          <div
            class="tabla"
            tabindex="0"
            role="region"
            [attr.aria-label]="'Hoja ' + h.nombre + ', solo lectura'"
          >
            <table>
              <thead>
                <tr>
                  <th aria-label="Fila"></th>
                  @for (c of h.columnas; track c) {
                    <th scope="col">{{ columna(c) }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (fila of h.filas; track $index) {
                  <tr>
                    <th scope="row">{{ $index + 1 }}</th>
                    @for (c of h.columnas; track c) {
                      <td>{{ fila[c] || '' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </main>
  `,
  styleUrl: './documento-office.scss',
})
export class DocumentoOffice {
  private readonly repo = inject(DocumentosAlumnosRepository);
  private readonly auth = inject(AuthService);
  private readonly descargas = inject(DescargasService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly usuario = computed(() => this.auth.session()?.user?.id ?? null);
  readonly documento = signal<DocumentoAlumno | null>(null);
  readonly cargando = signal(false);
  readonly descargando = signal(false);
  readonly error = signal('');
  readonly wordUrl = signal<SafeResourceUrl | null>(null);
  readonly hojas = signal<HojaLectura[]>([]);
  readonly indice = signal(0);
  readonly hoja = computed(() => this.hojas()[this.indice()]);
  private url = '';
  private generation = 0;
  constructor() {
    effect(() => {
      const id = this.params()?.get('id'),
        usuario = this.usuario();
      untracked(() => {
        const generation = ++this.generation;
        this.limpiar();
        if (id && usuario) void this.cargar(id, generation);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.limpiar();
    });
  }
  private limpiar() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = '';
    this.wordUrl.set(null);
    this.documento.set(null);
    this.hojas.set([]);
    this.indice.set(0);
    this.error.set('');
    this.cargando.set(false);
    this.descargando.set(false);
  }
  private async cargar(id: string, generation: number) {
    this.cargando.set(true);
    try {
      const doc = await this.repo.obtener(id);
      if (generation !== this.generation) return;
      this.documento.set(doc);
      const blob = await this.repo.descargar(doc);
      if (generation !== this.generation) return;
      const ext = doc.nombre_original.split('.').pop()?.toLowerCase();
      if (ext === 'docx') {
        const html = await renderizarWord(blob);
        if (generation !== this.generation) return;
        this.url = URL.createObjectURL(html);
        // Only our local, scriptless document is trusted; sandbox and CSP remain mandatory.
        this.wordUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.url));
      } else if (ext === 'xlsx') {
        const hojas = await leerExcel(blob);
        if (generation !== this.generation) return;
        this.hojas.set(hojas);
        if (!hojas.length)
          this.error.set('La planilla no contiene hojas visibles. Podés descargar el original.');
      } else this.error.set('Este formato no tiene vista previa. Podés descargar el original.');
    } catch {
      if (generation === this.generation)
        this.error.set(
          'No se pudo previsualizar el documento. Revisá tus permisos y la conexión, o descargá el original.',
        );
    } finally {
      if (generation === this.generation) this.cargando.set(false);
    }
  }
  async descargar() {
    const doc = this.documento(),
      generation = this.generation,
      token = this.auth.session()?.access_token;
    if (!doc || !token || this.descargando()) return;
    this.descargando.set(true);
    try {
      const blob = await this.repo.descargar(doc);
      if (generation === this.generation && token === this.auth.session()?.access_token)
        this.descargas.descargarBlob(doc.nombre_original, blob);
    } catch {
      if (generation === this.generation)
        this.error.set('No se pudo descargar el archivo. Revisá tus permisos y la conexión.');
    } finally {
      if (generation === this.generation) this.descargando.set(false);
    }
  }
  columna(indice: number): string {
    let n = indice + 1,
      nombre = '';
    while (n > 0) {
      n--;
      nombre = String.fromCharCode(65 + (n % 26)) + nombre;
      n = Math.floor(n / 26);
    }
    return nombre;
  }
  cerrar() {
    this.generation++;
    this.limpiar();
    window.close();
    this.error.set('Podés cerrar esta pestaña si el navegador no la cerró automáticamente.');
  }
}
