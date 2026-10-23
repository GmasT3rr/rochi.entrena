import { Component, input } from '@angular/core';
import { Skeleton } from './skeleton';

@Component({
  selector: 'app-loading-layout',
  imports: [Skeleton],
  templateUrl: './loading-layout.html',
  styleUrl: './loading-layout.scss',
  host: { 'aria-busy': 'true', role: 'region', '[attr.aria-label]': 'label()' },
})
export class LoadingLayout {
  readonly variant = input<'dashboard' | 'alumnos' | 'cuentas' | 'pagos'>('alumnos');
  readonly label = input('Cargando datos');
  readonly filas = [0, 1, 2, 3, 4];
}
