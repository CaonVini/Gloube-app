import type { User } from '../domain/user.entity.js';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface SessionTokensDTO {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AuthResultDTO {
  user: UserDTO;
  tokens: SessionTokensDTO;
}

/** Nunca expõe passwordHash: o mapeamento é explícito (allow-list). */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
