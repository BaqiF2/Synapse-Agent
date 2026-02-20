/**
 * 沙盒协议层核心类型定义与配置管理
 *
 * 提供沙盒系统的所有类型定义、Zod schema 验证、配置加载与合并逻辑。
 * F-010: sandbox-config.ts 合并到 types.ts。
 *
 * @module types
 *
 * Core Exports:
 * - ExecuteResult: 沙盒执行结果类型
 * - SandboxBackend: 沙盒实例接口
 * - SandboxPolicy: 通用安全策略
 * - SandboxCreateOptions: 创建沙盒参数
 * - SandboxInfo: 沙盒实例状态
 * - SandboxProvider: Provider 生命周期接口
 * - SandboxConfig: 顶层沙盒配置
 * - SandboxProviderFactory: Provider 工厂函数
 * - SandboxConfigSchema: Zod 配置验证 schema
 * - SandboxPolicySchema: Zod 策略验证 schema
 * - SandboxUserConfigSchema: 用户配置 schema（宽松校验）
 * - DEFAULT_SANDBOX_CONFIG: 默认沙盒配置
 * - DEFAULT_SANDBOX_CONFIG_PATH: 默认配置文件路径
 * - loadSandboxConfig: 加载并合并沙盒配置
 * - buildPolicy: 展开策略中的路径变量
 * - validateSandboxConfig: 验证配置合法性
 * - addPermanentWhitelist: 永久添加白名单路径
 * - getDefaultSandboxConfigPath: 获取默认配置路径
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { getSynapseHome } from '../config/paths.ts';
import { createLogger } from '../file-logger.ts';

const logger = createLogger('sandbox-config');

// ═══════════════════════════════════════════════════════════════════
// 核心类型定义
// ═══════════════════════════════════════════════════════════════════

/** 沙盒执行结果 */
export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  blocked: boolean;
  blockedReason?: string;
  blockedResource?: string;
}

/** 沙盒实例接口 */
export interface SandboxBackend {
  readonly id: string;
  execute(command: string): Promise<ExecuteResult>;
  dispose(): Promise<void>;
}

/** 通用安全策略 */
export interface SandboxPolicy {
  filesystem: {
    whitelist: string[];
    blacklist: string[];
  };
  network: {
    allowNetwork: boolean;
  };
}

/** 创建沙盒时的参数 */
export interface SandboxCreateOptions {
  cwd: string;
  policy: SandboxPolicy;
  providerOptions?: Record<string, unknown>;
}

/** 沙盒实例状态 */
export interface SandboxInfo {
  id: string;
  status: 'running' | 'stopped';
}

/** 沙盒 Provider 生命周期接口 */
export interface SandboxProvider {
  readonly type: string;
  create(options: SandboxCreateOptions): Promise<SandboxBackend>;
  destroy(sandboxId: string): Promise<void>;
  list?(): Promise<SandboxInfo[]>;
}

/** 顶层沙盒配置 */
export interface SandboxConfig {
  enabled: boolean;
  provider: string;
  policy: SandboxPolicy;
  providerOptions: Record<string, unknown>;
}

/** Provider 工厂函数 */
export type SandboxProviderFactory = () => SandboxProvider;

// ═══════════════════════════════════════════════════════════════════
// 配置管理（原 sandbox-config.ts）
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_BLACKLIST = [
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
];

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: false,
  provider: 'local',
  policy: {
    filesystem: {
      whitelist: [],
      blacklist: DEFAULT_BLACKLIST,
    },
    network: {
      allowNetwork: false,
    },
  },
  providerOptions: {},
};

export function getDefaultSandboxConfigPath(): string {
  return path.join(getSynapseHome(), 'sandbox.json');
}

export const DEFAULT_SANDBOX_CONFIG_PATH = getDefaultSandboxConfigPath();

const SandboxFilesystemSchema = z.object({
  whitelist: z.array(z.string()),
  blacklist: z.array(z.string()),
});

const SandboxNetworkSchema = z.object({
  allowNetwork: z.literal(false),
});

export const SandboxPolicySchema = z.object({
  filesystem: SandboxFilesystemSchema,
  network: SandboxNetworkSchema,
});

export const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().min(1),
  policy: SandboxPolicySchema,
  providerOptions: z.record(z.string(), z.unknown()),
});

const SandboxFilesystemPartialSchema = z.object({
  whitelist: z.array(z.string()).optional(),
  blacklist: z.array(z.string()).optional(),
});

const SandboxNetworkPartialSchema = z.object({
  allowNetwork: z.boolean().optional(),
});

export const SandboxUserConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().min(1).optional(),
  policy: z.object({
    filesystem: SandboxFilesystemPartialSchema.optional(),
    network: SandboxNetworkPartialSchema.optional(),
  }).optional(),
  providerOptions: z.record(z.string(), z.unknown()).optional(),
});

export type SandboxUserConfig = z.infer<typeof SandboxUserConfigSchema>;

