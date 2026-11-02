import { z } from 'zod';

export const enqueueBodySchema = z.object({ replace: z.boolean().default(false) }).strict().default({ replace: false });
export const tripIdParamsSchema = z.object({ id: z.uuid() });
export const generationIdParamsSchema = z.object({ generationId: z.uuid() });
