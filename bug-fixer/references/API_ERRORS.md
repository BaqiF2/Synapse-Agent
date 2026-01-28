<< 'EOF'
# API错误修复指南

## 常见类型

### 1. HTTP状态码错误
```javascript
// 问题：未正确处理HTTP状态码
async function fetchData(url) {
  const response = await fetch(url);
  return response.json(); // 如果404会抛错
}

// 修复：状态码检查
async function fetchData(url) {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}
```

### 2. 网络超时
```javascript
// 问题：无超时控制
async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

// 修复：添加超时
async function fetchData(url, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 3. 数据格式错误
```javascript
// 问题：未验证API响应格式
function processUser(user) {
  return user.name.toUpperCase(); // 如果字段缺失会崩溃
}

// 修复：数据验证
function processUser(user) {
  if (!user || typeof user.name !== 'string') {
    throw new Error('Invalid user data structure');
  }
  
  return user.name.toUpperCase();
}
```

### 4. 并发请求竞态
```javascript
// 问题：重复请求
let userData = null;

async function loadUser(id) {
  if (!userData) {
    userData = await fetch(`/api/users/${id}`).then(r => r.json());
  }
  return userData;
}

// 修复：请求去重
const pendingRequests = new Map();

async function loadUser(id) {
  if (pendingRequests.has(id)) {
    return pendingRequests.get(id);
  }
  
  const promise = fetch(`/api/users/${id}`)
    .then(r => r.json())
    .finally(() => pendingRequests.delete(id));
    
  pendingRequests.set(id, promise);
  return promise;
}
```

## 错误处理模式

### 1. 重试机制
```javascript
async function fetchWithRetry(url, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        return await response.json();
      }
      
      // 服务器错误(5xx)可以重试，客户端错误(4xx)通常不需要
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      throw new Error(`Client error: ${response.status}`);
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) break;
      
      // 指数退避
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
}
```

### 2. 熔断器模式
```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}
```

### 3. 缓存策略
```javascript
class APICache {
  constructor(ttl = 300000) { // 5分钟TTL
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  async get(key, fetcher) {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  clear() {
    this.cache.clear();
  }
  
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}
```

## 调试工具

### 1. 网络监控
```javascript
// 添加请求/响应拦截器
class NetworkLogger {
  constructor() {
    this.requests = [];
    this.responses = [];
  }
  
  install() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const start = Date.now();
      const request = {
        url: args[0],
        method: args[1]?.method || 'GET',
        headers: args[1]?.headers,
        timestamp: start
      };
      
      this.requests.push(request);
      
      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - start;
        
        this.responses.push({
          url: args[0],
          status: response.status,
          duration,
          timestamp: Date.now()
        });
        
        return response;
      } catch (error) {
        console.error('Fetch failed:', error);
        throw error;
      }
    };
  }
  
  getReport() {
    return {
      totalRequests: this.requests.length,
      averageDuration: this.responses.reduce((sum, r) => sum + r.duration, 0) / this.responses.length,
      errorRate: this.responses.filter(r => r.status >= 400).length / this.responses.length
    };
  }
}
```

### 2. 错误分类
```javascript
class APIError extends Error {
  constructor(message, type, status, originalError) {
    super(message);
    this.name = 'APIError';
    this.type = type; // NETWORK, TIMEOUT, SERVER, CLIENT, PARSE
    this.status = status;
    this.originalError = originalError;
  }
}

function classifyError(error) {
  if (error.name === 'AbortError') {
    return new APIError('Request timeout', 'TIMEOUT', null, error);
  }
  
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new APIError('Network error', 'NETWORK', null, error);
  }
  
  if (error.status >= 500) {
    return new APIError(`Server error: ${error.status}`, 'SERVER', error.status, error);
  }
  
  if (error.status >= 400) {
    return new APIError(`Client error: ${error.status}`, 'CLIENT', error.status, error);
  }
  
  return new APIError('Unknown error', 'UNKNOWN', null, error);
}
```

## 最佳实践
- 实现适当的超时控制
- 使用重试机制处理临时故障
- 缓存减少重复请求
- 详细记录日志用于调试
- 优雅降级处理
- 监控API性能指标
- 错误分类和告警

## 修复检查清单
- [ ] HTTP状态码检查
- [ ] 超时控制实现
- [ ] 数据格式验证
- [ ] 错误重试机制
- [ ] 缓存策略实施
- [ ] 网络监控配置
- [ ] 错误分类和日志
- [ ] 性能基准测试
EOF