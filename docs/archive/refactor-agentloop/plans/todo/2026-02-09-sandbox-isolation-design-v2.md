# 沙盒隔离设计文档 v2

## 概述

沙盒隔离系统为 Agent 生成的代码执行提供安全隔离环境。通过**可插拔的 Provider 架构**，支持本地沙盒（macOS sandbox-exec / Linux bwrap）和未来的云端沙盒扩展。

### 核心设计原则

- **仅抽象命令执行** — 文件操作（read/write/edit）继续走现有 Agent Shell Command Handler，不纳入沙盒协议
- **代理模式** — 沙盒协议替代 BashSession 成为命令执行的统一入口，BashSession 降级为本地沙盒的内部实现
- **Provider 生命周期管理** — 分离沙盒的"创建/销毁"和"使用"
- **策略在 Provider 层** — 通用安全策略传给 Provider，由各实现翻译为平台特定机制
- **严格安全边界** — 沙盒创建失败直接报错退出，命令被拦截中断 Agent 循环向用户申请授权

### 核心特性

- **文件系统隔离** — 白名单为主，黑名单兜底保护敏感目录
- **网络隔离** — 沙盒内完全禁止网络
- **全量覆盖** — 所有原生 Shell 命令在沙盒中运行
- **跨平台支持** — macOS sandbox-exec / Linux bwrap+unshare
- **可配置** — 通过配置文件定制访问规则和 Provider 类型
- **可扩展** — 注册表模式支持第三方 Provider 接入

---

## 协议层（核心抽象）

### 三层协议体系

| 层次 | 接口 | 职责 |
|------|------|------|
| `SandboxBackend` | 沙盒实例 | 提供 `execute()` 命令执行 |
| `SandboxProvider` | 生命周期管理 | 创建/销毁/列举沙盒实例 |
| `SandboxConfig` | 配置层 | 选择 Provider 类型和安全策略 |

### SandboxBackend

```typescript
/** 沙盒执行结果 */
interface ExecuteResult {
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number;
  /** 是否被沙盒安全策略拦截 */
  blocked: boolean;
  /** 拦截原因（如有） */
  blockedReason?: string;
  /** 被拦截的资源路径（用于向用户展示） */
  blockedResource?: string;
}

/** 沙盒实例接口 — 只负责命令执行 */
interface SandboxBackend {
  /** 沙盒实例唯一标识 */
  readonly id: string;
  /** 在沙盒中执行命令 */
  execute(command: string): Promise<ExecuteResult>;
  /** 销毁沙盒实例，释放资源 */
  dispose(): Promise<void>;
}
```

### SandboxPolicy

```typescript
/** 安全策略（通用，由各实现翻译为平台机制） */
interface SandboxPolicy {
  filesystem: {
    /** 允许读写的目录 */
    whitelist: string[];
    /** 强制禁止的路径（优先级高于白名单） */
    blacklist: string[];
  };
  network: {
    /** 是否允许网络访问（本地沙盒始终 false） */
    allowNetwork: boolean;
  };
}
```

### SandboxProvider

```typescript
/** 沙盒创建选项 */
interface SandboxCreateOptions {
  /** 工作目录 */
  cwd: string;
  /** 安全策略 */
  policy: SandboxPolicy;
  /** Provider 特有的扩展配置 */
  providerOptions?: Record<string, unknown>;
}

/** 沙盒信息 */
interface SandboxInfo {
  id: string;
  status: 'running' | 'stopped';
}

/** 沙盒生命周期管理 */
interface SandboxProvider {
  /** Provider 类型标识，如 "local", "daytona" */
  readonly type: string;
  /** 创建沙盒实例 */
  create(options: SandboxCreateOptions): Promise<SandboxBackend>;
  /** 销毁指定沙盒 */
  destroy(sandboxId: string): Promise<void>;
  /** 列举当前活跃的沙盒（可选） */
  list?(): Promise<SandboxInfo[]>;
}
```

### SandboxConfig

```typescript
/** 沙盒配置 */
interface SandboxConfig {
  /** 是否启用沙盒 */
  enabled: boolean;
  /** Provider 类型 */
  provider: string;
  /** 安全策略 */
  policy: SandboxPolicy;
  /** Provider 特有配置 */
  providerOptions: Record<string, unknown>;
}
```

---

