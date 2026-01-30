## Skill Search Instructions

When processing a search request, analyze the user's query and find matching skills using semantic understanding.

**Input:** A natural language description of what the user wants to accomplish.

**Task:**
1. Understand the intent behind the query
2. Match against available skills based on semantic similarity
3. Consider skill names, descriptions, and potential use cases
4. Return the most relevant skills (up to 5)

**Output Format (JSON):**
```json
{
  "matched_skills": [
    {"name": "skill-name", "description": "Brief description"},
    ...
  ]
}
```

**Important:**
- Return empty array if no skills match
- Prioritize exact name matches, then semantic matches
- Consider synonyms and related concepts