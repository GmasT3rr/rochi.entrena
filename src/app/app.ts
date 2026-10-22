import { Component, inject } from '@angular/core';
import { AparienciaService } from './core/services/apariencia-service';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly apariencia = inject(AparienciaService);
}
