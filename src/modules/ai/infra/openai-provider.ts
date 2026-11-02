import { AiProviderError, type AiProvider, type CompletionRequest, type CompletionResult } from '../application/ports/ai-provider.js';

/**
 * Adaptador da API Chat Completions da OpenAI (fetch nativo, sem SDK = sem dependência extra).
 * A chave vai só no header Authorization e nunca é logada; mensagens de erro do provedor não saem daqui.
 */
export class OpenAiProvider implements AiProvider {
  constructor(private readonly opts: { apiKey: string; baseUrl: string; timeoutMs: number }) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({
          model: req.model,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
          response_format: { type: 'json_object' },
          max_completion_tokens: req.maxOutputTokens,
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new AiProviderError(timeout ? 'timeout' : 'network', true, timeout ? 'timeout' : 'error');
    }

    if (!res.ok) {
      // 429 e 5xx valem nova tentativa; 4xx (chave/modelo/requisição inválida) não
      throw new AiProviderError(`http_${res.status}`, res.status === 429 || res.status >= 500);
    }
    const body = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;
    const choice = body?.choices?.[0];
    const text = choice?.message?.content;
    if (!text || choice?.finish_reason === 'length') throw new AiProviderError('empty_or_truncated', false);
    return { text, inputTokens: body?.usage?.prompt_tokens ?? 0, outputTokens: body?.usage?.completion_tokens ?? 0 };
  }
}
