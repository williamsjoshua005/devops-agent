import assert from 'node:assert';
import { LLMClient, fitMessagesToBudget } from '../src/harness/llm.js';
import { Message } from '../src/types.js';

console.log('=== LLM Context Budget & Configuration Test Suite ===\n');

async function runTests() {
  const originalEnvBudget = process.env.LLM_CONTEXT_BUDGET;

  try {
    delete process.env.LLM_CONTEXT_BUDGET;

    // Test 1: Kimi defaults to 500,000 token budget
    const kimiClient = new LLMClient({ provider: 'kimi', model: 'moonshot-v1-auto', apiKey: 'mock' });
    assert.strictEqual(kimiClient.getContextBudget(), 500000, 'Kimi should default to 500,000 context budget');
    console.log('✔ PASS: Kimi defaults to 500,000 token context budget');

    // Test 2: OpenAI defaults to 500,000 token budget
    const openaiClient = new LLMClient({ provider: 'openai', model: 'gpt-4o', apiKey: 'mock' });
    assert.strictEqual(openaiClient.getContextBudget(), 500000, 'OpenAI should default to 500,000 context budget');
    console.log('✔ PASS: OpenAI defaults to 500,000 token context budget');

    // Test 3: Ollama defaults to 500,000 token budget
    const ollamaClient = new LLMClient({ provider: 'ollama', model: 'llama3:8b' });
    assert.strictEqual(ollamaClient.getContextBudget(), 500000, 'Ollama should default to 500,000 context budget');
    console.log('✔ PASS: Ollama defaults to 500,000 token context budget');

    // Test 4: Gemini defaults to 500,000 token budget
    const geminiClient = new LLMClient({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'mock' });
    assert.strictEqual(geminiClient.getContextBudget(), 500000, 'Gemini should default to 500,000 context budget');
    console.log('✔ PASS: Gemini defaults to 500,000 token context budget');

    // Test 5: Anthropic defaults to 160,000 token budget
    const anthropicClient = new LLMClient({ provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', apiKey: 'mock' });
    assert.strictEqual(anthropicClient.getContextBudget(), 160000, 'Anthropic should default to 160,000 context budget');
    console.log('✔ PASS: Anthropic defaults to 160,000 token context budget');

    // Test 6: LLMConfig.contextBudget overrides defaults
    const customConfigClient = new LLMClient({ provider: 'openai', model: 'gpt-4o', apiKey: 'mock', contextBudget: 750000 });
    assert.strictEqual(customConfigClient.getContextBudget(), 750000, 'LLMConfig.contextBudget should override provider default');
    console.log('✔ PASS: LLMConfig.contextBudget overrides provider default');

    // Test 7: process.env.LLM_CONTEXT_BUDGET overrides defaults and config
    process.env.LLM_CONTEXT_BUDGET = '300000';
    const envOverriddenClient = new LLMClient({ provider: 'kimi', model: 'moonshot-v1-auto', apiKey: 'mock', contextBudget: 750000 });
    assert.strictEqual(envOverriddenClient.getContextBudget(), 300000, 'process.env.LLM_CONTEXT_BUDGET should take highest precedence');
    console.log('✔ PASS: process.env.LLM_CONTEXT_BUDGET takes precedence across all providers');

    // Test 8: fitMessagesToBudget retains turns up to 500,000 tokens
    delete process.env.LLM_CONTEXT_BUDGET;
    const sampleTurn = 'A'.repeat(4000); // approx 1000 tokens
    const messages: Message[] = [
      { role: 'system', content: 'System instruction' },
      ...Array.from({ length: 40 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Turn ${i}: ${sampleTurn}`,
      })),
    ];
    // With 24k budget, only ~20 turns fit
    const trimmed24k = fitMessagesToBudget(messages, 24000);
    assert.ok(trimmed24k.length < messages.length, '24k budget should trim older turns');

    // With 500k budget, all 41 messages fit comfortably
    const trimmed500k = fitMessagesToBudget(messages, 500000);
    assert.strictEqual(trimmed500k.length, messages.length, '500k budget should retain all conversation turns');
    console.log('✔ PASS: fitMessagesToBudget retains all conversation turns within 500k budget\n');

    console.log('\x1b[32mAll LLM context budget tests passed successfully!\x1b[0m\n');
  } finally {
    if (originalEnvBudget !== undefined) {
      process.env.LLM_CONTEXT_BUDGET = originalEnvBudget;
    } else {
      delete process.env.LLM_CONTEXT_BUDGET;
    }
  }
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
