<< 'EOF'
# 并发问题修复指南

## 常见类型

### 1. 竞态条件 (Race Condition)
```javascript
// 问题：多线程同时修改共享数据
let counter = 0;

function increment() {
  const temp = counter;  // 线程A读取
  counter = temp + 1;    // 线程B也在此阶段读取
}

// 修复：使用锁或原子操作
const counter = new AtomicInteger(0);
function increment() {
  counter.incrementAndGet();
}
```

### 2. 死锁 (Deadlock)
```javascript
// 问题：相互等待资源
function transfer(from, to, amount) {
  synchronized(lock1) {
    synchronized(lock2) { // 可能死锁
      // 转账逻辑
    }
  }
}

// 修复：统一锁顺序
function transfer(from, to, amount) {
  synchronized(getLockOrder(from, to)) {
    // 转账逻辑
  }
}
```

### 3. 数据竞争 (Data Race)
```c++
// 问题：未同步的内存访问
int counter = 0;

void increment() {
  counter++;  // 多个线程同时执行
}

// 修复：使用互斥锁
std::mutex mtx;
int counter = 0;

void increment() {
  std::lock_guard<std::mutex> lock(mtx);
  counter++;
}
```

## 解决方案模式

### 1. 同步机制
- **互斥锁 (Mutex)**: 保护共享资源
- **信号量 (Semaphore)**: 控制并发数量
- **条件变量 (Condition Variable)**: 线程间通信
- **原子操作 (Atomic)**: 简单的无锁操作

### 2. 无锁编程
```javascript
// 使用原子操作替代锁
class LockFreeQueue {
  constructor() {
    this.head = new AtomicMarkableReference(null);
    this.tail = new AtomicMarkableReference(null);
  }
  
  enqueue(value) {
    const node = new Node(value);
    while (true) {
      const tail = this.tail.get();
      const next = tail.next.get();
      if (tail === this.tail.get()) {
        if (next === null) {
          if (tail.next.compareAndSet(null, node)) {
            this.tail.compareAndSet(tail, node);
            return;
          }
        } else {
          this.tail.compareAndSet(tail, next);
        }
      }
    }
  }
}
```

### 3. 不可变数据
```javascript
// 使用不可变数据结构
const originalState = { count: 0 };
const newState = { ...originalState, count: originalState.count + 1 };
// originalState 保持不变，多线程安全
```

## 检测工具
- **Thread sanitizer (TSan)**: 检测数据竞争
- **Valgrind**: 内存和并发错误检测
- **静态分析**: Coverity, PVS-Studio
- **动态分析**: Helgrind, DRD

## 最佳实践
- 最小化共享状态
- 使用不可变数据
- 遵循统一锁顺序
- 避免嵌套锁
- 使用高级并发原语
- 充分的压力测试

## 修复检查清单
- [ ] 识别共享资源
- [ ] 分析访问模式
- [ ] 选择合适的同步机制
- [ ] 避免死锁
- [ ] 性能测试验证
- [ ] 添加并发安全测试
EOF