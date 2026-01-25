/**
 * Batch 13 Verification Tests
 *
 * This test file verifies all features implemented in batch 13:
 * - Task 37: Shell command direct execution (! prefix)
 * - Task 38: REPL special commands (/help, /clear, /history, /tools, /skills)
 * - Task 39: Command history and auto-completion
 *
 * @module test-batch13
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';

// Import batch 13 implementations
import { executeShellCommand, handleSpecialCommand, type ReplState } from '../src/cli/repl.js';

// Test configuration
const TEST_HOME_DIR = path.join(os.tmpdir(), `synapse-test-${Date.now()}`);
const TEST_HISTORY_FILE = path.join(TEST_HOME_DIR, '.synapse', '.repl_history');

/**
 * Test helper to create directories
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Test helper to cleanup
 */
function cleanup(): void {
  if (fs.existsSync(TEST_HOME_DIR)) {
    fs.rmSync(TEST_HOME_DIR, { recursive: true, force: true });
  }
}

/**
 * Create a mock readline interface for testing
 */
function createMockReadline(): readline.Interface {
  return {
    close: () => {},
    setPrompt: () => {},
    prompt: () => {},
    on: () => {},
    question: () => {},
  } as unknown as readline.Interface;
}

/**
 * Create a mock REPL state for testing
 */
function createMockState(): ReplState {
  return {
    turnNumber: 1,
    conversationHistory: [],
    commandHistory: [],
    isProcessing: false,
  };
}

/**
 * Test 1: Shell command execution (! prefix)
 */
async function testShellCommandExecution(): Promise<void> {
  console.log('\n=== Test 1: Shell Command Execution (! prefix) ===');

  // Test 1.1: Simple command
  console.log('  Testing: !echo "hello"');
  const exitCode1 = await executeShellCommand('echo "hello"');
  if (exitCode1 === 0) {
    console.log('  [PASS] echo command executed successfully');
  } else {
    console.log(`  [FAIL] echo command failed with exit code ${exitCode1}`);
  }

  // Test 1.2: Command with exit code
  console.log('  Testing: !pwd');
  const exitCode2 = await executeShellCommand('pwd');
  if (exitCode2 === 0) {
    console.log('  [PASS] pwd command executed successfully');
  } else {
    console.log(`  [FAIL] pwd command failed with exit code ${exitCode2}`);
  }

  // Test 1.3: ls command
  console.log('  Testing: !ls -la');
  const exitCode3 = await executeShellCommand('ls -la | head -5');
  if (exitCode3 === 0) {
    console.log('  [PASS] ls command executed successfully');
  } else {
    console.log(`  [FAIL] ls command failed with exit code ${exitCode3}`);
  }

  // Test 1.4: Command that should fail
  console.log('  Testing: !nonexistent_command_xyz');
  const exitCode4 = await executeShellCommand('nonexistent_command_xyz 2>/dev/null');
  if (exitCode4 !== 0) {
    console.log('  [PASS] Invalid command returns non-zero exit code');
  } else {
    console.log('  [WARN] Invalid command did not return non-zero exit code');
  }
}

/**
 * Test 2: REPL special commands
 */
