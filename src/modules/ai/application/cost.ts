export interface Prices {
  inputPer1M: number | undefined;
  outputPer1M: number | undefined;
}

/** Custo estimado em USD = tokens x preço por 1M. Sem preço configurado devolve null (nunca inventa valor). */
export function estimateCostUsd(inputTokens: number, outputTokens: number, prices: Prices): number | null {
  if (prices.inputPer1M === undefined || prices.outputPer1M === undefined) return null;
  const cost = (inputTokens * prices.inputPer1M + outputTokens * prices.outputPer1M) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}
