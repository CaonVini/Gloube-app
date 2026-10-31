import { z } from 'zod';
import { SOCIAL_PROVIDERS } from '../domain/social-identity.js';

// Limites máximos evitam abuso (ex.: senha de 1 MB forçando hash caro).
const phoneSchema = z
  .string()
  .max(30)
  // aceita máscaras como "(11) 99999-8888"; normaliza antes de validar em E.164
  .transform((v) => v.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Telefone inválido (use DDD e, se possível, +código do país)'));

export const addressSchema = z.object({
  street: z.string().trim().min(1).max(150),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(100).optional(),
  neighborhood: z.string().trim().max(100).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(50),
  zipCode: z
    .string()
    .trim()
    .max(15)
    .regex(/^[0-9A-Za-z -]{4,15}$/, 'CEP inválido'),
  country: z.string().trim().length(2).toUpperCase().default('BR'),
});

export const registerBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  password: z
    .string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres')
    .max(128, 'A senha deve ter no máximo 128 caracteres'),
  phone: phoneSchema.optional(),
  address: addressSchema.optional(),
});

export const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.nullable().optional(),
    address: addressSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Informe ao menos um campo' });

export const loginBodySchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const socialLoginBodySchema = z.object({
  provider: z.enum(SOCIAL_PROVIDERS),
  // Google: ID token (JWT). Facebook: access token. Ambos podem ser longos.
  token: z.string().min(10).max(4096),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
