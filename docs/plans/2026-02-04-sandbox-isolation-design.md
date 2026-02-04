# 沙盒隔离设计文档

## 概述

沙盒隔离系统为 Agent 生成的代码执行提供安全隔离环境，通过系统级沙盒技术（macOS sandbox-exec / Linux seccomp）实现文件系统和网络的访问控制。

### 核心特性

- **文件系统隔离** - 白名单为主，黑名单兜底保护敏感目录
- **网络隔离** - 沙盒内完全禁止网络，需调用沙盒外可控组件
- **全量覆盖** - 所有 Bash 工具执行都在沙盒中运行
- **跨平台支持** - macOS sandbox-exec / Linux seccomp
- **可配置** - 通过配置文件定制访问规则

---

## 数据结构

### SandboxConfig

```typescript
/** 沙盒配置 */
interface SandboxConfig {
  /** 是否启用沙盒（默认 true） */
  enabled: boolean;
  /** 文件系统策略 */
  filesystem: FilesystemPolicy;
  /** 网络策略 */
  network: NetworkPolicy;
}
```

### FilesystemPolicy

```typescript
/** 文件系统策略 */
interface FilesystemPolicy {
  /** 白名单目录（允许访问） */
  whitelist: string[];
  /** 黑名单路径（强制禁止，优先级高于白名单） */
  blacklist: string[];
  /** 是否允许读取白名单外的文件（只读） */
  allowReadOutside: boolean;
}
```

### NetworkPolicy

```typescript
/** 网络策略 */
interface NetworkPolicy {
  /** 是否允许网络访问（沙盒内始终为 false） */
  allowNetwork: boolean;
}
```

### SandboxResult

```typescript
/** 沙盒执行结果 */
interface SandboxResult {
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number;
  /** 是否被沙盒拦截 */
  blocked: boolean;
  /** 拦截原因（如有） */
  blockedReason?: string;
}
```

---

## 目录结构

### 代码文件结构

```
src/sandbox/
├── index.ts              # 模块导出
├── sandbox-executor.ts   # 沙盒执行器（入口）
├── sandbox-config.ts     # 配置加载和验证
├── platforms/
│   ├── index.ts          # 平台适配器接口
│   ├── macos.ts          # macOS sandbox-exec 实现
│   └── linux.ts          # Linux seccomp 实现
└── policies/
    ├── index.ts          # 策略管理
    ├── default.ts        # 默认策略
    └── filesystem.ts     # 文件系统规则处理
```

### 配置文件位置

```
~/.synapse/
└── sandbox.json          # 用户自定义沙盒配置
```

---

## 组件架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                      BashTool                           │
│  execute(command) → SandboxExecutor.run(command)       │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  SandboxExecutor                        │
│  - 加载沙盒配置                                         │
│  - 选择平台适配器                                       │
│  - 生成沙盒策略                                         │
│  - 执行命令并返回结果                                   │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 检测当前平台         │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
┌──────────────────────┐   ┌──────────────────────┐
│   MacOSSandbox       │   │   LinuxSandbox       │
│  - sandbox-exec      │   │  - seccomp           │
│  - .sb profile       │   │  - landlock          │
└──────────────────────┘   └──────────────────────┘
```

---

## 核心组件实现

### SandboxExecutor

```typescript
// src/sandbox/sandbox-executor.ts

import { createLogger } from '../utils/logger.ts';
import { loadSandboxConfig } from './sandbox-config.ts';
import { getPlatformSandbox } from './platforms/index.ts';
import type { SandboxConfig, SandboxResult } from './types.ts';

const logger = createLogger('sandbox-executor');

export class SandboxExecutor {
  private config: SandboxConfig;
  private platformSandbox: PlatformSandbox;

  constructor() {
    this.config = loadSandboxConfig();
    this.platformSandbox = getPlatformSandbox();
  }

