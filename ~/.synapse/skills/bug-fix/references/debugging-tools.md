<< 'EOF'
# Debugging Tools Reference

## Language-Specific Debuggers

### Python
- **pdb**: Built-in command-line debugger
  ```python
  import pdb; pdb.set_trace()  # Set breakpoint
  ```
- **ipdb**: Enhanced pdb with IPython features
  ```bash
  pip install ipdb
  import ipdb; ipdb.set_trace()
  ```
- **pdb++**: Advanced pdb with enhanced features
  ```bash
  pip install pdbpp
  ```

### JavaScript/Node.js
- **Chrome DevTools**: Browser-based debugging
  ```javascript
  debugger; // Browser debugger statement
  ```
- **Node.js Inspector**: CLI debugging
  ```bash
  node --inspect app.js
  ```

### Java
- **JDB**: Java Debugger (command-line)
  ```bash
  jdb -classpath . MyClass
  ```
- **IDE Debuggers**: IntelliJ IDEA, Eclipse built-in debuggers

### C/C++
- **GDB**: GNU Debugger
  ```bash
  gdb ./program
  ```
- **LLDB**: LLVM Debugger
  ```bash
  lldb ./program
  ```

## Logging Frameworks

### Python
```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('debug.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)
```

### JavaScript
```javascript
// Console API
console.log('Debug info');
console.error('Error message');
console.warn('Warning');

// Winston logger
const winston = require('winston');
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Java
```java
import java.util.logging.*;

public class DebugExample {
    private static final Logger logger = Logger.getLogger(DebugExample.class.getName());
    
    static {
        try {
            Handler fileHandler = new FileHandler("app.log");
            logger.addHandler(fileHandler);
            logger.setLevel(Level.ALL);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

## Performance Profiling

### Python
```bash
# Using cProfile
python -m cProfile script.py

# Using line_profiler
pip install line_profiler
kernprof -l -v script.py
```

### JavaScript
```javascript
// Performance API
console.time('operation');
// ... code to measure ...
console.timeEnd('operation');

// Chrome DevTools Performance tab
```

### Java
```bash
# JVisualVM
jvisualvm

# JProfiler (commercial)
```

## Memory Debugging

### Python
```python
import tracemalloc

tracemalloc.start()

# ... your code ...

current, peak = tracemalloc.get_traced_memory()
print(f"Current memory usage: {current / 1024 / 1024:.1f} MB")
print(f"Peak memory usage: {peak / 1024 / 1024:.1f} MB")
```

### JavaScript
```javascript
// Memory snapshots in Chrome DevTools
// heap snapshot, allocation timeline
```

### Java
```bash
# VisualVM heap dump analysis
# JMap for heap dumps
jmap -dump:live,format=b,file=heap.bin <pid>
```

## Static Analysis Tools

### Python
- **pylint**: Code quality and style checker
- **mypy**: Static type checker
- **flake8**: Style guide enforcement
- **bandit**: Security issue detection

```bash
pip install pylint mypy flake8 bandit
pylint your_code.py
mypy your_code.py
flake8 your_code.py
bandit -r your_code/
```

### JavaScript
- **ESLint**: Code quality and style
- **JSHint**: JavaScript code quality
- **TypeScript Compiler**: Type checking

```bash
npm install -g eslint
eslint your_code.js

# TypeScript
tsc --noEmit
```

### Java
- **FindBugs**: Bytecode analysis
- **PMD**: Source code analyzer
- **SonarQube**: Code quality platform

## Network Debugging

### cURL
```bash
# Basic request
curl -v http://api.example.com/endpoint

# Headers and authentication
curl -H "Authorization: Bearer token" \
     -H "Content-Type: application/json" \
     -d '{"key": "value"}' \
     http://api.example.com/endpoint
```

### Wireshark
- Packet analysis for network protocols
- Filter specific traffic patterns
- Troubleshoot connection issues

### Postman/Insomnia
- API testing and debugging
- Request/response inspection
- Environment variables

## Database Debugging

### SQL
```sql
-- Enable query logging
SET log_statement = 'all';

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Check index usage
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE created_at > '2024-01-01';
```

### ORM Debugging
- **SQLAlchemy**: Enable SQL echo
- **Sequelize**: Logging options
- **Django ORM**: Connection.queries

## Container Debugging

### Docker
```bash
# View logs
docker logs container_name

# Execute commands in container
docker exec -it container_name bash

# Inspect container
docker inspect container_name
```

### Kubernetes
```bash
# Pod logs
kubectl logs pod-name

# Pod description
kubectl describe pod pod-name

# Port forward for debugging
kubectl port-forward pod-name 8080:8080
```

## Error Monitoring

### Sentry
```python
import sentry_sdk

sentry_sdk.init(
    dsn="YOUR_DSN",
    traces_sample_rate=1.0
)

try:
    # Code that might fail
    result = risky_operation()
except Exception as e:
    sentry_sdk.capture_exception(e)
    raise
```

### Rollbar
```javascript
const Rollbar = require("rollbar");
const rollbar = new Rollbar({
  accessToken: "your-access-token",
});

try {
  // Code that might fail
  riskyOperation();
} catch (error) {
  rollbar.error(error);
  throw error;
}
```

## Debugging Strategies

### Binary Search Debugging
1. Identify the problem area
2. Test halfway point
3. Narrow down based on results
4. Repeat until isolated

### Rubber Duck Debugging
1. Explain the code line by line
2. Often reveals the issue
3. Don't skip this step!

### Scientific Method
1. Form hypothesis about the bug
2. Design experiment to test hypothesis
3. Run experiment
4. Analyze results
5. Refine hypothesis if needed

### Time Travel Debugging
- Record execution state changes
- Step backwards through execution
- Available in some advanced debuggers
EOF