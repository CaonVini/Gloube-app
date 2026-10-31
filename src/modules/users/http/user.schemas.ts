import { z } from 'zod';

// Limites máximos evitam abuso (ex.: senha de 1 MB forçando hash caro).
export const registerBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  password: z
    .string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres')
    .max(128, 'A senha deve ter no máximo 128 caracteres'),
});

export const loginBodySchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
