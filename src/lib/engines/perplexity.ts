import { EngineAdapter, EngineResponse, buildQueryPrompt } from './types';

export class PerplexityAdapter implements EngineAdapter {
  engineType = 'perplexity' as const;

  async query(keyword: string): Promise<EngineResponse> {
    const start = Date.now();
    const prompt = buildQueryPrompt(keyword);

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY environment variable is not set');
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.0,
        return_citations: true,
        return_related_questions: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error ${response.status}: ${error}`);
    }

    const data = await response.json();

    // Extract response text
    const content = data.choices?.[0]?.message?.content || '';

    // Extract structured citations (Perplexity returns URLs directly)
    const citations: string[] = data.citations || [];

    return {
      engineType: 'perplexity',
      rawResponse: content,
      citationUrls: citations,
      responseMetadata: {
        model: data.model || 'sonar',
        tokensUsed: data.usage?.total_tokens,
        latencyMs: Date.now() - start,
      },
    };
  }
}
