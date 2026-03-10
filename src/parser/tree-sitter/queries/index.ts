/**
 * Tree-sitter Language Queries
 * Language-specific queries for symbol extraction
 */

/**
 * Query strings for each language
 */
export const languageQueries: Record<string, string> = {
  typescript: `
    ; Functions
    (function_declaration name: (identifier) @name) @function
    (function_expression name: (identifier) @name) @function
    (generator_function_declaration name: (identifier) @name) @function

    ; Arrow functions assigned to variables
    (variable_declarator name: (identifier) @name value: (arrow_function)) @function

    ; Classes
    (class_declaration name: (type_identifier) @name) @class
    (class_expression name: (identifier) @name) @class

    ; Interfaces
    (interface_declaration name: (type_identifier) @name) @interface

    ; Types
    (type_alias_declaration name: (type_identifier) @name) @type

    ; Enums
    (enum_declaration name: (identifier) @name) @enum

    ; Methods
    (public_field_definition name: (property_identifier) @name value: (arrow_function)) @function
    (method_definition name: (property_identifier) @name) @function
  `,

  tsx: `
    ; Same as TypeScript
    (function_declaration name: (identifier) @name) @function
    (function_expression name: (identifier) @name) @function
    (variable_declarator name: (identifier) @name value: (arrow_function)) @function
    (class_declaration name: (type_identifier) @name) @class
    (interface_declaration name: (type_identifier) @name) @interface
    (type_alias_declaration name: (type_identifier) @name) @type
    (enum_declaration name: (identifier) @name) @enum
    (method_definition name: (property_identifier) @name) @function
  `,

  javascript: `
    ; Functions
    (function_declaration name: (identifier) @name) @function
    (function_expression name: (identifier) @name) @function
    (generator_function_declaration name: (identifier) @name) @function

    ; Arrow functions
    (variable_declarator name: (identifier) @name value: (arrow_function)) @function
    (variable_declarator name: (identifier) @name value: (function_expression)) @function

    ; Classes
    (class_declaration name: (identifier) @name) @class
    (class_expression name: (identifier) @name) @class

    ; Methods
    (method_definition name: (property_identifier) @name) @function
  `,

  python: `
    ; Functions
    (function_definition name: (identifier) @name) @function

    ; Classes
    (class_definition name: (identifier) @name) @class

    ; Methods
    (function_definition name: (identifier) @name decorator: (identifier) @decorator) @function
  `,

  go: `
    ; Functions
    (function_declaration name: (field_identifier) @name) @function

    ; Methods
    (method_declaration name: (field_identifier) @name) @function

    ; Structs (types)
    (type_declaration (type_spec name: (type_identifier) @name type: (struct_type))) @type

    ; Interfaces
    (type_declaration (type_spec name: (type_identifier) @name type: (interface_type))) @interface
  `,

  rust: `
    ; Functions
    (function_item name: (identifier) @name) @function

    ; Structs
    (struct_item name: (type_identifier) @name) @type

    ; Enums
    (enum_item name: (type_identifier) @name) @type

    ; Traits
    (trait_item name: (type_identifier) @name) @interface

    ; Impl blocks
    (impl_item type: (type_identifier) @name) @impl
  `,

  java: `
    ; Classes
    (class_declaration name: (identifier) @name) @class

    ; Interfaces
    (interface_declaration name: (identifier) @name) @interface

    ; Methods
    (method_declaration name: (identifier) @name) @function

    ; Enums
    (enum_declaration name: (identifier) @name) @enum
  `,

  c: `
    ; Functions
    (function_definition declarator: (function_declarator declarator: (identifier) @name)) @function

    ; Structs
    (struct_specifier name: (type_identifier) @name) @type

    ; Enums
    (enum_specifier name: (identifier) @name) @type
  `,

  cpp: `
    ; Functions
    (function_definition declarator: (function_declarator declarator: (identifier) @name)) @function

    ; Classes
    (class_specifier name: (type_identifier) @name) @class

    ; Structs
    (struct_specifier name: (type_identifier) @name) @type

    ; Namespaces
    (namespace_definition name: (identifier) @name) @namespace
  `,
};

/**
 * Get query for a language
 */
export function getQueryForLanguage(language: string): string | null {
  return languageQueries[language] ?? null;
}

/**
 * Get all supported languages
 */
export function getSupportedQueryLanguages(): string[] {
  return Object.keys(languageQueries);
}

/**
 * Symbol kind mapping from capture names
 */
export const captureToSymbolKind: Record<string, string> = {
  function: 'function',
  class: 'class',
  interface: 'interface',
  type: 'type',
  enum: 'enum',
  method: 'function',
  variable: 'variable',
};