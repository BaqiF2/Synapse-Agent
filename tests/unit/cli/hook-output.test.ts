import { describe, expect, it } from 'bun:test';
import { STOP_HOOK_MARKER } from '../../../src/hooks/stop-hook-constants.ts';
import { extractHookOutput } from '../../../src/cli/hook-output.ts';

describe('extractHookOutput', () => {
  it('uses stop hook marker when present', () => {
    const response = `Answer\n\n${STOP_HOOK_MARKER}\n[Skill] No enhancement needed`;
    expect(extractHookOutput(response)).toBe('[Skill] No enhancement needed');
  });

  it('falls back to last bracketed header when marker missing', () => {
    const response = 'Answer\n\n[Other] First\n\n[Skill] Final';
    expect(extractHookOutput(response)).toBe('[Skill] Final');
  });

  it('returns null when no hook output present', () => {
    const response = 'Just a normal answer.';
    expect(extractHookOutput(response)).toBeNull();
  });
});
