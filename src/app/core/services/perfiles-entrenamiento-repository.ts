import { ErrorUsuario } from './mensajes-usuario';
import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { PerfilCargaError } from './perfil-carga-error';
import {
  CAMPOS_PERFIL,
  DatosPerfilEntrenamiento,
  normalizarPerfil,
  PerfilEntrenamiento,
} from '../perfil-entrenamiento';

@Injectable({ providedIn: 'root' })
export class PerfilesEntrenamientoRepository {
  private readonly auth = inject(AuthService);
  private readonly authorization = inject(AdminAuthorization);
  private async contexto() {
    const session = this.auth.session();
    if (
      !session ||
      this.auth.recovery() ||
      this.auth.initializationError() ||
      !(await this.authorization.verify()) ||
      !authRuntime.client ||
      this.auth.session()?.access_token !== session.access_token
    )
      throw new PerfilCargaError({ code: 'TCF_AUTORIZACION' }, undefined, true);
    const vigente = () => {
      if (
        this.auth.session()?.access_token !== session.access_token ||
        this.auth.recovery() ||
        this.auth.initializationError()
      )
        throw new PerfilCargaError({ code: 'TCF_SESION' });
    };
    return { client: authRuntime.client, vigente, propietario: session.user.id };
  }
  private mapear(data: unknown, alumno: string): PerfilEntrenamiento {
    const fila = data as PerfilEntrenamiento;
    if (
      !fila ||
      fila.alumno_id !== alumno ||
      typeof fila.id !== 'string' ||
      typeof fila.propietario_id !== 'string' ||
      fila.propietario_id !== this.auth.session()?.user.id ||
      typeof fila.actualizado_en !== 'string' ||
      typeof fila.creado_en !== 'string' ||
      CAMPOS_PERFIL.some((c) => !(c.clave in fila))
    )
      throw new PerfilCargaError({ code: 'TCF_RESPUESTA' });
    try {
      return { ...fila, ...normalizarPerfil(fila as unknown as Record<string, unknown>) };
    } catch {
      throw new PerfilCargaError({ code: 'TCF_RESPUESTA' });
    }
  }
  async obtener(alumno: string): Promise<PerfilEntrenamiento | null> {
    const { client, vigente, propietario } = await this.contexto();
    try {
      const { data, error, status } = await client
        .from('perfiles_entrenamiento')
        .select('*')
        .eq('alumno_id', alumno)
        .eq('propietario_id', propietario)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle();
      vigente();
      if (error) throw new PerfilCargaError(error, status);
      return data === null ? null : this.mapear(data, alumno);
    } catch (error) {
      if (error instanceof PerfilCargaError) throw error;
      throw new PerfilCargaError(null);
    }
  }
  async guardar(
    alumno: string,
    datos: DatosPerfilEntrenamiento,
    version: string | null,
  ): Promise<PerfilEntrenamiento> {
    if (CAMPOS_PERFIL.some((c) => !(c.clave in datos)))
      throw new ErrorUsuario(
        'Faltan campos en el perfil. Volvé a cargar la ficha antes de guardar.',
      );
    const limpio = normalizarPerfil(datos as unknown as Record<string, unknown>);
    const { client, vigente } = await this.contexto();
    const { data, error } = await client
      .rpc('guardar_perfil_entrenamiento', {
        p_alumno: alumno,
        p_datos: limpio,
        p_version: version,
      })
      .abortSignal(AbortSignal.timeout(20000));
    vigente();
    if (error?.code === '40001' || error?.code === '23505')
      throw new ErrorUsuario(
        'El perfil cambió en otra sesión. Cerrá la edición y actualizá la ficha antes de guardar.',
      );
    if (error)
      throw new ErrorUsuario(
        'No se pudo confirmar el perfil. Conservamos tus datos para reintentar.',
      );
    return this.mapear(data, alumno);
  }
}
