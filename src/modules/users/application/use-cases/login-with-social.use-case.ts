import { ConflictError, ServiceUnavailableError } from '../../../../shared/errors/app-error.js';
import { User } from '../../domain/user.entity.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import { newSocialIdentity, type SocialProvider } from '../../domain/social-identity.js';
import type { SocialIdentityRepository } from '../../domain/social-identity.repository.js';
import type { SocialProfile, SocialTokenVerifier } from '../ports/social-token-verifier.js';
import type { AuthResultDTO } from '../dtos.js';
import type { UserPresenter } from '../user-presenter.js';
import type { IssueSessionService } from './issue-session.service.js';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';

export interface LoginWithSocialInput {
  provider: SocialProvider;
  token: string;
}

/**
 * Login com Google/Facebook. Fluxo:
 *  1. Valida o token junto ao provedor.
 *  2. Já existe vínculo (provedor + id)?              -> apenas LOGA.
 *  3. Existe conta com o mesmo e-mail (verificado)?   -> vincula e LOGA.
 *  4. Senão                                           -> CRIA a conta e loga.
 */
export class LoginWithSocialUseCase {
  constructor(
    private readonly verifiers: Partial<Record<SocialProvider, SocialTokenVerifier>>,
    private readonly users: UserRepository,
    private readonly identities: SocialIdentityRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly issueSession: IssueSessionService,
    private readonly presenter: UserPresenter,
  ) {}

  async execute(input: LoginWithSocialInput): Promise<AuthResultDTO> {
    const verifier = this.verifiers[input.provider];
    if (!verifier) throw new ServiceUnavailableError(`Login com ${input.provider} não está configurado`);

    const profile = await verifier.verify(input.token);

    const outcome = await this.resolveWithRetry(profile);

    const tokens = await this.issueSession.execute(outcome.user.id);
    return { user: await this.presenter.present(outcome.user), tokens, isNewUser: outcome.isNewUser };
  }

  /**
   * Requisições simultâneas do mesmo usuário novo disputam os índices únicos (e-mail e
   * provedor+id). Quem perde recebe ConflictError e tenta de novo: na nova leitura já
   * encontra o que o vencedor criou e apenas loga. Limitado a poucas tentativas.
   */
  private async resolveWithRetry(
    profile: SocialProfile,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const MAX_ATTEMPTS = 4;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.resolveUser(profile);
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw err;
      }
    }
  }

  private async resolveUser(
    profile: SocialProfile,
  ): Promise<{ user: User; isNewUser: boolean }> {
    // 2. Identidade já vinculada -> só loga
    const identity = await this.identities.findByProvider(profile.provider, profile.providerUserId);
    if (identity) {
      const user = await this.users.findById(identity.userId);
      if (!user) throw new UnauthorizedError('Conta não encontrada');
      return { user, isNewUser: false };
    }

    // Sem e-mail confiável não dá para vincular a uma conta existente nem criar uma conta segura
    if (!profile.email || !profile.emailVerified) {
      throw new UnauthorizedError('O provedor não informou um e-mail verificado');
    }
    const email = User.normalizeEmail(profile.email);

    // 3. Conta existente com o mesmo e-mail -> vincula e loga
    const existing = await this.users.findByEmail(email);
    if (existing) {
      let user = existing;
      if (existing.passwordHash) {
        // Defesa contra "pre-hijacking": o e-mail do cadastro por senha NUNCA foi verificado,
        // então alguém pode ter criado a conta com o e-mail da vítima antes dela. Como o
        // provedor provou a posse do e-mail, anulamos a senha antiga e encerramos sessões.
        user = existing.withoutPassword();
        await this.users.update(user);
        await this.refreshTokens.revokeAllForUser(user.id);
      }
      await this.identities.create(newSocialIdentity(user.id, profile.provider, profile.providerUserId));
      return { user, isNewUser: false };
    }

    // 4. Nova conta (sem senha, sem telefone/endereço — o app completa depois via PATCH /users/me)
    const user = User.create({ name: profile.name || email.split('@')[0]!, email, passwordHash: null });
    await this.users.create(user);
    await this.identities.create(newSocialIdentity(user.id, profile.provider, profile.providerUserId));
    return { user, isNewUser: true };
  }
}
