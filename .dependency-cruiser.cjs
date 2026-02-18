/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ===== 规则 1: core 模块不依赖其他业务模块 =====
    {
      name: 'no-core-import-cli',
      comment: 'core 模块不得依赖 cli 模块',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-core-import-tools',
      comment: 'core 模块不得依赖 tools 模块',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/tools/' },
    },
    {
      name: 'no-core-import-skills',
      comment: 'core 模块不得依赖 skills 模块',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/skills/' },
    },
    {
      name: 'no-core-import-sub-agents',
      comment: 'core 模块不得依赖 sub-agents 模块',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/sub-agents/' },
    },
    {
      name: 'no-core-import-providers',
      comment: 'core 模块不得依赖 providers 模块',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/providers/' },
    },
    {
      name: 'no-core-import-config',
      comment: 'core 模块不得依赖 config 模块',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/config/' },
    },

    // ===== 规则 2: providers 模块不依赖其他业务模块 =====
    {
      name: 'no-providers-import-cli',
      comment: 'providers 模块不得依赖 cli 模块',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-providers-import-tools',
      comment: 'providers 模块不得依赖 tools 模块',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/tools/' },
    },
    {
      name: 'no-providers-import-skills',
      comment: 'providers 模块不得依赖 skills 模块',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/skills/' },
    },
    {
      name: 'no-providers-import-sub-agents',
      comment: 'providers 模块不得依赖 sub-agents 模块',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/sub-agents/' },
    },
    {
      name: 'no-providers-import-core',
      comment: 'providers 模块不得依赖 core 模块',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/core/' },
    },
    {
      name: 'no-providers-import-config',
      comment: 'providers 模块不得依赖 config 模块',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/config/' },
    },

    // ===== 规则 3: config 模块不依赖其他业务模块 =====
    {
      name: 'no-config-import-cli',
      comment: 'config 模块不得依赖 cli 模块',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-config-import-tools',
      comment: 'config 模块不得依赖 tools 模块',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/tools/' },
    },
    {
      name: 'no-config-import-skills',
      comment: 'config 模块不得依赖 skills 模块',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/skills/' },
    },
    {
      name: 'no-config-import-sub-agents',
      comment: 'config 模块不得依赖 sub-agents 模块',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/sub-agents/' },
    },
    {
      name: 'no-config-import-core',
      comment: 'config 模块不得依赖 core 模块',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/core/' },
    },
    {
      name: 'no-config-import-providers',
      comment: 'config 模块不得依赖 providers 模块',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/config/../providers/' },
    },

    // ===== 规则 4: common 模块不依赖任何业务模块 =====
    {
      name: 'no-common-import-business',
      comment: 'common 模块不得依赖任何业务模块',
      severity: 'error',
      from: { path: '^src/common/' },
      to: { path: '^src/(core|providers|tools|skills|sub-agents|cli|config)/' },
    },

    // ===== 规则 5: tools 模块不依赖 cli/skills/sub-agents =====
    {
      name: 'no-tools-import-cli',
      comment: 'tools 模块不得依赖 cli 模块',
      severity: 'error',
      from: { path: '^src/tools/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-tools-import-skills',
      comment: 'tools 模块不得依赖 skills 模块',
      severity: 'error',
      from: { path: '^src/tools/' },
      to: { path: '^src/skills/' },
    },
    {
      name: 'no-tools-import-sub-agents',
      comment: 'tools 模块不得依赖 sub-agents 模块',
      severity: 'error',
      from: { path: '^src/tools/' },
      to: { path: '^src/sub-agents/' },
    },

    // ===== 规则 6: skills 模块不依赖 cli/sub-agents =====
    {
      name: 'no-skills-import-cli',
      comment: 'skills 模块不得依赖 cli 模块',
      severity: 'error',
      from: { path: '^src/skills/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-skills-import-sub-agents',
      comment: 'skills 模块不得依赖 sub-agents 模块',
      severity: 'error',
      from: { path: '^src/skills/' },
      to: { path: '^src/sub-agents/' },
    },

    // ===== 规则 7: sub-agents 不依赖 cli/skills =====
    {
      name: 'no-sub-agents-import-cli',
      comment: 'sub-agents 模块不得依赖 cli 模块',
      severity: 'error',
      from: { path: '^src/sub-agents/' },
      to: { path: '^src/cli/' },
    },
    {
      name: 'no-sub-agents-import-skills',
      comment: 'sub-agents 模块不得依赖 skills 模块',
      severity: 'error',
      from: { path: '^src/sub-agents/' },
      to: { path: '^src/skills/' },
    },

    // ===== 规则 8: 禁止循环依赖 =====
    {
      name: 'no-circular',
      comment: '禁止模块间循环依赖',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
    },
  },
};
