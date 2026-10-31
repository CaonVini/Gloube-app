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
import { makeAuthenticate } from './http/authenticate.js';

/**
 * Composition Root: ÚNICO lugar que conhece as implementações concretas.
 * Injeção de dependência manual via construtor — sem decorators/reflection,
 * tipada pelo TypeScript e sem custo em runtime.
 */
export function buildContainer(env: Env, db: Database) {
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

  // Application
  const issueSession = new IssueSessionService(
    accessTokenService,
    opaqueTokenService,
    refreshTokenRepository,
    env.REFRESH_TOKEN_TTL_DAYS,
  );
  const registerUser = new RegisterUserUseCase(userRepository, passwordHasher, issueSession);
  const authenticateUser = new AuthenticateUserUseCase(userRepository, passwordHasher, issueSession);
  const refreshSession = new RefreshSessionUseCase(refreshTokenRepository, opaqueTokenService, issueSession);
  const logout = new LogoutUseCase(refreshTokenRepository, opaqueTokenService);
  const getUserProfile = new GetUserProfileUseCase(userRepository);

  // HTTP
  return {
    authenticate: makeAuthenticate(accessTokenService),
    authController: new AuthController(registerUser, authenticateUser, refreshSession, logout),
    userController: new UserController(getUserProfile),
  };
}

export type Container = ReturnType<typeof buildContainer>;