  /**
   * 在沙盒中执行命令
   */
  async run(command: string, cwd: string): Promise<SandboxResult> {
    // 如果沙盒被禁用，直接执行
    if (!this.config.enabled) {
      logger.warn('Sandbox is disabled, executing without isolation');
      return this.executeWithoutSandbox(command, cwd);
    }

    logger.debug('Executing command in sandbox', { command, cwd });

    // 生成沙盒策略
    const policy = this.generatePolicy(cwd);

    // 使用平台特定实现执行
    const result = await this.platformSandbox.execute(command, cwd, policy);

    if (result.blocked) {
      logger.info('Command blocked by sandbox', {
        command,
        reason: result.blockedReason,
      });
    }

    return result;
  }

  /**
   * 生成沙盒策略
   */
  private generatePolicy(cwd: string): SandboxPolicy {
    const { filesystem, network } = this.config;

    // 动态添加当前工作目录到白名单
    const whitelist = [
      cwd,
      ...filesystem.whitelist,
      process.env.TMPDIR || '/tmp',
    ];

    return {
      filesystem: {
        whitelist: this.expandPaths(whitelist),
        blacklist: this.expandPaths(filesystem.blacklist),
      },
      network: {
        allowNetwork: false, // 沙盒内始终禁止网络
      },
    };
  }

  /**
   * 展开路径中的环境变量和 ~
   */
  private expandPaths(paths: string[]): string[] {
    return paths.map(p => {
      let expanded = p;
      if (expanded.startsWith('~')) {
        expanded = expanded.replace('~', process.env.HOME || '');
      }
      // 展开环境变量
      expanded = expanded.replace(/\$(\w+)/g, (_, name) => process.env[name] || '');
      return expanded;
    });
  }

  /**
   * 无沙盒执行（fallback）
   */
  private async executeWithoutSandbox(command: string, cwd: string): Promise<SandboxResult> {
    const { execAsync } = await import('../utils/exec.ts');
    try {
      const { stdout, stderr } = await execAsync(command, { cwd });
      return { stdout, stderr, exitCode: 0, blocked: false };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        blocked: false,
      };
    }
  }
}
```

### macOS 沙盒实现

```typescript
// src/sandbox/platforms/macos.ts

import { execAsync } from '../../utils/exec.ts';
import { createLogger } from '../../utils/logger.ts';
import type { PlatformSandbox, SandboxPolicy, SandboxResult } from '../types.ts';

const logger = createLogger('macos-sandbox');

export class MacOSSandbox implements PlatformSandbox {
  /**
   * 使用 sandbox-exec 执行命令
   */
  async execute(command: string, cwd: string, policy: SandboxPolicy): Promise<SandboxResult> {
    // 生成 .sb profile
    const profile = this.generateProfile(policy);

    // 写入临时文件
    const profilePath = await this.writeProfileToTemp(profile);

    try {
      // 使用 sandbox-exec 执行
      const sandboxCommand = `sandbox-exec -f ${profilePath} /bin/bash -c ${this.escapeCommand(command)}`;

      const { stdout, stderr } = await execAsync(sandboxCommand, {
        cwd,
        timeout: 120000,
      });

      return { stdout, stderr, exitCode: 0, blocked: false };
    } catch (error: any) {
      // 检查是否为沙盒拦截
      if (this.isSandboxViolation(error)) {
        return {
          stdout: '',
          stderr: `Permission denied: ${this.extractViolationReason(error)}`,
          exitCode: 1,
          blocked: true,
          blockedReason: this.extractViolationReason(error),
        };
      }

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        blocked: false,
      };
    } finally {
      // 清理临时文件
      await this.cleanupProfile(profilePath);
    }
  }

  /**
   * 生成 sandbox-exec profile
   */
  private generateProfile(policy: SandboxPolicy): string {
    const { filesystem, network } = policy;

    // 构建白名单规则
    const whitelistRules = filesystem.whitelist
      .map(path => `(subpath "${path}")`)
      .join('\n            ');

    // 构建黑名单规则
    const blacklistRules = filesystem.blacklist
      .map(path => `(subpath "${path}")`)
      .join('\n            ');

    return `
(version 1)

; 默认拒绝所有
(deny default)

; 允许基本进程操作
(allow process-fork)
(allow process-exec)
(allow signal)

; 允许读取系统基础文件
(allow file-read*
    (subpath "/usr/lib")
    (subpath "/usr/bin")
    (subpath "/bin")
    (subpath "/System")
    (subpath "/Library/Preferences")
    (subpath "/private/var/db")
)

; 白名单目录 - 允许读写
(allow file-read* file-write*
    ${whitelistRules}
)

; 黑名单目录 - 强制拒绝（优先级最高）
(deny file-read* file-write*
    ${blacklistRules}
)

; 禁止网络访问
(deny network*)

; 允许 IPC（进程间通信）
(allow ipc-posix-shm*)
(allow mach-lookup)
`;
  }

  private async writeProfileToTemp(profile: string): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const profilePath = path.join(os.tmpdir(), `synapse-sandbox-${Date.now()}.sb`);
    await fs.writeFile(profilePath, profile);
    return profilePath;
  }

  private async cleanupProfile(profilePath: string): Promise<void> {
    const fs = await import('fs/promises');
    try {
      await fs.unlink(profilePath);
    } catch {
      // 忽略清理错误
    }
  }

  private escapeCommand(command: string): string {
    return `'${command.replace(/'/g, "'\\''")}'`;
  }

  private isSandboxViolation(error: any): boolean {
    const stderr = error.stderr || error.message || '';
    return stderr.includes('sandbox') || stderr.includes('deny');
  }

  private extractViolationReason(error: any): string {
    const stderr = error.stderr || error.message || '';
    // 尝试提取违规原因
    const match = stderr.match(/deny\s+(\S+)/);
    return match ? match[1] : 'Access denied by sandbox';
  }
}
```

### Linux 沙盒实现

```typescript
// src/sandbox/platforms/linux.ts

