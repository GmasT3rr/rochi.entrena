import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  isDevMode,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/auth/auth-service';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import {
  CampoPerfil,
  PerfilEntrenamiento,
  SECCIONES_PERFIL,
} from '../../core/perfil-entrenamiento';
import { MinimumLoading } from '../../shared/skeleton/minimum-loading';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { PerfilEditor } from './perfil-editor';
import { DiagnosticoPerfil, PerfilCargaError } from '../../core/services/perfil-carga-error';
import { mensajeError } from '../../core/services/mensajes-usuario';

@Component({
  selector: 'app-alumno-entrenamiento',
  imports: [MatButtonModule, DatePipe, LoadingLayout],
  template: `
    <section aria-label="Perfil de entrenamiento" class="training" [attr.aria-busy]="cargando()">
      @if (inicial()) {
        <app-loading-layout variant="ficha" label="Cargando perfil de entrenamiento" />
      } @else if (error()) {
        <p role="alert">{{ error() }}</p>
        <button mat-stroked-button (click)="cargar()" [disabled]="cargando()">Reintentar</button>
      } @else if (cargado()) {
        <div class="hub-actions">
          <button mat-flat-button (click)="editar()" [disabled]="cargando() || editando()">
            {{ perfil() ? 'Editar perfil de entrenamiento' : 'Completar perfil' }}
          </button>
          <button mat-button (click)="cargar()" [disabled]="cargando() || editando()">
            Actualizar perfil
          </button>
        </div>
        @if (cargando()) {
          <p role="status">Actualizando perfil…</p>
        }
        @if (secciones().length) {
          <p class="scope">
            La edad es la declarada al completar la ficha y no se actualiza automáticamente.
          </p>
          @for (s of secciones(); track s.titulo) {
            <section>
              <h3>{{ s.titulo }}</h3>
              <dl>
                @for (c of s.campos; track c.clave) {
                  <div>
                    <dt>{{ c.label }}</dt>
                    <dd>{{ valor(c) }}</dd>
                  </div>
                }
              </dl>
            </section>
          }
          <p class="scope">
            Última actualización: {{ perfil()!.actualizado_en | date: 'dd/MM/yyyy HH:mm' }}
          </p>
        } @else {
          <p role="status" class="empty">
            {{
              perfil()
                ? 'El perfil no tiene datos completados.'
                : 'Este alumno todavía no tiene un perfil de entrenamiento.'
            }}
          </p>
        }
      }
    </section>
  `,
  styleUrl: './alumno-entrenamiento.scss',
})
export class AlumnoEntrenamiento {
  readonly alumno = input.required<string>();
  private readonly repo = inject(PerfilesEntrenamientoRepository);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly loading = new MinimumLoading();
  readonly inicial = this.loading.visible.asReadonly();
  readonly cargando = signal(false);
  readonly cargado = signal(false);
  readonly editando = signal(false);
  readonly error = signal('');
  readonly diagnostico = signal<DiagnosticoPerfil | null>(null);
  readonly perfil = signal<PerfilEntrenamiento | null>(null);
  readonly secciones = computed(() =>
    SECCIONES_PERFIL.map((s) => ({
      ...s,
      campos: s.campos.filter(
        (c) => this.perfil()?.[c.clave] !== null && this.perfil()?.[c.clave] !== undefined,
      ),
    })).filter((s) => s.campos.length),
  );
  private generation = 0;
  private alive = true;
  constructor() {
    effect(() => {
      const alumno = this.alumno(),
        session = this.auth.session();
      untracked(() => {
        this.generation++;
        this.loading.cancel();
        this.perfil.set(null);
        this.cargado.set(false);
        this.error.set('');
        this.diagnostico.set(null);
        this.editando.set(false);
        this.cargando.set(false);
        if (session && alumno) void this.cargar();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.generation++;
      this.loading.cancel();
    });
  }
  async cargar(): Promise<void> {
    const generation = ++this.generation;
    const finish = this.loading.begin(!this.cargado());
    this.cargando.set(true);
    this.error.set('');
    this.diagnostico.set(null);
    try {
      const perfil = await this.repo.obtener(this.alumno());
      if (this.alive && generation === this.generation) {
        this.perfil.set(perfil);
        this.cargado.set(true);
      }
    } catch (error) {
      if (this.alive && generation === this.generation) {
        this.diagnostico.set(
          isDevMode() && error instanceof PerfilCargaError ? error.diagnostico : null,
        );
        this.error.set(mensajeError(error));
      }
    } finally {
      if (this.alive && generation === this.generation) {
        this.cargando.set(false);
        finish();
      }
    }
  }
  valor(c: CampoPerfil): string {
    const v = this.perfil()?.[c.clave];
    if (v === null || v === undefined) return '';
    return (
      (typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)) + (c.unidad ? ' ' + c.unidad : '')
    );
  }
  editar(): void {
    if (!this.cargado() || this.cargando() || this.error() || this.editando()) return;
    const generation = this.generation;
    this.editando.set(true);
    const ref = this.dialog.open(PerfilEditor, {
      data: { alumno: this.alumno(), perfil: this.perfil() },
      closeOnNavigation: false,
      width: '760px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
    const editor = ref.componentInstance;
    ref.afterClosed().subscribe((ok) => {
      if (!this.alive || generation !== this.generation) return;
      this.editando.set(false);
      if (ok && editor.resultado) this.perfil.set(editor.resultado);
    });
  }
}