## 目录结构

```
src/sandbox/
├── index.ts                        # 模块导出
├── types.ts                        # 接口定义（SandboxBackend, SandboxProvider, SandboxPolicy 等）
├── sandbox-manager.ts              # SandboxManager — 懒初始化 + 生命周期管理
├── sandbox-config.ts               # 配置加载、合并、验证（Zod Schema）
├── provider-registry.ts            # SandboxProviderRegistry — 注册表
└── providers/
    └── local/
        ├── index.ts                # LocalSandboxProvider
        ├── local-backend.ts        # LocalSandboxBackend（持有 BashSession）
        └── platforms/
            ├── index.ts            # getPlatformAdapter()
            ├── platform-adapter.ts # PlatformAdapter 接口
            ├── macos-adapter.ts    # MacOSAdapter（sandbox-exec）
            └── linux-adapter.ts    # LinuxAdapter（bwrap/unshare）
```

配置文件位置：

```
~/.synapse/
└── sandbox.json                    # 用户自定义沙盒配置
```

---

## 组件架构

### 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                        BashTool                               │
│  execute(command) → BashRouter.route(command)                 │
│  检测 blocked → 返回 sandbox_blocked 标记                      │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│                      BashRouter                               │
│  Agent Shell Command (read/write/edit) → 原有 Handler         │
│  Extension Command (mcp/skill)        → 原有 Handler         │
│  Native Command                       → SandboxManager       │
└──────────────────────┬───────────────────────────────────────┘
                       ↓ （仅原生命令）
┌──────────────────────────────────────────────────────────────┐
│                   SandboxManager                              │
│  - 懒初始化 SandboxBackend                                    │
│  - 管理运行时白名单（用户授权）                                  │
│  - 沙盒崩溃自动重建                                            │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│              SandboxProviderRegistry                          │
│  "local" → LocalSandboxProvider                              │
│  "daytona" → DaytonaSandboxProvider（未来扩展）                │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│               LocalSandboxProvider                            │
│  create(options) → LocalSandboxBackend                       │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│              LocalSandboxBackend                              │
│  - 内部持有 BashSession（持久 Bash 进程）                      │
│  - 通过 PlatformAdapter 生成沙盒化启动命令                     │
│  execute(cmd) → BashSession.execute(cmd)                     │
│  → PlatformAdapter.isViolation(result) 检测拦截               │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
              ┌────────┴────────┐
              │ 检测当前平台      │
              └────────┬────────┘
           ┌───────────┼───────────┐
           ↓                       ↓
┌──────────────────┐   ┌──────────────────┐
│  MacOSAdapter    │   │  LinuxAdapter    │
│  sandbox-exec    │   │  bwrap/unshare   │
│  .sb profile     │   │  --unshare-net   │
└──────────────────┘   └──────────────────┘
```

### 安全层串联

```
命令进入 BashTool
  ↓
RestrictedBashTool（SubAgent 场景）
  → 命令字符串级黑名单检查
  → 不通过 → 直接返回 ToolError
  ↓ 通过
BashRouter → SandboxManager → SandboxBackend
  → OS 级资源访问控制（sandbox-exec / bwrap）
  → 不通过 → 返回 blocked，中断 Agent 循环
  ↓ 通过
命令在沙盒内执行，返回结果
```

---

## 核心组件实现

### SandboxManager

```typescript
// src/sandbox/sandbox-manager.ts

import { createLogger } from '../utils/logger.ts';
import { SandboxProviderRegistry } from './provider-registry.ts';
import type {
  SandboxBackend,
  SandboxConfig,
  SandboxPolicy,
  SandboxCreateOptions,
} from './types.ts';

const logger = createLogger('sandbox-manager');

export class SandboxManager {
  private provider: SandboxProvider;
  private activeSandbox: SandboxBackend | null = null;
  private config: SandboxConfig;
  /** 运行时白名单（用户会话级授权） */
  private runtimeWhitelist: string[] = [];

  constructor(config: SandboxConfig) {
    this.config = config;
    this.provider = SandboxProviderRegistry.get(config.provider);
  }

