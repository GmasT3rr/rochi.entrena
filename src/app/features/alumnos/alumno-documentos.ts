import { ErrorUsuario, mensajeError } from '../../core/services/mensajes-usuario';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe, DecimalPipe, Location } from '@angular/common';
import { Router } from '@angular/router';
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
  private readonly aperturas = new Map<Window, string>();
  private revisionAperturas: ReturnType<typeof setInterval> | undefined;
  private liberarApertura(ventana: Window, cerrar = false) {
    const url = this.aperturas.get(ventana);
    if (url) URL.revokeObjectURL(url);
    this.aperturas.delete(ventana);
    if (cerrar && !ventana.closed) ventana.close();
    if (!this.aperturas.size && this.revisionAperturas !== undefined) {
      clearInterval(this.revisionAperturas);
      this.revisionAperturas = undefined;
    }
  }
  private cerrarAperturas() {
    for (const ventana of this.aperturas.keys()) this.liberarApertura(ventana, true);
  }
  private observarCierres() {
    if (this.revisionAperturas !== undefined) return;
    // Keep the Blob alive while the native PDF viewer may still read its pages.
    this.revisionAperturas = setInterval(() => {
      for (const ventana of this.aperturas.keys()) {
        if (ventana.closed) this.liberarApertura(ventana);
      }
    }, 1000);
  }
  readonly miniaturas = signal<Record<string, string>>({});
  private limpiarMiniaturas() {
    Object.values(this.miniaturas()).forEach((url) => URL.revokeObjectURL(url));
    this.miniaturas.set({});
  }
  private async cargarMiniaturas(docs: DocumentoAlumno[], generation: number) {
    for (const doc of docs) {
      if (!this.vigente(generation)) return;
      if (doc.estado !== 'disponible' || !/^image\/(png|jpeg|webp)$/.test(doc.tipo_mime)) continue;
      try {
        const blob = await this.repo.descargar(doc);
        if (!this.vigente(generation)) return;
        const url = URL.createObjectURL(blob.slice(0, blob.size, doc.tipo_mime));
        this.miniaturas.update((actual) => ({ ...actual, [doc.storage_path]: url }));
      } catch {
        /* El nombre conserva la apertura del archivo original. */
      }
    }
  }
  readonly alumno = input.required<string>();
  private readonly repo = inject(DocumentosAlumnosRepository);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly auth = inject(AuthService);
  // Supabase emits new session objects on focus/token refresh. These do not
  // change the owner of the list and must not reset it or rerun the listing RPC.
  private readonly usuario = computed(() => this.auth.session()?.user?.id ?? null);
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
      const usuario = this.usuario();
      untracked(() => {
        this.generation++;
        this.cerrarAperturas();
        this.loading.cancel();
        this.limpiarMiniaturas();
        this.documentos.set([]);
        this.config.set(null);
        this.cargado = false;
        this.cargando.set(false);
        this.ocupado.set(false);
        this.estadoOperacion.set('');
        this.error.set('');
        this.errorCarga.set('');
        if (usuario && alumno) void this.cargar();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.cerrarAperturas();
      this.limpiarMiniaturas();
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
      this.limpiarMiniaturas();
      this.documentos.set(lista.documentos);
      void this.cargarMiniaturas(lista.documentos, generation);
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
        throw new ErrorUsuario(`Seleccioná hasta ${config.max_archivos} archivos por vez.`);
      for (const file of files) validarDocumento(file, config);
    } catch (e) {
      this.error.set(mensajeError(e));
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
        this.toast.mostrar(
          exitos === 1 ? 'Documento adjuntado' : `${exitos} documentos adjuntados`,
          'exito',
        );
    } catch (e) {
      if (this.vigente(generation))
        this.error.set(`${exitos} de ${files.length} archivos confirmados. ${mensajeError(e)}`);
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
    const token = this.auth.session()?.access_token;
    this.ocupado.set(true);
    this.error.set('');
    this.estadoOperacion.set('Preparando descarga…');
    try {
      const blob = await this.repo.descargar(doc);
      if (this.vigente(generation) && token === this.auth.session()?.access_token)
        this.descargas.descargarBlob(doc.nombre_original, blob);
    } catch {
      if (this.vigente(generation))
        this.error.set('No se pudo descargar el archivo. Revisá tu conexión y tus permisos.');
    } finally {
      if (this.vigente(generation)) {
        this.ocupado.set(false);
        this.estadoOperacion.set('');
      }
    }
  }
  async abrir(doc: DocumentoAlumno): Promise<void> {
    if (this.ocupado() || this.cargando() || doc.estado !== 'disponible' || !this.auth.session())
      return;
    const office = /\.(docx|xlsx)$/i.test(doc.nombre_original);
    if (!office && !/\.(pdf|png|jpe?g|webp)$/i.test(doc.nombre_original)) {
      await this.descargar(doc);
      return;
    }
    const generation = this.generation;
    const token = this.auth.session()?.access_token;
    this.error.set('');
    let ventana: Window | null = null;
    try {
      // Reserve the tab in the click/keyboard event, before any asynchronous work.
      // noopener in window.open would hide the handle needed to detect popup blockers.
      ventana = window.open('about:blank', '_blank');
      if (!ventana) {
        this.error.set(
          'El navegador bloqueó la pestaña. Permití ventanas emergentes para este sitio y volvé a intentar.',
        );
        return;
      }
      ventana.opener = null;
      if (office) {
        const ruta = this.router.serializeUrl(this.router.createUrlTree(['/documentos', doc.id]));
        ventana.location.replace(
          new URL(this.location.prepareExternalUrl(ruta), document.baseURI).href,
        );
        return;
      }
      this.aperturas.set(ventana, '');
      this.ocupado.set(true);
      this.estadoOperacion.set('Preparando apertura del archivo…');
      const blob = await this.repo.descargar(doc);
      if (!this.vigente(generation) || this.auth.session()?.access_token !== token) {
        this.liberarApertura(ventana, true);
        return;
      }
      if (ventana.closed) return;
      const ext = doc.nombre_original.split('.').pop()!.toLowerCase();
      const mime =
        ext === 'pdf'
          ? 'application/pdf'
          : ['jpg', 'jpeg'].includes(ext)
            ? 'image/jpeg'
            : `image/${ext}`;
      const url = URL.createObjectURL(blob.slice(0, blob.size, mime));
      this.aperturas.set(ventana, url);
      ventana.location.replace(url);
      this.observarCierres();
    } catch {
      if (ventana) this.liberarApertura(ventana, true);
      if (this.vigente(generation))
        this.error.set('No se pudo abrir el archivo. Revisá tu conexión y tus permisos de acceso.');
    } finally {
      if (ventana && !this.aperturas.get(ventana)) this.liberarApertura(ventana);
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
      if (this.vigente(generation)) this.error.set(mensajeError(e));
    } finally {
      if (this.vigente(generation)) {
        this.ocupado.set(false);
        this.estadoOperacion.set('');
        if (intento) await this.cargar();
      }
    }
  }
}
