import { Component } from '@angular/core';
import { MatCard, MatCardContent, MatCardHeader, MatCardSubtitle, MatCardTitle } from '@angular/material/card';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  imports: [MatCard, MatCardHeader, MatCardTitle, MatCardSubtitle, MatCardContent, PageHeader],
  selector: 'app-configuracion',
  styleUrl: './configuracion.scss',
  templateUrl: './configuracion.html',
})
export class Configuracion {
  readonly ajustes = [
    {
      titulo: 'Estudio',
      detalle: 'Rochy Entrena',
      descripcion: 'Nombre visible del espacio de trabajo en el panel.',
    },
    {
      titulo: 'Moneda',
      detalle: 'ARS',
      descripcion: 'Los importes se muestran en pesos argentinos.',
    },
    {
      titulo: 'Formato regional',
      detalle: 'Argentina',
      descripcion: 'Fechas en formato dd/MM/aaaa e interfaz en español de Argentina.',
    },
  ];
}
