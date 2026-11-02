import type { Env } from '../config/env.js';
import type { Database } from '../infra/database/client.js';
import { DrizzleUserRepository } from '../modules/users/infra/drizzle-user.repository.js';
import { DrizzleRefreshTokenRepository } from '../modules/users/infra/drizzle-refresh-token.repository.js';
import { Argon2PasswordHasher } from '../modules/users/infra/argon2-password-hasher.js';
import { JoseAccessTokenService } from '../modules/users/infra/jose-access-token.service.js';
import { CryptoOpaqueTokenService } from '../modules/users/infra/crypto-opaque-token.service.js';
import { IssueSessionService } from '../modules/users/application/use-cases/issue-session.service.js';
import { RegisterUserUseCase } from '../modules/users/application/use-cases/register-user.use-case.js';
import { AuthenticateUserUseCase } from '../modules/users/application/use-cases/authenticate-user.use-case.js';
import { RefreshSessionUseCase } from '../modules/users/application/use-cases/refresh-session.use-case.js';
import { LogoutUseCase } from '../modules/users/application/use-cases/logout.use-case.js';
import { GetUserProfileUseCase } from '../modules/users/application/use-cases/get-user-profile.use-case.js';
import { AuthController } from '../modules/users/http/auth.controller.js';
import { UserController } from '../modules/users/http/user.controller.js';
import { DrizzleSocialIdentityRepository } from '../modules/users/infra/drizzle-social-identity.repository.js';
import { GoogleTokenVerifier } from '../modules/users/infra/google-token-verifier.js';
import { FacebookTokenVerifier } from '../modules/users/infra/facebook-token-verifier.js';
import { LoginWithSocialUseCase } from '../modules/users/application/use-cases/login-with-social.use-case.js';
import { UpdateProfileUseCase } from '../modules/users/application/use-cases/update-profile.use-case.js';
import type { SocialProvider } from '../modules/users/domain/social-identity.js';
import type { SocialTokenVerifier } from '../modules/users/application/ports/social-token-verifier.js';
import { UserPresenter } from '../modules/users/application/user-presenter.js';
import { SetAvatarUseCase } from '../modules/users/application/use-cases/set-avatar.use-case.js';
import { RemoveAvatarUseCase } from '../modules/users/application/use-cases/remove-avatar.use-case.js';
import { AvatarController } from '../modules/users/http/avatar.controller.js';
import { S3AvatarStorage } from '../modules/users/infra/s3-avatar-storage.js';
import { SharpImageProcessor } from '../modules/users/infra/sharp-image-processor.js';
import type { AvatarStorage } from '../modules/users/application/ports/avatar-storage.js';
import { makeAuthenticate } from './http/authenticate.js';

/**
 * Composition Root: ÚNICO lugar que conhece as implementações concretas.
 * Injeção de dependência manual via construtor — sem decorators/reflection,
 * tipada pelo TypeScript e sem custo em runtime.
 */
export interface ContainerOverrides {
  /** Permite trocar os verificadores sociais (testes não chamam Google/Facebook de verdade). */
  socialVerifiers?: Partial<Record<SocialProvider, SocialTokenVerifier>>;
  /** Permite trocar o storage de fotos (testes não falam com S3). */
  avatarStorage?: AvatarStorage;
}

export function buildContainer(env: Env, db: Database, overrides: ContainerOverrides = {}) {
  // Infra
  const userRepository = new DrizzleUserRepository(db);
  const refreshTokenRepository = new DrizzleRefreshTokenRepository(db);
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokenService = new JoseAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    expiresInSeconds: env.JWT_ACCESS_TTL_SECONDS,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  const opaqueTokenService = new CryptoOpaqueTokenService();
  const socialIdentityRepository = new DrizzleSocialIdentityRepository(db);
  const socialVerifiers: Partial<Record<SocialProvider, SocialTokenVerifier>> = {
    ...(env.GOOGLE_CLIENT_IDS.length > 0 ? { google: new GoogleTokenVerifier(env.GOOGLE_CLIENT_IDS) } : {}),
    ...(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET
      ? { facebook: new FacebookTokenVerifier(env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET) }
      : {}),
    ...overrides.socialVerifiers,
  };

  const avatarStorage: AvatarStorage | null =
    overrides.avatarStorage ??
    (env.S3_BUCKET
      ? new S3AvatarStorage({
          bucket: env.S3_BUCKET,
          region: env.S3_REGION,
          endpoint: env.S3_ENDPOINT,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
          urlTtlSeconds: env.AVATAR_URL_TTL_SECONDS,
        })
      : null);
  const imageProcessor = new SharpImageProcessor();
  const userPresenter = new UserPresenter(avatarStorage);

  // Application
  const issueSession = new IssueSessionService(
    accessTokenService,
    opaqueTokenService,
    refreshTokenRepository,
    env.REFRESH_TOKEN_TTL_DAYS,
  );
  const registerUser = new RegisterUserUseCase(userRepository, passwordHasher, issueSession);
  const authenticateUser = new AuthenticateUserUseCase(userRepository, passwordHasher, issueSession, userPresenter);
  const refreshSession = new RefreshSessionUseCase(refreshTokenRepository, opaqueTokenService, issueSession);
  const logout = new LogoutUseCase(refreshTokenRepository, opaqueTokenService);
  const getUserProfile = new GetUserProfileUseCase(userRepository, userPresenter);
  const updateProfile = new UpdateProfileUseCase(userRepository, userPresenter);
  const loginWithSocial = new LoginWithSocialUseCase(
    socialVerifiers,
    userRepository,
    socialIdentityRepository,
    refreshTokenRepository,
    issueSession,
    userPresenter,
  );
  const setAvatar = avatarStorage ? new SetAvatarUseCase(userRepository, avatarStorage, imageProcessor, userPresenter) : null;
  const removeAvatar = avatarStorage ? new RemoveAvatarUseCase(userRepository, avatarStorage, userPresenter) : null;

  // HTTP
  return {
    authenticate: makeAuthenticate(accessTokenService),
    authController: new AuthController(registerUser, authenticateUser, refreshSession, logout, loginWithSocial),
    userController: new UserController(getUserProfile, updateProfile),
    avatarController: new AvatarController(setAvatar, removeAvatar),
  };
}

export type Container = ReturnType<typeof buildContainer>;
