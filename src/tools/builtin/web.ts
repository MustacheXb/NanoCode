/**
 * Built-in Web Tools
 * webfetch, websearch operations
 */

import type { Tool, ToolResult } from '../../types/index.js';

/**
 * Fetch content from a URL
 */
export const webfetchTool: Tool = {
  name: 'webfetch',
  description: 'Fetch and return content from a URL. Returns the text content of the page.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to fetch',
      required: true,
    },
    {
      name: 'method',
      type: 'string',
      description: 'HTTP method (GET, POST, etc.)',
      required: false,
      default: 'GET',
    },
    {
      name: 'headers',
      type: 'object',
      description: 'HTTP headers',
      required: false,
    },
    {
      name: 'body',
      type: 'string',
      description: 'Request body (for POST requests)',
      required: false,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const url = params.url as string;
      const method = (params.method as string) ?? 'GET';
      const headers = params.headers as Record<string, string> | undefined;
      const body = params.body as string | undefined;

      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'NanoAgent/0.1.0',
          ...headers,
        },
        body,
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      let content: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else if (contentType.includes('text/') || contentType.includes('application/')) {
        content = await response.text();
      } else {
        // For binary content, return info about it
        content = `[Binary content: ${contentType}, size: ${response.headers.get('content-length')} bytes]`;
      }

      return {
        success: true,
        data: {
          url,
          content,
          contentType,
          status: response.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Search the web
 */
export const websearchTool: Tool = {
  name: 'websearch',
  description: 'Search the web and return results. Use for finding up-to-date information.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The search query',
      required: true,
    },
    {
      name: 'count',
      type: 'number',
      description: 'Maximum number of results to return',
      required: false,
      default: 10,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const query = params.query as string;
      const count = (params.count as number) ?? 10;
      void query;
      void count;

      // Note: This is a placeholder implementation
      // In production, you'd integrate with a real search API (e.g., Bing, Google, DuckDuckGo)
      // For now, we'll use a simple approach or return a message

      const engine = process.env.NANOAGENT_SEARCH_ENGINE || 'duckduckgo';

      // Placeholder: In production, implement actual search API integration
      if (engine === 'duckduckgo') {
        // You could use the DuckDuckGo API or scrape the results
        // For now, return a simulated response
        return {
          success: false,
          data: null,
          error: 'Web search not configured. Please set up NANOAGENT_SEARCH_ENGINE environment variable or implement search API integration.',
        };
      }

      return {
        success: false,
        data: null,
        error: 'Web search functionality requires API integration. See documentation for setup.',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};
