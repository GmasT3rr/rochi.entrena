import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth-service';
import { DocumentoAlumno, ConfigDocumentos, validarDocumento } from '../../core/documentos-alumnos';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { DescargasService } from '../../core/services/descargas-service';
import { ToastService } from '../../core/services/toast-service';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { MinimumLoading } from '../../shared/skeleton/minimum-loading';
import { ConfirmarAlumno } from './confirmar-alumno';

@Component({
  selector: 'app-alumno-documentos',
  imports: [MatButtonModule, DatePipe, DecimalPipe, LoadingLayout],
  templateUrl: './alumno-documentos.html',
  styleUrl: './alumno-documentos.scss',
})
export class AlumnoDocumentos {
  readonly alumno = input.required<string>();
  private readonly repo = inject(DocumentosAlumnosRepository);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly descargas = inject(DescargasService);
  private readonly loading = new MinimumLoading();
  readonly inicial = this.loading.visible.asReadonly();
  readonly cargando = signal(false);
  readonly ocupado = signal(false);
  readonly estadoOperacion = signal('');
  readonly error = signal('');
  readonly errorCarga = signal('');
  readonly documentos = signal<DocumentoAlumno[]>([]);
  readonly config = signal<ConfigDocumentos | null>(null);
  private cargado = false;
  private generation = 0;
  private alive = true;
  constructor() {
    effect(() => {
      const alumno = this.alumno();
      const session = this.auth.session();
      untracked(() => {
        this.generation++;
        this.loading.cancel();
        this.documentos.set([]);
        this.config.set(null);
        this.cargado = false;
        this.cargando.set(false);
        this.ocupado.set(false);
        this.estadoOperacion.set('');
        this.error.set('');
        this.errorCarga.set('');
        if (session && alumno) void this.cargar();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.generation++;
      this.loading.cancel();
    });
  }
  private vigente(generation: number) {
    return this.alive && generation === this.generation;
  }
  async cargar(): Promise<void> {
    const generation = ++this.generation;
    const finish = this.loading.begin(!this.cargado);
    this.cargando.set(true);
    this.errorCarga.set('');
    try {
      const lista = await this.repo.listar(this.alumno());
      if (!this.vigente(generation)) return;
      this.documentos.set(lista.documentos);
      this.config.set(lista.config);
      this.cargado = true;
    } catch {
      if (this.vigente(generation)) {
        this.errorCarga.set(
          'No se pudieron cargar los documentos. Revisá la conexión y los permisos o consultá a la administración.',
        );
        this.documentos.set([]);
      }
    } finally {
      if (this.vigente(generation)) {
        finish();
        this.cargando.set(false);
      }
    }
  }
  get accept(): string {
    return Object.keys(this.config()?.formatos ?? {})
      .map((e) => '.' + e)
      .join(',');
  }
  async seleccionar(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const config = this.config();
    if (!files.length || !config || this.ocupado() || this.cargando() || this.errorCarga()) return;
    this.error.set('');
    try {
      if (files.length > config.max_archivos)
        throw Error(`Seleccioná hasta ${config.max_archivos} archivos por vez.`);
      for (const file of files) validarDocumento(file, config);
    } catch (e) {
      this.error.set((e as Error).message);
      return;
    }
    const alumno = this.alumno();
    const generation = this.generation;
    this.ocupado.set(true);
    let exitos = 0;
    try {
      for (const [index, file] of files.entries()) {
        if (!this.vigente(generation)) return;
        this.estadoOperacion.set(`Subiendo archivo ${index + 1} de ${files.length}…`);
        await this.repo.subir(alumno, file, config);
        exitos++;
      }
      if (this.vigente(generation))
        this.toast.mostrar(`${exitos} documento(s) adjuntado(s).`, 'exito');
    } catch (e) {
      if (this.vigente(generation))
        this.error.set(
          `${exitos} de ${files.length} archivos confirmados. ${(e as Error).message}`,
        );
    } finally {
      if (this.vigente(generation)) {
        this.ocupado.set(false);
        this.estadoOperacion.set('');
        await this.cargar();
      }
    }
  }
  async descargar(doc: DocumentoAlumno): Promise<void> {
    if (this.ocupado() || doc.estado !== 'disponible') return;
    const generation = this.generation;
    this.ocupado.set(true);
    this.error.set('');
    this.estadoOperacion.set('Preparando descarga…');
    try {
      const blob = await this.repo.descargar(doc);
      if (this.vigente(generation)) this.descargas.descargarBlob(doc.nombre_original, blob);
    } catch (e) {
      if (this.vigente(generation)) this.error.set((e as Error).message);
    } finally {
      if (this.vigente(generation)) {
        this.ocupado.set(false);
        this.estadoOperacion.set('');
      }
    }
  }
  async eliminar(doc: DocumentoAlumno): Promise<void> {
    if (this.ocupado()) return;
    const generation = this.generation;
    this.ocupado.set(true);
    this.error.set('');
    let intento = false;
    try {
      const ok = await firstValueFrom(
        this.dialog
          .open(ConfirmarAlumno, {
            data: {
              titulo: 'Eliminar documento',
              mensaje: `¿Confirmás eliminar “${doc.nombre_original}”? Se eliminarán el archivo y su registro. Esta acción no se puede deshacer.`,
              danger: true,
            },
            width: '420px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '90dvh',
          })
          .afterClosed(),
      );
      if (!ok || !this.vigente(generation)) return;
      intento = true;
      this.estadoOperacion.set('Eliminando documento…');
      await this.repo.eliminar(doc);
      if (this.vigente(generation)) this.toast.mostrar('Documento eliminado.', 'exito');
    } catch (e) {
      if (this.vigente(generation)) this.error.set((e as Error).message);
    } finally {
      if (this.vigente(generation)) {
        this.ocupado.set(false);
        this.estadoOperacion.set('');
        if (intento) await this.cargar();
      }
    }
  }
}
