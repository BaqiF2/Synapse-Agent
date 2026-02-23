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

WHEN TO USE:
    Use TodoWrite when any of the following apply:
    - Task involves 3 or more distinct steps
    - User signals: step by step, checklist, plan, in order
    - Task will modify 3 or more files

    Consider using when:
    - Task description is vague and needs decomposition
    - Multiple systems or modules need coordinated changes
    - Investigation or exploration is needed before determining steps

    Skip when:
    - Single clear operation (e.g., "read this file", "fix this typo")
    - Fewer than 3 steps with a clear goal

WORKFLOW:
    1. ASSESS — Decide if TodoWrite is needed based on criteria above

    2. CREATE — Break task into items; first item "in_progress", rest "pending"
       TodoWrite '{"todos":[
         {"content":"Step 1","activeForm":"Doing step 1","status":"in_progress"},
         {"content":"Step 2","activeForm":"Doing step 2","status":"pending"}
       ]}'

    3. EXECUTE — Work on the current "in_progress" item

    4. UPDATE — After completing an item, call TodoWrite with updated statuses:
       TodoWrite '{"todos":[
         {"content":"Step 1","activeForm":"Doing step 1","status":"completed"},
         {"content":"Step 2","activeForm":"Doing step 2","status":"in_progress"}
       ]}'

    5. LOOP — Repeat steps 3-4 until all items are "completed"

    6. NEVER ABANDON — Do not start unrelated work until all tasks are done

SPECIAL CASES:
    - Blocker found: keep current item "in_progress", add new blocker item
    - New task discovered: add new item to the list
