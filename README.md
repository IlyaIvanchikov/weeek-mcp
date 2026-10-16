# weeek-mcp-smart

[![npm version](https://img.shields.io/npm/v/weeek-mcp-smart.svg)](https://www.npmjs.com/package/weeek-mcp-smart)
[![npm downloads](https://img.shields.io/npm/dm/weeek-mcp-smart.svg)](https://www.npmjs.com/package/weeek-mcp-smart)
[![CI](https://github.com/IlyaIvanchikov/weeek-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/IlyaIvanchikov/weeek-mcp/actions/workflows/test.yml)
[![node](https://img.shields.io/node/v/weeek-mcp-smart.svg)](https://www.npmjs.com/package/weeek-mcp-smart)
[![license](https://img.shields.io/npm/l/weeek-mcp-smart.svg)](./LICENSE)

**The only one-click WEEEK MCP server** — it takes **names, not IDs**. Create a task in one call:

```
weeek_create_task({ title: "Ship v1", project: "Marketing",
                    column: "In Progress", assignee: "Ilya", due: "next friday",
                    fields: { "Estimate": 5 } })
```

Then `weeek_add_comment`, `weeek_add_assignees`, `weeek_set_task_parent` — all by name, all one call, custom fields included — and the CRM: `weeek_create_deal({ status: "New", funnel: "Sales", title: "Big one", contacts: ["Ann Lee"] })`.

No `list_projects → list_boards → list_columns → list_members` dance first.

<!-- DEMO: drop a gif/screenshot here — an agent creating a task by name in one call.
     Your PROMOTE.md calls this the biggest single stars lever. Suggested: ![demo](docs/demo.gif) -->


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
| `WEEEK_API_TOKEN` | to call tools | — | Your WEEEK personal API token. The server starts and lists its tools without it, but any tool call fails until it is set. |
| `WEEEK_API_BASE_URL` | no | `https://api.weeek.net/public/v1` | Override for self-hosted / regional hosts. |
| `WEEEK_TIMEOUT_MS` | no | `30000` | Per-request timeout. |
| `WEEEK_TOOLSETS` | no | `tasks` | Comma-separated groups of tools to expose, or `all`. See Toolsets. |
| `WEEEK_ATTACH_DIR` | no | the server's working directory | Directory `weeek_attach_file` may read from (see Safety). |
| `WEEEK_ATTACH_MAX_BYTES` | no | `10485760` (10 MB) | Max attachable file size. |

## Safety

This server is driven by an LLM that can read untrusted content (task text, web pages), so the two riskiest tools are guarded:

- **`weeek_attach_file`** only reads files inside an allowed directory (its subfolders included). By default that's the server's **working directory** — so it works with no setup for local files, while paths outside it (`/etc/passwd`, `~/.ssh`, `..` traversal, symlinks that escape) are refused. Set `WEEEK_ATTACH_DIR` to point the jail somewhere specific or lock it down further. No special folder is required.
- **`weeek_delete_task`** is permanent and requires an explicit `confirm: true`; to merely close a task use `weeek_complete_task`.
- **`weeek_get_attachment`** returns the image for an attachment WEEEK hosts itself, so a task specified in screenshots can be read rather than guessed at. It downloads bytes only when the attachment's `service` is `weeek`; an attachment parked in Google Drive/Dropbox/OneDrive/Box comes back as metadata with its URL instead. The download sends **no token at all**: WEEEK hands out a pre-signed one-hour URL that redirects to its storage bucket, and the server follows exactly one redirect, only to `https`, with no credentials on either hop. Non-images return metadata only, and anything over `WEEEK_ATTACH_MAX_BYTES` is refused rather than truncated.
- **Every tool that deletes, archives or detaches** — a project, board, column, tag, portfolio, comment, time entry, custom field or field option; a funnel, status, deal, organization or contact, a contact's or organization's address, email or phone; an assignee, watcher, contact, organization or tag link; a task's membership of a project — requires `confirm: true` and is marked destructive in its annotations, so a client can ask before running it.

## Toolsets

Every tool's schema is sent to the model on every request, so the server exposes a small
default and lets you opt into more. Set `WEEEK_TOOLSETS` to a comma-separated list, or `all`.

| Toolset | Tools | Default |
|---|---|---|
| `tasks` | `weeek_list_projects`, `weeek_list_boards`, `weeek_list_columns`, `weeek_list_tasks`, `weeek_get_task`, `weeek_list_members`, `weeek_get_attachment`, `weeek_create_task`, `weeek_create_tasks`, `weeek_update_task`, `weeek_move_task`, `weeek_complete_task`, `weeek_attach_file`, `weeek_delete_task`, `weeek_list_comments`, `weeek_add_comment`, `weeek_delete_comment`, `weeek_add_assignees`, `weeek_remove_assignees`, `weeek_add_watchers`, `weeek_remove_watchers`, `weeek_add_task_to_project`, `weeek_remove_task_from_project`, `weeek_set_task_parent` | **yes** |
| `time` | `weeek_set_timer`, `weeek_add_time_entry`, `weeek_update_time_entry`, `weeek_delete_time_entry` | |
| `projects` | `weeek_get_project`, `weeek_create_project`, `weeek_update_project`, `weeek_archive_project`, `weeek_delete_project`, `weeek_create_board`, `weeek_update_board`, `weeek_delete_board`, `weeek_move_board`, `weeek_create_column`, `weeek_update_column`, `weeek_delete_column`, `weeek_move_column`, `weeek_list_portfolios`, `weeek_get_portfolio`, `weeek_create_portfolio`, `weeek_update_portfolio`, `weeek_delete_portfolio`, `weeek_list_tags`, `weeek_get_tag`, `weeek_create_tag`, `weeek_update_tag`, `weeek_delete_tag`, `weeek_get_workspace`, `weeek_get_profile` | |
| `custom-fields` | `weeek_list_custom_fields`, `weeek_create_custom_field`, `weeek_update_custom_field`, `weeek_delete_custom_field`, `weeek_transfer_custom_field`, `weeek_move_custom_field`, `weeek_add_field_option`, `weeek_update_field_option`, `weeek_delete_field_option`, `weeek_move_field_option` | |
| `crm` | `weeek_list_funnels`, `weeek_get_funnel`, `weeek_create_funnel`, `weeek_update_funnel`, `weeek_delete_funnel`, `weeek_list_statuses`, `weeek_get_status`, `weeek_create_status`, `weeek_update_status`, `weeek_delete_status`, `weeek_list_currencies`, `weeek_list_deals`, `weeek_get_deal`, `weeek_create_deal`, `weeek_update_deal`, `weeek_delete_deal`, `weeek_move_deal`, `weeek_add_deal_assignees`, `weeek_remove_deal_assignees`, `weeek_attach_organization`, `weeek_detach_organization`, `weeek_add_deal_task`, `weeek_move_deal_task`, `weeek_remove_deal_task`, `weeek_attach_deal_file`, `weeek_list_organizations`, `weeek_get_organization`, `weeek_create_organization`, `weeek_update_organization`, `weeek_delete_organization`, `weeek_list_contacts`, `weeek_get_contact`, `weeek_create_contact`, `weeek_update_contact`, `weeek_delete_contact`, `weeek_attach_contact`, `weeek_detach_contact`, `weeek_add_crm_tag`, `weeek_remove_crm_tag`, `weeek_add_detail`, `weeek_update_detail`, `weeek_delete_detail` | |
| `all` | every toolset | |

`weeek_version` is always available. The default is the task surface: 16 566 bytes of
tool schemas per request; `crm` alone is 32 290 bytes; `all` is 76 321 bytes. An unknown name is
rejected at startup with the list of valid ones. Every operation of WEEEK's public API (157) is
registered, and all but one reach a tool (`PATCH /crm/deals/{id}`: the API ignores most of its body,
so `weeek_update_deal` uses `PUT` and the link routes instead) — the registry is checked against the
vendored OpenAPI document in both directions on every test run.

Custom-field **values** need no extra toolset: `weeek_get_task` returns them, and
`weeek_create_task` / `weeek_update_task` take `fields: { "Estimate": 5, "Stage": "Review" }` by
field name (on create, global and project fields; a board's own fields once the task exists, via
`weeek_update_task`). The `custom-fields` toolset is for administering the fields themselves — in the
global scope, a project, a board or a CRM funnel. A board's fields are read off its tasks because
the API lists them nowhere else, so an empty board shows none.

The `crm` toolset takes every reference by name: a funnel, a status inside it, a deal by title
(with its funnel or status) or by id, organizations, contacts by full name, currencies by code,
tags by title. Deals carry custom-field values like tasks (`fields` by name; on
`weeek_create_deal` pass `funnel` too). Addresses, emails and phones belong to
organizations and contacts and are changed with `weeek_add_detail` / `weeek_update_detail` /
`weeek_delete_detail`.

Upgrading from 1.0.0: `weeek_create_task` / `weeek_update_task` `due` now actually sets the due date
(the key sent before was ignored by the API); `weeek_update_deal` now applies custom fields and the
four link lists, and lost `description` (the API only sets it on create);
`weeek_create_organization` / `weeek_update_organization` take one `responsible` instead of
`responsibles` (the list was ignored); `weeek_list_deals` lost `sort: "amount"` (the API answers 500);
`weeek_update_project` `color` must now be `#` and six hex digits; a 200 the API marks
`success: false` (e.g. a plan limit) is now reported as an error.

Upgrading from 0.7.0: no tool was renamed or removed; `WEEEK_TOOLSETS=tasks` is still the
default. Opt in with `crm` or `all`.

Upgrading from 0.5.0: the default toolset grew from 12 tools to 24 in 0.6.0 (plus `weeek_version`), and `WEEEK_TOOLSETS=tasks` is still the default, so nothing else changes unless you opt in to `time`, `projects` or `all`.

```bash
WEEEK_TOOLSETS=tasks,crm npx -y weeek-mcp-smart   # add the CRM
WEEEK_TOOLSETS=all npx -y weeek-mcp-smart         # everything
```

## Development

### Updating the API spec snapshot

`spec/weeek-openapi.json` is a snapshot of WEEEK's public OpenAPI document. A test
(`tests/contract.test.ts`) checks that every operation the server calls exists in it and that
every operation the spec declares is registered — 157 both ways — so an API change
shows up as a failing test, not as a surprise in production.

It needs Node ≥ 18 (for `fetch`), and `curl` only when `REFRESH_SPEC_INTERFACE` is set.

```bash
npm run refresh-spec            # re-extract from developers.weeek.net
npx vitest run tests/contract.test.ts
```

A successful refresh prints one line such as
`wrote …/spec/weeek-openapi.json: openapi 3.1.1, 99 paths, 157 operations, 35 schemas (from weeek.yaml-<hash>.js)`.

If the refresh fails with a DNS or connection error, read the comment at the top of
`scripts/refresh-spec.mjs` — it lists the known causes (VPN resolver, blocked tunnel) and the
exact fix for each.

## Author

**Ilya Ivanchikov** — [GitHub](https://github.com/IlyaIvanchikov) · [LinkedIn](https://www.linkedin.com/in/ilyaivanchikov) · [Telegram](https://t.me/IlyaIvanchikov) · [Channel](https://t.me/ivanchikovitclub)