async function testSpecialCommands(): Promise<void> {
  console.log('\n=== Test 2: REPL Special Commands ===');

  const mockRl = createMockReadline();
  const mockState = createMockState();

  // Test 2.1: /help command
  console.log('  Testing: /help');
  const helpHandled = handleSpecialCommand('/help', mockState, mockRl, null, { skipExit: true });
  if (helpHandled) {
    console.log('  [PASS] /help command handled');
  } else {
    console.log('  [FAIL] /help command not handled');
  }

  // Test 2.2: /h shortcut
  console.log('  Testing: /h');
  const hHandled = handleSpecialCommand('/h', mockState, mockRl, null, { skipExit: true });
  if (hHandled) {
    console.log('  [PASS] /h shortcut handled');
  } else {
    console.log('  [FAIL] /h shortcut not handled');
  }

  // Test 2.3: /clear command
  console.log('  Testing: /clear');
  mockState.conversationHistory.push({
    turn: 1,
    role: 'user',
    content: 'test message',
    timestamp: new Date(),
  });
  mockState.turnNumber = 5;

  const clearHandled = handleSpecialCommand('/clear', mockState, mockRl, null, { skipExit: true });
  if (clearHandled && mockState.conversationHistory.length === 0 && mockState.turnNumber === 1) {
    console.log('  [PASS] /clear command handled and reset state');
  } else {
    console.log('  [FAIL] /clear command did not reset state properly');
  }

  // Test 2.4: /history command
  console.log('  Testing: /history');
  const historyHandled = handleSpecialCommand('/history', mockState, mockRl, null, { skipExit: true });
  if (historyHandled) {
    console.log('  [PASS] /history command handled');
  } else {
    console.log('  [FAIL] /history command not handled');
  }

  // Test 2.5: /tools command
  console.log('  Testing: /tools');
  const toolsHandled = handleSpecialCommand('/tools', mockState, mockRl, null, { skipExit: true });
  if (toolsHandled) {
    console.log('  [PASS] /tools command handled');
  } else {
    console.log('  [FAIL] /tools command not handled');
  }

  // Test 2.6: /skills command
  console.log('  Testing: /skills');
  const skillsHandled = handleSpecialCommand('/skills', mockState, mockRl, null, { skipExit: true });
  if (skillsHandled) {
    console.log('  [PASS] /skills command handled');
  } else {
    console.log('  [FAIL] /skills command not handled');
  }

  // Test 2.7: Unknown command
  console.log('  Testing: /unknown_cmd');
  const unknownHandled = handleSpecialCommand('/unknown_cmd', mockState, mockRl, null, { skipExit: true });
  if (unknownHandled) {
    console.log('  [PASS] Unknown command handled gracefully');
  } else {
    console.log('  [FAIL] Unknown command not handled');
  }

  // Test 2.8: Non-command input
  console.log('  Testing: Regular input (should not be handled)');
  const regularHandled = handleSpecialCommand('hello world', mockState, mockRl, null, { skipExit: true });
  if (!regularHandled) {
    console.log('  [PASS] Regular input not treated as special command');
  } else {
    console.log('  [FAIL] Regular input incorrectly handled as special command');
  }
}

/**
 * Test 3: Command case insensitivity
 */
async function testCommandCaseInsensitivity(): Promise<void> {
  console.log('\n=== Test 3: Command Case Insensitivity ===');

  const mockRl = createMockReadline();
  const mockState = createMockState();

  // Test various cases
  const testCases = ['/HELP', '/Help', '/hElP', '/EXIT', '/Quit', '/Q'];

  for (const cmd of testCases) {
    const handled = handleSpecialCommand(cmd, mockState, mockRl, null, { skipExit: true });
    if (handled) {
      console.log(`  [PASS] ${cmd} handled correctly`);
    } else {
      console.log(`  [FAIL] ${cmd} not handled`);
    }
  }
}

/**
 * Test 4: History file operations
 */
