import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth-service';
import { authRuntime } from './auth-runtime';

type AuthorizationState = 'unchecked' | 'checking' | 'authorized' | 'denied' | 'error';

@Injectable({ providedIn: 'root' })
export class AdminAuthorization {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly result = signal<{ token: string; state: AuthorizationState } | null>(null);
  private pending: { token: string; promise: Promise<boolean> } | null = null;
  private readonly checkingToken = signal<string | null>(null);
  readonly verifying = computed(() => {
    const session = this.auth.session();
    return (
      !!session &&
      this.checkingToken() === session.access_token &&
      !this.auth.recovery() &&
      !this.auth.initializationError()
    );
  });
  readonly status = computed<AuthorizationState>(() => {
    const session = this.auth.session();
    if (!session || this.auth.recovery() || this.auth.initializationError()) return 'unchecked';
    const result = this.result();
    return result?.token === session.access_token ? result.state : 'unchecked';
  });

  constructor() {
    effect(() => {
      const session = this.auth.session();
      const blocked = this.auth.recovery() || this.auth.initializationError();
      untracked(() => {
        if (!session || blocked) {
          this.result.set(null);
          return;
        }
        if (this.result()?.token === session.access_token) return;
        void this.verify().then((allowed) => {
          if (!allowed && this.auth.session()?.access_token === session.access_token) {
            void this.router.navigateByUrl('/acceso-no-autorizado');
          }
        });
      });
    });
  }

  verify(): Promise<boolean> {
    const session = this.auth.session();
    if (!session || this.auth.recovery() || this.auth.initializationError())
      return Promise.resolve(false);
    const token = session.access_token;
    if (this.pending?.token === token) return this.pending.promise;
    // A pending revalidation is not a revocation of an already confirmed grant.
    // Guards/repositories still await this request before navigating or accessing data.
    if (this.result()?.token !== token || this.result()?.state !== 'authorized') {
      this.result.set({ token, state: 'checking' });
    }
    this.checkingToken.set(token);
    const promise = this.query(token);
    this.pending = { token, promise };
    void promise.finally(() => {
      if (this.pending?.promise === promise) {
        this.pending = null;
        this.checkingToken.set(null);
      }
    });
    return promise;
  }

  private async query(token: string): Promise<boolean> {
    let state: AuthorizationState = 'error';
    try {
      if (!authRuntime.client) throw new Error('Missing client');
      const { data, error } = await authRuntime.client
        .rpc('es_administrador_actual')
        .abortSignal(AbortSignal.timeout(10000));
      if (!error && typeof data === 'boolean') state = data === true ? 'authorized' : 'denied';
    } catch {
      /* Fallo cerrado: sin registrar errores que pudieran contener credenciales. */
    }
    if (
      this.auth.session()?.access_token !== token ||
      this.auth.recovery() ||
      this.auth.initializationError()
    )
      return false;
    this.result.set({ token, state });
    return state === 'authorized';
  }
}
