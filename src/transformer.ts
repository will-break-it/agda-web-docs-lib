import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import { AgdaDocsIndexer } from './indexer';
import { AgdaDocsSearcher } from './search';
import { AgdaDocsConfig, ModuleInfo } from './types';

export class AgdaDocsTransformer {
  private config: AgdaDocsConfig;
  private dom: JSDOM;
  private currentFile: string = '';

  constructor(config: AgdaDocsConfig) {
    this.config = config;
    this.dom = new JSDOM('');
  }

  /**
   * Sets the HTML content to transform
   */
  public setContent(content: string, filename?: string): void {
    this.dom = new JSDOM(content);
    if (filename) {
      this.currentFile = filename;
    }
  }

  /**
   * Transforms the HTML with custom navigation
   */
  public transform(): string {
    this.addThemeInitScript();
    this.addStyles();
    this.addHeader();
    this.addSidebar();
    this.addLineNumbersToCodeBlocks();
    this.addSearchFunctionality();
    this.addTypePreviewContainer();

    // Use the global mappings from the indexer for link transformation
    this.transformAgdaLinks();
    return this.dom.serialize();
  }

  /**
   * Adds search functionality to the page
   */
  private addSearchFunctionality(): void {
    const document = this.dom.window.document;

    // Get the path to the search script
    const searchScriptPath = AgdaDocsSearcher.getSearchScriptPath();

    if (searchScriptPath && fs.existsSync(searchScriptPath)) {
      try {
        // Add script reference to the document - the script will be copied when cli.ts processes files
        const searchScript = document.createElement('script');
        searchScript.src = 'search.js';
        searchScript.defer = true;
        document.body.appendChild(searchScript);
      } catch (error) {
        console.error('Error adding search script:', error);
      }
    } else {
      console.warn('Search script not found at path:', searchScriptPath);
    }
  }

