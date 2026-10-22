import { TestBed } from '@angular/core/testing';
import { csv, Respaldo, validarRespaldo } from '../respaldo';
import { RespaldoService } from './respaldo-service';
import { AlumnosLocalService as AlumnosService } from './alumnos-local-service';
import { CuentasLocalesService as CuentasService } from './cuentas-locales-service';
import { AlumnosRepository, ALUMNOS_STORAGE_KEY } from './alumnos-repository';
import { CuentasRepository, CUENTAS_STORAGE_KEY } from './cuentas-repository';
import { DATOS_STORAGE_KEY } from './datos-repository';

export const ejemploRespaldo = (): Respaldo => ({
  formato: 'rochy',
  version: 1,
  generadoEn: '2026-10-21T12:00:00.000Z',
  alumnos: [
    {
      id: 'a-1',
      nombre: 'Ana',
      apellido: 'Pérez',
      telefono: '+54 11 1234',
      email: 'ana@example.com',
      modalidad: 'Online',
      estado: 'Activo',
      fechaIngreso: '2026-01-01',
      observaciones: 'Una; "nota"\ncon salto',
      configuracionMensual: { habilitada: true, importe: 23456.78, diaVencimiento: 31 },
    },
  ],
  cuotas: [
    {
      id: 'c-1',
      alumnoId: 'a-1',
      concepto: 'Cuota de entrenamiento',
      periodo: '2026-10',
      importe: 23456.78,
      vencimiento: '2026-10-31',
      observaciones: '',
    },
  ],
  pagos: [
    {
      id: 'p-1',
      cuotaId: 'c-1',
      importe: 10000.25,
      fecha: '2026-10-10',
      medio: 'Transferencia',
      observaciones: '=HYPERLINK("malicioso")',
    },
  ],
});

