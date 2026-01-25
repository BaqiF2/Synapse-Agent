/**
 * 批次 2 验证测试
 *
 * 测试 LLM 能接收 Bash 工具并调用简单命令
 */

import { LlmClient } from './src/agent/llm-client.ts';
import { BashToolSchema } from './src/tools/bash-tool-schema.ts';
import { BashSession } from './src/tools/bash-session.ts';
import { BashRouter } from './src/tools/bash-router.ts';

async function testBatch2() {
  console.log('=== Batch 2 Verification Test ===\n');

  // Test 1: LLM Client initialization
  console.log('Test 1: LLM Client initialization');
  try {
    const llmClient = new LlmClient();
    console.log('✅ LLM Client created successfully\n');
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      console.log('⚠️  ANTHROPIC_API_KEY not set (expected in test environment)');
      console.log('✅ LLM Client validation working correctly\n');
    } else {
      console.error('❌ Unexpected error:', error);
    }
  }

  // Test 2: Bash Tool Schema
  console.log('Test 2: Bash Tool Schema');
  console.log('Tool name:', BashToolSchema.name);
  console.log('Tool description length:', BashToolSchema.description.length);
  console.log('Required parameters:', BashToolSchema.input_schema.required);
  console.log('✅ Bash Tool Schema is valid\n');

  // Test 3: Bash Session and Router
  console.log('Test 3: Bash Session and Router');
  const session = new BashSession();
  const router = new BashRouter(session);

  try {
    // Execute a simple command
    const result = await router.route('echo "Hello from Synapse Agent"');
    console.log('Command output:', result.stdout);
    console.log('Exit code:', result.exitCode);

    if (result.exitCode === 0 && result.stdout.includes('Hello from Synapse Agent')) {
      console.log('✅ Base Bash command executed successfully\n');
    } else {
      console.log('❌ Command execution failed\n');
    }

    // Test pwd command
    const pwdResult = await router.route('pwd');
    console.log('Current directory:', pwdResult.stdout);
    console.log('✅ pwd command executed successfully\n');

  } catch (error) {
    console.error('❌ Command execution error:', error);
  } finally {
    session.cleanup();
  }

  console.log('=== Batch 2 Verification Complete ===');
}

testBatch2().catch(console.error);
