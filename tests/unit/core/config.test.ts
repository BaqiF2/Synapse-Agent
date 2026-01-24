/**
 * Unit tests for core configuration management.
 *
 * Tests the SynapseConfig class to ensure proper:
 * - Environment variable loading
 * - Directory path construction
 * - Singleton pattern implementation
 * - Validation logic
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SynapseConfig, getConfig, resetConfig } from '../../../src/core/config';
import * as os from 'os';
import * as path from 'path';

describe('SynapseConfig', () => {
  // Store original environment variables
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
    resetConfig();
  });

  test('should use default values when no environment variables set', () => {
    delete process.env.MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.SYNAPSE_HOME;

    const config = new SynapseConfig();

    expect(config.model).toBe('MiniMax-M2');
    expect(config.apiKey).toBe('');
    expect(config.baseURL).toBe('https://api.minimaxi.com/anthropic');
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0.7);
    expect(config.synapseHome).toBe(path.join(os.homedir(), '.synapse'));
  });

  test('should read from environment variables', () => {
    process.env.MODEL = 'claude-4-5-sonnet';
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    process.env.ANTHROPIC_BASE_URL = 'https://custom.api.com';
    process.env.MAX_TOKENS = '8192';
    process.env.TEMPERATURE = '0.5';

    const config = new SynapseConfig();

    expect(config.model).toBe('claude-4-5-sonnet');
    expect(config.apiKey).toBe('test-api-key');
    expect(config.baseURL).toBe('https://custom.api.com');
    expect(config.maxTokens).toBe(8192);
    expect(config.temperature).toBe(0.5);
  });

  test('should construct correct directory paths', () => {
    const config = new SynapseConfig('/custom/synapse');

    expect(config.synapseHome).toBe('/custom/synapse');
    expect(config.toolsDir).toBe('/custom/synapse/tools');
    expect(config.skillsDir).toBe('/custom/synapse/skills');
    expect(config.agentToolsDir).toBe('/custom/synapse/tools/agent');
    expect(config.fieldToolsDir).toBe('/custom/synapse/tools/field');
  });

  test('validate should return errors for missing required fields', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MODEL;

    const config = new SynapseConfig();
    const errors = config.validate();

    expect(errors).toContain('ANTHROPIC_API_KEY is not set');
  });

  test('validate should return no errors for valid configuration', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.MODEL = 'test-model';

    const config = new SynapseConfig();
    const errors = config.validate();

    expect(errors).toEqual([]);
  });
});

describe('getConfig singleton', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  test('should return same instance on multiple calls', () => {
    const config1 = getConfig();
    const config2 = getConfig();

    expect(config1).toBe(config2);
  });

  test('should read SYNAPSE_HOME from environment', () => {
    process.env.SYNAPSE_HOME = '/test/synapse';

    const config = getConfig();

    expect(config.synapseHome).toBe('/test/synapse');
  });

  test('resetConfig should clear the singleton', () => {
    const config1 = getConfig();
    resetConfig();
    const config2 = getConfig();

    expect(config1).not.toBe(config2);
  });
});
