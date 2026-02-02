/**
 * E2E Test Entry Point
 * 
 * Usage:
 *   bun run tests/e2e/cli/index.ts
 *   bun run tests/e2e/cli/index.ts --scenario "File Operations"
 */

import { runAllScenarios, SCENARIOS, CliTestRunner, runScenario } from './cli-e2e.js';

const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🧪 Synapse-Agent CLI E2E Test Suite

Usage:
  bun run tests/e2e/cli/index.ts [options]

Options:
  --scenario=<name>    Run specific scenario
  --list               List all scenarios
  --help, -h           Show help

Scenarios:
${SCENARIOS.map(s => `  • ${s.name}`).join('\n')}
`);
  process.exit(0);
}

// List scenarios
if (args.includes('--list')) {
  console.log('Available Scenarios:\n');
  for (const s of SCENARIOS) {
    console.log(`📋 ${s.name}`);
    console.log(`   ${s.description}\n`);
  }
  process.exit(0);
}

// Run specific scenario
const scenarioArg = args.find(a => a.startsWith('--scenario='));
if (scenarioArg) {
  const name = scenarioArg.split('=')[1];
  const scenario = SCENARIOS.find(s => s.name === name);

  if (!scenario) {
    console.error(`❌ Scenario not found: ${name}`);
    process.exit(1);
  }

  console.log(`\n🚀 Running: ${scenario.name}\n`);
  const runner = new CliTestRunner();

  try {
    await runner.start();
    await runScenario(runner, scenario);
  } finally {
    await runner.stop();
    runner.cleanup();
  }
  process.exit(0);
}

// Run all
runAllScenarios().then(results => {
  const failed = results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
