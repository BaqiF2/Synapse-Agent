/**
 * Settings Schema Tests
 *
 * Tests for settings schema validation and default values.
 */

import { describe, expect, it } from 'bun:test';
import {
  SynapseSettingsSchema,
  DEFAULT_SETTINGS,
} from '../../../src/config/settings-schema.ts';

describe('SynapseSettingsSchema', () => {
  const expectedMaxEnhanceContextChars = parseInt(
    process.env.SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS || '50000',
    10
  );

  it('should validate default settings', () => {
    const result = SynapseSettingsSchema.safeParse(DEFAULT_SETTINGS);
    expect(result.success).toBe(true);
  });

  it('should have correct default values for skillEnhance', () => {
    expect(DEFAULT_SETTINGS.skillEnhance.autoEnhance).toBe(false);
    expect(DEFAULT_SETTINGS.skillEnhance.maxEnhanceContextChars).toBe(
      expectedMaxEnhanceContextChars
    );
  });

  it('should reject settings missing env block', () => {
    const partial = {};
    const result = SynapseSettingsSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });

  it('should apply defaults for optional llm settings', () => {
    const partial = {
      env: {
        ANTHROPIC_API_KEY: 'test-key',
      },
    };
    const result = SynapseSettingsSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
      expect(result.data.model).toBe('claude-sonnet-4-5');
      expect(result.data.skillEnhance.autoEnhance).toBe(false);
    }
  });

  it('should accept empty api key as default (validation at provider level)', () => {
    const withEmptyKey = {
      env: {
        ANTHROPIC_API_KEY: '',
      },
    };
    const result = SynapseSettingsSchema.safeParse(withEmptyKey);
    expect(result.success).toBe(true);
  });

  it('should reject invalid autoEnhance value', () => {
    const invalid = {
      ...DEFAULT_SETTINGS,
      skillEnhance: { autoEnhance: 'yes' },
    };
    const result = SynapseSettingsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
