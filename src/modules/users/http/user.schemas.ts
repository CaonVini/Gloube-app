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

// Mesma regra do app: 2 a 60 letras (qualquer idioma), espaço, hífen, apóstrofo e ponto; sem invisíveis/dígitos.
export const nameSchema = z
  .string()
  .max(200)
  // eslint-disable-next-line no-control-regex
  .transform((v) => v.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(2, 'Digite pelo menos 2 letras')
      .max(60, 'Use no máximo 60 caracteres')
      .regex(/^[\p{L}\p{M}][\p{L}\p{M} '.\-’]*$/u, 'Use apenas letras, espaços, hífen e apóstrofo'),
  );

export const registerBodySchema = z.object({
  name: nameSchema,
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
    name: nameSchema.optional(),
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
