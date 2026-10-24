import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIcon } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/page-header/page-header';
import { explicacionesGuia } from './guia-contenido';

@Component({
  selector: 'app-guia',
  imports: [PageHeader, MatExpansionModule, MatIcon, MatButtonModule, RouterLink],
  templateUrl: './guia.html',
  styleUrl: './guia.scss',
})
export class Guia {
  readonly explicaciones = explicacionesGuia;
}
