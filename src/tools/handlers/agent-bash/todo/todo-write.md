TodoWrite - Create and manage task lists

USAGE:
    TodoWrite '<json>'

ARGUMENTS:
    <json>    JSON object with "todos" array

JSON FORMAT:
    {
      "todos": [
        {
          "content": "Task description (imperative form)",
          "activeForm": "Task in progress form (present continuous)",
          "status": "pending" | "in_progress" | "completed"
        }
      ]
    }

OPTIONS:
    -h         Show brief help
    --help     Show detailed help

CONSTRAINTS:
    - Maximum 1 task with status "in_progress" at any time
    - Maximum 50 tasks total (configurable via TODO_MAX_ITEMS)
    - Maximum 200 chars per content/activeForm (configurable via TODO_MAX_CONTENT_LENGTH)

EXAMPLES:
    TodoWrite '{"todos":[{"content":"Fix bug","activeForm":"Fixing bug","status":"in_progress"}]}'

    TodoWrite '{"todos":[
      {"content":"Analyze code","activeForm":"Analyzing code","status":"completed"},
      {"content":"Write tests","activeForm":"Writing tests","status":"in_progress"},
      {"content":"Update docs","activeForm":"Updating docs","status":"pending"}
    ]}'

OUTPUT:
    Todo list updated: 1 completed, 1 in_progress, 1 pending
    Tasks:
    - [x] Analyze code
    - [>] Writing tests
    - [ ] Update docs
