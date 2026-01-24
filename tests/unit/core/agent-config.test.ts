/**
 * Unit tests for Agent configuration.
 *
 * Tests the AgentConfig interface and DEFAULT_AGENT_CONFIG to ensure
 * proper configuration defaults and field alignment with Python version.
 */

import { describe, test, expect } from 'bun:test';
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from '../../../src/core/agent-config';
import { AgentState } from '../../../src/core/types';

describe('DEFAULT_AGENT_CONFIG', () => {
  test('should have correct default values', () => {
    expect(DEFAULT_AGENT_CONFIG.max_iterations).toBe(10);
    expect(DEFAULT_AGENT_CONFIG.max_tokens).toBe(4096);
    expect(DEFAULT_AGENT_CONFIG.verbose).toBe(false);
    expect(DEFAULT_AGENT_CONFIG.bash_timeout).toBe(30);
  });

  test('should use snake_case field names', () => {
    // Verify snake_case fields exist
    expect('max_iterations' in DEFAULT_AGENT_CONFIG).toBe(true);
    expect('max_tokens' in DEFAULT_AGENT_CONFIG).toBe(true);
    expect('bash_timeout' in DEFAULT_AGENT_CONFIG).toBe(true);

    // Verify camelCase fields do NOT exist
    expect('maxIterations' in DEFAULT_AGENT_CONFIG).toBe(false);
    expect('maxTokens' in DEFAULT_AGENT_CONFIG).toBe(false);
    expect('bashTimeout' in DEFAULT_AGENT_CONFIG).toBe(false);
  });

  test('should be extendable for custom configurations', () => {
    const customConfig: AgentConfig = {
      ...DEFAULT_AGENT_CONFIG,
      max_iterations: 20,
      verbose: true,
    };

    expect(customConfig.max_iterations).toBe(20);
    expect(customConfig.verbose).toBe(true);
    expect(customConfig.max_tokens).toBe(4096); // Inherited
    expect(customConfig.bash_timeout).toBe(30); // Inherited
  });
});

describe('AgentState', () => {
  test('should have all required states', () => {
    expect(AgentState.IDLE).toBe('idle');
    expect(AgentState.THINKING).toBe('thinking');
    expect(AgentState.EXECUTING).toBe('executing');
    expect(AgentState.DONE).toBe('done');
    expect(AgentState.ERROR).toBe('error');
  });

  test('should be usable in type checks', () => {
    let state: AgentState = AgentState.IDLE;

    state = AgentState.THINKING;
    expect(state).toBe('thinking');

    state = AgentState.EXECUTING;
    expect(state).toBe('executing');

    state = AgentState.DONE;
    expect(state).toBe('done');

    state = AgentState.ERROR;
    expect(state).toBe('error');
  });
});
