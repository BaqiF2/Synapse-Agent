/**
 * 测试 Bash 会话重启机制
 */

import { BashSession } from '../src/tools/bash-session.ts';
import { BashRouter } from '../src/tools/bash-router.ts';

async function testRestart() {
  console.log('=== Testing Bash Session Restart ===\n');

  const session = new BashSession();
  const router = new BashRouter(session);

  try {
    // Test 1: Set environment variable
    console.log('Test 1: Set environment variable');
    await router.route('export TEST_VAR=before_restart');
    const result1 = await router.route('echo $TEST_VAR');
    console.log('Before restart:', result1.stdout);

    if (result1.stdout.includes('before_restart')) {
      console.log('✅ Environment variable set correctly\n');
    } else {
      console.log('❌ Failed to set environment variable\n');
    }

    // Test 2: Change directory
    console.log('Test 2: Change directory');
    await router.route('cd /tmp');
    const result2 = await router.route('pwd');
    console.log('Before restart:', result2.stdout);

    if (result2.stdout.includes('/tmp')) {
      console.log('✅ Working directory changed\n');
    } else {
      console.log('❌ Failed to change directory\n');
    }

    // Test 3: Restart session with restart parameter
    console.log('Test 3: Restart session');
    const result3 = await router.route('echo "After restart"', true);
    console.log('Restart command output:', result3.stdout);
    console.log('✅ Session restarted\n');

    // Test 4: Verify environment is reset
    console.log('Test 4: Verify environment variable is cleared');
    const result4 = await router.route('echo $TEST_VAR');
    console.log('After restart:', result4.stdout);

    if (result4.stdout.trim() === '') {
      console.log('✅ Environment variable cleared after restart\n');
    } else {
      console.log('❌ Environment variable NOT cleared\n');
    }

    // Test 5: Verify working directory is reset
    console.log('Test 5: Verify working directory is reset');
    const result5 = await router.route('pwd');
    console.log('After restart:', result5.stdout);

    if (!result5.stdout.includes('/tmp')) {
      console.log('✅ Working directory reset after restart\n');
    } else {
      console.log('❌ Working directory NOT reset\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    session.cleanup();
  }

  console.log('=== Restart Test Complete ===');
}

testRestart().catch(console.error);
