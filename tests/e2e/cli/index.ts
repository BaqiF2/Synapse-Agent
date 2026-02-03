/**
 * E2E Test Entry Point
 * 
 * Usage:
 *   bun run tests/e2e/cli/index.ts           # Run all tests
 *   bun run tests/e2e/cli/index.ts --cases   # List test cases
 *   bun run tests/e2e/cli/index.ts --help    # Show help
 */

import { runAllTestCases, type TestSuiteResult } from './test-cases.js';
import { CliTestRunner } from './cli-e2e.js';

const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🧪 Synapse-Agent CLI E2E Test Suite

Usage:
  bun run tests/e2e/cli/index.ts [options]

Options:
  --cases, -c     List all test cases
  --p0            Run only P0 tests (Must Pass)
  --p1            Run P0 + P1 tests
  --all           Run all tests (default)
  --help, -h      Show this help message

Environment Variables:
  ANTHROPIC_API_KEY    Required for REPL chat tests
  DEBUG                Enable debug output

Test Categories:
  P0 (Must Pass): CLI basic commands (help, version, chat)
  P1 (Should Pass): REPL core functions (shell, file ops, chat)
  P2 (Nice to Have): REPL auxiliary functions (/help, /clear, /exit)

Examples:
  bun run tests/e2e/cli/index.ts
  bun run tests/e2e/cli/index.ts --p0
  ANTHROPIC_API_KEY=xxx bun run tests/e2e/cli/index.ts --all
`);
  process.exit(0);
}

// List test cases
if (args.includes('--cases') || args.includes('-c')) {
  console.log(`
📋 Test Cases

P0 Tests (Must Pass):
  ✅ E2E-CLI-001: CLI 帮助命令
  ✅ E2E-CLI-002: CLI 版本号
  ✅ E2E-CLI-003: CLI Chat 子命令

P1 Tests (Should Pass):
  ⚠️  E2E-REPL-001: REPL 基础对话 (requires API key)
  ✅ E2E-REPL-002: REPL Shell 命令执行
  ✅ E2E-REPL-003: REPL 文件读取工具
  ✅ E2E-REPL-004: REPL 文件写入工具

P2 Tests (Nice to Have):
  ⏭️  E2E-REPL-005: REPL 特殊命令 /help
  ⏭️  E2E-REPL-006: REPL 特殊命令 /clear
  ⏭️  E2E-REPL-007: REPL 退出命令

Legend: ✅ Tested  ⚠️ Requires setup  ⏭️ Optional
`);
  process.exit(0);
}

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('⚠️  Warning: ANTHROPIC_API_KEY not set');
  console.log('   REPL chat tests will be skipped.\n');
}

// Run tests
async function main() {
  const runner = new CliTestRunner();
  
  try {
    console.log('═'.repeat(60));
    console.log('🧪 Synapse-Agent CLI E2E Test Suite');
    console.log('═'.repeat(60));
    
    // Initialize CLI
    console.log('\n🚀 Initializing CLI...');
    await runner.start();
    console.log('   CLI Ready!\n');
    
    // Run test cases
    const results = await runAllTestCases(runner);
    
    // Exit with appropriate code
    const exitCode = results.failed > 0 ? 1 : 0;
    console.log(`\n🏁 Test suite completed with exit code: ${exitCode}`);
    process.exit(exitCode);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await runner.stop();
    runner.cleanup();
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
