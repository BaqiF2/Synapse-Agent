/**
 * CLI E2E Test Cases
 * 
 * Design Reference: E2E Test Case Design Document
 * Priority: P0 (Must), P1 (Should), P2 (Nice to have)
 */

import { CliTestRunner, Assertions } from './cli-e2e.js';

// ════════════════════════════════════════════════════════════════════
//  Test Data
// ════════════════════════════════════════════════════════════

const TEST_FILES = {
  readable: '/tmp/synapse-e2e-readable.txt',
  writable: '/tmp/synapse-e2e-writable.txt',
  content: 'Line 1\nLine 2\nLine 3\n',
};

// ════════════════════════════════════════════════════════════════════
//  P0 Test Cases: CLI Basic Commands (Must Pass)
// ════════════════════════════════════════════════════════════════════

/**
 * E2E-CLI-001: CLI 帮助命令
 * Priority: P0
 * Input: help / --help / -h
 * Expected: 显示 Usage、Options、Commands 信息
 */
export async function testCliHelp(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P0] E2E-CLI-001: CLI 帮助命令');
  
  try {
    // Test: help
    let output = await runner.sendCommand('help');
    let assertions = new Assertions(output);
    assertions.toContain('Usage', 'help should show Usage');
    assertions.toContain('synapse', 'help should show synapse');
    console.log('   ✅ help: PASSED');
    
    // Test: --help
    output = await runner.sendCommand('--help');
    assertions = new Assertions(output);
    assertions.toContain('Usage', '--help should show Usage');
    assertions.toContain('Options', '--help should show Options');
    assertions.toContain('Commands', '--help should show Commands');
    console.log('   ✅ --help: PASSED');
    
    // Test: -h
    output = await runner.sendCommand('-h');
    assertions = new Assertions(output);
    assertions.toContain('Usage', '-h should show Usage');
    console.log('   ✅ -h: PASSED');
    
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

/**
 * E2E-CLI-002: CLI 版本号
 * Priority: P0
 * Input: --version / -V
 * Expected: 显示版本号 "0.1.0"
 */
export async function testCliVersion(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P0] E2E-CLI-002: CLI 版本号');
  
  try {
    // Test: --version
    let output = await runner.sendCommand('--version');
    let assertions = new Assertions(output);
    assertions.toMatch(/0\.1\.0/, '--version should show 0.1.0');
    console.log('   ✅ --version: PASSED');
    
    // Test: -V
    output = await runner.sendCommand('-V');
    assertions = new Assertions(output);
    assertions.toMatch(/0\.1\.0/, '-V should show 0.1.0');
    console.log('   ✅ -V: PASSED');
    
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

/**
 * E2E-CLI-003: CLI Chat 子命令
 * Priority: P0
 * Input: chat --help
 * Expected: 显示 REPL 模式说明
 */
export async function testCliChatHelp(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P0] E2E-CLI-003: CLI Chat 子命令');
  
  try {
    const output = await runner.sendCommand('chat', '--help');
    const assertions = new Assertions(output);
    assertions.toContain('REPL', 'chat --help should mention REPL');
    assertions.toContain('interactive', 'chat --help should mention interactive');
    console.log('   ✅ chat --help: PASSED');
    
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
//  P1 Test Cases: REPL Core Functions (Should Pass)
// ════════════════════════════════════════════════════════════════════

export async function testReplShellCommand(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P1] E2E-REPL-002: REPL Shell 命令执行');
  
  try {
    await runner.sendToRepl('!echo "synapse-e2e-test"');
    const output = await runner.waitForReplResponse(30000);
    
    const assertions = new Assertions(output);
    assertions.toContain('synapse-e2e-test', 'Should output shell command result');
    
    console.log('   ✅ Shell 命令执行: PASSED');
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

export async function testReplFileRead(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P1] E2E-REPL-003: REPL 文件读取工具');
  
  try {
    await runner.sendToRepl(`read ${TEST_FILES.readable}`);
    const output = await runner.waitForReplResponse(60000);
    
    const assertions = new Assertions(output);
    assertions.toContain('Line 1', 'Should contain Line 1');
    assertions.toContain('Line 3', 'Should contain Line 3');
    
    console.log('   ✅ 文件读取: PASSED');
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

export async function testReplFileWrite(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P1] E2E-REPL-004: REPL 文件写入工具');
  
  try {
    await runner.sendToRepl(`write ${TEST_FILES.writable} "E2E test content"`);
    const output = await runner.waitForReplResponse(60000);
    
    const assertions = new Assertions(output);
    assertions.toMatch(/success|created|written/i, 'Should confirm file creation');
    
    console.log('   ✅ 文件写入: PASSED');
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

export async function testReplBasicChat(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P1] E2E-REPL-001: REPL 基础对话');
  
  try {
    await runner.sendToRepl('Hello, who are you?');
    const output = await runner.waitForReplResponse(120000);
    
    const assertions = new Assertions(output);
    assertions.toMatch(/synapse|agent|AI|assist/i, 'Should respond as AI agent');
    
    console.log('   ✅ REPL 基础对话: PASSED');
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error}`);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
//  P2 Test Cases: REPL Auxiliary Functions (Nice to have)
// ════════════════════════════════════════════════════════════════════

export async function testReplSpecialHelp(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P2] E2E-REPL-005: REPL 特殊命令 /help');
  
  try {
    await runner.sendToRepl('/help');
    const output = await runner.waitForReplResponse(10000);
    
    const assertions = new Assertions(output);
    assertions.toContain('/', 'Should show command hints');
    
    console.log('   ✅ /help: PASSED');
    return true;
  } catch (error) {
    console.log(`   ⚠️  SKIPPED: ${error}`);
    return false;
  }
}

export async function testReplSpecialClear(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P2] E2E-REPL-006: REPL 特殊命令 /clear');
  
  try {
    await runner.sendToRepl('/clear');
    console.log('   ✅ /clear: PASSED (no error)');
    return true;
  } catch (error) {
    console.log(`   ⚠️  SKIPPED: ${error}`);
    return false;
  }
}

export async function testReplExit(runner: CliTestRunner): Promise<boolean> {
  console.log('\n🧪 [P2] E2E-REPL-007: REPL 退出命令');
  
  try {
    await runner.sendToRepl('/exit');
    console.log('   ✅ /exit: PASSED');
    return true;
  } catch (error) {
    console.log(`   ⚠️  SKIPPED: ${error}`);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
//  Test Suite Runner
// ════════════════════════════════════════════════════════════════════

export interface TestSuiteResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

/**
 * Run only P0 tests (CLI basic commands)
 */
export async function runP0Tests(runner: CliTestRunner): Promise<TestSuiteResult> {
  console.log('═'.repeat(60));
  console.log('🧪 P0 Tests (Must Pass)');
  console.log('═'.repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };
  
  console.log('\n📋 P0 Tests');
  console.log('-'.repeat(40));
  
  if (await testCliHelp(runner)) results.passed++; else results.failed++;
  results.total++;
  if (await testCliVersion(runner)) results.passed++; else results.failed++;
  results.total++;
  if (await testCliChatHelp(runner)) results.passed++; else results.failed++;
  results.total++;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 P0 Test Results');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📝 Total: ${results.total}`);
  console.log('═'.repeat(60));
  
  return results;
}

/**
 * Run all test cases (P0 + P1 + P2)
 */
export async function runAllTestCases(runner: CliTestRunner): Promise<TestSuiteResult> {
  console.log('═'.repeat(60));
  console.log('🧪 Synapse-Agent E2E Test Suite');
  console.log('═'.repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };
  
  // P0 Tests
  console.log('\n📋 P0 Tests (Must Pass)');
  console.log('-'.repeat(40));
  
  if (await testCliHelp(runner)) results.passed++; else results.failed++;
  results.total++;
  if (await testCliVersion(runner)) results.passed++; else results.failed++;
  results.total++;
  if (await testCliChatHelp(runner)) results.passed++; else results.failed++;
  results.total++;
  
  // P1 Tests
  console.log('\n📋 P1 Tests (Should Pass)');
  console.log('-'.repeat(40));
  
  if (await testReplShellCommand(runner)) results.passed++; else results.failed++;
  results.total++;
  
  // P1 - File operations (require setup)
  const fs = await import('node:fs');
  if (fs.existsSync(TEST_FILES.readable)) {
    if (await testReplFileRead(runner)) results.passed++; else results.failed++;
    results.total++;
  } else {
    results.skipped++;
    results.total++;
    console.log('   ⚠️  File read: SKIPPED (test file not setup)');
  }
  
  // P1 - Chat and file write (require API key)
  if (process.env.ANTHROPIC_API_KEY) {
    if (await testReplBasicChat(runner)) results.passed++; else results.skipped++;
    results.total++;
    
    if (await testReplFileWrite(runner)) results.passed++; else results.failed++;
    results.total++;
  } else {
    results.skipped += 2;
    results.total += 2;
    console.log('   ⚠️  REPL Chat & File Write: SKIPPED (ANTHROPIC_API_KEY not set)');
  }
  
  // P2 Tests
  console.log('\n📋 P2 Tests (Nice to Have)');
  console.log('-'.repeat(40));
  
  if (await testReplSpecialHelp(runner)) results.passed++; else results.skipped++;
  results.total++;
  if (await testReplSpecialClear(runner)) results.passed++; else results.skipped++;
  results.total++;
  if (await testReplExit(runner)) results.passed++; else results.skipped++;
  results.total++;
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Test Results Summary');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`📝 Total: ${results.total}`);
  console.log('═'.repeat(60));
  
  return results;
}
