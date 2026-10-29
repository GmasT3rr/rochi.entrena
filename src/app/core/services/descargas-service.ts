import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DescargasService {
  descargar(nombre: string, contenido: string, tipo: string): void {
    this.descargarBlob(nombre, new Blob([contenido], { type: tipo }));
  }
  descargarBlob(nombre: string, contenido: Blob): void {
    const url = URL.createObjectURL(contenido);
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
