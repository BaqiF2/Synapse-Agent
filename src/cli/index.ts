/**
 * 文件功能说明：
 * - 该文件位于 `src/cli/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 CLI 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `main`
 *
 * 作用说明：
 * - `main`：提供该模块的核心能力。
 */

import { Command } from 'commander';
import { startRepl } from './repl.ts';
import { getProjectVersion } from '../config/version.ts';

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

/**
 * 入口
 */
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
