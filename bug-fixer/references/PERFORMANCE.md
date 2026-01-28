<< 'EOF'
# 性能问题修复指南

## 常见类型

### 1. 算法复杂度问题
```javascript
// 问题：O(n²) 算法
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      if (arr[i] === arr[j] && i !== j) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}

// 修复：O(n) 算法
function findDuplicates(arr) {
  const seen = new Set();
  const duplicates = new Set();
  
  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    } else {
      seen.add(item);
    }
  }
  
  return Array.from(duplicates);
}
```

### 2. 内存泄漏
```javascript
// 问题：事件监听器未清理
class Component {
  constructor() {
    this.data = [];
    window.addEventListener('resize', this.handleResize);
  }
  
  // 缺少 destructor
}

// 修复：添加清理
class Component {
  constructor() {
    this.data = [];
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }
  
  destroy() {
    window.removeEventListener('resize', this.handleResize);
  }
}
```

### 3. 重复计算
```javascript
// 问题：缓存缺失
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 修复：添加记忆化
function fibonacci() {
  const cache = new Map();
  
  return function fib(n) {
    if (cache.has(n)) return cache.get(n);
    
    const result = n <= 1 ? n : fib(n - 1) + fib(n - 2);
    cache.set(n, result);
    return result;
  };
}

const fib = fibonacci();
```

## 性能分析工具

### 1. 浏览器环境
```javascript
// Chrome DevTools Performance
console.time('operation');
// 执行代码
console.timeEnd('operation');

// Performance API
performance.mark('start');
// 执行代码
performance.mark('end');
performance.measure('operation', 'start', 'end');
```

### 2. Node.js 环境
```javascript
// 使用 v8 profiler
const { PerformanceObserver, performance } = require('perf_hooks');

const obs = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

obs.observe({ entryTypes: ['measure'] });

performance.mark('A');
// 执行代码
performance.mark('B');
performance.measure('A to B', 'A', 'B');
```

### 3. 数据库查询优化
```sql
-- 问题：全表扫描
SELECT * FROM users WHERE name LIKE '%john%';

-- 修复：使用索引
CREATE INDEX idx_users_name ON users(name);
SELECT * FROM users WHERE name LIKE 'john%';
```

## 优化策略

### 1. 代码层面
- **算法优化**: 选择更高效的算法
- **缓存策略**: 避免重复计算
- **懒加载**: 延迟非关键操作
- **批处理**: 合并多个操作

### 2. 架构层面
- **异步处理**: 非阻塞操作
- **负载均衡**: 分散计算负载
- **数据分页**: 减少单次数据传输
- **CDN加速**: 静态资源优化

### 3. 资源管理
- **连接池**: 复用数据库连接
- **对象池**: 重用常用对象
- **内存池**: 减少内存分配
- **资源释放**: 及时清理资源

## 性能基准测试
```javascript
// 性能测试框架
const Benchmark = require('benchmark');
const suite = new Benchmark.Suite();

suite.add('old-impl', () => {
  // 旧实现
})
.add('new-impl', () => {
  // 新实现
})
.on('cycle', (event) => {
  console.log(String(event.target));
})
.on('complete', function() {
  console.log('Fastest is ' + this.filter('fastest').map('name'));
})
.run({ async: true });
```

## 监控指标
- **响应时间**: API/页面加载时间
- **吞吐量**: 单位时间处理请求数
- **内存使用**: 堆内存、栈内存
- **CPU使用率**: 计算密集度
- **数据库性能**: 查询时间、连接数

## 修复检查清单
- [ ] 性能分析定位瓶颈
- [ ] 算法复杂度分析
- [ ] 内存使用模式检查
- [ ] 数据库查询优化
- [ ] 缓存策略实施
- [ ] 性能基准测试
- [ ] 生产环境监控
EOF