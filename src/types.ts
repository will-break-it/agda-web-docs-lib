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