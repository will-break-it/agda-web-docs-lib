import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { PositionMappings } from './types';

/**
 * Search entry structure
 */
export interface SearchEntry {
  type: 'code' | 'header' | 'module';
  content: string;
  lineNumber?: number;
  position?: string;
  context?: string;
}

/**
 * Search index structure for fast lookups
 */
export interface SearchIndex {
  [key: string]: SearchEntry[];
}

/**
 * Class responsible for building and providing search functionality
 */
export class AgdaDocsSearcher {

  /**
   * Generates the search index for all files in the inputDir
   */
  public static async buildSearchIndex(mappings: PositionMappings, inputDir: string): Promise<SearchIndex> {
    console.log('Building search index...');
    const index: SearchIndex = {};
    let fileCount = 0;
    let entryCount = 0;

    try {
      // Read all HTML files from the input directory
      const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.html'));

      // Process files in batches to avoid memory issues
      const batchSize = 20; // Same batch size as position mapping
      
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        // Process each file in the batch
        for (const file of batch) {
          try {
            const filePath = path.join(inputDir, file);
            const entries = this.extractSearchEntriesFromFile(filePath, mappings[file] || {});

            if (entries.length > 0) {
              index[file] = entries;
              fileCount++;
              entryCount += entries.length;
            }
          } catch (error) {
            console.error(`Error extracting search entries from ${file}:`, error);
          }
        }

        // Add a small delay between batches to allow garbage collection
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      console.log(`Search index built with ${entryCount} entries from ${fileCount} files.`);
      return index;
    } catch (error) {
      console.error('Error building search index:', error);
      return {};
    }
  }

  /**
   * Extracts search entries from a single file
   */
  private static extractSearchEntriesFromFile(
    filePath: string,
    positionMappings: { [position: string]: number }
  ): SearchEntry[] {
    let dom: JSDOM | null = null;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      dom = new JSDOM(content);
      const document = dom.window.document;
      const entries: SearchEntry[] = [];

      // Extract module name
      const moduleName = path.basename(filePath, '.html');

      // Add module entry
      entries.push({
        type: 'module',
        content: moduleName,
      });

      // Extract code blocks
      const codeBlocks = document.querySelectorAll('pre.Agda');
      
      let totalCodeEntries = 0;
      codeBlocks.forEach((block, blockIndex) => {
        const codeLines = block.querySelectorAll('.code-line');
        const allLines = Array.from(codeLines);

        allLines.forEach((line, index) => {
          const lineId = line.id;
          if (!lineId) {
            return;
          }

          // Parse line number from ID format like "B1-LC15" (LC = Line Content)
          const lineMatch = lineId.match(/B\d+-LC(\d+)/);
          if (!lineMatch) {
            return;
          }
          
          const lineNumber = parseInt(lineMatch[1]);
          if (isNaN(lineNumber)) return;

          // Get the full line content
          const lineContent = line.textContent?.trim();
          if (!lineContent) {
            return;
          }

          // Get surrounding context (1 line before and 1 line after)
          let contextBefore = '';
          let contextAfter = '';

          if (index > 0) {
            contextBefore = allLines[index - 1].textContent?.trim() || '';
          }

          if (index < allLines.length - 1) {
            contextAfter = allLines[index + 1].textContent?.trim() || '';
          }

          // Full context with line before, current line, and line after
          const fullContext = [contextBefore, lineContent, contextAfter]
            .filter((line) => line) // Remove empty lines
            .join('\n');

          // Add the whole line as a searchable entry
          entries.push({
            type: 'code',
            content: lineContent,
            lineNumber,
            context: fullContext,
          });

          totalCodeEntries++;

          // Also still get individual identifiers
          const identifiers = line.querySelectorAll('[id]');

          identifiers.forEach((identifier) => {
            const id = identifier.id;
            if (!id || /^\d+$/.test(id)) return; // Skip numeric IDs

            // Get the text content of the identifier
            const content = identifier.textContent?.trim();
            if (!content) return;

            // Get position mapping if available
            const position = Object.keys(positionMappings).find(
              (pos) => positionMappings[pos] === lineNumber
            );

            entries.push({
              type: 'code',
              content,
              lineNumber,
              position,
              context: fullContext,
            });
          });
        });
      });
      
      // Extract headers
      const headers = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headers.forEach((header) => {
        const content = header.textContent?.trim();
        if (!content) return;

        entries.push({
          type: 'header',
          content,
          context: content,
        });
      });

      return entries;
    } catch (error) {
      console.error(`Error extracting search entries from ${filePath}:`, error);
      return [];
    } finally {
      // Explicitly clean up JSDOM to free memory
      if (dom) {
        dom.window.close();
        dom = null;
      }
    }
  }

  /**
   * Writes the search index to a JSON file in the output directory
   */
  public static writeSearchIndex(outputDir: string, index: SearchIndex): void {
    try {
      const outputPath = path.join(outputDir, 'search-index.json');
      fs.writeFileSync(outputPath, JSON.stringify(index));
      console.log(`Search index written to ${outputPath}`);
    } catch (error) {
      console.error('Error writing search index:', error);
    }
  }

  /**
   * Returns the path to the search script
   * This will be included in the transformed HTML
   */
  public static getSearchScriptPath(): string {
    const possiblePaths = [
      // Production path (when installed as a package)
      path.join(__dirname, 'scripts', 'search.js'),
      // Development path
      path.join(__dirname, '..', 'src', 'scripts', 'search.js'),
      // Alternative development path
      path.join(__dirname, '..', '..', 'src', 'scripts', 'search.js'),
    ];

    for (const scriptPath of possiblePaths) {
      if (fs.existsSync(scriptPath)) {
        return scriptPath;
      }
    }

    console.warn('Warning: Could not find search.js script');
    return '';
  }
}