import { execAsync } from '../../utils/exec.ts';
import { createLogger } from '../../utils/logger.ts';
import type { PlatformSandbox, SandboxPolicy, SandboxResult } from '../types.ts';

const logger = createLogger('linux-sandbox');

export class LinuxSandbox implements PlatformSandbox {
  /**
   * 使用 unshare + seccomp 执行命令
   * 或使用 bubblewrap (bwrap) 如果可用
   */
  async execute(command: string, cwd: string, policy: SandboxPolicy): Promise<SandboxResult> {
    // 检查 bwrap 是否可用
    const hasBwrap = await this.checkBwrap();

    if (hasBwrap) {
      return this.executeWithBwrap(command, cwd, policy);
    } else {
      return this.executeWithUnshare(command, cwd, policy);
    }
  }

  /**
   * 使用 bubblewrap 执行
   */
  private async executeWithBwrap(
    command: string,
    cwd: string,
    policy: SandboxPolicy
  ): Promise<SandboxResult> {
    const { filesystem } = policy;

    // 构建 bwrap 参数
    const args: string[] = [
      '--unshare-net',           // 禁止网络
      '--die-with-parent',       // 父进程退出时终止
      '--new-session',           // 新会话
    ];

    // 绑定只读系统目录
    const readonlyDirs = ['/usr', '/bin', '/lib', '/lib64', '/etc'];
    for (const dir of readonlyDirs) {
      args.push('--ro-bind', dir, dir);
    }

    // 绑定白名单目录（读写）
    for (const dir of filesystem.whitelist) {
      args.push('--bind', dir, dir);
    }

    // 设置工作目录
    args.push('--chdir', cwd);

    // 执行命令
    args.push('/bin/bash', '-c', command);

    try {
      const { stdout, stderr } = await execAsync(`bwrap ${args.join(' ')}`, {
        timeout: 120000,
      });

      return { stdout, stderr, exitCode: 0, blocked: false };
    } catch (error: any) {
      if (this.isSandboxViolation(error)) {
        return {
          stdout: '',
          stderr: `Permission denied: ${error.message}`,
          exitCode: 1,
          blocked: true,
          blockedReason: error.message,
        };
      }

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        blocked: false,
      };
    }
  }

  /**
   * 使用 unshare 执行（fallback）
   */
  private async executeWithUnshare(
    command: string,
    cwd: string,
    policy: SandboxPolicy
  ): Promise<SandboxResult> {
    // 使用 unshare 创建新的网络命名空间（禁止网络）
    const sandboxCommand = `unshare --net /bin/bash -c '${command.replace(/'/g, "'\\''")}'`;

    try {
      const { stdout, stderr } = await execAsync(sandboxCommand, {
        cwd,
        timeout: 120000,
      });

      return { stdout, stderr, exitCode: 0, blocked: false };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        blocked: false,
      };
    }
  }

  private async checkBwrap(): Promise<boolean> {
    try {
      await execAsync('which bwrap');
      return true;
    } catch {
      return false;
    }
  }

  private isSandboxViolation(error: any): boolean {
    const stderr = error.stderr || error.message || '';
    return stderr.includes('Permission denied') || stderr.includes('Operation not permitted');
  }
}
```

### 沙盒配置加载

```typescript
// src/sandbox/sandbox-config.ts

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger.ts';
import type { SandboxConfig } from './types.ts';

