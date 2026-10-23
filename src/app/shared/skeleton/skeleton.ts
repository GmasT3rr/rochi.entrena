import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: '',
  styleUrl: './skeleton.scss',
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[class.circle]': "shape() === 'circle'",
    '[class.card]': "shape() === 'card'",
    '[class.line]': "shape() === 'line'",
  },
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly shape = input<'rectangle' | 'line' | 'circle' | 'card'>('rectangle');
}
