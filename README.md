# weeek-mcp-smart

A WEEEK MCP server that takes **names, not IDs**. Create a task in one call:

```
weeek_create_task({ title: "Ship v1", project: "Marketing",
                    column: "In Progress", assignee: "Ilya", due: "next friday" })
```

No `list_projects → list_boards → list_columns → list_members` dance first.

## Install (Claude Code / Cursor)

```bash
claude mcp add weeek -s user -- npx -y weeek-mcp-smart
# then set WEEEK_API_TOKEN in the generated config
```

## Install (Claude Desktop, one click)

Download `weeek-mcp-smart.mcpb` from Releases and open it — you'll be prompted for your token.

## Get a token

WEEEK → Settings → API → generate a personal token.

## Tools

Reads: `weeek_list_projects`, `weeek_list_tasks`, `weeek_get_task`.
Writes: `weeek_create_task`, `weeek_create_tasks`, `weeek_update_task`, `weeek_move_task`, `weeek_complete_task`.
