import { JSDOM } from 'jsdom';
import { AgdaDocsConfig, ModuleInfo } from './types';
import { AgdaDocsIndexer } from './indexer';
import { AgdaDocsSearcher } from './search';
import * as fs from 'fs';
import * as path from 'path';

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

            // Preserve original with data attribute and change the href
            link.setAttribute('data-original-href', href);
            link.setAttribute('href', `#L${lineNumber}`);

            // Add title tooltip to show both references
            link.setAttribute('title', `Line ${lineNumber} (position ${position})`);
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
            link.setAttribute('data-original-href', href);
            link.setAttribute('href', `${targetFile}#L${lineNumber}`);

            // Add title tooltip to show both references
            link.setAttribute('title', `Line ${lineNumber} (position ${position})`);
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

    // Log warnings for unmapped links if there are any
    if (unmappedLinks.length > 0) {
      const fileName = this.currentFile || 'current file';

      console.warn(
        `Warning: Could not map ${unmappedLinks.length} position references to line numbers in ${fileName}`
      );
      // Show all unmapped links for debugging
      unmappedLinks.forEach((link) => {
        console.warn(`  - Could not map: ${link.href}`);
        console.warn(`    Text content: "${link.text}"`);
        console.warn(`    HTML: ${link.element.outerHTML}`);
      });
    }

    // Add support script for toggling between position and line references
    this.addPositionToggleScript();
  }

  /**
   * Adds a script that allows toggling between position references and line numbers
   */
  private addPositionToggleScript(): void {
    const document = this.dom.window.document;
    const script = document.createElement('script');

    script.textContent = `
      (function() {
        // Support for toggling between position and line references
        document.addEventListener('keydown', function(event) {
          // Alt+P toggles position mode
          if (event.altKey && event.key === 'p') {
            const links = document.querySelectorAll('a[data-original-href]');
            links.forEach(link => {
              const currentHref = link.getAttribute('href');
              const originalHref = link.getAttribute('data-original-href');
              
              // Toggle between original position references and line numbers
              link.setAttribute('data-original-href', currentHref);
              link.setAttribute('href', originalHref);
            });
            
            // Show notification
            const notification = document.createElement('div');
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.padding = '10px 20px';
            notification.style.background = 'rgba(0,0,0,0.8)';
            notification.style.color = 'white';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '9999';
            notification.style.transition = 'opacity 0.5s';
            notification.textContent = 'Reference mode toggled';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
              notification.style.opacity = '0';
              setTimeout(() => {
                document.body.removeChild(notification);
              }, 500);
            }, 2000);
          }
        });
      })();
    `;

    document.body.appendChild(script);
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

    codeBlocks.forEach((codeBlock) => {
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

        // Create line number element with anchor
        lineNumbersHTML.push(
          `<a href="#L${lineNum}" id="L${lineNum}" class="line-number" data-line-number="${lineNum}">${lineNum}</a>`
        );

        // Add the line to the content with an ID that can be linked to
        // Ensure even empty lines have proper height by using a non-breaking space
        const lineContent = line.trim() === '' ? '&nbsp;' : line;
        linesHTML.push(`<div id="LC${lineNum}" class="code-line">${lineContent}</div>`);
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

    // Add script to handle copy functionality and line highlighting
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Function to copy code without line numbers
        function copyCode(event) {
          const button = event.currentTarget;
          const pre = button.closest('pre.Agda');
          if (!pre) return;
          
          const codeContent = pre.querySelector('.code-content');
          if (!codeContent) return;
          
          // Extract text content from code lines, preserving structure
          const codeLines = Array.from(codeContent.querySelectorAll('.code-line'));
          const codeText = codeLines.map(line => line.textContent).join('\\n');
          
          // Create temporary textarea to copy from
          const textarea = document.createElement('textarea');
          textarea.value = codeText;
          textarea.style.position = 'absolute';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          
          try {
            document.execCommand('copy');
            // Show success state
            button.classList.add('copy-success');
            setTimeout(() => {
              button.classList.remove('copy-success');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy code: ', err);
          }
          
          document.body.removeChild(textarea);
        }
        
        // Add click event listeners to all copy buttons
        const copyButtons = document.querySelectorAll('.copy-code-button');
        copyButtons.forEach(button => {
          button.addEventListener('click', copyCode);
        });
        
        // Handle highlighting of lines when line numbers are clicked
        function setupLineHighlighting() {
          const lineNumbers = document.querySelectorAll('.line-number');
          
          lineNumbers.forEach(lineNum => {
            lineNum.addEventListener('click', function(e) {
              e.preventDefault(); // Prevent default hash navigation
              
              // Remove highlight from all lines and line numbers first
              document.querySelectorAll('.code-line.highlighted').forEach(line => {
                line.classList.remove('highlighted');
              });
              document.querySelectorAll('.line-number.highlighted').forEach(num => {
                num.classList.remove('highlighted');
              });
              
              // Get the line number
              const num = this.getAttribute('data-line-number');
              if (!num) return;
              
              // Add highlight class to clicked line number
              this.classList.add('highlighted');
              
              // Find the corresponding code line and highlight it
              const lineId = 'LC' + num;
              const codeLine = document.getElementById(lineId);
              if (codeLine) {
                codeLine.classList.add('highlighted');
                
                // Update URL hash without causing a jump
                const newUrl = window.location.pathname + window.location.search + '#L' + num;
                history.pushState(null, '', newUrl);
                
                // Scroll the element into view
                codeLine.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center'
                });
              }
            });
          });
        }
        
        // Handle highlighting of lines when URL has fragment
        function highlightTargetLine() {
          // Clear any existing highlights first
          document.querySelectorAll('.code-line.highlighted').forEach(line => {
            line.classList.remove('highlighted');
          });
          document.querySelectorAll('.line-number.highlighted').forEach(num => {
            num.classList.remove('highlighted');
          });
          
          const hash = window.location.hash;
          if (hash && hash.startsWith('#L')) {
            // Extract the line number from the hash
            const lineNum = hash.substring(2);
            const lineId = 'LC' + lineNum;
            const codeLine = document.getElementById(lineId);
            const lineNumEl = document.getElementById('L' + lineNum);
            
            if (codeLine) {
              // Highlight the target line
              codeLine.classList.add('highlighted');
              
              // Highlight the corresponding line number
              if (lineNumEl) {
                lineNumEl.classList.add('highlighted');
              }
              
              // Scroll the line into view
              setTimeout(() => {
                codeLine.scrollIntoView({
                  behavior: 'smooth', 
                  block: 'center'
                });
              }, 100); // Small delay to ensure DOM is ready
            }
          }
        }
        
        // Run on page load and when hash changes
        setupLineHighlighting();
        highlightTargetLine();
        window.addEventListener('hashchange', highlightTargetLine);
      })();
    `;
    document.body.appendChild(script);
  }

  /**
   * Adds a script to initialize the theme before content loads
   */
  private addThemeInitScript(): void {
    const document = this.dom.window.document;
    const head = document.head;

    // Create script to set theme immediately (prevents flash)
    const themeScript = document.createElement('script');
    themeScript.textContent = `
      (function() {
        // Check for theme preference in localStorage
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark-theme');
        }
      })();
    `;

    // Add to head to be executed early
    head.insertBefore(themeScript, head.firstChild);
  }

  /**
   * Adds the CSS styles to the document
   */
  private addStyles(): void {
    const document = this.dom.window.document;
    const head = document.head;

    // Try to find the CSS files in different possible locations
    const possibleBasePaths = [
      // Production path (when installed as a package)
      path.join(__dirname, 'styles', 'base.css'),
      // Development path
      path.join(__dirname, '..', 'src', 'styles', 'base.css'),
      // Alternative development path
      path.join(__dirname, '..', '..', 'src', 'styles', 'base.css'),
    ];

    const possibleSearchPaths = [
      // Production path (when installed as a package)
      path.join(__dirname, 'styles', 'search.css'),
      // Development path
      path.join(__dirname, '..', 'src', 'styles', 'search.css'),
      // Alternative development path
      path.join(__dirname, '..', '..', 'src', 'styles', 'search.css'),
    ];

    // Load base CSS
    let baseCss: string | null = null;
    for (const cssPath of possibleBasePaths) {
      try {
        baseCss = fs.readFileSync(cssPath, 'utf-8');
        break;
      } catch (error) {
        continue;
      }
    }

    // Load search CSS
    let searchCss: string | null = null;
    for (const cssPath of possibleSearchPaths) {
      try {
        searchCss = fs.readFileSync(cssPath, 'utf-8');
        break;
      } catch (error) {
        continue;
      }
    }

    // Add base styles
    if (baseCss) {
      const style = document.createElement('style');
      style.textContent = baseCss;
      head.appendChild(style);
    } else {
      console.warn('Warning: Could not load base.css styles, using fallback styles');
      // Add fallback inline styles if CSS file is not found
      const fallbackStyles = `
        :root {
          --header-height: 64px;
          --sidebar-width: 280px;
          --content-max-width: 900px;
          --primary-color: #1a1a1a;
          --border-color: #e0e0e0;
          --hover-bg: #f5f5f5;
          --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        body { margin: 0; padding-top: var(--header-height); }
        header { position: fixed; top: 0; left: 0; right: 0; height: var(--header-height); background: #fff; }
        .sidebar { position: fixed; left: 0; top: var(--header-height); bottom: 0; width: var(--sidebar-width); }
        .main-content { margin-left: var(--sidebar-width); padding: 24px; max-width: var(--content-max-width); }
      `;
      const style = document.createElement('style');
      style.textContent = fallbackStyles;
      head.appendChild(style);
    }

    // Add search styles
    if (searchCss) {
      const searchStyle = document.createElement('style');
      searchStyle.textContent = searchCss;
      head.appendChild(searchStyle);
    } else {
      console.warn('Warning: Could not load search.css styles');
    }
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
          <path fill="currentColor" d="M12,9c1.65,0,3,1.35,3,3s-1.35,3-3,3s-3-1.35-3-3S10.35,9,12,9 M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5 S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1 s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0 c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95 c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41 L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41 s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06 c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z"></path>
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

    // Add theme toggle script
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Check if theme preference exists in localStorage
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark-theme');
        }

        // Add toggle functionality
        document.querySelector('.theme-toggle').addEventListener('click', function() {
          const html = document.documentElement;
          const isDark = html.classList.contains('dark-theme');
          
          if (isDark) {
            html.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
          } else {
            html.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
          }
        });
      })();
    `;
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
}
