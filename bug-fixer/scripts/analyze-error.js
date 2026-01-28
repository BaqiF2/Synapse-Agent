<< 'EOF'
#!/usr/bin/env node
/**
 * 错误分析脚本 - 自动分析错误信息和日志文件
 * 用法: node analyze-error.js <错误文件> [选项]
 */

const fs = require('fs');
const path = require('path');

class ErrorAnalyzer {
  constructor() {
    this.errorPatterns = {
      javascript: [
        /Error:\s*(.+)/,
        /at\s+(.+?):(\d+):(\d+)/,
        /ReferenceError:\s*(.+)/,
        /TypeError:\s*(.+)/,
        /SyntaxError:\s*(.+)/
      ],
      python: [
        /Traceback\s*\(most\s+recent\s+call\s+last\):/,
        /File\s+"(.+)",\s+line\s+(\d+)/,
        /(\w+Error):\s*(.+)/,
        /IndentationError:\s*(.+)/
      ],
      java: [
        /Exception in\s+thread\s+"(.+)"\s+(.+)/,
        /at\s+(.+)\((.+):(\d+)\)/,
        /Caused by:\s*(.+)/,
        /(java\.\w+\.\w+Exception):\s*(.+)/
      ]
    };
  }

  /**
   * 分析错误文件
   */
  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return this.analyzeContent(content, filePath);
    } catch (error) {
      return { error: `无法读取文件: ${error.message}` };
    }
  }

  /**
   * 分析错误内容
   */
  analyzeContent(content, source = 'unknown') {
    const lines = content.split('
');
    const errors = [];
    
    // 检测语言类型
    const language = this.detectLanguage(content);
    
    // 提取错误信息
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const patterns = this.errorPatterns[language] || [];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          errors.push({
            line: i + 1,
            message: line.trim(),
            type: this.categorizeError(match),
            context: this.getContext(lines, i)
          });
        }
      }
    }

    return {
      source,
      language,
      totalErrors: errors.length,
      errors,
      summary: this.generateSummary(errors)
    };
  }

  /**
   * 检测编程语言
   */
  detectLanguage(content) {
    if (content.includes('Traceback') || content.includes('File "')) {
      return 'python';
    }
    if (content.includes('Exception in thread') || content.includes('at ')) {
      return 'java';
    }
    if (content.includes('Error:') || content.includes('ReferenceError')) {
      return 'javascript';
    }
    return 'unknown';
  }

  /**
   * 错误分类
   */
  categorizeError(match) {
    const message = match[0].toLowerCase();
    
    if (message.includes('undefined') || message.includes('null')) {
      return 'null_reference';
    }
    if (message.includes('syntax') || message.includes('indentation')) {
      return 'syntax_error';
    }
    if (message.includes('timeout') || message.includes('network')) {
      return 'network_error';
    }
    if (message.includes('memory') || message.includes('stack')) {
      return 'memory_error';
    }
    
    return 'general_error';
  }

  /**
   * 获取上下文
   */
  getContext(lines, errorLine, contextSize = 3) {
    const start = Math.max(0, errorLine - contextSize);
    const end = Math.min(lines.length, errorLine + contextSize + 1);
    
    return {
      before: lines.slice(start, errorLine),
      error: lines[errorLine],
      after: lines.slice(errorLine + 1, end)
    };
  }

  /**
   * 生成错误摘要
   */
  generateSummary(errors) {
    const types = {};
    const files = {};
    
    errors.forEach(error => {
      types[error.type] = (types[error.type] || 0) + 1;
      
      const fileMatch = error.message.match(/at\s+(.+?):(\d+)/);
      if (fileMatch) {
        const file = fileMatch[1];
        files[file] = (files[file] || 0) + 1;
      }
    });

    return {
      errorTypes: types,
      mostCommonFiles: Object.entries(files)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      recommendations: this.generateRecommendations(errors)
    };
  }

  /**
   * 生成修复建议
   */
  generateRecommendations(errors) {
    const recommendations = [];
    
    const typeCounts = {};
    errors.forEach(error => {
      typeCounts[error.type] = (typeCounts[error.type] || 0) + 1;
    });

    if (typeCounts.null_reference > 0) {
      recommendations.push({
        type: 'null_reference',
        priority: 'high',
        suggestion: '检查变量初始化和空值处理',
        reference: 'VALIDATION.md'
      });
    }

    if (typeCounts.syntax_error > 0) {
      recommendations.push({
        type: 'syntax_error',
        priority: 'high',
        suggestion: '检查语法错误和缩进',
        reference: 'VALIDATION.md'
      });
    }

    if (typeCounts.network_error > 0) {
      recommendations.push({
        type: 'network_error',
        priority: 'medium',
        suggestion: '检查网络连接和超时设置',
        reference: 'API_ERRORS.md'
      });
    }

    return recommendations;
  }

  /**
   * 生成报告
   */
  generateReport(analysis) {
    let report = `
=== 错误分析报告 ===
`;
    report += `源文件: ${analysis.source}
`;
    report += `检测语言: ${analysis.language}
`;
    report += `错误总数: ${analysis.totalErrors}

`;

    report += `=== 错误类型分布 ===
`;
    for (const [type, count] of Object.entries(analysis.summary.errorTypes)) {
      report += `${type}: ${count} 个
`;
    }

    report += `
=== 修复建议 ===
`;
    analysis.summary.recommendations.forEach(rec => {
      report += `[${rec.priority}] ${rec.type}: ${rec.suggestion}
`;
      report += `参考文档: ${rec.reference}

`;
    });

    report += `=== 详细错误信息 ===
`;
    analysis.errors.forEach((error, index) => {
      report += `${index + 1}. 行 ${error.line}: ${error.message}
`;
      report += `   类型: ${error.type}

`;
    });

    return report;
  }
}

// CLI 使用
if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = args[0];

  if (!filePath) {
    console.log('用法: node analyze-error.js <错误文件>');
    process.exit(1);
  }

  const analyzer = new ErrorAnalyzer();
  const analysis = analyzer.analyzeFile(filePath);
  
  if (analysis.error) {
    console.error(analysis.error);
    process.exit(1);
  }

  console.log(analyzer.generateReport(analysis));
}

module.exports = ErrorAnalyzer;
EOF