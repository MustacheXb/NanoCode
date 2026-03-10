/**
 * JSON-RPC 2.0 Message Handler
 * Implements the JSON-RPC protocol for LSP communication
 */

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Standard JSON-RPC error codes
 */
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // LSP specific error codes
  ServerNotInitialized: -32002,
  UnknownErrorCode: -32001,
  RequestFailed: -32803,
  ServerCancelled: -32802,
  ContentModified: -32801,
  RequestCancelled: -32800,
} as const;

/**
 * JSON-RPC 2.0 Message Handler
 */
export class JSONRPCHandler {
  private requestId = 0;

  /**
   * Generate a unique request ID
   */
  generateId(): number {
    return ++this.requestId;
  }

  /**
   * Reset the request ID counter
   */
  resetId(): void {
    this.requestId = 0;
  }

  /**
   * Format a JSON-RPC request message
   */
  formatRequest(method: string, params?: unknown, id?: number | string): JSONRPCRequest {
    return {
      jsonrpc: '2.0',
      id: id ?? this.generateId(),
      method,
      params,
    };
  }

  /**
   * Format a JSON-RPC notification message
   */
  formatNotification(method: string, params?: unknown): JSONRPCNotification {
    return {
      jsonrpc: '2.0',
      method,
      params,
    };
  }

  /**
   * Format a JSON-RPC response message
   */
  formatResponse(id: number | string, result: unknown): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * Format a JSON-RPC error response message
   */
  formatErrorResponse(id: number | string, error: JSONRPCError): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }

  /**
   * Create a JSON-RPC error object
   */
  createError(code: number, message: string, data?: unknown): JSONRPCError {
    return { code, message, data };
  }

  /**
   * Serialize a message to a string with Content-Length header
   * This is the standard LSP transport format
   */
  serializeMessage(message: JSONRPCRequest | JSONRPCNotification | JSONRPCResponse): string {
    const content = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(content, 'utf-8')}\r\n\r\n${content}`;
  }

  /**
   * Parse a message from a buffer
   * Returns the parsed message and the number of bytes consumed
   */
  parseMessage(buffer: Buffer): { message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification | null; consumed: number } {
    // Find the Content-Length header
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return { message: null, consumed: 0 };
    }

    const header = buffer.toString('utf-8', 0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);

    if (!contentLengthMatch) {
      throw new Error('Invalid message: missing Content-Length header');
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const contentStart = headerEnd + 4;
    const totalLength = contentStart + contentLength;

    if (buffer.length < totalLength) {
      return { message: null, consumed: 0 };
    }

    const content = buffer.toString('utf-8', contentStart, totalLength);
    const message = JSON.parse(content) as JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;

    return { message, consumed: totalLength };
  }

  /**
   * Check if a message is a request
   */
  isRequest(message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification): message is JSONRPCRequest {
    return 'id' in message && 'method' in message;
  }

  /**
   * Check if a message is a response
   */
  isResponse(message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification): message is JSONRPCResponse {
    return 'id' in message && !('method' in message);
  }

  /**
   * Check if a message is a notification
   */
  isNotification(message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification): message is JSONRPCNotification {
    return !('id' in message) && 'method' in message;
  }

  /**
   * Check if a response has an error
   */
  isErrorResponse(response: JSONRPCResponse): boolean {
    return response.error !== undefined;
  }
}

/**
 * Create a JSON-RPC handler
 */
export function createJSONRPCHandler(): JSONRPCHandler {
  return new JSONRPCHandler();
}