  /**
   * 获取或创建沙盒实例（懒初始化）
   * 沙盒禁用时返回无沙盒 backend；创建失败直接抛异常
   */
  async getSandbox(cwd: string): Promise<SandboxBackend> {
    if (!this.config.enabled) {
      return this.createUnsandboxedBackend(cwd);
    }

    if (!this.activeSandbox) {
      const policy = this.buildPolicy(cwd);
      logger.info('Creating sandbox', { provider: this.config.provider, cwd });
      // 失败直接抛出，不降级
      this.activeSandbox = await this.provider.create({ cwd, policy });
    }

    return this.activeSandbox;
  }

  /**
   * 添加运行时白名单（用户会话级授权）
   * 触发沙盒重建以应用新策略
   */
  async addRuntimeWhitelist(path: string, cwd: string): Promise<void> {
    this.runtimeWhitelist.push(path);
    // 重建沙盒以应用新的白名单
    await this.rebuildSandbox(cwd);
  }

  /** 关闭沙盒 */
  async shutdown(): Promise<void> {
    if (this.activeSandbox) {
      await this.provider.destroy(this.activeSandbox.id);
      this.activeSandbox = null;
    }
  }

  /**
   * 重建沙盒（崩溃恢复或策略变更时调用）
   * 保留运行时授权
   */
  private async rebuildSandbox(cwd: string): Promise<void> {
    if (this.activeSandbox) {
      await this.activeSandbox.dispose();
      this.activeSandbox = null;
    }
    const policy = this.buildPolicy(cwd);
    this.activeSandbox = await this.provider.create({ cwd, policy });
  }

  /**
   * 构建安全策略（合并默认 + 用户配置 + 运行时授权）
   */
  private buildPolicy(cwd: string): SandboxPolicy {
    const { filesystem, network } = this.config.policy;

    return {
      filesystem: {
        whitelist: this.expandPaths([
          cwd,
          ...filesystem.whitelist,
          ...this.runtimeWhitelist,
          process.env.TMPDIR || '/tmp',
        ]),
        blacklist: this.expandPaths(filesystem.blacklist),
      },
      network: {
        allowNetwork: false, // 始终禁止
      },
    };
  }

  /** 展开路径中的 ~ 和环境变量 */
  private expandPaths(paths: string[]): string[] {
    return paths.map(p => {
      let expanded = p;
      if (expanded.startsWith('~')) {
        expanded = expanded.replace('~', process.env.HOME || '');
      }
      expanded = expanded.replace(/\$(\w+)/g, (_, name) => process.env[name] || '');
      return expanded;
    });
  }

  /** 创建无沙盒的 backend（沙盒禁用时使用） */
  private createUnsandboxedBackend(cwd: string): SandboxBackend {
    logger.warn('Sandbox is disabled, executing without isolation');
    // 返回一个不包裹沙盒的 backend，直接使用裸 BashSession
    // 具体实现由 LocalSandboxProvider 提供
  }
}
```

### SandboxProviderRegistry

```typescript
// src/sandbox/provider-registry.ts

import type { SandboxProvider } from './types.ts';

/** Provider 工厂注册表 */
export class SandboxProviderRegistry {
  private static providers = new Map<string, () => SandboxProvider>();

  /** 注册 Provider 工厂 */
  static register(type: string, factory: () => SandboxProvider): void {
    this.providers.set(type, factory);
  }

  /** 按类型获取 Provider 实例 */
  static get(type: string): SandboxProvider {
    const factory = this.providers.get(type);
    if (!factory) {
      throw new Error(`Unknown sandbox provider: "${type}". Available: [${[...this.providers.keys()].join(', ')}]`);
    }
    return factory();
  }

  /** 获取所有已注册的 Provider 类型 */
  static listTypes(): string[] {
    return [...this.providers.keys()];
  }
}

// 内置注册
SandboxProviderRegistry.register('local', () => new LocalSandboxProvider());
```

### LocalSandboxProvider

```typescript
// src/sandbox/providers/local/index.ts

import type {
  SandboxBackend,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxProvider,
} from '../../types.ts';
import { LocalSandboxBackend } from './local-backend.ts';
import { getPlatformAdapter } from './platforms/index.ts';

export class LocalSandboxProvider implements SandboxProvider {
  readonly type = 'local';
  private activeBackends = new Map<string, LocalSandboxBackend>();

  async create(options: SandboxCreateOptions): Promise<SandboxBackend> {
    const platform = getPlatformAdapter();
    const backend = new LocalSandboxBackend(options, platform);
    await backend.start();
    this.activeBackends.set(backend.id, backend);
    return backend;
  }

