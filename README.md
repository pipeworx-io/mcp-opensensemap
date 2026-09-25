# mcp-opensensemap

openSenseMap MCP — citizen-science environmental sensor network (opensensemap.org)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `opensensemap_nearby` | Find citizen science sensor stations (senseBox, openSenseMap network) near a lat/lon and return their latest readings — hyperlocal temperature, humidity, air pressure, PM2.5/PM10 air quality, illuminance, UV, noise. Answers "sensor readings near me", "what does the local air quality sensor say". Community-operated uncalibrated hardware: quality varies, so cross-check outliers. Filter to one measurement type with `phenomenon` ( |
| `opensensemap_box` | Get one openSenseMap citizen science sensor station (senseBox) by its box id — full sensor readout with latest value, unit, and measurement time per sensor (temperature, humidity, PM2.5/PM10 air quality, pressure, noise...), plus location, exposure (outdoor/indoor/mobile) and station metadata. Box ids come from opensensemap_nearby. Community-operated uncalibrated sensors. Example: opensensemap_box({ box_id: "65e8d93acbf5700007f920ca" }) |
| `opensensemap_area_average` | Average one phenomenon across all citizen science sensors (openSenseMap / senseBox network) in an area — hyperlocal neighborhood-level temperature, PM2.5/PM10 air quality, humidity, pressure or noise from many independent community stations. Give either a bounding box or a center point + radius_km. Aggregates the latest reading per sensor over the recent window client-side (the network has no fast server-side aggregation). |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "opensensemap": {
      "url": "https://gateway.pipeworx.io/opensensemap/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/opensensemap/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/opensensemap_nearby \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.52,"longitude":13.405}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/opensensemap_nearby`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "opensensemap": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-opensensemap"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-opensensemap
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Opensensemap data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
