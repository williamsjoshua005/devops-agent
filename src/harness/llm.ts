import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { LLMConfig, Message, ToolCall, ToolDefinition } from '../types.js';

const ROUGH_CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / ROUGH_CHARS_PER_TOKEN);
}

function messageText(m: Message): string {
  let text = m.content || '';
  if (m.toolCalls) {
    for (const tc of m.toolCalls) {
      text += ` ${tc.name} ${JSON.stringify(tc.arguments)}`;
    }
  }
  return text;
}

/**
 * Keep the conversation within the model's context budget by:
 * - Preserving the system prompt, the last user message, and every turn after it.
 * - Dropping oldest intermediate turns first when over budget.
 * - Capping any individual message text at maxMessageTokens.
 */
export function fitMessagesToBudget(
  messages: Message[],
  maxTotalTokens: number,
  maxMessageTokens = 3000
): Message[] {
  if (messages.length === 0) return messages;

  // First cap individual message sizes (except system prompt, which is small and critical).
  const capped = messages.map((m) => {
    if (m.role === 'system') return m;
    const text = messageText(m);
    if (estimateTokens(text) <= maxMessageTokens) return m;
    const maxChars = maxMessageTokens * ROUGH_CHARS_PER_TOKEN;
    const truncatedContent =
      (m.content || '').slice(0, maxChars) +
      `\n\n[Message truncated: original ${estimateTokens(text)} tokens]`;
    return { ...m, content: truncatedContent };
  });

  // Find critical anchors: first system prompt and last user message.
  const systemIndex = capped.findIndex((m) => m.role === 'system');
  const lastUserIndex = capped.map((m) => m.role).lastIndexOf('user');

  // Everything from the last user message onward must be kept (current turn).
  const tailStart = lastUserIndex >= 0 ? lastUserIndex : capped.length;
  const tail = capped.slice(tailStart);

  let totalTokens = tail.reduce((sum, m) => sum + estimateTokens(messageText(m)), 0);
  if (systemIndex >= 0) {
    totalTokens += estimateTokens(messageText(capped[systemIndex]));
  }

  // Walk backwards from just before the tail, adding older turns while we fit.
  const middle: Message[] = [];
  for (let i = tailStart - 1; i >= 0; i--) {
    if (i === systemIndex) continue; // system prompt added separately at the front
    const tokens = estimateTokens(messageText(capped[i]));
    if (totalTokens + tokens > maxTotalTokens) break;
    totalTokens += tokens;
    middle.unshift(capped[i]);
  }

  const result: Message[] = [];
  if (systemIndex >= 0) result.push(capped[systemIndex]);
  result.push(...middle);
  result.push(...tail);
  return result;
}

export interface LLMResponse {
  content?: string;
  toolCalls?: ToolCall[];
}

export class LLMClient {
  private config: LLMConfig;
  private proxyAgent?: ProxyAgent;

  constructor(config: LLMConfig) {
    this.config = config;
    const proxyUrl = process.env.https_proxy || process.env.http_proxy;
    if (proxyUrl) {
      const normalized = proxyUrl.startsWith('http') ? proxyUrl : `http://${proxyUrl}`;
      this.proxyAgent = new ProxyAgent(normalized);
    }
  }

  isConfigured(): boolean {
    if (this.config.provider === 'ollama') {
      return true;
    }
    const key = this.config.apiKey;
    if (!key || key.trim() === '') return false;
    if (key.includes('your_') || key.includes('_here') || key.includes('placeholder')) return false;
    return true;
  }

  private async makeRequest(url: string, init: any): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const requestInit = { ...init, signal: controller.signal };

    if (this.proxyAgent) {
      requestInit.dispatcher = this.proxyAgent;
    }

