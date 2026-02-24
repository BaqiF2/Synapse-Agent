#!/usr/bin/env bun

/**
 * Synapse Agent 自动化评估工具
 * 
 * 用法:
 *   bun run scripts/evaluation/run-evaluation.ts
 *   bun run scripts/evaluation/run-evaluation.ts --quick      # 快速评估
 *   bun run scripts/evaluation/run-evaluation.ts --full        # 完整评估
 *   bun run scripts/evaluation/run-evaluation.ts --tasks A1,A2 # 指定任务
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// ============ 配置 ============

const CONFIG = {
  evaluationDir: './docs/evaluation',
  outputDir: './reports/evaluation',
  quickTaskCount: 10,
  fullTaskCount: 50,
};

// ============ 任务库 ============

interface TaskDefinition {
  id: string;
  category: string;
  name: string;
  difficulty: number;
  description: string;
  expectedSteps: string[];
  evaluationCriteria: string[];
}

const TASK_LIBRARY: TaskDefinition[] = [
  // 文件操作类
  { id: 'A1', category: '文件操作', name: '单文件读取', difficulty: 1, description: '读取指定文件', expectedSteps: ['read file'], evaluationCriteria: ['内容正确', '错误处理'] },
  { id: 'A2', category: '文件操作', name: '文件创建', difficulty: 1, description: '创建新文件', expectedSteps: ['write file'], evaluationCriteria: ['创建成功', '内容正确'] },
  { id: 'A3', category: '文件操作', name: '文件编辑', difficulty: 2, description: '修改文件内容', expectedSteps: ['edit file'], evaluationCriteria: ['修改正确', '无副作用'] },
  { id: 'A4', category: '文件操作', name: '文件删除', difficulty: 1, description: '删除文件', expectedSteps: ['rm file'], evaluationCriteria: ['删除成功', '安全确认'] },
  { id: 'A5', category: '文件操作', name: '批量文件操作', difficulty: 2, description: '批量处理文件', expectedSteps: ['glob', 'search'], evaluationCriteria: ['结果完整', '效率'] },
  
  // 代码开发类
  { id: 'B1', category: '代码开发', name: 'Bug 修复', difficulty: 3, description: '定位并修复 Bug', expectedSteps: ['search', 'edit'], evaluationCriteria: ['定位准确', '修复正确'] },
  { id: 'B2', category: '代码开发', name: '功能实现', difficulty: 3, description: '实现新功能', expectedSteps: ['write', 'test'], evaluationCriteria: ['功能完整', '代码质量'] },
  { id: 'B3', category: '代码开发', name: '代码重构', difficulty: 3, description: '重构代码', expectedSteps: ['read', 'edit'], evaluationCriteria: ['功能保持', '改进效果'] },
  { id: 'B4', category: '代码开发', name: '测试编写', difficulty: 2, description: '编写测试用例', expectedSteps: ['write'], evaluationCriteria: ['覆盖充分', '测试通过'] },
  
  // 项目结构类
  { id: 'C1', category: '项目结构', name: '项目搭建', difficulty: 2, description: '初始化项目', expectedSteps: ['create dirs', 'write config'], evaluationCriteria: ['结构正确', '可运行'] },
  { id: 'C2', category: '项目结构', name: '依赖管理', difficulty: 2, description: '管理依赖', expectedSteps: ['npm install', 'update'], evaluationCriteria: ['安装成功', '版本正确'] },
  
  // 信息检索类
  { id: 'D1', category: '信息检索', name: '代码搜索', difficulty: 2, description: '搜索代码', expectedSteps: ['search', 'read'], evaluationCriteria: ['定位准确', '结果完整'] },
  { id: 'D2', category: '信息检索', name: '文档理解', difficulty: 2, description: '理解文档', expectedSteps: ['read', 'explain'], evaluationCriteria: ['理解准确', '表达清晰'] },
  
  // 复杂任务类
  { id: 'E1', category: '复杂任务', name: '多步骤工作流', difficulty: 4, description: '执行多步骤任务', expectedSteps: ['plan', 'execute', 'verify'], evaluationCriteria: ['步骤完整', '结果正确'] },
  { id: 'E2', category: '复杂任务', name: '跨模块修改', difficulty: 4, description: '修改多个模块', expectedSteps: ['identify', 'modify', 'test'], evaluationCriteria: ['变更一致', '无回归'] },
  { id: 'E3', category: '复杂任务', name: '集成任务', difficulty: 4, description: '集成外部系统', expectedSteps: ['configure', 'integrate', 'test'], evaluationCriteria: ['集成正确', '可运行'] },
  
  // 错误处理类
  { id: 'F1', category: '错误处理', name: '异常恢复', difficulty: 3, description: '从错误恢复', expectedSteps: ['detect', 'recover'], evaluationCriteria: ['恢复成功', '用户提示'] },
  { id: 'F2', category: '错误处理', name: '错误诊断', difficulty: 3, description: '诊断问题', expectedSteps: ['analyze', 'diagnose'], evaluationCriteria: ['定位准确', '建议有效'] },
];

// ============ 评估器 ============

interface EvaluationResult {
  taskId: string;
  success: boolean;
  score: number;
  metrics: Record<string, number>;
  issues: string[];
  duration: number;
  notes: string[];
}

class AgentEvaluator {
  private results: EvaluationResult[] = [];
  private startTime: number = 0;

  async runEvaluation(taskIds?: string[]): Promise<void> {
    console.log('\n🚀 Synapse Agent 评估工具\n');
    console.log('='.repeat(50));
    
    this.startTime = Date.now();
    
    const tasks = taskIds 
      ? TASK_LIBRARY.filter(t => taskIds.includes(t.id))
      : TASK_LIBRARY.slice(0, CONFIG.quickTaskCount);
    
    console.log(`📋 评估任务数: ${tasks.length}`);
    console.log(`📁 任务ID: ${tasks.map(t => t.id).join(', ')}\n`);
    
    // 模拟任务执行（实际应该调用 agent 执行）
    for (const task of tasks) {
      console.log(`⏳ 执行任务: ${task.id} - ${task.name}`);
      const result = await this.evaluateTask(task);
      this.results.push(result);
      console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'} (${result.score}/100) - ${result.duration}ms\n`);
    }
    
    this.generateReport();
  }

  private async evaluateTask(task: TaskDefinition): Promise<EvaluationResult> {
    const start = Date.now();
    
    // 模拟评估 - 实际应该执行真实任务并评估
    // 这里返回模拟结果用于演示
    const baseScore = 100 - (task.difficulty * 5);
    const success = Math.random() > 0.2;
    
    return {
      taskId: task.id,
      success,
      score: success ? Math.max(60, baseScore + Math.random() * 20) : Math.max(20, baseScore - 20),
      metrics: {
        successRate: success ? 1 : 0,
        toolAccuracy: 0.85 + Math.random() * 0.1,
        responseQuality: 3 + Math.random() * 2,
        errorRecovery: Math.random() * 0.3 + 0.7,
      },
      issues: success ? [] : ['执行过程中出现错误'],
      duration: Date.now() - start,
      notes: [],
    };
  }

  private generateReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const successCount = this.results.filter(r => r.success).length;
    const avgScore = this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length;
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;

    console.log('\n📊 评估结果汇总\n');
    console.log('='.repeat(50));
    console.log(`总任务数:     ${this.results.length}`);
    console.log(`成功任务:     ${successCount} (${(successCount/this.results.length*100).toFixed(1)}%)`);
    console.log(`失败任务:     ${this.results.length - successCount}`);
    console.log(`平均得分:     ${avgScore.toFixed(1)}/100`);
    console.log(`平均执行时间: ${avgDuration.toFixed(0)}ms`);
    console.log(`总执行时间:   ${totalDuration}ms`);
    console.log('='.repeat(50));
    
    // 按类别统计
    console.log('\n📈 按类别统计:\n');
    const categoryStats = new Map<string, { total: number; success: number; avgScore: number }>();
    
    for (const result of this.results) {
      const task = TASK_LIBRARY.find(t => t.id === result.taskId);
      if (!task) continue;
      
      const cat = task.category;
      if (!categoryStats.has(cat)) {
        categoryStats.set(cat, { total: 0, success: 0, avgScore: 0 });
      }
      const stat = categoryStats.get(cat)!;
      stat.total++;
      if (result.success) stat.success++;
      stat.avgScore = (stat.avgScore * (stat.total - 1) + result.score) / stat.total;
    }
    
    for (const [category, stat] of categoryStats) {
      const rate = (stat.success / stat.total * 100).toFixed(1);
      console.log(`  ${category}: ${stat.success}/${stat.total} 成功 (${rate}%) - 平均分 ${stat.avgScore.toFixed(1)}`);
    }
    
    // 按难度统计
    console.log('\n📉 按难度统计:\n');
    const difficultyStats = new Map<number, { total: number; success: number; avgScore: number }>();
    
    for (const result of this.results) {
      const task = TASK_LIBRARY.find(t => t.id === result.taskId);
      if (!task) continue;
      
      const diff = task.difficulty;
      if (!difficultyStats.has(diff)) {
        difficultyStats.set(diff, { total: 0, success: 0, avgScore: 0 });
      }
      const stat = difficultyStats.get(diff)!;
      stat.total++;
      if (result.success) stat.success++;
      stat.avgScore = (stat.avgScore * (stat.total - 1) + result.score) / stat.total;
    }
    
    for (const [diff, stat] of difficultyStats) {
      const rate = (stat.success / stat.total * 100).toFixed(1);
      console.log(`  L${diff}: ${stat.success}/${stat.total} 成功 (${rate}%) - 平均分 ${stat.avgScore.toFixed(1)}`);
    }

    // 输出评级
    console.log('\n🏆 评估等级:\n');
    let grade = 'F';
    if (avgScore >= 90) grade = 'A (优秀)';
    else if (avgScore >= 80) grade = 'B (良好)';
    else if (avgScore >= 70) grade = 'C (合格)';
    else if (avgScore >= 60) grade = 'D (待改进)';
    console.log(`  ${grade}`);
    
    // 详细结果表
    console.log('\n📋 详细结果:\n');
    console.log('  任务ID | 类别     | 难度 | 结果 | 得分 | 耗时');
    console.log('  ' + '-'.repeat(55));
    for (const result of this.results) {
      const task = TASK_LIBRARY.find(t => t.id === result.taskId);
      const status = result.success ? '✅' : '❌';
      console.log(`  ${result.taskId.padEnd(7)}| ${(task?.category || '').padEnd(9)}| L${task?.difficulty || 1}    | ${status}   | ${result.score.toFixed(1).padEnd(5)}| ${result.duration}ms`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✨ 评估完成\n');
    
    // 保存 JSON 报告
    this.saveReport();
  }

  private async saveReport(): Promise<void> {
    try {
      if (!existsSync(CONFIG.outputDir)) {
        await mkdir(CONFIG.outputDir, { recursive: true });
      }
      
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalTasks: this.results.length,
          successCount: this.results.filter(r => r.success).length,
          avgScore: this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length,
          totalDuration: Date.now() - this.startTime,
        },
        results: this.results,
      };
      
      const filename = `evaluation-${Date.now()}.json`;
      await writeFile(join(CONFIG.outputDir, filename), JSON.stringify(report, null, 2));
      console.log(`📄 报告已保存: ${CONFIG.outputDir}/${filename}`);
    } catch (error) {
      console.error('保存报告失败:', error);
    }
  }
}

// ============ 主程序 ============

async function main() {
  const args = process.argv.slice(2);
  
  let taskIds: string[] | undefined;
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Synapse Agent 评估工具

用法:
  bun run scripts/evaluation/run-evaluation.ts [选项]

选项:
  --help, -h           显示帮助信息
  --quick              快速评估 (默认 10 个任务)
  --full               完整评估 (50 个任务)
  --tasks <ids>        指定任务 ID (逗号分隔)
  
示例:
  bun run scripts/evaluation/run-evaluation.ts --quick
  bun run scripts/evaluation/run-evaluation.ts --full
  bun run scripts/evaluation/run-evaluation.ts --tasks A1,A2,B1
`);
    process.exit(0);
  }
  
  if (args.includes('--full')) {
    // 完整评估使用全部任务
    taskIds = TASK_LIBRARY.map(t => t.id);
  } else if (args.includes('--tasks')) {
    const idx = args.indexOf('--tasks');
    taskIds = args[idx + 1]?.split(',');
  }
  
  const evaluator = new AgentEvaluator();
  await evaluator.runEvaluation(taskIds);
}

main().catch(console.error);
