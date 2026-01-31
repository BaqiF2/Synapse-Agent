/**
 * Anthropic Types Tests
 *
 * Tests for type definitions and error classes.
 */

import { describe, expect, it } from 'bun:test';
import {
  ChatProviderError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  APIEmptyResponseError,
} from '../../../src/agent/anthropic-types.ts';

describe('Error Classes', () => {
  describe('ChatProviderError', () => {
    it('should create error with message', () => {
      const error = new ChatProviderError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ChatProviderError');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('APIConnectionError', () => {
    it('should extend ChatProviderError', () => {
      const error = new APIConnectionError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('APIConnectionError');
      expect(error instanceof ChatProviderError).toBe(true);
    });
  });

  describe('APITimeoutError', () => {
    it('should extend ChatProviderError', () => {
      const error = new APITimeoutError('Request timed out');
      expect(error.message).toBe('Request timed out');
      expect(error.name).toBe('APITimeoutError');
      expect(error instanceof ChatProviderError).toBe(true);
    });
  });

  describe('APIStatusError', () => {
    it('should include status code', () => {
      const error = new APIStatusError(429, 'Rate limited');
      expect(error.message).toBe('Rate limited');
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('APIStatusError');
      expect(error instanceof ChatProviderError).toBe(true);
    });
  });

  describe('APIEmptyResponseError', () => {
    it('should have default message', () => {
      const error = new APIEmptyResponseError();
      expect(error.message).toBe('API returned an empty response');
      expect(error.name).toBe('APIEmptyResponseError');
      expect(error instanceof ChatProviderError).toBe(true);
    });

    it('should accept custom message', () => {
      const error = new APIEmptyResponseError('Custom empty');
      expect(error.message).toBe('Custom empty');
    });
  });
});
