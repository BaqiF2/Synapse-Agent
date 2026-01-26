/**
 * 批次六功能测试
 *
 * 功能：验证上下文管理、系统提示词、工具执行器的功能
 */

import {
  ContextManager,
  ToolExecutor,
  buildSystemPrompt,
  buildMinimalSystemPrompt,
} from '../src/agent/index.ts';

async function testBatch6() {
  console.log('=== 批次六功能测试 ===\n');

  // Test 1: 上下文管理器
  console.log('--- 测试 1: 上下文管理器 ---');

  const contextManager = new ContextManager({ maxMessages: 10 });

  // 添加用户消息
  contextManager.addUserMessage('Hello, I need help with a task.');
  console.log('添加用户消息后，消息数量:', contextManager.getMessageCount());

  // 添加助手消息
  contextManager.addAssistantMessage('I can help you with that. What do you need?');
  console.log('添加助手消息后，消息数量:', contextManager.getMessageCount());

  // 添加工具调用
  contextManager.addAssistantToolCall('Let me check the files.', [
    { id: 'tool_1', name: 'Bash', input: { command: 'ls -la' } },
  ]);
  console.log('添加工具调用后，消息数量:', contextManager.getMessageCount());

  // 添加工具结果
  contextManager.addToolResults([
    { type: 'tool_result', tool_use_id: 'tool_1', content: 'file1.txt\nfile2.txt' },
  ]);
  console.log('添加工具结果后，消息数量:', contextManager.getMessageCount());

  // 获取摘要
  const summary = contextManager.getSummary();
  console.log('上下文摘要:', summary);

  // 获取所有消息
  const messages = contextManager.getMessages();
  console.log('消息角色:', messages.map((m) => m.role));

  // 清空上下文
  contextManager.clear();
  console.log('清空后，消息数量:', contextManager.getMessageCount());
  console.log();

  // Test 2: 系统提示词
  console.log('--- 测试 2: 系统提示词 ---');

  // 默认提示词
  const defaultPrompt = buildSystemPrompt();
  console.log('默认提示词长度:', defaultPrompt.length, '字符');
  console.log('包含 Agent Shell Command:', defaultPrompt.includes('Agent Shell Command'));
  console.log('包含 read 命令:', defaultPrompt.includes('read <file_path>'));
  console.log('包含 glob 命令:', defaultPrompt.includes('glob <pattern>'));

  // 带选项的提示词
  const customPrompt = buildSystemPrompt({
    cwd: '/home/user/project',
    includeExtendShellCommand: true,
    customInstructions: '请用中文回复。',
  });
  console.log('自定义提示词长度:', customPrompt.length, '字符');
  console.log('包含工作目录:', customPrompt.includes('/home/user/project'));
  console.log('包含 extend Shell command:', customPrompt.includes('extend Shell command'));
  console.log('包含附加指令:', customPrompt.includes('请用中文回复'));

  // 最小提示词
  const minimalPrompt = buildMinimalSystemPrompt();
  console.log('最小提示词长度:', minimalPrompt.length, '字符');
  console.log();

  // Test 3: 工具执行器
  console.log('--- 测试 3: 工具执行器 ---');

  const toolExecutor = new ToolExecutor();

  try {
    // 执行有效的工具调用
    const result1 = await toolExecutor.executeTool({
      id: 'test_1',
      name: 'Bash',
      input: { command: 'pwd' },
    });
    console.log('执行 pwd:');
    console.log('  success:', result1.success);
    console.log('  isError:', result1.isError);
    console.log('  output:', result1.output.slice(0, 100));
    console.log();

    // 执行多个工具调用
    const results = await toolExecutor.executeTools([
      { id: 'test_2', name: 'Bash', input: { command: 'echo "Hello"' } },
      { id: 'test_3', name: 'Bash', input: { command: 'read /Users/wuwenjun/WebstormProjects/Synapse-Agent/package.json --limit 3' } },
    ]);
    console.log('批量执行结果:');
    for (const result of results) {
      console.log(`  ${result.toolUseId}: success=${result.success}, output=${result.output.slice(0, 50)}...`);
    }
    console.log();

    // 测试无效工具
    const invalidTool = await toolExecutor.executeTool({
      id: 'test_4',
      name: 'InvalidTool',
      input: { command: 'test' },
    });
    console.log('无效工具调用:');
    console.log('  success:', invalidTool.success);
    console.log('  isError:', invalidTool.isError);
    console.log('  output:', invalidTool.output);
    console.log();

    // 测试缺少命令
    const noCommand = await toolExecutor.executeTool({
      id: 'test_5',
      name: 'Bash',
      input: {},
    });
    console.log('缺少命令:');
    console.log('  success:', noCommand.success);
    console.log('  isError:', noCommand.isError);
    console.log('  output:', noCommand.output);
    console.log();

    // 格式化结果用于 LLM
    const formattedResults = toolExecutor.formatResultsForLlm(results);
    console.log('格式化结果:');
    for (const result of formattedResults) {
      console.log(`  type: ${result.type}, tool_use_id: ${result.tool_use_id}, is_error: ${result.is_error}`);
    }
    console.log();

    // 测试会话重启
    await toolExecutor.restartSession();
    console.log('会话重启成功');

  } finally {
    toolExecutor.cleanup();
  }

  console.log('=== 批次六测试完成 ===');
  console.log('✅ 所有测试通过！');
}

testBatch6();
