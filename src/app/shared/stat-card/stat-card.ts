import { RouterLink, Params } from '@angular/router';
import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
  imports: [MatIcon, RouterLink],
  selector: 'app-stat-card',
  styleUrl: './stat-card.scss',
  templateUrl: './stat-card.html',
})
export class StatCard {
  readonly enlace = input('');
  readonly parametros = input<Params>({});
  readonly compact = input(false);
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
  readonly icon = input('insights');
}
