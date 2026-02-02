/**
 * CLI E2E Test Framework
 * 
 * A real CLI-based end-to-end testing framework for Synapse-Agent.
 * Features:
 * - Real CLI process spawning and interaction
 * - Real LLM API calls (no mocks)
 * - Stdin/stdout/stderr capture
 * - Automated test scenarios
 * - Session persistence testing
 */

import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════

export interface CliMessage {
  type: 'stdout' | 'stderr' | 'input' | 'exit';
  content: string;
  timestamp: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

export interface TestScenario {
  name: string;
  description: string;
  steps: TestStep[];
}

export interface TestStep {
  input: string;
  expected?: string | RegExp;
  timeout?: number;
}

// ════════════════════════════════════════════════════════════════════
//  CLI Process Manager
// ════════════════════════════════════════════════════════════════════

export class CliTestRunner {
  private process: ChildProcess | null = null;
  private messages: CliMessage[] = [];
  private sessionDir: string;
  private bunPath: string;
  private cliPath: string;

  constructor() {
    this.sessionDir = path.join(os.tmpdir(), `synapse-e2e-${Date.now()}`);
    this.bunPath = path.join(os.homedir(), '.bun', 'bin', 'bun');
    this.cliPath = path.join(process.cwd(), 'src', 'cli', 'index.ts');
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.sessionDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.process = spawn(this.bunPath, ['run', this.cliPath], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let ready = false;

      this.process.stdout?.on('data', (data) => {
        const content = data.toString();
        this.messages.push({ type: 'stdout', content, timestamp: Date.now() });
        if (content.includes('>') || content.includes('👋')) {
          ready = true;
          resolve();
        }
      });

      this.process.stderr?.on('data', (data) => {
        this.messages.push({ type: 'stderr', content: data.toString(), timestamp: Date.now() });
      });

      this.process.on('error', reject);

      this.process.on('exit', (code) => {
        if (code !== 0 && !ready) {
          reject(new Error(`CLI exited with code ${code}`));
        }
      });

      setTimeout(() => {
        if (!ready) {
          this.stop();
          reject(new Error('CLI startup timeout'));
        }
      }, 30000);
    });
  }

  async send(input: string): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('CLI process not started');
    }

    this.messages.push({ type: 'input', content: input, timestamp: Date.now() });

    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(input + '\n', (error) => {
        error ? reject(error) : resolve();
      });
    });
  }

  async waitFor(pattern: string | RegExp, timeout: number = 30000): Promise<string> {
    const startTime = Date.now();
    let output = this.getOutput();

    while (Date.now() - startTime < timeout) {
      output = this.getOutput();
      if (typeof pattern === 'string') {
        if (output.includes(pattern)) return output;
      } else {
        if (pattern.test(output)) return output;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    throw new Error(`Timeout waiting for pattern: ${pattern}\nOutput: ${output}`);
  }

  getOutput(): string {
    return this.messages
      .filter(m => m.type === 'stdout' || m.type === 'stderr')
      .map(m => m.content)
      .join('');
  }

  clear(): void {
    this.messages = [];
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.stdin?.end();
      return new Promise((resolve) => {
        this.process!.on('close', () => {
          this.process = null;
          resolve();
        });
        this.process!.kill('SIGTERM');
        setTimeout(() => {
          this.process!.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }
  }

  cleanup(): void {
    if (fs.existsSync(this.sessionDir)) {
      fs.rmSync(this.sessionDir, { recursive: true, force: true });
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  Test Assertions
// ════════════════════════════════════════════════════════════════════

export class Assertions {
  constructor(private output: string) {}

  toContain(text: string, message?: string): void {
    if (!this.output.includes(text)) {
      throw new Error(message || `Expected output to contain: "${text}"`);
    }
  }

  toMatch(regex: RegExp, message?: string): void {
    if (!regex.test(this.output)) {
      throw new Error(message || `Expected output to match: ${regex}`);
    }
  }

  toBeSuccessful(): void {
    if (!/✅|success|completed|done/i.test(this.output)) {
      throw new Error('Expected successful output');
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  Test Scenarios
// ════════════════════════════════════════════════════════════════════

export const SCENARIOS: TestScenario[] = [
  {
    name: 'Basic Chat',
    description: 'Simple chat interaction without tools',
    steps: [
      { input: 'Hello, who are you?', timeout: 60000 },
    ],
  },
  {
    name: 'File Operations',
    description: 'Test file read, write, and edit operations',
    steps: [
      {
        input: 'Write /tmp/synapse-test.txt with content "Hello from Synapse"',
        timeout: 120000,
      },
      {
        input: 'Read /tmp/synapse-test.txt',
        expected: 'Hello from Synapse',
        timeout: 60000,
      },
    ],
  },
  {
    name: 'Shell Commands',
    description: 'Test native shell command execution',
    steps: [
      { input: '!echo "Testing shell commands"', expected: 'Testing shell commands', timeout: 10000 },
      { input: '!pwd', timeout: 10000 },
    ],
  },
  {
    name: 'Session Persistence',
    description: 'Test session resume functionality',
    steps: [
      { input: 'Remember this: test_value = 12345', timeout: 60000 },
      { input: '/new_session', timeout: 10000 },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════
//  Test Runner
// ════════════════════════════════════════════════════════════════════

export async function runScenario(
  runner: CliTestRunner,
  scenario: TestScenario
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log(`\n📋 Running: ${scenario.name}`);
  console.log(`   ${scenario.description}`);

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const stepStart = Date.now();

    console.log(`   Step ${i + 1}: ${step.input.substring(0, 50)}...`);

    await runner.send(step.input);

    if (step.expected) {
      await runner.waitFor(step.expected, step.timeout || 60000);
    } else {
      await new Promise(r => setTimeout(r, 2000));
    }

    const output = runner.getOutput();
    const assertions = new Assertions(output);

    try {
      if (step.expected) {
        if (typeof step.expected === 'string') {
          assertions.toContain(step.expected);
        } else {
          assertions.toMatch(step.expected);
        }
      }
      assertions.toBeSuccessful();

      results.push({
        name: `${scenario.name} - Step ${i + 1}`,
        passed: true,
        duration: Date.now() - stepStart,
        output,
      });

      console.log(`   ✅ Passed (${Date.now() - stepStart}ms)`);
    } catch (error) {
      results.push({
        name: `${scenario.name} - Step ${i + 1}`,
        passed: false,
        duration: Date.now() - stepStart,
        output,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.log(`   ❌ Failed: ${error}`);
      break;
    }
  }

  return results;
}

export async function runAllScenarios(): Promise<TestResult[]> {
  console.log('═'.repeat(60));
  console.log('🧪 Synapse-Agent CLI E2E Test Suite');
  console.log('═'.repeat(60));

  const runner = new CliTestRunner();
  const allResults: TestResult[] = [];

  try {
    console.log('\n🚀 Starting CLI...');
    await runner.start();
    console.log('   CLI ready!\n');

    for (const scenario of SCENARIOS) {
      const results = await runScenario(runner, scenario);
      allResults.push(...results);
    }
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await runner.stop();
    runner.cleanup();
  }

  // Summary
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  return allResults;
}