const logger = createLogger('sandbox-config');

/** 配置文件路径 */
const CONFIG_PATH = path.join(
  process.env.HOME || '',
  '.synapse',
  'sandbox.json'
);

/** 默认配置 */
const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  filesystem: {
    whitelist: [
      // 当前工作目录会在运行时动态添加
    ],
    blacklist: [
      '~/.ssh',
      '~/.aws',
      '~/.gnupg',
      '~/.config/gcloud',
      '~/.azure',
      '/etc/passwd',
      '/etc/shadow',
      '**/.env',
      '**/.envrc',
      '**/.env.local',
      '**/credentials.json',
      '**/secrets.json',
    ],
    allowReadOutside: false,
  },
  network: {
    allowNetwork: false,
  },
};

/**
 * 加载沙盒配置
 */
export function loadSandboxConfig(): SandboxConfig {
  // 尝试加载用户配置
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      logger.debug('Loaded user sandbox config', { path: CONFIG_PATH });

      // 合并配置（用户配置优先，但黑名单始终包含默认项）
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    } catch (error) {
      logger.warn('Failed to load sandbox config, using defaults', { error });
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * 合并配置
 */
function mergeConfig(defaultConfig: SandboxConfig, userConfig: Partial<SandboxConfig>): SandboxConfig {
  return {
    enabled: userConfig.enabled ?? defaultConfig.enabled,
    filesystem: {
      whitelist: [
        ...defaultConfig.filesystem.whitelist,
        ...(userConfig.filesystem?.whitelist || []),
      ],
      // 黑名单始终包含默认项
      blacklist: [
        ...defaultConfig.filesystem.blacklist,
        ...(userConfig.filesystem?.blacklist || []),
      ],
      allowReadOutside: userConfig.filesystem?.allowReadOutside ?? defaultConfig.filesystem.allowReadOutside,
    },
    network: {
      allowNetwork: false, // 始终禁止网络
    },
  };
}
```

### 平台适配器选择

```typescript
// src/sandbox/platforms/index.ts

import { MacOSSandbox } from './macos.ts';
import { LinuxSandbox } from './linux.ts';
import type { PlatformSandbox } from '../types.ts';

/**
 * 根据当前平台获取沙盒实现
 */
export function getPlatformSandbox(): PlatformSandbox {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return new MacOSSandbox();
    case 'linux':
      return new LinuxSandbox();
    default:
      throw new Error(`Sandbox not supported on platform: ${platform}`);
  }
}
```

---

## BashTool 集成

### 修改 BashTool

```typescript
// src/tools/bash-tool.ts（修改部分）

import { SandboxExecutor } from '../sandbox/sandbox-executor.ts';

export class BashTool implements CallableTool {
  private sandboxExecutor: SandboxExecutor;

  constructor() {
    this.sandboxExecutor = new SandboxExecutor();
  }

