/**
 * CLI E2E Test Framework
 * 
 * Features:
 * - CLI command testing (help, version, etc.)
 * - REPL interactive mode testing
 * - Real process spawning and communication
 */

import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

export class CliTestRunner {
  private process: ChildProcess | null = null;
  private replProcess: ChildProcess | null = null;
  private output: string = '';
  private replOutput: string = '';
  private bunPath: string;
  private sessionDir: string;
  private lastReplPrompt: number = 0;

  constructor() {
    this.bunPath = path.join(os.homedir(), '.bun', 'bin', 'bun');
    this.sessionDir = path.join(os.tmpdir(), `synapse-e2e-${Date.now()}`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLI Command Mode
  // ═══════════════════════════════════════════════════════════════

  async start(): Promise<void> {
    fs.mkdirSync(this.sessionDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.process = spawn(
        this.bunPath,
        ['run', 'src/cli/index.ts', '--help'],
        {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '0' },
        }
      );

      let resolved = false;
      const resolveOnce = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      this.process.stdout?.on('data', (data) => {
        this.output += data.toString();
        if (data.toString().includes('Usage')) {
          resolveOnce();
        }
      });

      this.process.stderr?.on('data', (data) => {
        this.output += data.toString();
      });

      this.process.on('error', (error) => {
        if (!resolved) reject(error);
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && !resolved) {
          reject(new Error(`CLI exited with code ${code}`));
        }
        setTimeout(resolveOnce, 500);
      });

      setTimeout(() => {
        if (!resolved) {
          this.stop();
          reject(new Error('CLI startup timeout'));
        }
      }, 30000);
    });
  }

  async sendCommand(...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        this.bunPath,
        ['run', 'src/cli/index.ts', ...args],
        {
          cwd: process.cwd(),
          stdio: 'pipe',
          env: { ...process.env, FORCE_COLOR: '0' },
        }
      );

      let output = '';
      proc.stdout?.on('data', (d) => output += d.toString());
      proc.stderr?.on('data', (d) => output += d.toString());

      proc.on('close', () => resolve(output));
      proc.on('error', reject);

      setTimeout(() => {
        proc.kill();
        resolve(output);
      }, 30000);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  REPL Interactive Mode
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start REPL interactive mode
   */
  async startRepl(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.replProcess = spawn(
        this.bunPath,
        ['run', 'src/cli/index.ts', 'chat'],
        {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '0' },
        }
      );

      let ready = false;
      const startTime = Date.now();

      this.replProcess.stdout?.on('data', (data) => {
        const content = data.toString();
        this.replOutput += content;
        
        // Detect prompt (e.g., ">", "👋", or "synapse")
        if (!ready && (content.includes('>') || content.includes('👋') || content.includes('synapse'))) {
          ready = true;
          this.lastReplPrompt = Date.now();
          resolve();
        }
      });

      this.replProcess.stderr?.on('data', (data) => {
        this.replOutput += data.toString();
      });

      this.replProcess.on('error', (error) => {
        reject(error);
      });

      this.replProcess.on('exit', (code) => {
        if (!ready && code !== 0) {
          reject(new Error(`REPL exited with code ${code}`));
        }
      });

      // Timeout
      setTimeout(() => {
        if (!ready) {
          this.stopRepl();
          reject(new Error('REPL startup timeout'));
        }
      }, 60000);
    });
  }

  /**
   * Send input to REPL
   */
  async sendToRepl(input: string): Promise<void> {
    if (!this.replProcess || !this.replProcess.stdin) {
      throw new Error('REPL not started');
    }

    return new Promise((resolve, reject) => {
      this.replProcess!.stdin!.write(input + '\n', (error) => {
        if (error) reject(error);
        else {
          this.lastReplPrompt = Date.now();
          resolve();
        }
      });
    });
  }

  /**
   * Wait for REPL response
   */
  async waitForReplResponse(timeout: number = 60000): Promise<string> {
    const startTime = Date.now();
    const lastOutputLength = this.replOutput.length;

    while (Date.now() - startTime < timeout) {
      // Check for new output
      if (this.replOutput.length > lastOutputLength) {
        // Wait a bit to ensure response is complete
        await new Promise(r => setTimeout(r, 1000));
        
        // Check if we're back at prompt (indicates response is complete)
        const recentOutput = this.replOutput.slice(-200);
        if (recentOutput.includes('>') || recentOutput.includes('👋')) {
          return this.replOutput;
        }
      }
      
      await new Promise(r => setTimeout(r, 100));
    }

    throw new Error(`REPL response timeout (${timeout}ms)`);
  }

  /**
   * Get REPL output since last call
   */
  getReplOutput(): string {
    return this.replOutput;
  }

  /**
   * Clear REPL output
   */
  clearReplOutput(): void {
    this.replOutput = '';
  }

  /**
   * Stop REPL
   */
  async stopRepl(): Promise<void> {
    if (this.replProcess) {
      this.replProcess.stdin?.end();
      this.replProcess.kill('SIGTERM');
      this.replProcess = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Utility Methods
  // ═══════════════════════════════════════════════════════════════

  getOutput(): string {
    return this.output;
  }

  clear(): void {
    this.output = '';
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.stdin?.end();
      this.process.kill('SIGTERM');
      this.process = null;
    }
    await this.stopRepl();
  }

  cleanup(): void {
    if (fs.existsSync(this.sessionDir)) {
      fs.rmSync(this.sessionDir, { recursive: true, force: true });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Assertions
// ═══════════════════════════════════════════════════════════════════

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
}

// ═══════════════════════════════════════════════════════════════════
//  Pre-defined Scenarios
// ═══════════════════════════════════════════════════════════════════

export const SCENARIOS: TestScenario[] = [
  {
    name: 'CLI Help & Version',
    description: 'Test CLI help and version commands',
    steps: [
      { input: 'help', expected: 'Usage' },
      { input: '--help', expected: 'Usage' },
      { input: '--version', expected: '0.1.0' },
      { input: '-V', expected: '0.1.0' },
    ],
  },
  {
    name: 'CLI Chat',
    description: 'Test chat subcommand',
    steps: [
      { input: 'chat --help', expected: 'REPL' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
//  Scenario Runner
// ═══════════════════════════════════════════════════════════════════

export async function runScenario(
  runner: CliTestRunner,
  scenario: TestScenario
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log(`\n📋 ${scenario.name}`);
  console.log(`   ${scenario.description}`);

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const start = Date.now();

    console.log(`   Step ${i + 1}: ${step.input}`);

    try {
      const output = await runner.sendCommand(...step.input.split(' '));
      const assertions = new Assertions(output);

      if (step.expected) {
        if (typeof step.expected === 'string') {
          assertions.toContain(step.expected);
        } else {
          assertions.toMatch(step.expected);
        }
      }

      results.push({
        name: `${scenario.name} - ${step.input}`,
        passed: true,
        duration: Date.now() - start,
        output,
      });
      console.log(`   ✅ Passed`);
    } catch (error) {
      results.push({
        name: `${scenario.name} - ${step.input}`,
        passed: false,
        duration: Date.now() - start,
        output: runner.getOutput(),
        error: error instanceof Error ? error.message : 'Unknown',
      });
      console.log(`   ❌ ${error}`);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  Main Runner (Legacy)
// ═══════════════════════════════════════════════════════════════════

export async function runAllScenarios(): Promise<TestResult[]> {
  console.log('═'.repeat(50));
  console.log('🧪 Synapse-Agent CLI E2E Test');
  console.log('═'.repeat(50));

  const runner = new CliTestRunner();
  const allResults: TestResult[] = [];

  try {
    console.log('\n🚀 Starting CLI...');
    await runner.start();
    console.log('   Ready!\n');

    for (const scenario of SCENARIOS) {
      const results = await runScenario(runner, scenario);
      allResults.push(...results);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await runner.stop();
    runner.cleanup();
  }

  const passed = allResults.filter(r => r.passed).length;
  console.log(`\n📊 Results: ${passed}/${allResults.length} passed`);
  console.log('═'.repeat(50));

  return allResults;
}
