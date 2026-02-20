/**
 * CLI 入口文件
 *
 * 功能：定义命令行接口，处理命令参数和选项
 *
 * 核心导出：
 * - main(): 主函数，启动 CLI 应用
 */

import { Command } from 'commander';
import { startRepl } from './repl.ts';
import { getProjectVersion } from '../shared/config/version.ts';

const program = new Command();

program
  .name('synapse')
  .description('Synapse Agent - A self-growing AI agent framework based on unified Bash abstraction')
  .version(getProjectVersion());

program
  .command('chat')
  .description('Start interactive REPL mode')
  .action(async () => {
    await startRepl();
  });

/**
 * Main function to run the CLI
 */
export async function main() {
  await program.parseAsync(process.argv);
}

// Run if executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
