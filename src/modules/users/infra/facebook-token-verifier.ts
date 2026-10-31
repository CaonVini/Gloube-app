import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import type { SocialProfile, SocialTokenVerifier } from '../application/ports/social-token-verifier.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 5_000;

/**
 * Valida o **access token** do Facebook:
 *  1. /debug_token confirma que o token é válido E foi emitido para ESTE app
 *     (sem isso, um token de outro app malicioso seria aceito).
 *  2. /me obtém id, nome e e-mail.
 * O App Secret fica só no servidor.
 */
export class FacebookTokenVerifier implements SocialTokenVerifier {
  readonly provider = 'facebook' as const;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  async verify(token: string): Promise<SocialProfile> {
    try {
      const debugUrl = new URL(`${GRAPH}/debug_token`);
      debugUrl.searchParams.set('input_token', token);
      debugUrl.searchParams.set('access_token', `${this.appId}|${this.appSecret}`);
      const debug = await this.getJson<{ data?: { is_valid?: boolean; app_id?: string; user_id?: string } }>(debugUrl);
      if (!debug.data?.is_valid || debug.data.app_id !== this.appId || !debug.data.user_id) {
        throw new Error('token inválido para este app');
      }

      const meUrl = new URL(`${GRAPH}/me`);
      meUrl.searchParams.set('fields', 'id,name,email');
      meUrl.searchParams.set('access_token', token);
      const me = await this.getJson<{ id?: string; name?: string; email?: string }>(meUrl);
      if (!me.id || me.id !== debug.data.user_id) throw new Error('id divergente');

      return {
        provider: 'facebook',
        providerUserId: me.id,
        name: me.name ?? '',
        email: me.email ?? null,
        // O Facebook só retorna e-mail confirmado pelo usuário na conta dele.
        emailVerified: typeof me.email === 'string' && me.email.length > 0,
      };
    } catch {
      throw new UnauthorizedError('Token do Facebook inválido');
    }
  }

  private async getJson<T>(url: URL): Promise<T> {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`facebook respondeu ${res.status}`);
    return (await res.json()) as T;
  }
}
