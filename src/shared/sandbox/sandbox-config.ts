/**
 * Sandbox Config (re-export shim)
 * F-010: 实际实现已合并到 types.ts
 */
export {
  DEFAULT_SANDBOX_CONFIG,
  DEFAULT_SANDBOX_CONFIG_PATH,
  SandboxPolicySchema,
  SandboxConfigSchema,
  SandboxUserConfigSchema,
  type SandboxUserConfig,
  type LoadSandboxConfigOptions,
  type PersistWhitelistOptions,
  type BuildPolicyOptions,
  validateSandboxConfig,
  buildPolicy,
  loadSandboxConfig,
  addPermanentWhitelist,
  getDefaultSandboxConfigPath,
} from './types.ts';
