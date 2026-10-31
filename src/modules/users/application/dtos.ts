import type { User } from '../domain/user.entity.js';
import type { Address } from '../domain/address.js';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: Address | null;
  /** True quando falta telefone ou endereço (o app pode pedir para completar). */
  profileComplete: boolean;
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
  /** Presente no login social: true se a conta acabou de ser criada. */
  isNewUser?: boolean;
}

/** Nunca expõe passwordHash: o mapeamento é explícito (allow-list). */
export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    profileComplete: user.phone !== null && user.address !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
