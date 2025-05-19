export interface AgdaDocsConfig {
  /**
   * Optional URL for the back button in the header
   */
  backButtonUrl?: string;

  /**
   * Directory containing the Agda-generated HTML files
   */
  inputDir: string;

  /**
   * Optional array of module names to include in the sidebar
   * If not provided, all modules will be shown
   */
  modules?: string[];

  /**
   * Optional GitHub URL for the project
   */
  githubUrl?: string;
}

export interface ModuleInfo {
  name: string;
  path: string;
  isProjectModule: boolean;
}

/**
 * Type for position-to-line number mappings
 */
export interface PositionMappings {
  [filename: string]: {
    [position: string]: number;
  };
}

/**
 * Configuration for indexing operations
 */
export interface IndexingConfig {
  /**
   * Whether to build the position-to-line mappings
   */
  buildPositionMappings?: boolean;
  
  /**
   * Whether to build the type definition index
   */
  buildTypeDefinitionIndex?: boolean;
  
  /**
   * Whether to build the search index
   */
  buildSearchIndex?: boolean;
}

/**
 * Type definition index for hover features
 */
export interface TypeDefinitionIndex {
  [typeName: string]: {
    file: string;
    line: number;
    definition: string;
  };
}

/**
 * Search index for full-text search feature
 */
export interface SearchIndex {
  [term: string]: {
    file: string;
    line: number;
    context: string;
  }[];
}
