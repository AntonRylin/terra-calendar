# Terra Calendar MCP Server

A Model Context Protocol (MCP) server for [Terra Calendar](..). It enables AI assistants (like Claude Desktop or Cursor) to read, search, create, update, and delete events. It works against **both editions**:

- **Local edition** — reads/writes the `events.json` file used by the Tauri desktop app (the default; no configuration needed).
- **Cloud edition** — reads/writes your events in Supabase, scoped to your account by Row-Level Security, so you can manage the same calendar you use on the hosted web app.

The backend is selected automatically from environment variables (see [Cloud edition (Supabase)](#cloud-edition-supabase) below); with none set, it runs fully local.

## Features

- **Dual backend:** The same tools work against the local JSON file or the hosted Supabase database — chosen from the environment, no code changes.
- **Store Auto-Detection (local):** Automatically locates the `events.json` database used by the Tauri desktop application, including under sandboxed environments (such as when Tauri is launched inside Claude Desktop).
- **RLS-scoped auth (cloud):** Signs in with your email + password and the public anon/publishable key, so every operation is limited to your own events — exactly like the web app. The service-role key is never used.
- **Recurrence Expansion:** When listing events for a specific date range, recurring events are automatically expanded into actual occurrences.
- **Dedicated Keyword Search:** Allows fast text-based searching of event titles and descriptions.

## Setup Instructions

### 1. Build the Server

Ensure you have Node.js installed, then run the following commands in the `mcp-server` directory:

```bash
# Install dependencies
npm install

# Compile the TypeScript code
npm run build
```

### 2. Configure Claude Desktop

Open your Claude Desktop configuration file. On Windows, this is located at:
`%APPDATA%\Claude\claude_desktop_config.json`

Add the `open-calendar` configuration block under `mcpServers`.

We recommend using the TypeScript executor `tsx` directly so you don't need to rebuild after editing. Replace `C:/path/to/terra-calendar` with the absolute path to your repository:

```json
{
  "mcpServers": {
    "open-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/path/to/terra-calendar/mcp-server/src/index.ts"
      ]
    }
  }
}
```

Alternatively, if you prefer running the precompiled production bundle, use the compiled `dist/index.js` file:

```json
{
  "mcpServers": {
    "open-calendar": {
      "command": "node",
      "args": [
        "C:/path/to/terra-calendar/mcp-server/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Desktop, and you will see a plug icon indicating that the Terra Calendar MCP server is connected.

### Custom Store File Path

If you want the MCP server to read/write events from a custom file location, you can set the `OPEN_CALENDAR_STORE_PATH` environment variable in your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "open-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/path/to/terra-calendar/mcp-server/src/index.ts"
      ],
      "env": {
        "OPEN_CALENDAR_STORE_PATH": "C:\\path\\to\\your\\custom-events.json"
      }
    }
  }
}
```

## Cloud edition (Supabase)

To manage the calendar from the **hosted** edition instead of the local file, give the server your Supabase project details and your account credentials in the `env` block. When all four variables below are present, the server talks to Supabase; otherwise it stays local.

```json
{
  "mcpServers": {
    "open-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/path/to/terra-calendar/mcp-server/src/index.ts"
      ],
      "env": {
        "OPEN_CALENDAR_SUPABASE_URL": "https://YOUR-PROJECT-ref.supabase.co",
        "OPEN_CALENDAR_SUPABASE_ANON_KEY": "sb_publishable_xxxxxxxx",
        "OPEN_CALENDAR_EMAIL": "you@example.com",
        "OPEN_CALENDAR_PASSWORD": "your-account-password"
      }
    }
  }
}
```

- `OPEN_CALENDAR_SUPABASE_URL` / `OPEN_CALENDAR_SUPABASE_ANON_KEY` — from **Settings → API Keys** in your Supabase project. Use the **publishable** key (starts with `sb_publishable_`) or the legacy **anon** key. **Never** use the `secret` / `service_role` key — it bypasses Row-Level Security.
- `OPEN_CALENDAR_EMAIL` / `OPEN_CALENDAR_PASSWORD` — the same account you sign in with on the hosted web app. The server authenticates as you, so it can only ever see and modify your own events.

The server signs in once at startup; if the credentials are wrong it exits immediately with an error in the Claude Desktop MCP logs.

### Forcing a backend

By default the backend is auto-detected (Supabase if the four variables above are set, otherwise local). To override:

- `OPEN_CALENDAR_BACKEND=local` — always use the local file, even if Supabase vars are present.
- `OPEN_CALENDAR_BACKEND=supabase` — require Supabase; if any variable is missing the server errors out instead of silently falling back to local.

## Available Tools

- **`list_events`**: Lists events.
  - If `start_date` and `end_date` (format: `YYYY-MM-DD`) are provided, it returns all individual occurrences of events (including expanded recurring events) within the range, sorted chronologically.
  - If no range is specified, it returns all raw event definitions.
  - Supports optional keyword `query` filter.
- **`search_events`**: Performs keyword search in event titles and descriptions.
- **`get_event`**: Returns detailed fields of a specific event by its UUID `id`.
- **`create_event`**: Adds a new event. Supports `title`, `date` (`YYYY-MM-DD`), optional `time` (`HH:mm`), optional timezone `tz`, `description`, `color`, and `recurrence` rule (weekly, monthly, or yearly).
- **`update_event`**: Updates fields of an existing event. Can modify any attribute, clear/change recurrence, or add exclusions to `exdates`.
- **`delete_event`**: Deletes an event by its UUID `id`.
