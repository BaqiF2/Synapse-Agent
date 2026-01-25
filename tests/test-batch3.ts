/**
 * 批次 3 验证测试
 *
 * 测试持久 Bash 会话的所有功能
 */

import { BashSession } from '../src/tools/bash-session.ts';
import { BashRouter } from '../src/tools/bash-router.ts';
import { buildSystemPrompt } from '../src/agent/system-prompt.ts';

async function testBatch3() {
  console.log('=== Batch 3 Verification Test ===\n');

  const session = new BashSession();
  const router = new BashRouter(session);

  try {
    // Verification 1: Session state persists across commands
    console.log('✓ Verification 1: Session state persistence');

    await router.route('cd /tmp');
    const result1 = await router.route('pwd');

    if (result1.stdout.includes('/tmp') && result1.exitCode === 0) {
      console.log('  ✅ cd /tmp && pwd returns /tmp');
    } else {
      console.log('  ❌ Working directory persistence failed');
    }

    // Verification 2: Environment variables persist
    console.log('\n✓ Verification 2: Environment variable persistence');

    await router.route('export FOO=bar');
    const result2 = await router.route('echo $FOO');

    if (result2.stdout.includes('bar') && result2.exitCode === 0) {
      console.log('  ✅ export FOO=bar then echo $FOO returns bar');
    } else {
      console.log('  ❌ Environment variable persistence failed');
    }

    // Verification 3: restart: true parameter works
    console.log('\n✓ Verification 3: Session restart');

    const result3 = await router.route('echo "test"', true);

    if (result3.stdout.includes('test') && result3.exitCode === 0) {
      console.log('  ✅ restart: true executes command successfully');
    } else {
      console.log('  ❌ Restart failed');
    }

    // Verification 4: Environment cleared after restart
    const result4 = await router.route('echo $FOO');

    if (result4.stdout.trim() === '' && result4.exitCode === 0) {
      console.log('  ✅ Environment variables cleared after restart');
    } else {
      console.log('  ❌ Environment not cleared after restart');
    }

    // Verification 5: Working directory reset after restart
    const result5 = await router.route('pwd');

    if (!result5.stdout.includes('/tmp') && result5.exitCode === 0) {
      console.log('  ✅ Working directory reset after restart');
    } else {
      console.log('  ❌ Working directory not reset');
    }

    // Verification 6: System prompt is available
    console.log('\n✓ Verification 4: System prompt');

    const systemPrompt = buildSystemPrompt();

    if (systemPrompt.includes('Synapse Agent') &&
        systemPrompt.includes('Base Bash') &&
        systemPrompt.includes('持久会话')) {
      console.log('  ✅ System prompt contains required content');
      console.log(`  ✅ System prompt length: ${systemPrompt.length} characters`);
    } else {
      console.log('  ❌ System prompt incomplete');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  } finally {
    session.cleanup();
  }

  console.log('\n=== Batch 3 Verification Complete ===');
}

testBatch3().catch(console.error);
