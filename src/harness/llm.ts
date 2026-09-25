import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { LLMConfig, Message, ToolCall, ToolDefinition } from '../types.js';

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

  private async makeRequest(url: string, init: any): Promise<Response> {
    if (this.proxyAgent) {
      init.dispatcher = this.proxyAgent;
    }
    const res = await (undiciFetch as any)(url, init);
    return res;
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

  private async chatOpenAI(messages: Message[], tools: ToolDefinition[]): Promise<LLMResponse> {
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

    const formattedMessages = messages.map((m) => {
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
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0]?.message;
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
    const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY;
    const model = this.config.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let systemInstruction: string | undefined;
    const contents: any[] = [];

    for (const m of messages) {
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
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    const model = this.config.model || 'claude-3-7-sonnet-20250219';
    const url = 'https://api.anthropic.com/v1/messages';

    let systemPrompt = '';
    const formattedMessages: any[] = [];

    for (const m of messages) {
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
