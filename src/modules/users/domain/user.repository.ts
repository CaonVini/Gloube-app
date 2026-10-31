import type { User } from './user.entity.js';

/**
 * Contrato (DIP): os casos de uso dependem desta interface, não do Drizzle.
 * Trocar o ORM ou usar um repositório em memória nos testes não muda nada acima.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Lança ConflictError se o e-mail já existir (inclusive em corrida). */
  create(user: User): Promise<void>;
}
