/**
 * Bash 会话管理 — 重导出层
 *
 * BashSession 已迁移到 shared/ 模块（消除 shared→tools 跨层依赖）。
 * 本文件保留重导出以保持向后兼容，后续应直接从 shared/bash-session 导入。
 *
 * 核心导出：
 * - BashSession: Bash 会话管理类（重导出自 shared/bash-session）
 * - BashSessionOptions: 会话配置选项（重导出自 shared/bash-session）
 */

export { BashSession, type BashSessionOptions } from '../shared/bash-session.ts';
