import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  untracked,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';

import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';

import { MatSelectModule } from '@angular/material/select';

import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  EntrenamientoDialog,
  EntrenamientoDialogData,
  EntrenamientoDialogResult,
} from './entrenamiento-dialog';
import { PageHeader } from '../../shared/page-header/page-header';
import { PeriodSelector } from '../../shared/period-selector';

import { AlumnosService } from '../../core/services/alumnos-service';

import { AlumnoFicha } from '../alumnos/alumno-ficha';
import {
  AgendaRepository,
  Turno,
  fechaLocal,
  fechaBuenosAires,
  fechasMes,
  minutos,
} from './agenda';
import { AgendaSupabase } from './agenda-supabase';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import {
  diasVisibles,
  distribuirTurnos,
  horaTexto,
  PIXELES_MINUTO,
  sumarDias,
  VistaAgenda,
} from './agenda-layout';

@Component({
  selector: 'app-calendario',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,

    MatSelectModule,

    PageHeader,
    PeriodSelector,
    LoadingLayout,
  ],
  providers: [AgendaSupabase, { provide: AgendaRepository, useExisting: AgendaSupabase }],
  templateUrl: './calendario.html',
  styleUrl: './calendario.scss',
})
export class Calendario {
  readonly agenda = inject(AgendaRepository);
  readonly alumnos = inject(AlumnosService);
  private readonly dialog = inject(MatDialog);

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private entrenamientoRef?: MatDialogRef<EntrenamientoDialog, EntrenamientoDialogResult>;
  private destruido = false;
  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 599.98px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  readonly vista = signal<VistaAgenda>('semana');
  readonly vistaEfectiva = computed<VistaAgenda>(() =>
    this.mobile() && this.vista() !== 'mes' ? 'dia' : this.vista(),
  );
  readonly vistas: { valor: VistaAgenda; nombre: string }[] = [
    { valor: 'dia', nombre: 'Día' },
    { valor: 'laboral', nombre: 'Semana laboral' },
    { valor: 'semana', nombre: 'Semana completa' },
    { valor: 'mes', nombre: 'Mes' },
  ];

