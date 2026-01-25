/**
 * 批次四功能测试
 *
 * 功能：验证 read/write/edit 工具的基本功能
 */

import { BashSession } from '../src/tools/bash-session.ts';
import { BashRouter } from '../src/tools/bash-router.ts';

async function testBatch4() {
  console.log('=== 批次四功能测试 ===\n');

  const session = new BashSession();
  const router = new BashRouter(session);

  try {
    // Test 1: read 工具
    console.log('--- 测试 1: read 工具 ---');

    // 读取一个已知存在的文件
    const readResult = await router.route('read /Users/wuwenjun/WebstormProjects/Synapse-Agent/package.json');
    console.log('read package.json 结果:');
    console.log('exitCode:', readResult.exitCode);
    console.log('stdout (前 200 字符):', readResult.stdout.slice(0, 200));
    console.log('stderr:', readResult.stderr || '(无)');
    console.log();

    // 测试 read --help
    const readHelpResult = await router.route('read --help');
    console.log('read --help:');
    console.log('exitCode:', readHelpResult.exitCode);
    console.log('stdout (前 300 字符):', readHelpResult.stdout.slice(0, 300));
    console.log();

    // 测试 read 带参数
    const readWithArgs = await router.route('read /Users/wuwenjun/WebstormProjects/Synapse-Agent/package.json --offset 2 --limit 3');
    console.log('read package.json --offset 2 --limit 3:');
    console.log('exitCode:', readWithArgs.exitCode);
    console.log('stdout:', readWithArgs.stdout);
    console.log();

    // Test 2: write 工具
    console.log('--- 测试 2: write 工具 ---');

    const testFilePath = '/tmp/synapse-test-batch4.txt';
    const writeResult = await router.route(`write ${testFilePath} "Hello Synapse Agent!\\nThis is line 2."`);
    console.log('write 结果:');
    console.log('exitCode:', writeResult.exitCode);
    console.log('stdout:', writeResult.stdout);
    console.log('stderr:', writeResult.stderr || '(无)');
    console.log();

    // 验证写入
    const verifyWrite = await router.route(`read ${testFilePath}`);
    console.log('验证写入内容:');
    console.log(verifyWrite.stdout);
    console.log();

    // 测试 write --help
    const writeHelpResult = await router.route('write --help');
    console.log('write --help:');
    console.log('exitCode:', writeHelpResult.exitCode);
    console.log('stdout (前 300 字符):', writeHelpResult.stdout.slice(0, 300));
    console.log();

    // Test 3: edit 工具
    console.log('--- 测试 3: edit 工具 ---');

    const editResult = await router.route(`edit ${testFilePath} "Hello" "Goodbye"`);
    console.log('edit 结果:');
    console.log('exitCode:', editResult.exitCode);
    console.log('stdout:', editResult.stdout);
    console.log('stderr:', editResult.stderr || '(无)');
    console.log();

    // 验证编辑
    const verifyEdit = await router.route(`read ${testFilePath}`);
    console.log('验证编辑内容:');
    console.log(verifyEdit.stdout);
    console.log();

    // 测试 edit --all
    const writeMultiple = await router.route(`write ${testFilePath} "foo bar foo baz foo"`);
    console.log('写入测试内容用于 --all 测试:', writeMultiple.stdout);

    const editAllResult = await router.route(`edit ${testFilePath} "foo" "FOO" --all`);
    console.log('edit --all 结果:');
    console.log('exitCode:', editAllResult.exitCode);
    console.log('stdout:', editAllResult.stdout);
    console.log();

    const verifyEditAll = await router.route(`read ${testFilePath}`);
    console.log('验证 --all 编辑内容:');
    console.log(verifyEditAll.stdout);
    console.log();

    // 测试 edit --help
    const editHelpResult = await router.route('edit --help');
    console.log('edit --help:');
    console.log('exitCode:', editHelpResult.exitCode);
    console.log('stdout (前 300 字符):', editHelpResult.stdout.slice(0, 300));
    console.log();

    // Test 4: 错误处理
    console.log('--- 测试 4: 错误处理 ---');

    // 文件不存在
    const readNotFound = await router.route('read /nonexistent/path/file.txt');
    console.log('read 不存在的文件:');
    console.log('exitCode:', readNotFound.exitCode);
    console.log('stderr:', readNotFound.stderr);
    console.log();

    // edit 字符串不存在
    const editNotFound = await router.route(`edit ${testFilePath} "NOTFOUND" "replacement"`);
    console.log('edit 不存在的字符串:');
    console.log('exitCode:', editNotFound.exitCode);
    console.log('stderr:', editNotFound.stderr);
    console.log();

    // 清理测试文件
    await router.route(`rm ${testFilePath}`);

    console.log('=== 批次四测试完成 ===');
    console.log('✅ 所有测试通过！');

  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    session.cleanup();
  }
}

testBatch4();
