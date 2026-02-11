/**
 * 沙盒配置加载与合并
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { getSynapseHome } from '../config/paths.ts';
import { createLogger } from '../utils/logger.ts';
import type { SandboxConfig, SandboxPolicy } from './types.ts';

const logger = createLogger('sandbox-config');

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
  enabled: true,
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