  async execute(params: BashParams): Promise<CommandResult> {
    const { command, cwd = process.cwd() } = params;

    // 所有命令都通过沙盒执行
    const result = await this.sandboxExecutor.run(command, cwd);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }
}
```

---

## 配置文件格式

### sandbox.json 示例

```json
{
  "enabled": true,
  "filesystem": {
    "whitelist": [
      "/home/user/projects",
      "/var/data"
    ],
    "blacklist": [
      "~/.kube",
      "~/.docker"
    ]
  }
}
```

---

## 执行流程

### 命令执行流程

```
┌─────────────────────────────────────────────────────────┐
│ Agent 调用 Bash 工具执行命令                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ BashTool.execute() → SandboxExecutor.run()             │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 沙盒是否启用?        │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
          否                          是
           ↓                           ↓
    直接执行命令                 加载沙盒配置
                                       ↓
                             生成沙盒策略（白名单+黑名单）
                                       ↓
                              ┌────────┴────────┐
                              │ 检测平台         │
                              └────────┬────────┘
                           ┌───────────┼───────────┐
                           ↓                       ↓
                        macOS                   Linux
                           ↓                       ↓
                   sandbox-exec              bwrap/unshare
                           └───────────┬───────────┘
                                       ↓
                             在沙盒中执行命令
                                       ↓
              ┌──────────┴──────────┐
              │ 执行结果             │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
        成功                        被拦截
           ↓                           ↓
    返回正常结果             返回权限错误（静默拒绝）
```

### 网络访问流程

```
┌─────────────────────────────────────────────────────────┐
│ Agent 生成的代码需要网络访问                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 沙盒内直接访问?      │
              └──────────┬──────────┘
                         ↓
                    被沙盒拒绝
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Agent 需要调用沙盒外可控组件                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 选择可控组件         │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
   Agent Shell Command            MCP 工具
   （如 fetch、http）           （网络相关服务）
           ↓                           ↓
    在沙盒外安全执行            通过 MCP 协议调用
           └─────────────┬─────────────┘
                         ↓
                    返回结果给 Agent
```

---

## 测试用例

### 文件系统隔离

1. 访问白名单目录 → 验证允许读写
2. 访问黑名单目录（如 ~/.ssh）→ 验证被拒绝
3. 访问白名单内的黑名单文件 → 验证黑名单优先
4. 访问白名单外的目录 → 验证被拒绝

### 网络隔离

5. 在沙盒内执行 curl → 验证网络被禁止
6. 在沙盒内执行 ping → 验证网络被禁止
7. 调用 Agent Shell Command 访问网络 → 验证正常工作

### 平台适配

8. macOS sandbox-exec → 验证 profile 生成正确
9. Linux bwrap → 验证参数构建正确
10. Linux unshare fallback → 验证降级执行

### 配置加载

11. 默认配置 → 验证黑名单包含敏感目录
12. 用户自定义配置 → 验证合并正确
13. 配置文件不存在 → 验证使用默认值
14. 配置文件格式错误 → 验证降级到默认配置

### 违规处理

15. 访问被禁止资源 → 验证静默拒绝，返回权限错误
16. 违规不中断后续执行 → 验证继续执行其他命令

### 边界情况

17. 路径包含环境变量 → 验证正确展开
18. 路径包含 ~ → 验证正确展开为 HOME
19. 不支持的平台 → 验证抛出明确错误

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `SYNAPSE_SANDBOX_ENABLED` | true | 是否启用沙盒 |
| `SYNAPSE_SANDBOX_CONFIG` | `~/.synapse/sandbox.json` | 配置文件路径 |

---

## 安全考虑

### 黑名单强制保护

以下目录/文件始终被禁止访问，无法通过配置覆盖：

- `~/.ssh/` - SSH 密钥
- `~/.aws/` - AWS 凭证
- `~/.gnupg/` - GPG 密钥
- `~/.config/gcloud/` - GCP 凭证
- `/etc/passwd`、`/etc/shadow` - 系统用户信息
- `**/.env`、`**/.envrc` - 环境变量文件
- `**/credentials.json`、`**/secrets.json` - 凭证文件

### 网络完全禁止

沙盒内的网络访问始终被禁止，该设置无法通过配置更改。需要网络访问时，必须通过：

1. Agent Shell Commands（如 `fetch`、`http`）
2. MCP 工具（网络相关服务）

这确保了所有网络请求都经过可控的代码路径，便于审计和控制。
