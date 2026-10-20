import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MockData } from '../../core/services/mock-data';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  imports: [DatePipe, MatCard, MatCardContent, MatTableModule, PageHeader],
  selector: 'app-alumnos',
  styleUrl: './alumnos.scss',
  templateUrl: './alumnos.html',
})
export class Alumnos {
  private readonly mockData = inject(MockData);

  readonly alumnos = this.mockData.alumnos;
  readonly columnas = ['nombre', 'modalidad', 'estado', 'proximaCuota'];
}
