## TodoWrite - Task List Management

A full-replacement task list tool for creating and managing structured task lists in the current session.

### Usage

TodoWrite '{"todos":[...]}'

### Parameters

Each todo item requires:
- content (string): Task description in imperative form, e.g., "Write unit tests"
- activeForm (string): Present continuous form, e.g., "Writing unit tests"
- status (string): One of "pending", "in_progress", or "completed"

### When to Use

1. Complex multi-step tasks
2. Non-trivial tasks that require careful planning
3. User explicitly requests a todo list
4. User provides multiple tasks at once

### Task States

- pending: Task not yet started
- in_progress: Currently working on (limit to ONE at any time)
- completed: Task finished successfully

### Example

TodoWrite '{"todos":[
  {"content":"Analyze requirements","activeForm":"Analyzing requirements","status":"completed"},
  {"content":"Write implementation","activeForm":"Writing implementation","status":"in_progress"},
  {"content":"Run tests","activeForm":"Running tests","status":"pending"}
]}'

Returns: Todo list updated: 1 completed, 1 in_progress, 1 pending
