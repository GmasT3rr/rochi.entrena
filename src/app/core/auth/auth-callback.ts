export type PasswordFlowKind = 'invite' | 'recovery';
export interface PasswordFlow {
  kind: PasswordFlowKind;
  userId: string;
  expiresAt: number;
}
export const PASSWORD_FLOW_KEY = 'tcf.auth.password-flow.v1';
export const PASSWORD_LINK_ERROR =
  'El enlace no es válido, ya se usó o venció. Solicitá uno nuevo y abrilo en el navegador donde lo pediste.';
const callbackKeys = [
  'code',
  'access_token',
  'refresh_token',
  'token_hash',
  'token',
  'type',
  'error',
  'error_code',
  'error_description',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'sb_flow_id',
];

// Misma precedencia que el SDK: query sobre fragmento. Las rutas Angular no son tokens.
export function authParameters(url: URL): URLSearchParams {
  let fragment = url.hash.slice(1);
  if (fragment.startsWith('/')) {
    // Enlaces antiguos con redirectTo terminado en #/login pueden añadir otro # o ?.
    const separator = fragment.search(/[?#]/);
    fragment = separator < 0 ? '' : fragment.slice(separator + 1);
  }
  const parameters = new URLSearchParams(fragment);
  url.searchParams.forEach((value, key) => parameters.set(key, value));
  return parameters;
}
export function hasAuthCallback(url: URL): boolean {
  const params = authParameters(url);
  return [
    'code',
    'access_token',
    'refresh_token',
    'token_hash',
    'error',
    'error_code',
    'error_description',
  ].some((key) => params.has(key));
}
export function passwordKind(value: string | null): PasswordFlowKind | null {
  return value === 'invite' || value === 'recovery' ? value : null;
}
export function authRedirectUrl(base = document.baseURI): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  return url.href;
}
export function cleanCallbackUrl(url: URL, route: string): string {
  const clean = new URL(url);
  for (const key of callbackKeys) clean.searchParams.delete(key);
  clean.hash = route;
  return `${clean.pathname}${clean.search}${clean.hash}`;
}
/** Separar la ruta Angular del callback, sin interpretar/intercambiar credenciales. */
export function sdkCallbackUrl(url: URL): string {
  const params = authParameters(url);
  if (!hasAuthCallback(url) || params.has('token_hash')) return url.href;
  const clean = new URL(url);
  clean.hash = '';
  for (const key of callbackKeys) clean.searchParams.delete(key);
  if (
    params.has('code') &&
    !params.has('error') &&
    !params.has('error_description') &&
    !params.has('error_code')
  ) {
    clean.searchParams.set('code', params.get('code')!);
    if (params.has('sb_flow_id')) clean.searchParams.set('sb_flow_id', params.get('sb_flow_id')!);
  } else {
    const fragment = new URLSearchParams();
    for (const key of callbackKeys) if (params.has(key)) fragment.set(key, params.get(key)!);
    clean.hash = fragment.toString();
  }
  return clean.href;
}
export function readPasswordFlow(): PasswordFlow | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PASSWORD_FLOW_KEY) ?? 'null');
    return value &&
      passwordKind(value.kind) &&
      typeof value.userId === 'string' &&
      value.userId &&
      Number.isFinite(value.expiresAt) &&
      value.expiresAt > Date.now() &&
      value.expiresAt <= Date.now() + 60 * 60 * 1000
      ? value
      : null;
  } catch {
    return null;
  }
}
export function hasStoredPasswordFlow(): boolean {
  try {
    return (
      !!sessionStorage.getItem(PASSWORD_FLOW_KEY) || !!sessionStorage.getItem('rochy.auth.recovery')
    );
  } catch {
    return false;
  }
}
export function storePasswordFlow(flow: PasswordFlow | null): void {
  try {
    // Nunca guardar tokens, enlaces o contraseñas en este marcador de interfaz.
    sessionStorage.removeItem('rochy.auth.recovery');
    if (flow) sessionStorage.setItem(PASSWORD_FLOW_KEY, JSON.stringify(flow));
    else sessionStorage.removeItem(PASSWORD_FLOW_KEY);
  } catch {
    /* Con almacenamiento bloqueado, el flujo continúa en memoria. */
  }
}
