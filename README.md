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

**[⬇ Download the latest `.mcpb`](https://github.com/IlyaIvanchikov/weeek-mcp/releases/latest/download/weeek-mcp-smart.mcpb)**, then open it in Claude Desktop (Settings → Extensions → install from file). You'll be prompted for your WEEEK API token — it's stored in your OS keychain.

All releases: https://github.com/IlyaIvanchikov/weeek-mcp/releases

## Get a token

WEEEK → Settings → API → generate a personal token.

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `WEEEK_API_TOKEN` | yes | — | Your WEEEK personal API token. |
| `WEEEK_API_BASE_URL` | no | `https://api.weeek.net/public/v1` | Override for self-hosted / regional hosts. |
| `WEEEK_TIMEOUT_MS` | no | `30000` | Per-request timeout. |
| `WEEEK_ATTACH_DIR` | no | the server's working directory | Directory `weeek_attach_file` may read from (see Safety). |
| `WEEEK_ATTACH_MAX_BYTES` | no | `10485760` (10 MB) | Max attachable file size. |

## Safety

This server is driven by an LLM that can read untrusted content (task text, web pages), so the two riskiest tools are guarded:

- **`weeek_attach_file`** only reads files inside an allowed directory (its subfolders included). By default that's the server's **working directory** — so it works with no setup for local files, while paths outside it (`/etc/passwd`, `~/.ssh`, `..` traversal, symlinks that escape) are refused. Set `WEEEK_ATTACH_DIR` to point the jail somewhere specific or lock it down further. No special folder is required.
- **`weeek_delete_task`** is permanent and requires an explicit `confirm: true`; to merely close a task use `weeek_complete_task`.

## Tools

Reads: `weeek_version`, `weeek_list_projects`, `weeek_list_tasks`, `weeek_get_task`.
Writes: `weeek_create_task`, `weeek_create_tasks`, `weeek_update_task`, `weeek_move_task`, `weeek_complete_task`, `weeek_attach_file`, `weeek_delete_task`.

## Author

**Ilya Ivanchikov** — [GitHub](https://github.com/IlyaIvanchikov) · [LinkedIn](https://www.linkedin.com/in/ilyaivanchikov) · [Telegram](https://t.me/IlyaIvanchikov) · [Channel](https://t.me/ivanchikovitclub)