  readonly focoHora = signal('09:00');
  readonly hoy = fechaBuenosAires();
  readonly periodo = signal(this.hoy.slice(0, 7));
  readonly fecha = signal(this.hoy);
  readonly diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  readonly celdas = computed(() => {
    const fechas = fechasMes(this.periodo());
    const offset = (new Date(`${fechas[0]}T12:00:00`).getDay() + 6) % 7;
    return [...Array<string>(offset).fill(''), ...fechas];
  });
  readonly activos = computed(() => this.agenda.listar().filter((t) => t.estado === 'programado'));
  readonly dias = computed(() => diasVisibles(this.fecha(), this.vistaEfectiva()));
  readonly intervaloVisible = computed(
    () => {
      const mes = fechasMes(this.periodo());
      const visibles = [...mes, ...this.dias()].sort();
      return { desde: visibles[0], hasta: visibles.at(-1)! };
    },
    { equal: (a, b) => a.desde === b.desde && a.hasta === b.hasta },
  );
  readonly rango = computed(() => {
    const turnos = this.activos().filter((t) => this.dias().includes(t.fecha));
    return {
      inicio: Math.floor(Math.min(420, ...turnos.map((t) => minutos(t.inicio))) / 30) * 30,
      fin:
        Math.ceil(Math.max(1320, ...turnos.map((t) => minutos(t.inicio) + t.duracion)) / 30) * 30,
    };
  });
  readonly horas = computed(() =>
    Array.from({ length: (this.rango().fin - this.rango().inicio) / 30 }, (_, i) =>
      horaTexto(this.rango().inicio + i * 30),
    ),
  );
  readonly altura = computed(() => (this.rango().fin - this.rango().inicio) * PIXELES_MINUTO);
  readonly columnas = computed(() =>
    this.dias().map((fecha) => ({
      fecha,
      bloques: distribuirTurnos(
        this.activos().filter((t) => t.fecha === fecha),
        this.rango().inicio,
      ),
    })),
  );
  readonly tituloRango = computed(() =>
    this.vistaEfectiva() === 'mes'
      ? new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(
          new Date(`${this.periodo()}-01T12:00:00`),
        )
      : this.dias().length === 1
        ? this.etiquetaDia(this.fecha())
        : `${this.etiquetaDia(this.dias()[0])} — ${this.etiquetaDia(this.dias().at(-1)!)}`,
  );
  readonly mesCompleto = computed(() => [
    ...this.celdas(),
    ...Array<string>((7 - (this.celdas().length % 7)) % 7).fill(''),
  ]);
  constructor() {
    this.alumnos.refrescarSiNecesario();
    effect(() => {
      const { desde, hasta } = this.intervaloVisible();
      untracked(() => {
        void this.agenda.cargar(desde, hasta);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.entrenamientoRef?.close();
    });
  }
  recargar(): void {
    const { desde, hasta } = this.intervaloVisible();
    void this.agenda.cargar(desde, hasta);
  }
  cambiarMes(periodo: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return;
    this.periodo.set(periodo);
    this.fecha.set(periodo === this.hoy.slice(0, 7) ? this.hoy : `${periodo}-01`);
  }
  seleccionarFecha(fecha: string): void {
    this.fecha.set(fecha);
    this.periodo.set(fecha.slice(0, 7));
  }
  irHoy(): void {
    this.seleccionarFecha(this.hoy);
  }
  navegar(delta: number): void {
    if (this.vistaEfectiva() === 'mes') {
      this.moverMes(delta);
      return;
    }
    const fecha = sumarDias(this.fecha(), delta * (this.vistaEfectiva() === 'dia' ? 1 : 7));
    if (fecha.slice(0, 4) >= '1900' && fecha.slice(0, 4) <= '9999') this.seleccionarFecha(fecha);
  }
  etiquetaDia(fecha: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${fecha}T12:00:00`));
  }
  fin(turno: Turno): string {
    return horaTexto(minutos(turno.inicio) + turno.duracion);
  }
  finRango(): string {
    return horaTexto(this.rango().fin);
  }
  participantes(turno: Turno): string {
    return turno.alumnoIds.map((id) => this.nombre(id)).join(', ');
  }
  turnosDia(fecha: string): readonly Turno[] {
    return this.activos()
      .filter((t) => t.fecha === fecha)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  nuevoEn(fecha: string, hora: string, origen?: HTMLElement): void {
    this.seleccionarFecha(fecha);
    this.abrirModal({ fecha, inicio: hora }, origen);
  }
  verDetalle(turno: Turno, origen?: HTMLElement): void {
    this.abrirModal({ fecha: turno.fecha, inicio: turno.inicio, turno, detalles: true }, origen);
  }
  private abrirModal(data: EntrenamientoDialogData, origen?: HTMLElement): void {
    if (this.entrenamientoRef || this.dialog.openDialogs.length) return;
    this.entrenamientoRef = this.dialog.open(EntrenamientoDialog, {
      data,
      injector: this.injector,
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
      autoFocus: 'first-heading',
      restoreFocus: false,
    });
    this.entrenamientoRef.afterClosed().subscribe((result) => {
      this.entrenamientoRef = undefined;
      if (this.destruido) return;
      if (result?.fecha) this.seleccionarFecha(result.fecha);
      if (result?.alumnoId) {
        this.dialog
          .open(AlumnoFicha, {
            data: result.alumnoId,
            width: '960px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '90dvh',
          })
          .afterClosed()
          .subscribe(() => this.restaurarFoco(origen));
      } else this.restaurarFoco(origen);
    });
  }
  private restaurarFoco(origen?: HTMLElement): void {
    if (this.destruido) return;
    afterNextRender(
      () => {
        if (origen?.isConnected) origen.focus();
        else
          this.host.nativeElement
            .querySelector<HTMLButtonElement>('.celda-hora[tabindex="0"], .dia.elegido')
            ?.focus();
      },
      { injector: this.injector },
    );
  }
  tecladoCelda(event: KeyboardEvent, fecha: string, hora: string): void {
    const indice = this.dias().indexOf(fecha);
    const fila = this.horas().indexOf(hora);
    let destinoDia = indice,
      destinoFila = fila;
    switch (event.key) {
      case 'ArrowDown':
        destinoFila++;
        break;
      case 'ArrowUp':
        destinoFila--;
        break;
      case 'ArrowRight':
        destinoDia++;
        break;
      case 'ArrowLeft':
        destinoDia--;
        break;
      case 'Home':
        destinoFila = 0;
        break;
      case 'End':
        destinoFila = this.horas().length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const dia = this.dias()[destinoDia],
      inicio = this.horas()[destinoFila];
    if (!dia || !inicio) return;
    this.seleccionarFecha(dia);
    this.focoHora.set(inicio);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLButtonElement>(`[data-celda="${dia}_${inicio}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }
  moverMes(delta: number): void {
    const d = new Date(`${this.periodo()}-01T12:00:00`);
    d.setMonth(d.getMonth() + delta);
    if (d.getFullYear() >= 1900 && d.getFullYear() <= 9999)
      this.cambiarMes(fechaLocal(d).slice(0, 7));
  }
  cantidad(fecha: string): number {
    return this.activos().filter((t) => t.fecha === fecha).length;
  }
  nombre(id: string): string {
    const alumno = this.alumnos.alumnos().find((a) => a.id === id);
    return alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Alumno no disponible';
  }
  abrir(turno?: Turno, origen?: HTMLElement): void {
    if (turno) {
      this.abrirModal({ fecha: turno.fecha, inicio: turno.inicio, turno }, origen);
      return;
    }
    this.abrirModal({ fecha: this.fecha(), inicio: '09:00' }, origen);
  }
}