  /**
   * Transforms Agda-generated numeric position references to line number references
   * so that they work with the line highlighting feature
   */
  private transformAgdaLinks(): void {
    const document = this.dom.window.document;

    // Get all links in the document
    const links = document.querySelectorAll('a[href]');

    // Get the mappings for the current file from global mappings in the indexer
    const allMappings = AgdaDocsIndexer.getGlobalMappings();
    const currentFileMappings = this.currentFile ? allMappings[this.currentFile] || {} : {};

    // Track unmapped links for warning messages
    const unmappedLinks: { href: string; element: Element; text: string }[] = [];

    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;

      // Check if the link has a numeric fragment identifier
      // It could be either in the same file (#342) or another file (Leios.Abstract.html#342)
      const hashMatch = href.match(/(.+?\.html)?#(\d+)$/);
      if (hashMatch) {
        const filePart = hashMatch[1] || '';
        const position = hashMatch[2];

        // If this is a reference to the current file
        if (!filePart) {
          if (currentFileMappings[position]) {
            const lineNumber = currentFileMappings[position];

            // Find the appropriate block that contains this position
            // For multi-block files (e.g., Literate Agda), we need to determine which block
            // contains the target line, rather than always targeting the first block
            const targetCodeBlock = this.findCodeBlockContainingPosition(document, position);
            const blockId = targetCodeBlock ? targetCodeBlock.id : 'B1'; // Default to first block if not found

            // Preserve original with data attribute and change the href
            link.setAttribute('data-original-href', href);
            link.setAttribute('href', `#${blockId}-L${lineNumber}`);

            // Set data attributes needed for hover preview
            link.setAttribute('data-hoverable', 'true');
            link.setAttribute('data-position', position);
            link.setAttribute('data-block-id', blockId);

            // Add class for styling
            link.classList.add('type-hoverable');
          } else {
            // Keep original link but track for warning
            unmappedLinks.push({
              href: href,
              element: link,
              text: link.textContent || '[No text content]',
            });
          }
        } else {
          // This is a reference to another file
          const targetFile = filePart;

          // Check if we have mappings for the target file
          if (allMappings[targetFile] && allMappings[targetFile][position]) {
            // If we have the mapping, use it
            const lineNumber = allMappings[targetFile][position];

            // Preserve original with data attribute and change the href
            // For cross-file references we'll use the conventional first block (B1)
            // since we can't determine which block contains the target position in another file
            link.setAttribute('data-original-href', href);
            link.setAttribute('href', `${targetFile}#B1-L${lineNumber}`);

            // Set data attributes needed for hover preview
            link.setAttribute('data-hoverable', 'true');
            link.setAttribute('data-position', position);
            link.setAttribute('data-target-file', targetFile);

            // Add class for styling
            link.classList.add('type-hoverable');
          } else {
            // Keep original link but track for warning
            unmappedLinks.push({
              href: href,
              element: link,
              text: link.textContent || '[No text content]',
            });
          }
        }
      }
    });
  }

  /**
   * Attempts to find which code block contains the specified position
   * For literate Agda files where there are multiple code blocks
   */
  private findCodeBlockContainingPosition(document: Document, position: string): Element | null {
    // Get all code blocks
    const codeBlocks = document.querySelectorAll('pre.Agda');
    if (codeBlocks.length <= 1) {
      // If there's only one block, it must be that one
      return codeBlocks[0] || null;
    }

    // Try to find the exact position in any code block
    for (const block of codeBlocks) {
      const positionElement = block.querySelector(`[id="${position}"]`);
      if (positionElement) {
        return block;
      }

      // Check if any elements inside this block have data-position attribute
      const elementsWithPosition = block.querySelectorAll(`[data-position="${position}"]`);
      if (elementsWithPosition.length > 0) {
        return block;
      }
    }

    // If not found by exact position matching, we need to do more heuristics
    // This is a complex problem that might require analyzing the content
    // For now, we'll return the first block as a fallback
    return codeBlocks[0];
  }

  /**
   * Determines if the given file path refers to the current file
   */
  private isCurrentFile(filePath: string): boolean {
    if (!filePath) return true;
    return filePath === this.currentFile;
  }

  /**
   * Adds line numbers to Agda code blocks
   */
  private addLineNumbersToCodeBlocks(): void {
    const document = this.dom.window.document;
    const codeBlocks = document.querySelectorAll('pre.Agda');

    // Generate a unique id for each code block to ensure line numbers are unique per block
    codeBlocks.forEach((codeBlock, blockIndex) => {
      // Assign a unique ID to the code block - using B prefix for brevity
      const blockId = `B${blockIndex + 1}`;
      codeBlock.id = blockId;

      // Create a container for the line numbers and code
      const container = document.createElement('div');
      container.className = 'code-container';

      // Create line numbers div
      const lineNumbers = document.createElement('div');
      lineNumbers.className = 'line-numbers';

      // Get the original HTML content
      const originalContent = codeBlock.innerHTML;

      // Split by lines for processing
      // Ensure we handle empty lines properly
      const lines = originalContent.split('\n');

      // Create modified content with line IDs for anchors
      const lineNumbersHTML: string[] = [];
      const linesHTML: string[] = [];

      // Process non-empty lines only (skip the last empty line if it exists)
      const actualLines = lines.filter(
        (line, index) => !(index === lines.length - 1 && line.trim() === '')
      );

      actualLines.forEach((line, index) => {
        const lineNum = index + 1;

        // Create unique IDs for each line by combining block ID and line number
        const lineId = `${blockId}-L${lineNum}`;
        const lineContentId = `${blockId}-LC${lineNum}`;

        // Create line number element with anchor using the block-specific ID
        lineNumbersHTML.push(
          `<a href="#${lineId}" id="${lineId}" class="line-number" data-line-number="${lineNum}" data-block-id="${blockId}">${lineNum}</a>`
        );

        // Add the line to the content with a block-specific ID
        const lineContent = line.trim() === '' ? '&nbsp;' : line;
        linesHTML.push(`<div id="${lineContentId}" class="code-line">${lineContent}</div>`);
      });

      // Create the line numbers container
      lineNumbers.innerHTML = lineNumbersHTML.join('');

      // Create the code content container
      const codeContent = document.createElement('div');
      codeContent.className = 'code-content';
      codeContent.innerHTML = linesHTML.join('');

      // Create copy button with improved design
      const copyButton = document.createElement('button');
      copyButton.className = 'copy-code-button';
      copyButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
        </svg>
      `;
      copyButton.title = 'Copy code';
      codeBlock.classList.add('has-copy-button');

      // Replace the original pre with our new structure
      container.appendChild(lineNumbers);
      container.appendChild(codeContent);

      // Replace the content of the pre tag
      codeBlock.innerHTML = '';
      codeBlock.appendChild(container);
      codeBlock.appendChild(copyButton);
    });

    // Add script reference to handle copy functionality and line highlighting
    const script = document.createElement('script');
    script.src = 'codeBlocks.js';
    script.defer = true;
    document.body.appendChild(script);
  }

  /**
   * Adds a script to initialize the theme before content loads
   */
  private addThemeInitScript(): void {
    const document = this.dom.window.document;
    const head = document.head;

    // Reference the external theme init script
    const themeScript = document.createElement('script');
    themeScript.src = 'themeInit.js';
    themeScript.defer = false;

    // Add to head to be executed early
    head.insertBefore(themeScript, head.firstChild);
  }

  /**
   * Adds the CSS styles to the document
   */
  private addStyles(): void {
    const document = this.dom.window.document;
    const head = document.head;

    // Add base styles link
    const baseStyleLink = document.createElement('link');
    baseStyleLink.rel = 'stylesheet';
    baseStyleLink.href = 'base.css';
    head.appendChild(baseStyleLink);

    // Add search styles link
    const searchStyleLink = document.createElement('link');
    searchStyleLink.rel = 'stylesheet';
    searchStyleLink.href = 'search.css';
    head.appendChild(searchStyleLink);

    // Add type preview styles link
    const typePreviewStyleLink = document.createElement('link');
    typePreviewStyleLink.rel = 'stylesheet';
    typePreviewStyleLink.href = 'typePreview.css';
    head.appendChild(typePreviewStyleLink);
  }

  /**
   * Adds the custom header with optional back button
   */
  private addHeader(): void {
    const document = this.dom.window.document;
    const body = document.body;

    // Create header
    const header = document.createElement('header');

    // Create left section
    const headerLeft = document.createElement('div');
    headerLeft.className = 'header-left';

    // Add back button if URL is provided
    if (this.config.backButtonUrl) {
      const backButton = document.createElement('a');
      backButton.href = this.config.backButtonUrl;
      backButton.textContent = '← Back';
      backButton.className = 'back-button';
      headerLeft.appendChild(backButton);
    }

    // Create right section
    const headerRight = document.createElement('div');
    headerRight.className = 'header-right';

    // Add GitHub link if URL is provided
    if (this.config.githubUrl) {
      const githubLink = document.createElement('a');
      githubLink.href = this.config.githubUrl;
      githubLink.className = 'github-link';
      githubLink.target = '_blank';
      githubLink.rel = 'noopener noreferrer';
      githubLink.title = 'View on GitHub';

      // Add GitHub icon
      githubLink.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" class="github-icon">
          <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      `;

      headerRight.appendChild(githubLink);
    }

    // Add theme toggle button
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.setAttribute('title', 'Toggle theme');
    themeToggle.innerHTML = `
      <span class="light-icon">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M12,9c1.65,0,3,1.35,3,3s-1.35,3-3,3s-3-1.35-3-3S10.35,9,12,9 M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1 s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0 c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95 c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41 L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41 s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06 c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z"></path>
        </svg>
      </span>
      <span class="dark-icon">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M9.37,5.51C9.19,6.15,9.1,6.82,9.1,7.5c0,4.08,3.32,7.4,7.4,7.4c0.68,0,1.35-0.09,1.99-0.27C17.45,17.19,14.93,19,12,19 c-3.86,0-7-3.14-7-7C5,9.07,6.81,6.55,9.37,5.51z M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36 c-0.98,1.37-2.58,2.26-4.4,2.26c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z"></path>
        </svg>
      </span>
    `;
    headerRight.appendChild(themeToggle);

    // Add sections to header
    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    // Insert header at the beginning of body
    body.insertBefore(header, body.firstChild);

    // Add theme toggle script reference
    const script = document.createElement('script');
    script.src = 'themeToggle.js';
    script.defer = true;
    document.body.appendChild(script);
  }

  /**
   * Checks if a module should be included in the sidebar
   */
  private shouldIncludeModule(moduleName: string): boolean {
    if (!this.config.modules) {
      return true; // Include all modules if no filter is provided
    }
    // Check if the module name starts with any of the configured module prefixes
    return this.config.modules.some((module) => moduleName.startsWith(module));
  }

  /**
   * Adds the sidebar with modules
   */
  private addSidebar(): void {
    const document = this.dom.window.document;
    const body = document.body;

    // Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';

    // Add modules section header
    const modulesHeader = document.createElement('h3');
    modulesHeader.textContent = 'Modules';
    modulesHeader.className = 'modules-header';
    sidebar.appendChild(modulesHeader);

    // Get all module links from the input directory
    const inputDir = this.config.inputDir;
    if (!inputDir) {
      console.warn('Warning: No input directory specified in config');
      return;
    }

    try {
      // Read all HTML files from the input directory
      const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.html'));
      const modules: ModuleInfo[] = files.map((file) => {
        const moduleName = file.replace('.html', '');
        return {
          name: moduleName,
          path: file,
          isProjectModule: this.shouldIncludeModule(moduleName),
        };
      });

      // Filter and sort modules
      const filteredModules = modules
        .filter((m) => m.isProjectModule)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Group modules by their top-level namespace
      const groupedModules = new Map<string, ModuleInfo[]>();
      filteredModules.forEach((module) => {
        const parts = module.name.split('.');
        const group = parts[0];
        if (!groupedModules.has(group)) {
          groupedModules.set(group, []);
        }
        groupedModules.get(group)!.push(module);
      });

      // Add each group of modules
      groupedModules.forEach((groupModules, groupName) => {
        const groupHeader = document.createElement('h4');
        groupHeader.textContent = groupName;
        groupHeader.className = 'module-group-header';
        sidebar.appendChild(groupHeader);

        const groupList = document.createElement('ul');
        groupList.className = 'module-list';

        groupModules.forEach((module) => {
          const li = document.createElement('li');
          li.className = 'module-item';

          const a = document.createElement('a');
          a.href = module.path;
          // Show only the part after the group name
          const displayName = module.name.split('.').slice(1).join('.');
          a.textContent = displayName || module.name; // Fallback to full name if no dots
          a.className = 'module-link';

          // Add active class if this is the current page
          const currentPath = document.location.pathname;
          if (module.path === currentPath || module.path === currentPath.split('/').pop()) {
            a.classList.add('active');
          }

          li.appendChild(a);
          groupList.appendChild(li);
        });
        sidebar.appendChild(groupList);
      });
    } catch (error) {
      console.error('Error reading input directory:', error);
    }

    // Create main wrapper
    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'main-wrapper';

    // Create main content wrapper
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // Move all content except header into the wrapper
    const header = document.querySelector('header');
    const content = Array.from(body.childNodes).filter((node) => node !== header);
    content.forEach((node) => mainContent.appendChild(node));

    // Add sidebar and main content to the wrapper
    mainWrapper.appendChild(sidebar);
    mainWrapper.appendChild(mainContent);

    // Add the wrapper after the header
    if (header) {
      header.after(mainWrapper);
    } else {
      body.appendChild(mainWrapper);
    }
  }

  /**
   * Adds the preview container and script for type hover functionality
   */
  private addTypePreviewContainer(): void {
    const document = this.dom.window.document;

    // Create the preview container that will be positioned and shown on hover
    const previewContainer = document.createElement('div');
    previewContainer.id = 'type-preview-container';
    previewContainer.className = 'type-preview-container';
    previewContainer.style.display = 'none';
    document.body.appendChild(previewContainer);

    // Add script reference to handle hover preview functionality
    const script = document.createElement('script');
    script.src = 'typePreview.js';
    script.defer = true;
    document.body.appendChild(script);
  }
}
