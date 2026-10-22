import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DescargasService {
  descargar(nombre: string, contenido: string, tipo: string): void {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.append(enlace);
    try {
      enlace.click();
    } finally {
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
