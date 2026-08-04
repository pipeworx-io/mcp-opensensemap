# mcp-opensensemap

openSenseMap MCP — citizen-science environmental sensor network (opensensemap.org)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Opensensemap data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
