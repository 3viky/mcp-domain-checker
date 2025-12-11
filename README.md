# Domain Checker MCP Server

Model Context Protocol (MCP) server for domain availability checking and intelligent domain recommendations.

## Purpose

Provides AI agents with domain name checking capabilities, including:

- Check if a single domain is available for registration
- Batch check multiple domains at once
- Generate intelligent domain name suggestions based on keywords
- Support for multiple TLDs (Top Level Domains)

## Features

### Available Tools

| Tool | Description |
|------|-------------|
| `check_domain` | Check if a single domain name is available |
| `check_domains_batch` | Check availability for multiple domains at once |
| `suggest_domains` | Generate domain name suggestions based on keywords |

### Intelligent Features

- **WHOIS Integration**: Uses the whoiser library for accurate domain availability checks
- **Multi-TLD Support**: Check domains across .com, .org, .net, .io, .app, and more
- **Smart Suggestions**: Generates creative domain combinations from keywords
- **Batch Processing**: Efficiently check multiple domains in a single request

## Installation

```bash
# Install dependencies
npm install
# or
pnpm install

# Build the server
npm run build
```

## Configuration

No configuration required by default. The server uses public WHOIS services.

### For Claude Code MCP Configuration

Add to your `~/.config/claude-code/mcp-servers.json`:

```json
{
  "mcpServers": {
    "domain-checker": {
      "command": "node",
      "args": ["/path/to/mcp-domain-checker/dist/index.js"]
    }
  }
}
```

## Usage Examples

### Check Single Domain

```typescript
// Check if example.com is available
await check_domain({ domain: "example.com" })
```

### Batch Check Multiple Domains

```typescript
// Check multiple domains at once
await check_domains_batch({
  domains: ["myapp.com", "myapp.io", "myapp.dev"]
})
```

### Generate Domain Suggestions

```typescript
// Get 10 domain suggestions for a tech startup
await suggest_domains({
  keywords: ["tech", "startup", "ai"],
  count: 10,
  tlds: ["com", "io", "ai", "dev"]
})
```

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build

# Type checking
tsc --noEmit
```

## API Reference

### check_domain

Check if a single domain name is available.

**Parameters:**
- `domain` (string, required): The domain name to check (e.g., "example.com")

**Returns:**
- `available` (boolean): Whether the domain is available
- `domain` (string): The checked domain name
- `whoisData` (object, optional): Raw WHOIS data if available

### check_domains_batch

Check availability for multiple domain names at once.

**Parameters:**
- `domains` (string[], required): Array of domain names to check

**Returns:**
- Array of availability results for each domain

### suggest_domains

Generate domain name suggestions based on keywords.

**Parameters:**
- `keywords` (string[], required): Keywords to use for suggestions
- `count` (number, optional): Maximum number of suggestions (default: 10)
- `tlds` (string[], optional): TLDs to check (default: ["com", "org", "net", "io", "app"])

**Returns:**
- Array of available domain suggestions with metadata

## License

MIT

## Author

Built with Claude Code

## Repository

https://github.com/3viky/mcp-domain-checker
