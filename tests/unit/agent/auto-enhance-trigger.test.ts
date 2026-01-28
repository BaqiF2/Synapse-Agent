/**
 * Auto Enhance Trigger Tests
 *
 * Tests for auto-enhance settings management.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AutoEnhanceTrigger } from '../../../src/agent/auto-enhance-trigger.ts';

describe('AutoEnhanceTrigger', () => {
  let testDir: string;
  let trigger: AutoEnhanceTrigger;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-auto-enhance-test-'));
    trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      expect(trigger.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      trigger.enable();
      expect(trigger.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      trigger.enable();
      trigger.disable();
      expect(trigger.isEnabled()).toBe(false);
    });
  });

  describe('enable', () => {
    it('should persist the enabled state', () => {
      trigger.enable();

      // Create a new instance to verify persistence
      const newTrigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      expect(newTrigger.isEnabled()).toBe(true);
    });
  });

  describe('disable', () => {
    it('should persist the disabled state', () => {
      trigger.enable();
      trigger.disable();

      // Create a new instance to verify persistence
      const newTrigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      expect(newTrigger.isEnabled()).toBe(false);
    });
  });
});
