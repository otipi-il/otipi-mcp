<a href="https://otipi.co.il"><img src=".github/otipi-logo.png" alt="Otipi" width="64" height="64"></a>

# otipi-mcp

[![npm](https://img.shields.io/npm/v/otipi-mcp?color=f0481c&label=npm)](https://www.npmjs.com/package/otipi-mcp) [![test](https://github.com/otipi-il/otipi-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/otipi-il/otipi-mcp/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-15120f)](LICENSE) [![Website](https://img.shields.io/badge/otipi.co.il-15120f)](https://otipi.co.il)

MCP server for [Otipi](https://otipi.co.il), an SMS, email and OTP API for Israel. It lets AI agents (Claude Code, Cursor, Claude Desktop, VS Code) send and verify one-time codes in test mode, check delivery, and generate ready-to-paste integration code for Next.js, Supabase and Express.

Zero runtime dependencies. Plain Node.js (>= 18), stdio transport.


## Remote server, nothing to install

The same tools run at **https://otipi.co.il/mcp** (Streamable HTTP).

- **Claude.ai, ChatGPT** and other apps with connectors: add a custom connector with that address. You sign in to Otipi and allow it (OAuth); the app gets a test key of its own that you can revoke in the dashboard.
- **Claude Code**: `claude mcp add --transport http otipi https://otipi.co.il/mcp --header "Authorization: Bearer sk_test_..."`
- **Cursor** (`.cursor/mcp.json`): `{ "mcpServers": { "otipi": { "url": "https://otipi.co.il/mcp", "headers": { "Authorization": "Bearer sk_test_..." } } } }`
- **VS Code**: `{ "name": "otipi", "type": "http", "url": "https://otipi.co.il/mcp", "headers": { "Authorization": "Bearer sk_test_..." } }`

A free test key comes in one click after sign-up at https://otipi.co.il/signup. This npm package is the local alternative for clients that only run stdio servers.

## Get a key

Sign up at https://otipi.co.il/signup to get a free test key (`sk_test_...`). Live keys (`sk_live_...`) send real messages and need a subscription.

The key is read only from the `OTIPI_KEY` environment variable (`OTIPI_API_KEY` is accepted as a fallback). `OTIPI_BASE_URL` is optional and defaults to `https://otipi.co.il`.

## Install

### Claude Code

```
claude mcp add otipi --env OTIPI_KEY=sk_test_... -- npx -y otipi-mcp
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "otipi": {
      "command": "npx",
      "args": ["-y", "otipi-mcp"],
      "env": { "OTIPI_KEY": "sk_test_..." }
    }
  }
}
```

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "otipi": {
      "command": "npx",
      "args": ["-y", "otipi-mcp"],
      "env": { "OTIPI_KEY": "sk_test_..." }
    }
  }
}
```

### VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "otipi": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "otipi-mcp"],
      "env": { "OTIPI_KEY": "sk_test_..." }
    }
  }
}
```

On Windows, if `npx` is not found by your client, use `"command": "cmd", "args": ["/c", "npx", "-y", "otipi-mcp"]`.

## Test-mode flow

With a test key, messages to anyone are only kept in the Otipi log (sandbox). Messages to your own numbers or emails really arrive once you confirm them with a code. Each account gets 5 free test SMS for life.

1. `add_test_recipient` with your number (`+9725XXXXXXXX`). A 6-digit code is sent to it.
2. The human reads the code on the device.
3. `confirm_test_recipient` with the number and the code.
4. `send_test_otp` now really delivers. The result states whether delivery was real or sandbox.
5. `verify_otp` with the code the human received (or the `test_code` returned in test mode).

## Tools

| Tool | What it does |
| --- | --- |
| `send_test_otp` | Send an OTP (sms or email). Reports real vs sandbox delivery and includes `test_code`. |
| `verify_otp` | Check a code for a recipient. |
| `add_test_recipient` | Start confirming a number or email as a test recipient. |
| `confirm_test_recipient` | Finish confirmation with the 6-digit code. |
| `list_test_recipients` | List recipients and the free test SMS left. |
| `check_delivery_status` | Look up a message and its event timeline. |
| `get_integration_snippet` | Offline, no key needed. Code for `nextjs`, `supabase` or `express` (`ts` or `js`). |

Tool failures are returned as normal results with `isError: true` and a plain explanation of what to do next.

## Security notes

- The API key lives in the environment only. It is never printed, logged or returned by any tool.
- Use free `sk_test_` keys for development. Do not put `sk_live_` keys into shared config files or repositories.
- Requests use a 15 second timeout, no redirects, and `Authorization: Bearer` over HTTPS.
- stdout carries only JSON-RPC messages; diagnostics go to stderr.

## Development

```
npm test
```

The tests spawn the server and drive it over stdio against a local fake Otipi API. No network access is needed.

## Publishing (for maintainers)

Not automated: a maintainer runs these by hand.

The GitHub owner is set to `otipi-il` in `package.json` (`mcpName`, `repository`) and `server.json` (`name`, `repository`). The `mcpName` must start with `io.github.<github-username>/` for GitHub login, so adjust all of these together if the repository lives under a different owner.

```
npm publish --access public
mcp-publisher login github
mcp-publisher publish
```

Keep `version` in `package.json` and `server.json` (both the top level and the package entry) identical on every release. `node scripts/validate-server-json.mjs <schema.json>` checks `server.json` against the schema from `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`.

## License

MIT
