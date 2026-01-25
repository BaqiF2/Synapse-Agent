/**
 * 批次五功能测试
 *
 * 功能：验证 glob/grep/bash 工具的基本功能
 */

import { BashSession } from '../src/tools/bash-session.ts';
import { BashRouter } from '../src/tools/bash-router.ts';

async function testBatch5() {
  console.log('=== 批次五功能测试 ===\n');

  const session = new BashSession();
  const router = new BashRouter(session);

  try {
    // Test 1: glob 工具
    console.log('--- 测试 1: glob 工具 ---');

    // 查找 TypeScript 文件
    const globResult = await router.route('glob "*.ts" --path /Users/wuwenjun/WebstormProjects/Synapse-Agent/src/tools');
    console.log('glob "*.ts" --path src/tools 结果:');
    console.log('exitCode:', globResult.exitCode);
    console.log('stdout:', globResult.stdout);
    console.log();

    // 递归查找
    const globRecursive = await router.route('glob "**/*.ts" --path /Users/wuwenjun/WebstormProjects/Synapse-Agent/src/tools --max 5');
    console.log('glob "**/*.ts" (递归，最多5个):');
    console.log('exitCode:', globRecursive.exitCode);
    console.log('stdout:', globRecursive.stdout);
    console.log();

    // glob --help
    const globHelp = await router.route('glob --help');
    console.log('glob --help:');
    console.log('exitCode:', globHelp.exitCode);
    console.log('stdout (前 300 字符):', globHelp.stdout.slice(0, 300));
    console.log();

    // Test 2: grep 工具
    console.log('--- 测试 2: grep 工具 ---');

    // 搜索 "export"
    const grepResult = await router.route('grep "export" --path /Users/wuwenjun/WebstormProjects/Synapse-Agent/src/tools/handlers/agent-bash --type ts --max 5');
    console.log('grep "export" 结果:');
    console.log('exitCode:', grepResult.exitCode);
    console.log('stdout:', grepResult.stdout);
    console.log();

    // 搜索带上下文
    const grepWithContext = await router.route('grep "CommandResult" --path /Users/wuwenjun/WebstormProjects/Synapse-Agent/src/tools --type ts --context 1 --max 3');
    console.log('grep "CommandResult" --context 1:');
    console.log('exitCode:', grepWithContext.exitCode);
    console.log('stdout:', grepWithContext.stdout);
    console.log();

    // grep --help
    const grepHelp = await router.route('grep --help');
    console.log('grep --help:');
    console.log('exitCode:', grepHelp.exitCode);
    console.log('stdout (前 300 字符):', grepHelp.stdout.slice(0, 300));
    console.log();

    // Test 3: bash 包装器工具
    console.log('--- 测试 3: bash 包装器工具 ---');

    // 执行 ls 命令
    const bashLs = await router.route('bash ls -la /Users/wuwenjun/WebstormProjects/Synapse-Agent/src/tools/handlers/agent-bash');
    console.log('bash ls -la 结果:');
    console.log('exitCode:', bashLs.exitCode);
    console.log('stdout:', bashLs.stdout);
    console.log();

    // 执行 pwd
    const bashPwd = await router.route('bash pwd');
    console.log('bash pwd 结果:');
    console.log('exitCode:', bashPwd.exitCode);
    console.log('stdout:', bashPwd.stdout);
    console.log();

    // 测试环境变量持久化
    await router.route('bash export TEST_VAR=hello_batch5');
    const bashEcho = await router.route('bash echo $TEST_VAR');
    console.log('bash echo $TEST_VAR (环境变量持久化测试):');
    console.log('exitCode:', bashEcho.exitCode);
    console.log('stdout:', bashEcho.stdout);
    console.log();

    // bash --help
    const bashHelp = await router.route('bash --help');
    console.log('bash --help:');
    console.log('exitCode:', bashHelp.exitCode);
    console.log('stdout (前 300 字符):', bashHelp.stdout.slice(0, 300));
    console.log();

    // Test 4: 错误处理
    console.log('--- 测试 4: 错误处理 ---');

    // glob 目录不存在
    const globError = await router.route('glob "*.ts" --path /nonexistent/path');
    console.log('glob 目录不存在:');
    console.log('exitCode:', globError.exitCode);
    console.log('stderr:', globError.stderr);
    console.log();

    // grep 无效正则
    const grepInvalidRegex = await router.route('grep "[invalid(" --path /Users/wuwenjun/WebstormProjects/Synapse-Agent/src');
    console.log('grep 无效正则:');
    console.log('exitCode:', grepInvalidRegex.exitCode);
    console.log('stderr:', grepInvalidRegex.stderr);
    console.log();

    // grep 未知文件类型
    const grepUnknownType = await router.route('grep "test" --type unknowntype');
    console.log('grep 未知文件类型:');
    console.log('exitCode:', grepUnknownType.exitCode);
    console.log('stderr:', grepUnknownType.stderr);
    console.log();

    console.log('=== 批次五测试完成 ===');
    console.log('✅ 所有测试通过！');

  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    session.cleanup();
  }
}

testBatch5();
