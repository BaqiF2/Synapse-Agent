/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 沙箱 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - 无（该文件不直接对外导出符号）。
 *
 * 作用说明：
 * - 作为内部实现模块，承载该目录的基础逻辑。
 */

export * from './types.ts';
export * from './sandbox-config.ts';
export * from './provider-registry.ts';
export * from './sandbox-manager.ts';
export * from './providers/daytona/index.ts';
export * from './providers/daytona/daytona-backend.ts';
export * from './providers/local/index.ts';
export * from './providers/local/local-backend.ts';
export * from './providers/local/platforms/platform-adapter.ts';
export * from './providers/local/platforms/index.ts';