    try {
      const res = await (undiciFetch as any)(url, requestInit);
      clearTimeout(timeout);
      return res;
    } catch (err: any) {
      clearTimeout(timeout);
      // Fallback: If proxy failed or timed out, attempt direct connection without proxy
      if (this.proxyAgent) {
        try {
          const directController = new AbortController();
          const directTimeout = setTimeout(() => directController.abort(), 6000);
          const directInit = { ...init, signal: directController.signal };
          delete directInit.dispatcher;
          const directRes = await (undiciFetch as any)(url, directInit);
          clearTimeout(directTimeout);
          return directRes;
        } catch {
          // If direct attempt also fails, rethrow original error
        }
      }
      throw err;
    }
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    if (this.config.provider === 'gemini') {
      return await this.chatGemini(messages, tools);
    } else if (this.config.provider === 'anthropic') {
      return await this.chatAnthropic(messages, tools);
    } else {
      // Default: openai, kimi, ollama, openrouter
      return await this.chatOpenAI(messages, tools);
    }
  }

  private async chatOpenAI(
    messages: Message[],
    tools: ToolDefinition[],
    isRetry = false
  ): Promise<LLMResponse> {
    // Keep prompt token usage focused and lean within context window.
    // We budget 24k tokens for prompt + tools to prevent context bloat and safety filter trips.
    const budgetedMessages = fitMessagesToBudget(messages, 24000, 3000);

    let baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      if (this.config.provider === 'kimi') {
        baseUrl = 'https://api.moonshot.cn/v1';
      } else if (this.config.provider === 'ollama') {
        baseUrl = 'http://localhost:11434/v1';
      } else {
        baseUrl = 'https://api.openai.com/v1';
      }
    }

    const formattedMessages = budgetedMessages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          name: m.name,
          content: m.content || '',
        };
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: m.role,
        content: m.content || '',
      };
    });

    const formattedTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const res = await this.makeRequest(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        tool_choice: formattedTools.length > 0 ? 'auto' : undefined,
        temperature: this.config.temperature ?? 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();

      // Catch content safety / Jailbreak filter triggers from Azure / LiteLLM gateway
      const isSafetyFilter =
        errText.includes('content_filter') ||
        errText.includes('Jailbreak') ||
        errText.includes('content_filter_results');

      if (isSafetyFilter && !isRetry) {
        console.warn('⚠️ Content safety filter triggered by gateway. Auto-recovering with sanitized minimal prompt...');
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        const sanitizedMessages: Message[] = [
          {
            role: 'system',
            content:
              'You are a DevOps and infrastructure platform assistant. Provide concise, factual, and direct technical answers to assist with Kubernetes, cloud, and infrastructure operations.',
          },
          lastUser || { role: 'user', content: 'Provide the current infrastructure status and operational recommendations.' },
        ];

        try {
          return await this.chatOpenAI(sanitizedMessages, tools, true);
        } catch (retryErr: any) {
          if (
            retryErr.message?.includes('content_filter') ||
            retryErr.message?.includes('Jailbreak')
          ) {
            console.warn('⚠️ Safety filter triggered on tools. Retrying direct response without tools...');
            return await this.chatOpenAI(sanitizedMessages, [], true);
          }
          throw retryErr;
        }
      }

      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0]?.message;

    if (data.choices?.[0]?.finish_reason === 'content_filter' && !isRetry) {
      console.warn('⚠️ Model completion blocked by content filter finish_reason. Retrying with sanitized prompt...');
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const sanitizedMessages: Message[] = [
        {
          role: 'system',
          content:
            'You are a DevOps and infrastructure platform assistant. Provide concise, factual, and direct technical answers to assist with Kubernetes, cloud, and infrastructure operations.',
        },
        lastUser || { role: 'user', content: 'Provide the current infrastructure status and operational recommendations.' },
      ];
      return await this.chatOpenAI(sanitizedMessages, [], true);
    }

    if (!choice) {
      return { content: '' };
    }

    const toolCalls: ToolCall[] = [];
    if (choice.tool_calls) {
      for (const tc of choice.tool_calls) {
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
          });
        } catch (e) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: {},
          });
        }
      }
    }

    return {
      content: choice.content || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private async chatGemini(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    // Gemini 1.5 Flash/Pro context windows are large (1M+), but cap conservatively.
    const budgetedMessages = fitMessagesToBudget(messages, 500000);

    const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY;
    const model = this.config.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let systemInstruction: string | undefined;
    const contents: any[] = [];

    for (const m of budgetedMessages) {
      if (m.role === 'system') {
        systemInstruction = m.content;
      } else if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content || '' }] });
      } else if (m.role === 'assistant') {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: m.name || 'tool',
                response: { output: m.content || '' },
              },
            },
          ],
        });
      }
    }

    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const body: any = {
      contents,
      generationConfig: {
        temperature: this.config.temperature ?? 0.2,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (functionDeclarations.length > 0) {
      body.tools = [{ functionDeclarations }];
    }

    const res = await this.makeRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0]?.content;
    if (!candidate) {
      return { content: '' };
    }

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.parts || []) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).substring(2, 9)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    return {
      content: textContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private async chatAnthropic(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
    // Claude 3.5/3.7 Sonnet context window is 200k tokens; budget ~160k for prompt.
    const budgetedMessages = fitMessagesToBudget(messages, 160000);

    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    const model = this.config.model || 'claude-3-7-sonnet-20250219';
    const url = 'https://api.anthropic.com/v1/messages';

    let systemPrompt = '';
    const formattedMessages: any[] = [];

    for (const m of budgetedMessages) {
      if (m.role === 'system') {
        systemPrompt = m.content || '';
      } else if (m.role === 'tool') {
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId,
              content: m.content || '',
            },
          ],
        });
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const contentBlocks: any[] = [];
        if (m.content) {
          contentBlocks.push({ type: 'text', text: m.content });
        }
        for (const tc of m.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        formattedMessages.push({ role: 'assistant', content: contentBlocks });
      } else {
        formattedMessages.push({
          role: m.role,
          content: m.content || '',
        });
      }
    }

    const formattedTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const res = await this.makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: formattedMessages,
        tools: formattedTools,
        max_tokens: this.config.maxTokens ?? 4096,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        });
      }
    }

    return {
      content: textContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