export interface LoadSandboxConfigOptions {
  configPath?: string;
  userConfig?: unknown;
  runtimeConfig?: unknown;
}

export interface PersistWhitelistOptions {
  configPath?: string;
}

export interface BuildPolicyOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

function cloneDefaultConfig(): SandboxConfig {
  return {
    enabled: DEFAULT_SANDBOX_CONFIG.enabled,
    provider: DEFAULT_SANDBOX_CONFIG.provider,
    policy: {
      filesystem: {
        whitelist: [...DEFAULT_SANDBOX_CONFIG.policy.filesystem.whitelist],
        blacklist: [...DEFAULT_SANDBOX_CONFIG.policy.filesystem.blacklist],
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: { ...DEFAULT_SANDBOX_CONFIG.providerOptions },
  };
}

function appendUnique(base: string[], additions: readonly string[] = []): string[] {
  const merged = [...base];
  const seen = new Set(base);

  for (const item of additions) {
    if (seen.has(item)) {
      continue;
    }
    merged.push(item);
    seen.add(item);
  }

  return merged;
}

function parsePartialConfig(config: unknown, sourceLabel: string): SandboxUserConfig {
  if (config === null || config === undefined) {
    return {};
  }

  const parsed = SandboxUserConfigSchema.safeParse(config);
  if (parsed.success) {
    return parsed.data;
  }

  logger.warn(`Invalid sandbox config from ${sourceLabel}, ignored`, {
    issues: parsed.error.issues,
  });
  return {};
}

function readUserConfigFile(configPath: string): SandboxUserConfig {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return parsePartialConfig(parsed, `file:${configPath}`);
  } catch (error) {
    logger.warn('Failed to load sandbox config file, using defaults', {
      configPath,
      error,
    });
    return {};
  }
}

function mergeConfig(base: SandboxConfig, patch: SandboxUserConfig): SandboxConfig {
  return {
    enabled: patch.enabled ?? base.enabled,
    provider: patch.provider ?? base.provider,
    policy: {
      filesystem: {
        whitelist: appendUnique(
          base.policy.filesystem.whitelist,
          patch.policy?.filesystem?.whitelist ?? []
        ),
        blacklist: appendUnique(
          base.policy.filesystem.blacklist,
          patch.policy?.filesystem?.blacklist ?? []
        ),
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: {
      ...base.providerOptions,
      ...(patch.providerOptions ?? {}),
    },
  };
}

function expandPathToken(token: string, env: NodeJS.ProcessEnv, homeDir: string): string {
  let value = token;

  if (value === '~') {
    value = homeDir;
  } else if (value.startsWith('~/')) {
    value = path.join(homeDir, value.slice(2));
  }

  value = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (full, name: string) => {
    const envValue = env[name];
    return envValue ?? full;
  });

  return value;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export function validateSandboxConfig(config: unknown) {
  return SandboxConfigSchema.safeParse(config);
}

export function buildPolicy(policy: SandboxPolicy, options: BuildPolicyOptions = {}): SandboxPolicy {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? env.HOME ?? os.homedir();

  return {
    filesystem: {
      whitelist: dedupe(
        policy.filesystem.whitelist.map((item) => expandPathToken(item, env, homeDir))
      ),
      blacklist: dedupe(
        policy.filesystem.blacklist.map((item) => expandPathToken(item, env, homeDir))
      ),
    },
    network: {
      allowNetwork: false,
    },
  };
}

export function loadSandboxConfig(options: LoadSandboxConfigOptions = {}): SandboxConfig {
  const configPath = options.configPath ?? getDefaultSandboxConfigPath();
  const fileConfig = readUserConfigFile(configPath);
  const userConfig = parsePartialConfig(options.userConfig, 'userConfig');
  const runtimeConfig = parsePartialConfig(options.runtimeConfig, 'runtimeConfig');

  const merged = mergeConfig(
    mergeConfig(
      mergeConfig(cloneDefaultConfig(), fileConfig),
      userConfig
    ),
    runtimeConfig
  );

  const validation = validateSandboxConfig(merged);
  if (!validation.success) {
    logger.warn('Merged sandbox config is invalid, falling back to defaults', {
      issues: validation.error.issues,
    });
    return cloneDefaultConfig();
  }

  return validation.data;
}

export function addPermanentWhitelist(
  resourcePath: string,
  options: PersistWhitelistOptions = {}
): void {
  const configPath = options.configPath ?? getDefaultSandboxConfigPath();
  const fileConfig = readUserConfigFile(configPath);
  const merged = mergeConfig(cloneDefaultConfig(), fileConfig);
  if (!merged.policy.filesystem.whitelist.includes(resourcePath)) {
    merged.policy.filesystem.whitelist.push(resourcePath);
  }

  const payload = {
    enabled: merged.enabled,
    provider: merged.provider,
    policy: {
      filesystem: {
        whitelist: merged.policy.filesystem.whitelist,
        blacklist: merged.policy.filesystem.blacklist,
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: merged.providerOptions,
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
}