  async destroy(sandboxId: string): Promise<void> {
    const backend = this.activeBackends.get(sandboxId);
    if (backend) {
      await backend.dispose();
      this.activeBackends.delete(sandboxId);
    }
  }

  async list(): Promise<SandboxInfo[]> {
    return [...this.activeBackends.entries()].map(([id]) => ({
      id,
      status: 'running' as const,
    }));
  }
}
```

### LocalSandboxBackend

```typescript
// src/sandbox/providers/local/local-backend.ts

import { BashSession } from '../../../tools/bash-session.ts';
import { createLogger } from '../../../utils/logger.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxCreateOptions,
} from '../../types.ts';
import type { PlatformAdapter } from './platforms/platform-adapter.ts';

const logger = createLogger('local-sandbox');

export class LocalSandboxBackend implements SandboxBackend {
  readonly id: string;
  private session!: BashSession;
  private platform: PlatformAdapter;
  private options: SandboxCreateOptions;

  constructor(options: SandboxCreateOptions, platform: PlatformAdapter) {
    this.id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.platform = platform;
    this.options = options;
  }

  /** 启动沙盒化的 BashSession */
  async start(): Promise<void> {
    const shellCommand = this.platform.wrapCommand(this.options.policy);
    logger.info('Starting sandboxed bash session', { shellCommand });

    // BashSession 支持自定义 shellCommand 参数
    this.session = new BashSession({ shellCommand });
  }

  async execute(command: string): Promise<ExecuteResult> {
    const result = await this.session.execute(command);

    const blocked = this.platform.isViolation(result);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      blocked,
      blockedReason: blocked ? this.platform.extractViolationReason(result) : undefined,
      blockedResource: blocked ? this.platform.extractBlockedResource(result) : undefined,
    };
  }

  async dispose(): Promise<void> {
    await this.session.kill();
    await this.platform.cleanup();
    logger.info('Sandbox disposed', { id: this.id });
  }
}
```

### PlatformAdapter 接口

```typescript
// src/sandbox/providers/local/platforms/platform-adapter.ts

import type { SandboxPolicy, CommandResult } from '../../../types.ts';

/** 平台适配器接口 — 将通用策略翻译为平台特定的沙盒机制 */
export interface PlatformAdapter {
  /** 生成沙盒化的 shell 启动命令 */
  wrapCommand(policy: SandboxPolicy): string;
  /** 判断执行结果是否为沙盒违规 */
  isViolation(result: CommandResult): boolean;
  /** 提取违规原因 */
  extractViolationReason(result: CommandResult): string | undefined;
  /** 提取被拦截的资源路径 */
  extractBlockedResource(result: CommandResult): string | undefined;
  /** 清理临时资源（如 .sb profile 文件） */
  cleanup(): Promise<void>;
}
```

### getPlatformAdapter

```typescript
// src/sandbox/providers/local/platforms/index.ts

import type { PlatformAdapter } from './platform-adapter.ts';
import { MacOSAdapter } from './macos-adapter.ts';
import { LinuxAdapter } from './linux-adapter.ts';

export function getPlatformAdapter(): PlatformAdapter {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return new MacOSAdapter();
    case 'linux':
      return new LinuxAdapter();
    default:
      throw new Error(`Sandbox not supported on platform: ${platform}`);
  }
}
```

### MacOSAdapter

```typescript
// src/sandbox/providers/local/platforms/macos-adapter.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../../../../utils/logger.ts';
import type { SandboxPolicy, CommandResult } from '../../../types.ts';
import type { PlatformAdapter } from './platform-adapter.ts';

const logger = createLogger('macos-sandbox');

export class MacOSAdapter implements PlatformAdapter {
  private profilePath?: string;

  wrapCommand(policy: SandboxPolicy): string {
    const profile = this.generateSbProfile(policy);
    // 同步写入临时文件（在启动阶段，可接受同步）
    this.profilePath = this.writeProfileSync(profile);
    return `sandbox-exec -f ${this.profilePath} /bin/bash`;
  }

  isViolation(result: CommandResult): boolean {
    const stderr = result.stderr || '';
    return stderr.includes('sandbox') || stderr.includes('deny');
  }

