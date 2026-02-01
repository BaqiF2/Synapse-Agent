/**
 * E2E Tests - Context Persistence
 *
 * Tests session index and path handling including:
 * - Session creation and registration
 * - Session path derivation
 * - Corrupted index handling
 *
 * @module tests/e2e/context-persistence
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ContextPersistence } from '../../src/agent/context-persistence.js';

describe('E2E: Context Persistence', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = path.join(
      os.tmpdir(),
      `synapse-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('Session Management', () => {
    test('should create new session with generated ID', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      expect(sessionId).toMatch(/^session-/);
      // No messages yet, file may not exist
    });

    test('should register session in index', () => {
      new ContextPersistence(undefined, testDir);

      const indexPath = path.join(testDir, 'sessions.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(content.sessions.length).toBe(1);
      expect(content.version).toBe('1.0.0');
    });

    test('should provide session file path', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();
      const sessionPath = persistence.getSessionPath();

      expect(sessionPath).toBe(path.join(testDir, `${sessionId}.jsonl`));
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted index file gracefully', () => {
      // Create corrupted index
      fs.writeFileSync(path.join(testDir, 'sessions.json'), 'not valid json', 'utf-8');

      // Should not throw, should create new index
      const persistence = new ContextPersistence(undefined, testDir);
      expect(persistence.getSessionId()).toMatch(/^session-/);
    });
  });
});
