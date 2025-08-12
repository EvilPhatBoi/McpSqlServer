# MSSQL MCP Server

A Model Context Protocol (MCP) server that enables LLMs like Claude to interact with Microsoft SQL Server databases through natural language.

## Features

- 🔍 Query your SQL Server database using natural language
- 📊 Read, insert, update, and delete data
- 🏗️ Create and manage tables and indexes
- 🔒 Secure connection handling with optional read-only mode
- ⚡ Direct TypeScript execution with tsx - no build step required

## Quick Start

### Option 1: Use directly from GitHub with npx (Recommended)

No installation needed! Just configure Claude Desktop:

#### Windows
Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mssql": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:EvilPhatBoi/McpSqlServer"],
      "env": {
        "SERVER_NAME": "your-server.database.windows.net",
        "DATABASE_NAME": "your-database",
        "SQL_USERNAME": "your-username",
        "SQL_PASSWORD": "your-password",
        "PORT": "1433",
        "TRUST_SERVER_CERTIFICATE": "false",
        "CONNECTION_TIMEOUT": "30",
        "READONLY": "false"
      }
    }
  }
}
```

#### macOS/Linux
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mssql": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:EvilPhatBoi/McpSqlServer"],
      "env": {
        "SERVER_NAME": "your-server.database.windows.net",
        "DATABASE_NAME": "your-database",
        "SQL_USERNAME": "your-username",
        "SQL_PASSWORD": "your-password",
        "PORT": "1433",
        "TRUST_SERVER_CERTIFICATE": "false",
        "CONNECTION_TIMEOUT": "30",
        "READONLY": "false"
      }
    }
  }
}
```

### Option 2: Clone and run locally

1. Clone the repository:
```bash
git clone https://github.com/EvilPhatBoi/McpSqlServer.git
cd McpSqlServer
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Configure Claude Desktop to point to your local installation:

```json
{
  "mcpServers": {
    "mssql": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "C:/path/to/McpSqlServer/src/index.ts"],
      "env": {
        "SERVER_NAME": "your-server.database.windows.net",
        "DATABASE_NAME": "your-database",
        "SQL_USERNAME": "your-username",
        "SQL_PASSWORD": "your-password"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_NAME` | SQL Server hostname | Required |
| `DATABASE_NAME` | Database name | Required |
| `SQL_USERNAME` | SQL username | Required |
| `SQL_PASSWORD` | SQL password | Required |
| `PORT` | SQL Server port | `1433` |
| `TRUST_SERVER_CERTIFICATE` | Trust self-signed certificates | `false` |
| `CONNECTION_TIMEOUT` | Connection timeout in seconds | `30` |
| `READONLY` | Enable read-only mode | `false` |

## Usage Examples

Once configured, you can interact with your database using natural language in Claude:

- "Show me all customers from New York"
- "Create a table called products with columns for id, name, and price"
- "Update the price of product with id 5 to 29.99"
- "List all tables in the database"
- "Describe the structure of the orders table"

## Development

### Running locally with tsx:
```bash
npm run start  # Run the server
npm run dev    # Run with watch mode
```

### Type checking:
```bash
npm run typecheck
```

## Security Notes

- Never commit `.env` files with real credentials
- Use read-only mode (`READONLY=true`) in production for safety
- The server requires WHERE clauses for updates to prevent accidental mass updates
- Consider using environment-specific credentials

## Troubleshooting

### Connection issues
- Ensure your SQL Server allows remote connections
- Check firewall rules for SQL Server port (default 1433, or your custom PORT setting)
- Verify credentials and server name

### Authentication errors
- This server uses SQL authentication, not Windows authentication
- Ensure SQL authentication is enabled on your server
- Check that the SQL user has appropriate permissions

## License

MIT