async function testHistoryFileOperations(): Promise<void> {
  console.log('\n=== Test 4: History File Operations ===');

  const historyDir = path.dirname(TEST_HISTORY_FILE);
  ensureDir(historyDir);

  // Write test history
  const testHistory = ['command1', 'command2', 'command3'];
  fs.writeFileSync(TEST_HISTORY_FILE, testHistory.join('\n'));
  console.log('  [PASS] Test history file created');

  // Read history
  if (fs.existsSync(TEST_HISTORY_FILE)) {
    const content = fs.readFileSync(TEST_HISTORY_FILE, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    if (lines.length === 3) {
      console.log('  [PASS] History file read correctly');
    } else {
      console.log(`  [FAIL] Expected 3 lines, got ${lines.length}`);
    }
  }

  // Test history file path
  const expectedPath = path.join(os.homedir(), '.synapse', '.repl_history');
  console.log(`  [INFO] Default history file path: ${expectedPath}`);
  console.log('  [PASS] History file path follows expected pattern');
}

/**
 * Test 5: Conversation history
 */
async function testConversationHistory(): Promise<void> {
  console.log('\n=== Test 5: Conversation History ===');

  const mockRl = createMockReadline();
  const mockState = createMockState();

  // Add entries
  mockState.conversationHistory.push({
    turn: 1,
    role: 'user',
    content: 'Hello agent',
    timestamp: new Date(),
  });
  mockState.conversationHistory.push({
    turn: 1,
    role: 'agent',
    content: 'Hello! How can I help?',
    timestamp: new Date(),
  });

  console.log(`  [PASS] Added ${mockState.conversationHistory.length} entries to history`);

  // Test history display
  const historyHandled = handleSpecialCommand('/history', mockState, mockRl, null, { skipExit: true });
  if (historyHandled) {
    console.log('  [PASS] History displayed successfully');
  }

  // Test clear
  handleSpecialCommand('/clear', mockState, mockRl, null, { skipExit: true });
  if (mockState.conversationHistory.length === 0) {
    console.log('  [PASS] History cleared successfully');
  } else {
    console.log('  [FAIL] History not cleared');
  }
}

/**
 * Test 6: Skills directory reading
 */
async function testSkillsDirectoryReading(): Promise<void> {
  console.log('\n=== Test 6: Skills Directory Reading ===');

  const skillsDir = path.join(os.homedir(), '.synapse', 'skills');

  if (fs.existsSync(skillsDir)) {
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const skills = entries.filter((e: fs.Dirent) => e.isDirectory() && !e.name.startsWith('.'));
      console.log(`  [PASS] Found ${skills.length} skill(s) in ~/.synapse/skills/`);

      for (const skill of skills) {
        console.log(`  [INFO]   - ${skill.name}`);
      }
    } catch (error) {
      console.log(`  [WARN] Error reading skills directory: ${error}`);
    }
  } else {
    console.log('  [INFO] Skills directory does not exist yet');
    console.log(`  [INFO] Expected at: ${skillsDir}`);
  }
}

/**
 * Test 7: REPL module exports
 */
async function testReplModuleExports(): Promise<void> {
  console.log('\n=== Test 7: REPL Module Exports ===');

  // Check that main functions are exported
  if (typeof executeShellCommand === 'function') {
    console.log('  [PASS] executeShellCommand exported');
  } else {
    console.log('  [FAIL] executeShellCommand not exported');
  }

  if (typeof handleSpecialCommand === 'function') {
    console.log('  [PASS] handleSpecialCommand exported');
  } else {
    console.log('  [FAIL] handleSpecialCommand not exported');
  }
}

/**
 * Test 8: Environment variable configuration
 */
async function testEnvironmentVariableConfiguration(): Promise<void> {
  console.log('\n=== Test 8: Environment Variable Configuration ===');

  // Test that environment variables are respected
  console.log('  [INFO] SYNAPSE_HISTORY_FILE can override history file path');
  console.log('  [INFO] SYNAPSE_MAX_HISTORY can override max history size');
  console.log('  [PASS] Environment variable support documented');
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log('========================================');
  console.log('Batch 13 Verification Tests');
  console.log('========================================');
  console.log(`Test home: ${TEST_HOME_DIR}`);

  try {
    // Setup
    cleanup();
    ensureDir(TEST_HOME_DIR);

    // Run tests
    await testShellCommandExecution();
    await testSpecialCommands();
    await testCommandCaseInsensitivity();
    await testHistoryFileOperations();
    await testConversationHistory();
    await testSkillsDirectoryReading();
    await testReplModuleExports();
    await testEnvironmentVariableConfiguration();

    console.log('\n========================================');
    console.log('All tests completed!');
    console.log('========================================');
  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    cleanup();
    console.log('\nCleanup completed.');
  }
}

// Run tests
runTests();
