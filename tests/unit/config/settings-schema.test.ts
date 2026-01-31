/**
 * Settings Schema Tests
 *
 * Tests for settings schema validation and default values.
 */

import { describe, expect, it } from 'bun:test';
import {
  SynapseSettingsSchema,
  DEFAULT_SETTINGS,
  type SynapseSettings,
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

  it('should validate partial settings with defaults', () => {
    const partial = {};
    const result = SynapseSettingsSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skillEnhance.autoEnhance).toBe(false);
    }
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
