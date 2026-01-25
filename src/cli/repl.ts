/**
 * REPL 交互模式实现
 *
 * 功能：提供命令行交互式对话界面，支持用户输入和响应输出
 *
 * 核心导出：
 * - startRepl(): 启动 REPL 循环
 */

import * as readline from 'node:readline';
import chalk from 'chalk';

let turnNumber = 1;

/**
 * Start the REPL (Read-Eval-Print-Loop) interactive mode
 */
export async function startRepl(): Promise<void> {
  console.log(chalk.blue.bold('╭──────────────────────────────────────────╮'));
  console.log(chalk.blue.bold('│     Synapse Agent - Interactive Mode     │'));
  console.log(chalk.blue.bold('╰──────────────────────────────────────────╯'));
  console.log();
  console.log(chalk.gray('Type /exit to quit, /help for available commands'));
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });

  const promptUser = () => {
    rl.setPrompt(chalk.green(`You (${turnNumber})> `));
    rl.prompt();
  };

  rl.on('line', async (input: string) => {
    const trimmedInput = input.trim();

    // Handle empty input
    if (!trimmedInput) {
      promptUser();
      return;
    }

    // Handle special commands
    if (trimmedInput === '/exit') {
      console.log(chalk.yellow('\nGoodbye! 👋\n'));
      rl.close();
      process.exit(0);
    }

    if (trimmedInput === '/help') {
      console.log();
      console.log(chalk.cyan('Available commands:'));
      console.log(chalk.gray('  /exit  - Exit the REPL'));
      console.log(chalk.gray('  /help  - Show this help message'));
      console.log();
      promptUser();
      return;
    }

    // Echo user input (placeholder response)
    console.log();
    console.log(chalk.magenta(`Agent (${turnNumber})> `) + chalk.white(`You said: ${trimmedInput}`));
    console.log();

    turnNumber++;
    promptUser();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nREPL session ended.\n'));
    process.exit(0);
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    console.log();
    rl.question(chalk.yellow('Do you want to exit? (y/n) '), (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log(chalk.yellow('\nGoodbye! 👋\n'));
        rl.close();
      } else {
        console.log();
        promptUser();
      }
    });
  });

  // Start the REPL
  promptUser();
}
