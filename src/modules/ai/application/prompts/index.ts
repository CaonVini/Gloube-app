import type { GenerationInput } from '../../domain/generation.js';
import { itineraryPromptV1 } from './itinerary.v1.js';

export interface PromptTemplate {
  /** Regras fixas para a IA (papel, formato de saída, segurança). */
  system: string;
  /** Monta a mensagem do usuário com os dados da viagem. */
  user(input: GenerationInput): string;
}

/**
 * COMO TROCAR O PROMPT: crie `itinerary.v2.ts` exportando um PromptTemplate, registre aqui como `v2`
 * e ligue com AI_PROMPT_VERSION=v2. A versão fica gravada em cada geração (coluna prompt_version),
 * então dá para comparar custo e qualidade entre versões nas views de custo.
 */
export const PROMPTS: Readonly<Record<string, PromptTemplate>> = {
  v1: itineraryPromptV1,
};

export function getPrompt(version: string): PromptTemplate | undefined {
  return Object.hasOwn(PROMPTS, version) ? PROMPTS[version] : undefined;
}
