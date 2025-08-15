#!/usr/bin/env node

// External imports
import * as dotenv from "dotenv";
import sql from "mssql";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";

// Internal imports
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

// Load environment variables
dotenv.config();

// Globals for connection reuse
let globalSqlPool: sql.ConnectionPool | null = null;
let connectionRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;
const DEBUG = process.env.DEBUG?.toLowerCase() === 'true';

// Debug logging helper
function debugLog(...args: any[]) {
  if (DEBUG) {
    console.error('[MSSQL-MCP DEBUG]', new Date().toISOString(), ...args);
  }
}

// Function to create SQL config for standard SQL authentication
export function createSqlConfig(): sql.config {
  const trustServerCertificate = process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true';
  const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 1433;
  
  // Validate port number
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${process.env.PORT}. Must be between 1 and 65535.`);
  }
  
  // Platform-specific adjustments
  const platform = os.platform();
  const isMacOS = platform === 'darwin';
  
  // Use longer timeout on macOS if not specified
  const adjustedTimeout = isMacOS && !process.env.CONNECTION_TIMEOUT ? 60 : connectionTimeout;
  
  debugLog('Platform:', platform);
  debugLog('Configuration:', {
    server: process.env.SERVER_NAME,
    database: process.env.DATABASE_NAME,
    port,
    trustServerCertificate,
    connectionTimeout: adjustedTimeout,
    isMacOS
  });

  return {
    server: process.env.SERVER_NAME!,
    port: port,
    database: process.env.DATABASE_NAME!,
    user: process.env.SQL_USERNAME!,
    password: process.env.SQL_PASSWORD!,
    options: {
      encrypt: true,
      trustServerCertificate: isMacOS ? true : trustServerCertificate, // macOS often needs this
      enableArithAbort: true,
      // macOS specific TLS settings
      ...(isMacOS && {
        cryptoCredentialsDetails: {
          minVersion: 'TLSv1.2'
        }
      })
    },
    connectionTimeout: adjustedTimeout * 1000, // convert seconds to milliseconds
    requestTimeout: adjustedTimeout * 1000, // Also set request timeout
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: adjustedTimeout * 1000
    }
  };
}

const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

const server = new Server(
  {
    name: "mssql-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Read READONLY env variable
const isReadOnly = process.env.READONLY === "true";

// Request handlers

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: isReadOnly
    ? [listTableTool, readDataTool, describeTableTool] // todo: add searchDataTool to the list of tools available in readonly mode once implemented
    : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool], // add all new tools here
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case insertDataTool.name:
        result = await insertDataTool.run(args);
        break;
      case readDataTool.name:
        result = await readDataTool.run(args);
        break;
      case updateDataTool.name:
        result = await updateDataTool.run(args);
        break;
      case createTableTool.name:
        result = await createTableTool.run(args);
        break;
      case createIndexTool.name:
        result = await createIndexTool.run(args);
        break;
      case listTableTool.name:
        result = await listTableTool.run(args);
        break;
      case dropTableTool.name:
        result = await dropTableTool.run(args);
        break;
      case describeTableTool.name:
        if (!args || typeof args.tableName !== "string") {
          return {
            content: [{ type: "text", text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
            isError: true,
          };
        }
        result = await describeTableTool.run(args as { tableName: string });
        break;
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error occurred: ${error}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

// Connect to SQL only when handling a request
async function ensureSqlConnection() {
  // If we have a pool and it's connected, reuse it
  if (globalSqlPool && globalSqlPool.connected) {
    debugLog('Using existing connection pool');
    return;
  }

  debugLog('Creating new connection...');
  
  // Close old pool if exists
  if (globalSqlPool) {
    debugLog('Closing existing pool...');
    try {
      await globalSqlPool.close();
    } catch (err) {
      debugLog('Error closing pool:', err);
    }
    globalSqlPool = null;
  }

  let lastError: any = null;
  
  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      debugLog(`Connection attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`);
      
      const config = createSqlConfig();
      globalSqlPool = await sql.connect(config);
      
      debugLog('Connection successful!');
      connectionRetryCount = 0; // Reset retry count on success
      
      // Set up error handlers for the pool
      globalSqlPool.on('error', (err: any) => {
        console.error('SQL Pool Error:', err);
        debugLog('Pool error occurred:', err);
        // Mark pool as null so next request will reconnect
        globalSqlPool = null;
      });
      
      return;
    } catch (err: any) {
      lastError = err;
      console.error(`Connection attempt ${attempt} failed:`, err.message);
      debugLog('Full error details:', err);
      
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        debugLog(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we get here, all retries failed
  throw new Error(`Failed to connect after ${MAX_RETRY_ATTEMPTS} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Patch all tool handlers to ensure SQL connection before running
function wrapToolRun(tool: { run: (...args: any[]) => Promise<any> }) {
  const originalRun = tool.run.bind(tool);
  tool.run = async function (...args: any[]) {
    await ensureSqlConnection();
    return originalRun(...args);
  };
}

[insertDataTool, readDataTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool, describeTableTool].forEach(wrapToolRun);