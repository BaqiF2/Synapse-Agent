<< 'EOF'
# 内存泄漏修复指南

## 常见类型

### 1. 事件监听器泄漏
```javascript
// 问题：未移除事件监听器
class EventManager {
  constructor() {
    window.addEventListener('scroll', this.handleScroll);
  }
  
  // 缺少清理
}

// 修复：实现清理机制
class EventManager {
  constructor() {
    this.handleScroll = this.handleScroll.bind(this);
    window.addEventListener('scroll', this.handleScroll);
  }
  
  destroy() {
    window.removeEventListener('scroll', this.handleScroll);
  }
}
```

### 2. 闭包引用
```javascript
// 问题：闭包持有不必要引用
function createProcessor() {
  const largeData = new Array(1000000).fill('data');
  
  return function process() {
    return largeData[0]; // 持有整个largeData数组
  };
}

// 修复：只保留必要引用
function createProcessor() {
  const necessaryData = largeData[0]; // 只保留需要的数据
  
  return function process() {
    return necessaryData;
  };
}
```

### 3. DOM节点引用
```javascript
// 问题：JavaScript持有DOM节点引用
class Cache {
  constructor() {
    this.nodes = new Map();
  }
  
  cacheNode(id, element) {
    this.nodes.set(id, element);
  }
  
  // 节点被移除但引用仍存在
}

// 修复：WeakMap使用
class Cache {
  constructor() {
    this.nodes = new WeakMap();
  }
  
  cacheNode(id, element) {
    this.nodes.set(element, id); // 当DOM节点被垃圾回收时，映射也会消失
  }
}
```

### 4. 定时器泄漏
```javascript
// 问题：未清理定时器
class Timer {
  start() {
    this.interval = setInterval(() => {
      // 执行任务
    }, 1000);
  }
  
  // 缺少停止方法
}

// 修复：实现生命周期管理
class Timer {
  start() {
    this.interval = setInterval(() => {
      // 执行任务
    }, 1000);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  
  destroy() {
    this.stop();
  }
}
```

## 检测工具

### 1. 浏览器环境
```javascript
// Chrome DevTools Memory
// 1. 录制堆快照
// 2. 比较快照差异
// 3. 识别泄漏对象

// Memory API
if (performance.memory) {
  console.log('Memory usage:', {
    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
  });
}
```

### 2. Node.js环境
```javascript
// heapdump生成堆快照
const heapdump = require('heapdump');

process.on('SIGUSR2', () => {
  heapdump.writeSnapshot((err, filename) => {
    console.log('Heap snapshot written to', filename);
  });
});

// clinic.js工具链
npm install -g clinic
clinic doctor -- node app.js
```

### 3. C/C++环境
```c++
// Valgrind检测内存泄漏
valgrind --leak-check=full --show-leak-kinds=all ./program

// AddressSanitizer
gcc -fsanitize=address -g program.c -o program
./program
```

## 内存分析模式

### 1. 堆增长检测
```javascript
function monitorMemoryGrowth() {
  const measurements = [];
  
  setInterval(() => {
    if (performance.memory) {
      measurements.push({
        timestamp: Date.now(),
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize
      });
      
      // 如果内存持续增长，可能存在泄漏
      if (measurements.length > 10) {
        const trend = measurements.slice(-5);
        const growing = trend.every((m, i) => 
          i === 0 || m.used > trend[i-1].used
        );
        
        if (growing) {
          console.warn('Potential memory leak detected');
        }
      }
    }
  }, 5000);
}
```

### 2. 对象存活分析
```javascript
// 检查对象是否被意外持有
function findLeakingReferences(rootObject) {
  const visited = new WeakSet();
  const leakingRefs = [];
  
  function traverse(obj, path = 'root') {
    if (obj === null || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    
    visited.add(obj);
    
    // 检查是否为DOM节点或特殊对象
    if (obj.nodeType || obj === window || obj === document) {
      leakingRefs.push({ path, type: 'DOM/special', object: obj });
    }
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        traverse(obj[key], `${path}.${key}`);
      }
    }
  }
  
  traverse(rootObject);
  return leakingRefs;
}
```

## 修复策略

### 1. 主动清理
```javascript
class ResourceManager {
  constructor() {
    this.resources = new Set();
  }
  
  addResource(resource) {
    this.resources.add(resource);
    return resource;
  }
  
  cleanup() {
    for (const resource of this.resources) {
      if (resource.destroy) {
        resource.destroy();
      }
    }
    this.resources.clear();
  }
}

// 使用WeakRef进行自动清理
class SmartCache {
  constructor() {
    this.cache = new Map();
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次
  }
  
  cleanup() {
    for (const [key, value] of this.cache.entries()) {
      if (value.deref() === undefined) {
        this.cache.delete(key);
      }
    }
  }
  
  set(key, value) {
    this.cache.set(key, new WeakRef(value));
  }
  
  get(key) {
    const ref = this.cache.get(key);
    return ref ? ref.deref() : undefined;
  }
}
```

### 2. 生命周期管理
```javascript
// React组件示例
class Component extends React.Component {
  constructor(props) {
    super(props);
    this.state = { data: null };
    this.controller = new AbortController();
  }
  
  componentDidMount() {
    this.loadData();
  }
  
  componentWillUnmount() {
    this.controller.abort(); // 取消网络请求
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
  
  async loadData() {
    try {
      const response = await fetch('/api/data', {
        signal: this.controller.signal
      });
      this.setState({ data: await response.json() });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Load failed:', error);
      }
    }
  }
}
```

## 最佳实践
- 使用WeakMap和WeakSet
- 及时清理事件监听器
- 避免闭包持有不必要引用
- 实现统一的资源管理
- 使用RAII模式 (C++)
- 定期进行内存分析
- 建立内存使用基线

## 修复检查清单
- [ ] 识别泄漏源头
- [ ] 添加清理机制
- [ ] 使用适当的数据结构
- [ ] 实现生命周期管理
- [ ] 内存使用监控
- [ ] 泄漏检测测试
- [ ] 性能影响评估
EOF