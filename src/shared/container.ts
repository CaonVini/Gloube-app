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
import { DrizzleTripRepository } from '../modules/trips/infra/drizzle-trip.repository.js';
import { CreateTripUseCase } from '../modules/trips/application/use-cases/create-trip.use-case.js';
import { GetTripUseCase } from '../modules/trips/application/use-cases/get-trip.use-case.js';
import { ListTripsUseCase } from '../modules/trips/application/use-cases/list-trips.use-case.js';
import { UpdateTripUseCase } from '../modules/trips/application/use-cases/update-trip.use-case.js';
import { ChangeTripStatusUseCase } from '../modules/trips/application/use-cases/change-trip-status.use-case.js';
import { SetTripArchivedUseCase } from '../modules/trips/application/use-cases/set-trip-archived.use-case.js';
import { GenerateItineraryUseCase, ReplaceItineraryUseCase } from '../modules/trips/application/use-cases/itinerary.use-cases.js';
import { TripController } from '../modules/trips/http/trip.controller.js';
import { makeAuthenticate } from './http/authenticate.js';

/**
 * Composition Root: ÚNICO lugar que conhece as implementações concretas.
 * Injeção de dependência manual via construtor — sem decorators/reflection,
 * tipada pelo TypeScript e sem custo em runtime.
 */
export interface ContainerOverrides {
  /** Permite trocar os verificadores sociais (testes não chamam Google/Facebook de verdade). */
  socialVerifiers?: Partial<Record<SocialProvider, SocialTokenVerifier>>;
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
  const updateProfile = new UpdateProfileUseCase(userRepository);
  const loginWithSocial = new LoginWithSocialUseCase(
    socialVerifiers,
    userRepository,
    socialIdentityRepository,
    refreshTokenRepository,
    issueSession,
  );

  const tripRepository = new DrizzleTripRepository(db);

  // HTTP
  return {
    authenticate: makeAuthenticate(accessTokenService),
    authController: new AuthController(registerUser, authenticateUser, refreshSession, logout, loginWithSocial),
    userController: new UserController(getUserProfile, updateProfile),
    tripController: new TripController(
      new CreateTripUseCase(tripRepository),
      new GetTripUseCase(tripRepository),
      new ListTripsUseCase(tripRepository),
      new UpdateTripUseCase(tripRepository),
      new ChangeTripStatusUseCase(tripRepository),
      new SetTripArchivedUseCase(tripRepository),
      new GenerateItineraryUseCase(tripRepository),
      new ReplaceItineraryUseCase(tripRepository),
    ),
  };
}

export type Container = ReturnType<typeof buildContainer>;
