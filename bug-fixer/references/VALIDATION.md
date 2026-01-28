<< 'EOF'
# 数据验证错误修复指南

## 常见类型

### 1. 输入验证失败
```javascript
// 问题：未验证用户输入
function processUserData(userData) {
  return userData.name.toUpperCase(); // 如果name为null会崩溃
}

// 修复：添加验证
function processUserData(userData) {
  if (!userData || !userData.name) {
    throw new Error('Invalid user data');
  }
  return userData.name.toUpperCase();
}
```

### 2. 类型转换错误
```javascript
// 问题：隐式类型转换
const total = "5" + 3; // "53" 而不是 8

// 修复：显式转换
const total = Number("5") + 3; // 8
```

### 3. 边界条件错误
```javascript
// 问题：数组越界
const lastItem = arr[arr.length]; // undefined

// 修复：检查边界
const lastItem = arr.length > 0 ? arr[arr.length - 1] : null;
```

## 验证策略

### 防御性编程
- 始终验证输入参数
- 使用类型检查
- 设置默认值
- 早失败原则 (fail fast)

### 验证层次
1. **输入层**: 用户输入、API参数
2. **业务层**: 业务规则验证
3. **数据层**: 数据格式和完整性

### 最佳实践
```javascript
// 使用验证库
const Joi = require('joi');

const schema = Joi.object({
  name: Joi.string().required(),
  age: Joi.number().min(0).max(150),
  email: Joi.string().email()
});

function validateUser(user) {
  const { error, value } = schema.validate(user);
  if (error) throw new Error(`Validation error: ${error.message}`);
  return value;
}
```

## 修复检查清单
- [ ] 识别验证失败点
- [ ] 添加输入验证
- [ ] 处理边界条件
- [ ] 使用适当的验证库
- [ ] 添加单元测试
- [ ] 文档化验证规则
EOF