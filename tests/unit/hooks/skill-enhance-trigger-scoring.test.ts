import { describe, expect, it } from 'bun:test';
import {
  collectTriggerSignals,
  evaluateTriggerDecision,
  resolveTriggerProfile,
} from '../../../src/core/hooks/skill-enhance-hook.ts';
import type { Message } from '../../../src/types/message.ts';

function textMessage(role: Message['role'], text: string): Message {
  return {
    role,
    content: [{ type: 'text', text }],
  };
}

describe('SkillEnhanceTriggerScoring', () => {
  it('应提取基础信号（工具统计、写编辑、错误恢复）', () => {
    const messages: Message[] = [
      textMessage('user', '请先处理一版'),
      textMessage('user', '我的意思是换成 JSON 输出'),
      textMessage('user', 'actually use another format'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'working' }],
        toolCalls: [
          { id: '1', name: 'Bash', arguments: JSON.stringify({ command: 'read README.md' }) },
          { id: '2', name: 'Read', arguments: JSON.stringify({ path: 'README.md' }) },
          { id: '3', name: 'Bash', arguments: JSON.stringify({ command: 'write out.txt "ok"' }) },
        ],
      },
      textMessage('tool', 'Command failed with exit code 1\n[stderr]\nboom'),
      textMessage('tool', 'done'),
    ];

    const signals = collectTriggerSignals(messages);
    expect(signals.toolCallCount).toBe(3);
    expect(signals.uniqueToolCount).toBe(2);
    expect(signals.hasWriteOrEdit).toBe(true);
    expect(signals.hasErrorRecovered).toBe(true);
    expect(signals.userClarificationCount).toBe(0);
  });

  it('仅出现错误且无后续成功时，不应判定错误恢复', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'run' }],
        toolCalls: [
          { id: '1', name: 'Bash', arguments: JSON.stringify({ command: 'read a.txt' }) },
          { id: '2', name: 'Bash', arguments: JSON.stringify({ command: 'read b.txt' }) },
          { id: '3', name: 'Bash', arguments: JSON.stringify({ command: 'read c.txt' }) },
        ],
      },
      textMessage('tool', 'Command failed with exit code 1'),
      textMessage('tool', 'timeout error'),
    ];

    const signals = collectTriggerSignals(messages);
    expect(signals.hasErrorRecovered).toBe(false);
  });

  it('保守档：总分=2 时不触发（LOW_SCORE）', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'run' }],
        toolCalls: [
          { id: '1', name: 'Bash', arguments: JSON.stringify({ command: 'read a.txt' }) },
          { id: '2', name: 'Read', arguments: JSON.stringify({ path: 'a.txt' }) },
          { id: '3', name: 'Bash', arguments: JSON.stringify({ command: 'read b.txt' }) },
        ],
      },
    ];

    const decision = evaluateTriggerDecision(messages, 'conservative');
    expect(decision.totalScore).toBe(2);
    expect(decision.threshold).toBe(3);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.reasonCode).toBe('LOW_SCORE');
  });

  it('保守档：总分=3 时触发（SCORE_REACHED）', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'run' }],
        toolCalls: [
          { id: '1', name: 'Bash', arguments: JSON.stringify({ command: 'read a.txt' }) },
          { id: '2', name: 'Read', arguments: JSON.stringify({ path: 'a.txt' }) },
          { id: '3', name: 'Bash', arguments: JSON.stringify({ command: 'write out.txt "ok"' }) },
        ],
      },
    ];

    const decision = evaluateTriggerDecision(messages, 'conservative');
    expect(decision.totalScore).toBe(3);
    expect(decision.threshold).toBe(3);
    expect(decision.shouldTrigger).toBe(true);
    expect(decision.reasonCode).toBe('SCORE_REACHED');
  });

  it('保守档：总分=4 时触发（SCORE_REACHED）', () => {
    const messages: Message[] = [
      textMessage('user', 'mean we need this changed'),
      textMessage('user', 'actually use another format'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'run' }],
        toolCalls: [
          { id: '1', name: 'Bash', arguments: JSON.stringify({ command: 'read a.txt' }) },
          { id: '2', name: 'Read', arguments: JSON.stringify({ path: 'a.txt' }) },
          { id: '3', name: 'Bash', arguments: JSON.stringify({ command: 'write out.txt "ok"' }) },
        ],
      },
    ];

    const decision = evaluateTriggerDecision(messages, 'conservative', 2);
    expect(decision.totalScore).toBe(4);
    expect(decision.threshold).toBe(3);
    expect(decision.shouldTrigger).toBe(true);
    expect(decision.reasonCode).toBe('SCORE_REACHED');
  });

  it('不同档位阈值应正确映射', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'run' }],
        toolCalls: [
          { id: '1', name: 'Bash', arguments: JSON.stringify({ command: 'read a.txt' }) },
          { id: '2', name: 'Read', arguments: JSON.stringify({ path: 'a.txt' }) },
          { id: '3', name: 'Bash', arguments: JSON.stringify({ command: 'read b.txt' }) },
        ],
      },
    ];

    const conservative = evaluateTriggerDecision(messages, 'conservative');
    const neutral = evaluateTriggerDecision(messages, 'neutral');
    const aggressive = evaluateTriggerDecision(messages, 'aggressive');

    expect(conservative.threshold).toBe(3);
    expect(conservative.shouldTrigger).toBe(false);
    expect(neutral.threshold).toBe(2);
    expect(neutral.shouldTrigger).toBe(true);
    expect(aggressive.threshold).toBe(1);
    expect(aggressive.shouldTrigger).toBe(true);
  });

  it('非法档位应回退 conservative', () => {
    expect(resolveTriggerProfile('neutral')).toBe('neutral');
    expect(resolveTriggerProfile('aggressive')).toBe('aggressive');
    expect(resolveTriggerProfile('invalid')).toBe('conservative');
    expect(resolveTriggerProfile(undefined)).toBe('conservative');
  });
});
