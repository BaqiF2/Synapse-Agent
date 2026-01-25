/**
 * 测试持久 Bash 会话
 */

import { BashSession } from '../src/tools/bash-session.ts';

async function testPersistence() {
  console.log('=== Testing Bash Session Persistence ===\n');

  const session = new BashSession();

  try {
    // Test 1: Environment variable persistence
    console.log('Test 1: Environment variable persistence');
    await session.execute('export FOO=bar');
    const result1 = await session.execute('echo $FOO');
    console.log('Result:', result1.stdout);

    if (result1.stdout.includes('bar')) {
      console.log('✅ Environment variable persisted\n');
    } else {
      console.log('❌ Environment variable NOT persisted\n');
    }

    // Test 2: Working directory persistence
    console.log('Test 2: Working directory persistence');
    await session.execute('cd /tmp');
    const result2 = await session.execute('pwd');
    console.log('Result:', result2.stdout);

    if (result2.stdout.includes('/tmp')) {
      console.log('✅ Working directory persisted\n');
    } else {
      console.log('❌ Working directory NOT persisted\n');
    }

    // Test 3: Combined test
    console.log('Test 3: Combined persistence test');
    const result3 = await session.execute('cd /tmp && pwd');
    console.log('cd /tmp && pwd:', result3.stdout);

    const result4 = await session.execute('echo $FOO');
    console.log('echo $FOO:', result4.stdout);

    console.log('✅ Multiple commands work\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    session.cleanup();
  }
}

testPersistence().catch(console.error);