describe('Exportaciones y restauración', () => {
  beforeEach(() => {
    localStorage.clear();
    const r = ejemploRespaldo();
    localStorage.setItem(ALUMNOS_STORAGE_KEY, JSON.stringify(r.alumnos));
    localStorage.setItem(
      CUENTAS_STORAGE_KEY,
      JSON.stringify({ version: 1, cuotas: r.cuotas, pagos: r.pagos }),
    );
    TestBed.configureTestingModule({});
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('exporta CSV con BOM UTF-8, punto y coma, nombres, fechas y decimales argentinos', () => {
    const s = TestBed.inject(RespaldoService);
    for (const entidad of ['alumnos', 'cuotas', 'pagos'] as const) {
      const salida = s.exportar(entidad);
      expect(salida.charCodeAt(0)).toBe(0xfeff);
      expect(salida).toContain(';');
      expect(salida.endsWith('\r\n')).toBe(true);
      expect(Array.from(new TextEncoder().encode(salida).slice(0, 3))).toEqual([239, 187, 191]);
    }
    expect(s.exportar('alumnos')).toContain('"Una; ""nota""\ncon salto"');
    expect(s.exportar('alumnos')).toContain('"\'+54 11 1234"');
    expect(s.exportar('cuotas')).toContain('"Ana Pérez"');
    expect(s.exportar('cuotas')).toContain('"23456,78";"31/10/2026"');
    expect(s.exportar('pagos')).toContain('"Ana Pérez"');
    expect(s.exportar('pagos')).toContain('"10000,25";"10/10/2026"');
    expect(s.exportar('pagos')).toContain('"\'=HYPERLINK(');
  });
  it.each([
    '=1+1',
    '+SUM(A1)',
    '-1+1',
    '@SUM(A1)',
    '  =cmd',
    '\t=cmd',
    '\r@cmd',
    '\ntexto',
    '\u0000=cmd',
  ])('neutraliza el texto %s', (valor) => {
    expect(csv([[valor]])).toBe('\uFEFF"\'' + valor + '"\r\n');
  });
  it('respalda solo datos de Rochy sin alterar valores originales ni otros datos del navegador', () => {
    localStorage.setItem('otra-app', 'secreto');
    const s = TestBed.inject(RespaldoService);
    const copia = s.crear();
    validarRespaldo(copia);
    expect(copia.alumnos).toEqual(ejemploRespaldo().alumnos);
    expect(copia.cuotas).toEqual(ejemploRespaldo().cuotas);
    expect(copia.pagos).toEqual(ejemploRespaldo().pagos);
    expect(JSON.stringify(copia)).not.toContain('secreto');
    expect(copia.pagos[0].observaciones).toBe('=HYPERLINK("malicioso")');
    expect(s.leer('\uFEFF' + JSON.stringify(copia))).toEqual(copia);
  });
  it('reemplaza solo el conjunto local, actualiza Signals, conserva IDs y persiste tras recargar', () => {
    const s = TestBed.inject(RespaldoService);
    const alumnos = TestBed.inject(AlumnosService);
    const cuentas = TestBed.inject(CuentasService);
    cuentas.hoy.set('2026-10-21');
    const r = ejemploRespaldo();
    r.alumnos[0].id = 'nuevo';
    r.alumnos[0].nombre = 'Lucía';
    r.cuotas[0].alumnoId = 'nuevo';
    r.pagos[0].importe = 20000;
    s.restaurar(r);
    expect(alumnos.alumnos()).toEqual(r.alumnos);
    expect(cuentas.cuotas()).toEqual(r.cuotas);
    expect(cuentas.pagos()).toEqual(r.pagos);
    expect(cuentas.ingresosMes()).toBe(20000);
    expect(cuentas.cuentas()[0].saldo).toBe(3456.78);
    expect(alumnos.activos()).toBe(1);
    expect(cuentas.proximos()).toHaveLength(0);
    const almacenado = localStorage.getItem(DATOS_STORAGE_KEY);
    TestBed.resetTestingModule();
    expect(TestBed.inject(AlumnosService).alumnos()).toEqual(r.alumnos);
    expect(TestBed.inject(CuentasService).pagos()).toEqual(r.pagos);
    expect(localStorage.getItem(DATOS_STORAGE_KEY)).toBe(almacenado);
  });
  it('continúa guardando con los repositorios existentes después de restaurar', () => {
    const s = TestBed.inject(RespaldoService);
    s.restaurar(ejemploRespaldo());
    const alumnos = TestBed.inject(AlumnosService);
    expect(alumnos.guardar({ ...alumnos.alumnos()[0], nombre: 'Editada' }, 'a-1')).toBe(true);
    const cuentas = TestBed.inject(CuentasService);
    expect(
      cuentas.guardarPago({
        cuotaId: 'c-1',
        importe: 100,
        fecha: '2026-01-01',
        medio: 'Efectivo',
        observaciones: '',
      }),
    ).toBe(true);
    expect(TestBed.inject(AlumnosRepository).cargar()![0].nombre).toBe('Editada');
    expect(TestBed.inject(CuentasRepository).cargar()!.pagos).toHaveLength(2);
  });
  it('respeta respaldos vacíos sin volver a generar mocks', () => {
    const s = TestBed.inject(RespaldoService);
    s.restaurar({ ...ejemploRespaldo(), alumnos: [], cuotas: [], pagos: [] });
    TestBed.resetTestingModule();
    expect(TestBed.inject(AlumnosService).alumnos()).toEqual([]);
    expect(TestBed.inject(CuentasService).cuotas()).toEqual([]);
  });
  it.each([false, true])(
    'si falla la escritura conserva almacenamiento y Signals (restauración anterior: %s)',
    (restaurado) => {
      const s = TestBed.inject(RespaldoService);
      if (restaurado) s.restaurar(ejemploRespaldo());
      const antes = s.crear();
      const raw = localStorage.getItem(DATOS_STORAGE_KEY);
      const legacy = localStorage.getItem(ALUMNOS_STORAGE_KEY);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw Error('Sin espacio');
      });
      expect(() =>
        s.restaurar({ ...ejemploRespaldo(), alumnos: [], cuotas: [], pagos: [] }),
      ).toThrow('Sin espacio');
      expect(s.crear().alumnos).toEqual(antes.alumnos);
      expect(s.crear().cuotas).toEqual(antes.cuotas);
      expect(s.crear().pagos).toEqual(antes.pagos);
      expect(localStorage.getItem(DATOS_STORAGE_KEY)).toBe(raw);
      expect(localStorage.getItem(ALUMNOS_STORAGE_KEY)).toBe(legacy);
    },
  );
  it.each([
    (r: any) => {
      r.version = 2;
    },
    (r: any) => {
      delete r.pagos;
    },
    (r: any) => {
      r.alumnos.push(r.alumnos[0]);
    },
    (r: any) => {
      r.cuotas.push(r.cuotas[0]);
    },
    (r: any) => {
      r.pagos.push(r.pagos[0]);
    },
    (r: any) => {
      r.cuotas[0].alumnoId = 'ausente';
    },
    (r: any) => {
      r.pagos[0].cuotaId = 'ausente';
    },
    (r: any) => {
      r.cuotas[0].importe = '100';
    },
    (r: any) => {
      r.alumnos[0].fechaIngreso = '2026-02-30';
    },
    (r: any) => {
      r.alumnos[0].configuracionMensual.diaVencimiento = 32;
    },
    (r: any) => {
      r.pagos[0].importe = 99999;
    },
    (r: any) => {
      r.ajeno = 'secreto';
    },
    (r: any) => {
      r.alumnos[0].extra = 'secreto';
    },
    (r: any) => {
      r.generadoEn = '2026-02-30T12:00:00.000Z';
    },
  ])('rechaza respaldos incompletos o inválidos sin escrituras (%#)', (cambiar) => {
    const s = TestBed.inject(RespaldoService);
    const r = ejemploRespaldo();
    cambiar(r);
    const guardar = vi.spyOn(Storage.prototype, 'setItem');
    expect(() => s.leer(JSON.stringify(r))).toThrow();
    expect(() => s.restaurar(r)).toThrow();
    expect(guardar).not.toHaveBeenCalled();
  });
  it.each(['{invalido', 'null', '[]', '{}'])('rechaza JSON inválido o ajeno: %s', (texto) => {
    expect(() => TestBed.inject(RespaldoService).leer(texto)).toThrow();
  });
});
