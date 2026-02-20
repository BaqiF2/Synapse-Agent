/**
 * E2E Tests - Session Management
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
import { Session } from '../../src/core/session.ts';

describe('E2E: Session Management', () => {
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
    test('should create new session with generated ID', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const sessionId = session.id;

      expect(sessionId).toMatch(/^session-/);
    });

    test('should register session in index', async () => {
      await Session.create({ sessionsDir: testDir });

      const indexPath = path.join(testDir, 'sessions.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(content.sessions.length).toBe(1);
      expect(content.version).toBe('1.0.0');
    });

    test('should provide session file path', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const sessionId = session.id;
      const historyPath = session.historyPath;

      expect(historyPath).toBe(path.join(testDir, `${sessionId}.jsonl`));
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted index file gracefully', async () => {
      // Create corrupted index
      fs.writeFileSync(path.join(testDir, 'sessions.json'), 'not valid json', 'utf-8');

      // Should not throw, should create new index
      const session = await Session.create({ sessionsDir: testDir });
      expect(session.id).toMatch(/^session-/);
    });
  });
});
