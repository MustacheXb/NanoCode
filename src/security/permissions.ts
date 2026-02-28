/**
 * Permission Management
 * Handles permission levels and user approval flows
 */

import type { PermissionLevel, Tool } from '../types/index.js';

export interface PermissionRequest {
  tool: string;
  action: string;
  parameters: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reason?: string;
}

export interface PermissionResponse {
  approved: boolean;
  remember?: boolean;
}

/**
 * Assess the risk level of a tool operation
 */
export function assessRisk(
  tool: Tool,
  parameters: Record<string, unknown>
): 'low' | 'medium' | 'high' | 'critical' {
  // If tool is marked as dangerous, start with medium
  let risk = tool.dangerous ? 'medium' : 'low';

  // Check for dangerous patterns in parameters
  const paramsString = JSON.stringify(parameters).toLowerCase();

  const criticalPatterns = [
    'rm -rf',
    'dd if=',
    '> /dev/sd',
    ':(){ :|:& };:', // fork bomb
    'chmod 777 /',
    'mkfs.',
    'format',
  ];

  const highPatterns = [
    'sudo',
    'su ',
    'curl | sh',
    'wget | sh',
    'eval(',
    'exec(',
  ];

  for (const pattern of criticalPatterns) {
    if (paramsString.includes(pattern)) {
      return 'critical';
    }
  }

  for (const pattern of highPatterns) {
    if (paramsString.includes(pattern)) {
      risk = 'high';
      break;
    }
  }

  // Check tool-specific risks
  if (tool.name === 'bash' || tool.name === 'chain') {
    risk = 'high';
  }

  if (tool.name === 'write' || tool.name === 'edit') {
    const filePath = parameters.file_path as string || '';
    const dangerousPaths = [
      '/etc/passwd',
      '/etc/shadow',
      '/.ssh/',
      'package.json',
      'package-lock.json',
    ];

    for (const dangerousPath of dangerousPaths) {
      if (filePath.includes(dangerousPath)) {
        return 'high';
      }
    }
  }

  return risk as 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Permission manager that handles user approval flows
 */
export class PermissionManager {
  private permissionLevel: PermissionLevel;
  private approvedOperations: Set<string>;
  private deniedOperations: Set<string>;
  private rememberDecisions: boolean;

  constructor(permissionLevel: PermissionLevel = 'ask', rememberDecisions: boolean = true) {
    this.permissionLevel = permissionLevel;
    this.approvedOperations = new Set();
    this.deniedOperations = new Set();
    this.rememberDecisions = rememberDecisions;
  }

  /**
   * Check if permission is required for an operation
   */
  requiresPermission(tool: Tool, parameters: Record<string, unknown>): boolean {
    const risk = assessRisk(tool, parameters);

    switch (this.permissionLevel) {
      case 'bypass':
        return false;
      case 'accept':
        return risk === 'critical';
      case 'ask':
        return risk !== 'low';
      case 'plan':
        return true;
      default:
        return true;
    }
  }

  /**
   * Request permission for an operation
   */
  async requestPermission(
    tool: Tool,
    parameters: Record<string, unknown>,
    interactiveCallback?: (request: PermissionRequest) => Promise<PermissionResponse>
  ): Promise<boolean> {
    const operationKey = this.getOperationKey(tool.name, parameters);
    const risk = assessRisk(tool, parameters);

    // Check cached decision
    if (this.approvedOperations.has(operationKey)) {
      return true;
    }

    if (this.deniedOperations.has(operationKey)) {
      return false;
    }

    // Check if permission is even required
    if (!this.requiresPermission(tool, parameters)) {
      return true;
    }

    const request: PermissionRequest = {
      tool: tool.name,
      action: this.getActionDescription(tool, parameters),
      parameters,
      riskLevel: risk,
      reason: this.getReason(risk),
    };

    // Use callback if provided (for interactive CLI)
    if (interactiveCallback) {
      const response = await interactiveCallback(request);

      if (this.rememberDecisions && response.remember) {
        if (response.approved) {
          this.approvedOperations.add(operationKey);
        } else {
          this.deniedOperations.add(operationKey);
        }
      }

      return response.approved;
    }

    // Non-interactive: auto-approve based on risk level
    return risk !== 'critical';
  }

  /**
   * Set the permission level
   */
  setPermissionLevel(level: PermissionLevel): void {
    this.permissionLevel = level;
  }

  /**
   * Get current permission level
   */
  getPermissionLevel(): PermissionLevel {
    return this.permissionLevel;
  }

  /**
   * Clear cached decisions
   */
  clearDecisions(): void {
    this.approvedOperations.clear();
    this.deniedOperations.clear();
  }

  /**
   * Set whether to remember decisions
   */
  setRememberDecisions(remember: boolean): void {
    this.rememberDecisions = remember;
  }

  /**
   * Get operation key for caching decisions
   */
  private getOperationKey(toolName: string, parameters: Record<string, unknown>): string {
    // Create a normalized key from the operation
    const paramsStr = JSON.stringify(
      Object.keys(parameters)
        .sort()
        .reduce((acc, key) => {
          acc[key] = parameters[key];
          return acc;
        }, {} as Record<string, unknown>)
    );
    return `${toolName}:${paramsStr}`;
  }

  /**
   * Get human-readable action description
   */
  private getActionDescription(tool: Tool, parameters: Record<string, unknown>): string {
    switch (tool.name) {
      case 'read':
        return `Read file: ${parameters.file_path}`;
      case 'write':
        return `Write to file: ${parameters.file_path}`;
      case 'edit':
        return `Edit file: ${parameters.file_path}`;
      case 'bash':
        return `Run command: ${parameters.command}`;
      case 'webfetch':
        return `Fetch from URL: ${parameters.url}`;
      default:
        return `Execute tool: ${tool.name}`;
    }
  }

  /**
   * Get reason for permission request
   */
  private getReason(risk: 'low' | 'medium' | 'high' | 'critical'): string {
    const reasons = {
      low: 'This operation is safe to execute.',
      medium: 'This operation could modify files or system state.',
      high: 'This operation involves elevated privileges or significant changes.',
      critical: 'This operation is potentially dangerous and could cause data loss or system damage.',
    };

    return reasons[risk];
  }

  /**
   * Get cached decisions (for export/import)
   */
  exportDecisions(): {
    approved: string[];
    denied: string[];
  } {
    return {
      approved: Array.from(this.approvedOperations),
      denied: Array.from(this.deniedOperations),
    };
  }

  /**
   * Import cached decisions
   */
  importDecisions(decisions: { approved: string[]; denied: string[] }): void {
    this.approvedOperations = new Set(decisions.approved);
    this.deniedOperations = new Set(decisions.denied);
  }
}

/**
 * Create a permission manager with the specified level
 */
export function createPermissionManager(
  level: PermissionLevel = 'ask'
): PermissionManager {
  return new PermissionManager(level);
}
