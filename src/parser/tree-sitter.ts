/**
 * Tree-sitter Parser
 * Re-export from the Tree-sitter module
 */

export {
  TreeSitterParser,
  createTreeSitterParser,
  type ParseOptions,
  type ParseResult,
} from './tree-sitter/parser.js';

export {
  languageQueries,
  getQueryForLanguage,
  getSupportedQueryLanguages,
} from './tree-sitter/queries/index.js';