  extractViolationReason(result: CommandResult): string | undefined {
    const stderr = result.stderr || '';
    const match = stderr.match(/deny\s+(\S+)/);
    return match ? match[1] : 'Access denied by sandbox';
  }

  extractBlockedResource(result: CommandResult): string | undefined {
    const stderr = result.stderr || '';
    // 尝试从 sandbox 错误信息中提取路径
    const match = stderr.match(/path\s+"([^"]+)"/);
    return match ? match[1] : undefined;
  }

  async cleanup(): Promise<void> {
    if (this.profilePath) {
      try {
        await fs.unlink(this.profilePath);
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 生成 sandbox-exec .sb profile
   */
  private generateSbProfile(policy: SandboxPolicy): string {
    const { filesystem } = policy;

    const whitelistRules = filesystem.whitelist
      .map(p => `(subpath "${p}")`)
      .join('\n            ');

    const blacklistRules = filesystem.blacklist
      .filter(p => !p.includes('*')) // 精确路径
      .map(p => `(subpath "${p}")`)
      .join('\n            ');

    // glob 模式黑名单转为 regex
    const globBlacklistRules = filesystem.blacklist
      .filter(p => p.includes('*'))
      .map(p => {
        const regex = p
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\./g, '\\.');
        return `(regex #"${regex}")`;
      })
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
    ${globBlacklistRules}
)

; 禁止网络访问
(deny network*)

; 允许 IPC（进程间通信）
(allow ipc-posix-shm*)
(allow mach-lookup)
`;
  }

  private writeProfileSync(profile: string): string {
    const profilePath = path.join(os.tmpdir(), `synapse-sandbox-${Date.now()}.sb`);
    require('fs').writeFileSync(profilePath, profile);
    return profilePath;
  }
}
```

### LinuxAdapter

```typescript
// src/sandbox/providers/local/platforms/linux-adapter.ts

import { createLogger } from '../../../../utils/logger.ts';
import type { SandboxPolicy, CommandResult } from '../../../types.ts';
import type { PlatformAdapter } from './platform-adapter.ts';

const logger = createLogger('linux-sandbox');

export class LinuxAdapter implements PlatformAdapter {
  private hasBwrap: boolean | null = null;

  wrapCommand(policy: SandboxPolicy): string {
    // 同步检测 bwrap 可用性
    this.hasBwrap = this.checkBwrapSync();

    if (this.hasBwrap) {
      return this.buildBwrapCommand(policy);
    } else {
      // unshare fallback（仅网络隔离，无文件系统隔离）
      logger.warn('bwrap not available, using unshare (network isolation only)');
      return 'unshare --net /bin/bash';
    }
  }

  isViolation(result: CommandResult): boolean {
    const stderr = result.stderr || '';
    return stderr.includes('Permission denied') || stderr.includes('Operation not permitted');
  }

  extractViolationReason(result: CommandResult): string | undefined {
    const stderr = result.stderr || '';
    if (stderr.includes('Permission denied')) return 'Permission denied';
    if (stderr.includes('Operation not permitted')) return 'Operation not permitted';
    return undefined;
  }

  extractBlockedResource(result: CommandResult): string | undefined {
    const stderr = result.stderr || '';
    // 尝试从错误信息中提取路径
    const match = stderr.match(/'([^']+)':\s*Permission denied/);
    return match ? match[1] : undefined;
  }

  async cleanup(): Promise<void> {
    // Linux 适配器无需清理临时文件
  }

  private buildBwrapCommand(policy: SandboxPolicy): string {
    const { filesystem } = policy;
    const args: string[] = [
      'bwrap',
      '--unshare-net',       // 禁止网络
      '--die-with-parent',   // 父进程退出时终止
      '--new-session',       // 新会话
    ];

    // 绑定只读系统目录
    const readonlyDirs = ['/usr', '/bin', '/lib', '/lib64', '/etc'];
    for (const dir of readonlyDirs) {
      args.push('--ro-bind', dir, dir);
    }

    // 绑定白名单目录（读写）
    for (const dir of filesystem.whitelist) {
      if (!dir.includes('*')) { // bwrap 不支持 glob
        args.push('--bind', dir, dir);
      }
    }

    args.push('/bin/bash');
    return args.join(' ');
  }

  private checkBwrapSync(): boolean {
    try {
      require('child_process').execSync('which bwrap', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## BashTool / BashRouter 集成

### BashTool 改造

```typescript
// src/tools/bash-tool.ts（修改部分）

import { SandboxManager } from '../sandbox/sandbox-manager.ts';
import { loadSandboxConfig } from '../sandbox/sandbox-config.ts';

export class BashTool extends CallableTool<BashToolParams> {
  private sandboxManager: SandboxManager;
  private router: BashRouter;

  constructor(options: BashToolOptions = {}) {
    super();
    const sandboxConfig = loadSandboxConfig();
    this.sandboxManager = new SandboxManager(sandboxConfig);
    // BashRouter 接收 SandboxManager 而非 BashSession
    this.router = new BashRouter({
      sandboxManager: this.sandboxManager,
      ...options,
    });
  }

  protected execute(params: BashToolParams): CancelablePromise<ToolReturnValue> {
    const result = await this.router.route(params.command, params.restart);

    // 检测沙盒拦截，通知 AgentRunner 中断循环
    if (result.blocked) {
      return ToolResult({
        type: 'sandbox_blocked',
        message: result.blockedReason,
        resource: result.blockedResource,
      });
    }

    return ToolResult({ /* 正常结果 */ });
  }

  async dispose(): Promise<void> {
    await this.sandboxManager.shutdown();
  }
}
```

### BashRouter 改造

```typescript
// src/tools/bash-router.ts（修改部分）

export class BashRouter {
  private sandboxManager: SandboxManager;

  // Agent Shell Command / Extension Command 路由不变
  // 仅原生命令路由走沙盒

  private async routeToNative(command: string): CancelablePromise<CommandResult> {
    // 原来: this.session.execute(command)
    // 现在: 通过沙盒执行
    const sandbox = await this.sandboxManager.getSandbox(this.cwd);
    return sandbox.execute(command);
  }
}
```

### BashSession 改造

```typescript
// src/tools/bash-session.ts（仅修改 start 方法）

export class BashSession {
  private shellCommand: string;

  constructor(options?: { shellCommand?: string }) {
    // 支持自定义 shell 启动命令，默认为裸 /bin/bash
    this.shellCommand = options?.shellCommand || '/bin/bash';
  }

  private start(): void {
    // 解析 shellCommand 为命令和参数
    const [cmd, ...args] = this.shellCommand.split(' ');

    this.process = spawn(cmd, [...args, '--norc', '--noprofile'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  }

  // 其余方法不变：execute(), kill(), 超时检测, 标记检测等
}
```

### AgentRunner 拦截处理

```typescript
// src/agent/agent-runner.ts（修改部分）

async step(): Promise<StepResult> {
  const toolResult = await tool.call(args);

  // 检测沙盒拦截
  if (toolResult.type === 'sandbox_blocked') {
    return {
      status: 'requires_permission',
      permission: {
        type: 'sandbox_access',
        resource: toolResult.resource,
        reason: toolResult.message,
        // 用户可选操作
        options: [
          'allow_once',     // 允许本次（沙盒外执行此命令）
          'allow_session',  // 允许本会话（运行时白名单追加，重建沙盒）
          'allow_permanent', // 永久加入白名单（写入 sandbox.json）
          'deny',           // 拒绝（将拒绝信息返回给 Agent）
        ],
      },
    };
  }

  // 继续正常循环
}
```

---

## 配置文件

### sandbox.json 示例

```json
{
  "enabled": true,
  "provider": "local",
  "policy": {
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
  },
  "providerOptions": {}
}
```

### 默认配置

```typescript
const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  provider: 'local',
  policy: {
    filesystem: {
      whitelist: [],   // cwd 运行时动态添加
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
    },
    network: {
      allowNetwork: false,
    },
  },
  providerOptions: {},
};
```

### 配置合并规则

- `enabled`: 用户配置覆盖默认
- `provider`: 用户配置覆盖默认
- `whitelist`: 用户配置追加到默认列表
- `blacklist`: 用户配置追加到默认列表，**默认黑名单不可被移除**
- `network.allowNetwork`: **始终为 false**，不可配置

---

## 执行流程

### 命令执行全流程

```
Agent 调用 Bash(command="npm test")
  ↓
BashTool.execute()
  ↓
BashRouter.route("npm test")
  ↓ 匹配不到 Agent/Extension Handler → 走原生命令
NativeCommandHandler
  ↓
SandboxManager.getSandbox(cwd)
  ↓ 首次调用触发懒初始化
SandboxProviderRegistry.get("local")
  → LocalSandboxProvider.create({ cwd, policy })
    → getPlatformAdapter()  // darwin → MacOSAdapter
    → MacOSAdapter.wrapCommand(policy)
      → 生成 .sb profile → 写入 /tmp/synapse-sandbox-xxx.sb
      → 返回 "sandbox-exec -f /tmp/xxx.sb /bin/bash"
    → new BashSession({ shellCommand: "sandbox-exec -f ... /bin/bash" })
    → 返回 LocalSandboxBackend
  ↓
LocalSandboxBackend.execute("npm test")
  → BashSession.execute("npm test")  // 在沙盒化的持久 bash 内执行
  → 检测违规: platform.isViolation(result)
  ↓
返回 ExecuteResult { stdout, stderr, exitCode, blocked, blockedReason }
```

### 沙盒禁用时的流程

```
SandboxConfig.enabled === false
  ↓
SandboxManager.getSandbox()
  → 创建无沙盒的 LocalSandboxBackend
    → BashSession({ shellCommand: "/bin/bash" })  // 无包裹
```

### 命令被拦截时的流程

```
Agent 执行 cat ~/.ssh/id_rsa
  ↓
LocalSandboxBackend.execute("cat ~/.ssh/id_rsa")
  → BashSession 在沙盒内执行
  → sandbox-exec 拦截文件访问，返回 Permission denied
  → MacOSAdapter.isViolation() → true
  ↓
BashTool 检测 blocked === true
  → 返回 sandbox_blocked 标记
  ↓
AgentRunner 中断循环
  → 向用户展示: "命令尝试访问 ~/.ssh/id_rsa（被沙盒策略禁止）"
  ↓
用户选择:
  ├── 允许本次 → 临时在沙盒外执行此命令，继续循环
  ├── 允许本会话 → SandboxManager.addRuntimeWhitelist("~/.ssh")
  │                → 重建沙盒，重试命令
  ├── 永久加入白名单 → 写入 sandbox.json，重建沙盒，重试命令
  └── 拒绝 → 将拒绝信息返回给 Agent，继续循环
```

---

## 错误处理

| 场景 | 行为 |
|------|------|
| 沙盒创建失败（如 sandbox-exec 不可用） | **抛异常终止启动**，不降级 |
| 命令被沙盒拦截（如访问 ~/.ssh） | **中断 Agent 循环，向用户申请授权** |
| 命令超时 | BashSession 现有超时机制不变，沙盒层透传 |
| 沙盒进程意外退出 | 自动重建沙盒实例（重新调用 Provider.create） |
| 不支持的平台（如 Windows） | **抛异常终止启动** |
| 配置文件格式错误 | 日志 warn，使用默认配置 |

---

## 状态行为

### 状态生命周期

```
BashTool 创建
  ↓
首次 route 到原生命令 → SandboxManager 懒初始化 → SandboxBackend 实例化
  ↓
后续原生命令复用同一 SandboxBackend → 持久进程内 cd/export 保持
  ↓
沙盒进程崩溃 → 自动重建 → 新持久进程，cd/export 状态重置
  ↓
BashTool.dispose() → SandboxManager.shutdown() → 清理所有资源
```

### 状态规则

| 状态 | 行为 |
|------|------|
| cwd（工作目录） | 持久进程内 cd 生效，沙盒重建后重置为初始 cwd |
| 环境变量 | 持久进程内 export 生效，重建后丢失 |
| .sb profile 文件 | 沙盒创建时写入 /tmp，dispose 时清理 |
| 用户会话级白名单 | 存在 SandboxManager 内存中，进程退出丢失 |
| 永久白名单 | 写入 sandbox.json，跨会话持久 |

---

## BashSession 改造范围

**仅修改 `start()` 方法中的 spawn 参数**，其余方法不变：

- `execute()` — 不变
- `kill()` — 不变
- 超时检测 — 不变
- 标记检测（`___SYNAPSE_COMMAND_END___`）— 不变
- 重启逻辑 — 不变

改造内容：`constructor` 接收可选 `shellCommand` 参数，`start()` 解析为 spawn 的命令和参数。

---

## 安全层关系

系统中存在两个独立的安全层，串联执行：

| 层次 | 机制 | 检查对象 | 使用场景 |
|------|------|----------|----------|
| `RestrictedBashTool` | 命令字符串黑名单匹配 | 命令文本 | SubAgent 权限控制 |
| `SandboxBackend` | OS 级资源访问控制 | 文件系统/网络 | 所有原生命令 |

执行顺序：`RestrictedBashTool 字符串检查 → SandboxBackend OS 级检查`

---

## 测试策略

### 单元测试

| 测试目标 | 测试内容 |
|----------|----------|
| SandboxConfig | 默认配置正确；用户配置合并；黑名单不可覆盖；路径展开 |
| SandboxProviderRegistry | 注册/查找；未注册 provider 抛异常 |
| SandboxManager | 懒初始化；disabled 时无沙盒；创建失败抛异常；会话级白名单合并；重建保留授权 |
| LocalSandboxProvider | create/destroy 生命周期 |
| MacOSAdapter | .sb profile 生成；glob 转 regex；违规检测 |
| LinuxAdapter | bwrap 参数构建；unshare fallback；违规检测 |

### 集成测试（按平台条件执行）

| 测试目标 | 测试内容 |
|----------|----------|
| 文件系统隔离 | 白名单可读写；黑名单被拒绝；黑名单优先于白名单 |
| 网络隔离 | curl/ping 被禁止 |
| 持久进程状态 | cd/export 后续命令生效 |
| 沙盒重建 | 进程崩溃后自动重建 |
| 用户授权流程 | 拦截 → blocked 返回 → 授权后重试 |

### Mock 策略

- 单元测试用 MockPlatformAdapter / MockSandboxBackend
- BashTool/BashRouter 测试注入 Mock，验证集成逻辑
- 集成测试标记 `platform: darwin` / `platform: linux`，按平台条件执行

---

## 边界情况

| 情况 | 处理 |
|------|------|
| 路径含 ~ 或环境变量 | buildPolicy() 展开为绝对路径 |
| 白名单路径不存在 | 忽略，不报错 |
| 白名单内包含黑名单路径 | 黑名单优先，始终禁止 |
| 用户会话级授权后沙盒重建 | 合并运行时白名单 |
| BashTool.createIsolatedCopy() | 创建新的 SandboxManager + 独立沙盒实例 |
| 沙盒内命令 spawn 子进程 | 子进程继承沙盒约束 |
| Linux glob 黑名单 | bwrap 不支持 glob，需运行时扫描预展开 |

---

## 扩展指南

### 接入新的 Provider（如云端沙盒）

1. 创建 `src/sandbox/providers/<name>/` 目录
2. 实现 `SandboxProvider` 接口（create/destroy）
3. 实现 `SandboxBackend` 接口（execute/dispose）
4. 在 `provider-registry.ts` 中注册
5. 在 `sandbox.json` 中配置 `"provider": "<name>"`

云端沙盒示例（如 Daytona）：

```typescript
class DaytonaSandboxBackend implements SandboxBackend {
  readonly id: string;

  constructor(private sandbox: DaytonaSDK.Sandbox) {
    this.id = sandbox.id;
  }

  async execute(command: string): Promise<ExecuteResult> {
    const result = await this.sandbox.process.exec(command);
    return {
      stdout: result.output,
      stderr: '',
      exitCode: result.exitCode,
      blocked: false,  // 云端沙盒天然隔离，不会有本地拦截
    };
  }

  async dispose(): Promise<void> {
    // 由 Provider.destroy() 管理
  }
}
```

---

## 与原设计文档的差异

| 项目 | 原设计 | v2 设计 |
|------|--------|---------|
| 抽象层次 | 直接实现，无抽象 | Provider + Backend 两层协议 |
| 沙盒与 BashSession | 沙盒包裹 BashSession | 沙盒替代 BashSession（代理模式） |
| 文件操作 | 纳入沙盒 | 不纳入，走现有 Handler |
| 错误处理 | 静默拒绝 | 中断循环，用户授权 |
| 可扩展性 | 仅支持本地 | Provider 注册表，支持云端扩展 |
| 配置方式 | SandboxConfig 直接加载 | 配置驱动 Provider 选择 |
