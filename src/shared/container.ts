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
import { GetUserTripStatsUseCase } from '../modules/trips/application/use-cases/get-user-trip-stats.use-case.js';
import { TripController } from '../modules/trips/http/trip.controller.js';
import { DrizzleGenerationRepository } from '../modules/ai/infra/drizzle-generation.repository.js';
import { OpenAiProvider } from '../modules/ai/infra/openai-provider.js';
import { GenerationWorker } from '../modules/ai/application/generation-worker.js';
import { getPrompt } from '../modules/ai/application/prompts/index.js';
import type { AiProvider } from '../modules/ai/application/ports/ai-provider.js';
import { EnqueueGenerationUseCase } from '../modules/ai/application/use-cases/enqueue-generation.use-case.js';
import { GetAiUsageUseCase, GetGenerationUseCase, ListTripGenerationsUseCase } from '../modules/ai/application/use-cases/query-generations.use-cases.js';
import { AiController } from '../modules/ai/http/ai.controller.js';
import { makeAuthenticate } from './http/authenticate.js';

/**
 * Composition Root: ÚNICO lugar que conhece as implementações concretas.
 * Injeção de dependência manual via construtor — sem decorators/reflection,
 * tipada pelo TypeScript e sem custo em runtime.
 */
export interface ContainerOverrides {
  /** Permite trocar os verificadores sociais (testes não chamam Google/Facebook de verdade). */
  socialVerifiers?: Partial<Record<SocialProvider, SocialTokenVerifier>>;
  /** Troca o provedor de IA (testes usam um falso: nunca chamam a OpenAI de verdade). */
  aiProvider?: AiProvider;
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

  // IA: só fica ativa com chave + modelo + versão de prompt existente
  const prompt = getPrompt(env.AI_PROMPT_VERSION);
  const aiProvider = overrides.aiProvider ?? (env.OPENAI_API_KEY
    ? new OpenAiProvider({ apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, timeoutMs: env.AI_REQUEST_TIMEOUT_MS })
    : null);
  const aiModel = env.OPENAI_MODEL && aiProvider && prompt ? env.OPENAI_MODEL : null;
  const generationRepository = new DrizzleGenerationRepository(db);
  const generationWorker = aiModel && aiProvider && prompt
    ? new GenerationWorker(generationRepository, tripRepository, aiProvider, prompt, {
        maxAttempts: env.AI_MAX_ATTEMPTS,
        maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        prices: { inputPer1M: env.AI_PRICE_INPUT_PER_1M_USD, outputPer1M: env.AI_PRICE_OUTPUT_PER_1M_USD },
        pollMs: env.AI_WORKER_POLL_MS,
        staleMs: env.AI_REQUEST_TIMEOUT_MS * env.AI_MAX_ATTEMPTS + 60_000,
      })
    : null;

  // HTTP
  return {
    generationWorker,
    aiController: new AiController(
      new EnqueueGenerationUseCase(tripRepository, generationRepository, {
        model: aiModel, promptVersion: env.AI_PROMPT_VERSION, dailyLimitPerUser: env.AI_DAILY_LIMIT_PER_USER,
      }),
      new GetGenerationUseCase(generationRepository),
      new ListTripGenerationsUseCase(tripRepository, generationRepository),
      new GetAiUsageUseCase(generationRepository, env.AI_DAILY_LIMIT_PER_USER),
    ),
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
      new GetUserTripStatsUseCase(tripRepository),
    ),
  };
}

export type Container = ReturnType<typeof buildContainer>;
