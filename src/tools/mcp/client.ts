/**
 * MCP (Model Context Protocol) Client
 * Handles communication with MCP servers
 */

import type { Tool, ToolResult } from '../../types/index.js';
import { spawn, ChildProcess } from 'child_process';

export interface MCPServerInfo {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPTool extends Tool {
  server: string; // Name of the MCP server
}

export class MCPClient {
  private servers: Map<string, ChildProcess>;
  private serverInfo: Map<string, MCPServerInfo>;
  private serverTools: Map<string, MCPTool[]>;
  private requestTimeout: number;

  constructor(timeoutMs: number = 30000) {
    this.servers = new Map();
    this.serverInfo = new Map();
    this.serverTools = new Map();
    this.requestTimeout = timeoutMs;
  }

  /**
   * Connect to an MCP server
   */
  async connect(info: MCPServerInfo): Promise<boolean> {
    if (this.servers.has(info.name)) {
      return true; // Already connected
    }

    try {
      const childProcess = spawn(info.command, info.args || [], {
        env: info.env ? { ...process.env, ...info.env } : process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.servers.set(info.name, childProcess);
      this.serverInfo.set(info.name, info);

      // Initialize the server (send initialize request)
      await this.initializeServer(info.name, childProcess);

      return true;
    } catch (error) {
      console.error(`Failed to connect to MCP server ${info.name}:`, error);
      return false;
    }
  }

  /**
   * Initialize an MCP server connection
   */
  private async initializeServer(name: string, _process: ChildProcess): Promise<void> {
    // Send JSON-RPC initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: {
          name: 'nanoagent',
          version: '0.1.0',
        },
      },
    };

    this.sendRequest(name, initRequest);

    // Wait for initialized response
    await this.waitForResponse(name, 1);

    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    };

    this.sendRequest(name, initializedNotification);

    // List available tools from the server
    await this.listServerTools(name);
  }

  /**
   * List available tools from a server
   */
  private async listServerTools(name: string): Promise<void> {
    const listRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
    };

    this.sendRequest(name, listRequest);
    const response = await this.waitForResponse(name, listRequest.id as number);

    if (response && response.result) {
      const tools: MCPTool[] = (response.result.tools || []).map((tool: any) => ({
        server: name,
        name: tool.name,
        description: tool.description || '',
        parameters: (tool.inputSchema?.properties || []).map((param: any) => ({
          name: param.name,
          type: param.type,
          description: param.description || '',
          required: tool.inputSchema?.required?.includes(param.name) || false,
        })),
        execute: async (params: Record<string, unknown>) => {
          return this.callTool(name, tool.name, params);
        },
      }));

      this.serverTools.set(name, tools);
    }
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(serverName: string, toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    const server = this.servers.get(serverName);

    if (!server) {
      return {
        success: false,
        data: null,
        error: `MCP server not connected: ${serverName}`,
      };
    }

    try {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params,
        },
      };

      this.sendRequest(serverName, request);
      const response = await this.waitForResponse(serverName, request.id as number);

      if (response?.error) {
        return {
          success: false,
          data: null,
          error: response.error.message || 'Unknown error from MCP server',
        };
      }

      return {
        success: true,
        data: response?.result,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  }

  /**
   * List resources from an MCP server
   */
  async listResources(serverName: string): Promise<MCPResource[]> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/list',
    };

    this.sendRequest(serverName, request);
    const response = await this.waitForResponse(serverName, request.id as number);

    return response?.result?.resources || [];
  }

  /**
   * Read a resource from an MCP server
   */
  async readResource(serverName: string, uri: string): Promise<string> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: { uri },
    };

    this.sendRequest(serverName, request);
    const response = await this.waitForResponse(serverName, request.id as number);

    return response?.result?.contents?.[0]?.text || '';
  }

  /**
   * Send a JSON-RPC request to a server
   */
  private sendRequest(serverName: string, request: Record<string, unknown>): void {
    const server = this.servers.get(serverName);

    if (!server || !server.stdin) {
      throw new Error(`Server not available: ${serverName}`);
    }

    const json = JSON.stringify(request);
    server.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  /**
   * Wait for a response from a server
   */
  private waitForResponse(serverName: string, requestId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const server = this.servers.get(serverName);

      if (!server || !server.stdout) {
        reject(new Error(`Server not available: ${serverName}`));
        return;
      }

      let buffer = Buffer.alloc(0);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('MCP request timeout'));
      }, this.requestTimeout);

      const cleanup = () => {
        if (server.stdout) {
          server.stdout.off('data', onData);
        }
        clearTimeout(timeout);
      };

      const onData = (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);

        // Try to parse complete messages
        const text = buffer.toString('utf-8');
        const lines = text.split('\r\n');

        let i = 0;
        while (i < lines.length) {
          const contentLengthMatch = lines[i].match(/^Content-Length:\s*(\d+)/);
          if (contentLengthMatch) {
            const contentLength = parseInt(contentLengthMatch[1], 10);
            const messageStart = lines[i + 2]; // Skip the empty line after header

            if (messageStart && messageStart.length >= contentLength) {
              try {
                const message = JSON.parse(messageStart.substring(0, contentLength));

                if (message.id === requestId) {
                  cleanup();
                  resolve(message);

                  // Remove processed data from buffer
                  const processedBytes = lines.slice(0, i + 3).join('\r\n').length;
                  buffer = buffer.slice(processedBytes);
                  return;
                }
              } catch (e) {
                // Invalid JSON, continue
              }

              i += 3;
            } else {
              i++;
            }
          } else {
            i++;
          }
        }
      };

      server.stdout!.on('data', onData);
    });
  }

  /**
   * Disconnect from a server
   */
  disconnect(name: string): void {
    const server = this.servers.get(name);

    if (server) {
      server.kill();
      this.servers.delete(name);
      this.serverInfo.delete(name);
      this.serverTools.delete(name);
    }
  }

  /**
   * Disconnect from all servers
   */
  disconnectAll(): void {
    for (const name of this.servers.keys()) {
      this.disconnect(name);
    }
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = [];

    for (const tools of this.serverTools.values()) {
      allTools.push(...tools);
    }

    return allTools;
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverName: string): MCPTool[] {
    return this.serverTools.get(serverName) || [];
  }

  /**
   * Check if a server is connected
   */
  isConnected(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }
}
