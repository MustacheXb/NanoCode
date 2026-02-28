/**
 * MCP Server Management
 * Manages connection and lifecycle of MCP servers
 */

import type { MCPServerConfig, Tool } from '../../types/index.js';
import { MCPClient, MCPServerInfo } from './client.js';

export class MCPServerManager {
  private client: MCPClient;
  private servers: Map<string, MCPServerInfo>;
  private enabledServers: Set<string>;

  constructor() {
    this.client = new MCPClient();
    this.servers = new Map();
    this.enabledServers = new Set();
  }

  /**
   * Configure MCP servers
   */
  configure(configs: MCPServerConfig[]): void {
    this.servers.clear();

    for (const config of configs) {
      this.servers.set(config.name, {
        name: config.name,
        command: config.command,
        args: config.args,
        env: config.env,
      });
    }
  }

  /**
   * Connect to a specific server
   */
  async connect(name: string): Promise<boolean> {
    const info = this.servers.get(name);

    if (!info) {
      console.warn(`MCP server not configured: ${name}`);
      return false;
    }

    const success = await this.client.connect(info);

    if (success) {
      this.enabledServers.add(name);
    }

    return success;
  }

  /**
   * Disconnect from a specific server
   */
  disconnect(name: string): void {
    this.client.disconnect(name);
    this.enabledServers.delete(name);
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(): Promise<{ name: string; success: boolean }[]> {
    const results: Array<{ name: string; success: boolean }> = [];

    for (const [name, info] of this.servers.entries()) {
      const success = await this.client.connect(info);

      if (success) {
        this.enabledServers.add(name);
      }

      results.push({ name, success });
    }

    return results;
  }

  /**
   * Disconnect from all servers
   */
  disconnectAll(): void {
    this.client.disconnectAll();
    this.enabledServers.clear();
  }

  /**
   * Get all available tools from MCP servers
   */
  async getAllTools(): Promise<Tool[]> {
    await this.connectAll();
    return this.client.getAllTools();
  }

  /**
   * Get tools from a specific server
   */
  async getServerTools(name: string): Promise<Tool[]> {
    if (!this.enabledServers.has(name)) {
      await this.connect(name);
    }

    return this.client.getServerTools(name);
  }

  /**
   * Check if a server is connected
   */
  isServerConnected(name: string): boolean {
    return this.client.isConnected(name);
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return this.client.getConnectedServers();
  }

  /**
   * Get client instance for direct use
   */
  getClient(): MCPClient {
    return this.client;
  }
}

/**
 * Global MCP server manager instance
 */
export const mcpServerManager = new MCPServerManager();

/**
 * Initialize MCP servers from config
 */
export async function initializeMCPServers(configs: MCPServerConfig[]): Promise<Tool[]> {
  mcpServerManager.configure(configs);
  return await mcpServerManager.getAllTools();
}
