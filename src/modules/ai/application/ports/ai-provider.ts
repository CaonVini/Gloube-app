export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Falha do provedor. `retryable` = vale tentar de novo (timeout, 429, 5xx). A mensagem nunca vai para o cliente. */
export class AiProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly kind: 'timeout' | 'error' = 'error') {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** Porta do provedor de IA: trocar de OpenAI para outro é escrever outro adaptador. */
export interface AiProvider {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
