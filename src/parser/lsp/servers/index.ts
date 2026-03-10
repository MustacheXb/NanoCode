/**
 * Language Server Configurations
 * Pre-configured settings for supported language servers
 */

export interface LanguageServerInfo {
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  languages: string[];
  installation: string;
  website: string;
}

/**
 * Pre-configured language servers
 */
export const languageServers: Record<string, LanguageServerInfo> = {
  typescript: {
    name: 'TypeScript Language Server',
    description: 'Language server for TypeScript and JavaScript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    installation: 'npm install -g typescript-language-server typescript',
    website: 'https://github.com/typescript-language-server/typescript-language-server',
  },
  python: {
    name: 'Pyright',
    description: 'Fast static type checker for Python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    languages: ['python'],
    installation: 'npm install -g pyright',
    website: 'https://github.com/microsoft/pyright',
  },
  pythonJedi: {
    name: 'Jedi Language Server',
    description: 'Language server for Python using Jedi',
    command: 'jedi-language-server',
    args: [],
    languages: ['python'],
    installation: 'pip install jedi-language-server',
    website: 'https://github.com/pappasam/jedi-language-server',
  },
  go: {
    name: 'gopls',
    description: 'Go language server',
    command: 'gopls',
    args: ['mode=stdio'],
    languages: ['go'],
    installation: 'go install golang.org/x/tools/gopls@latest',
    website: 'https://pkg.go.dev/golang.org/x/tools/gopls',
  },
  rust: {
    name: 'rust-analyzer',
    description: 'Rust language server',
    command: 'rust-analyzer',
    args: [],
    languages: ['rust'],
    installation: 'rustup component add rust-analyzer',
    website: 'https://rust-analyzer.github.io/',
  },
};

/**
 * Get language server for a file extension
 */
export function getServerForExtension(ext: string): LanguageServerInfo | undefined {
  const normalized = ext.toLowerCase().replace('.', '');

  for (const server of Object.values(languageServers)) {
    if (server.languages.includes(normalized)) {
      return server;
    }
  }

  return undefined;
}

/**
 * Get language server for a language name
 */
export function getServerForLanguage(language: string): LanguageServerInfo | undefined {
  const normalized = language.toLowerCase();

  for (const server of Object.values(languageServers)) {
    if (server.languages.includes(normalized)) {
      return server;
    }
  }

  return undefined;
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): string[] {
  const languages = new Set<string>();
  for (const server of Object.values(languageServers)) {
    server.languages.forEach((lang) => languages.add(lang));
  }
  return Array.from(languages);
}

/**
 * Get all language server names
 */
export function getServerNames(): string[] {
  return Object.keys(languageServers);
}

/**
 * Check if a language server is installed
 */
export async function isServerInstalled(serverName: string): Promise<boolean> {
  const server = languageServers[serverName];
  if (!server) return false;

  try {
    const { execa } = await import('execa');

    // Try to find the command in PATH
    const command = process.platform === 'win32' ? 'where' : 'which';
    const result = await execa(command, [server.command], { reject: false });

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get installation instructions for a server
 */
export function getInstallInstructions(serverName: string): string | null {
  const server = languageServers[serverName];
  if (!server) return null;

  return `To install ${server.name}, run:\n  ${server.installation}\n\nFor more information, visit: ${server.website}`;
}