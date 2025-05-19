import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { PositionMappings } from './types';

export class AgdaDocsIndexer {
  private static globalPositionMappings: PositionMappings = {};

  /**
   * Gets the global position-to-line mappings for all files
   * Used for passing mappings to worker threads
   */
  public static getGlobalMappings(): PositionMappings {
    return { ...AgdaDocsIndexer.globalPositionMappings };
  }

  /**
   * Sets the global position-to-line mappings
   * Used for receiving mappings in worker threads
   */
  public static setGlobalMappings(mappings: PositionMappings): void {
    AgdaDocsIndexer.globalPositionMappings = { ...mappings };
  }

  /**
   * Builds position-to-line mappings for the Agda documentation
   * @param inputDir Directory containing the HTML files
   * @param progressCallback Optional callback function for progress reporting
   */
  public static buildPositionMappings(
    inputDir: string,
    progressCallback?: (current: number, total: number) => void
  ): void {
    AgdaDocsIndexer.globalPositionMappings = {};
    console.log('Building indexes for cross-file references...');

    try {
      // First pass: process all files to build position-to-line mappings
      const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.html'));
      console.log(`Scanning ${files.length} files for position mappings...`);

      let processedCount = 0;
      for (const file of files) {
        const content = fs.readFileSync(path.join(inputDir, file), 'utf-8');
        const tempDom = new JSDOM(content);
        const document = tempDom.window.document;

        // Build mappings for this file
        const mappings: Record<string, number> = {};

        // Add line numbers to code blocks first
        AgdaDocsIndexer.addLineNumbersToElementsInDocument(document);

        // Look for all elements with an id attribute that is numeric
        const elementsWithNumericId = document.querySelectorAll('[id]');
        elementsWithNumericId.forEach((element) => {
          const id = element.getAttribute('id');
          if (id && /^\d+$/.test(id)) {
            // Find the line number for this element
            const lineNumber = AgdaDocsIndexer.findLineNumberForElement(element);
            if (lineNumber) {
              mappings[id] = lineNumber;
            }
          }
        });

        // Store mappings for this file
        AgdaDocsIndexer.globalPositionMappings[file] = mappings;

        // Update progress counter and callback
        processedCount++;
        if (progressCallback) {
          progressCallback(processedCount, files.length);
        }
      }
    } catch (error) {
      console.error('Error building position mappings index:', error);
    }
  }

  /**
   * Adds line numbers to code blocks in a document
   * Static version used during pre-processing
   */
  private static addLineNumbersToElementsInDocument(document: Document): void {
    // Add line numbers to code blocks
    const codeBlocks = document.querySelectorAll('pre.Agda');

    codeBlocks.forEach((codeBlock) => {
      // Create a container for the code content
      const codeContent = document.createElement('div');
      codeContent.className = 'code-content';

      // Get the original HTML content
      const originalContent = codeBlock.innerHTML;

      // Split by lines for processing
      const lines = originalContent.split('\n');

      // Create modified content with line IDs
      const linesHTML: string[] = [];

      // Process lines
      const actualLines = lines.filter(
        (line, index) => !(index === lines.length - 1 && line.trim() === '')
      );

      actualLines.forEach((line, index) => {
        const lineNum = index + 1;

        // Add the line with an ID that can be linked to
        const lineContent = line.trim() === '' ? '&nbsp;' : line;
        linesHTML.push(`<div id="LC${lineNum}" class="code-line">${lineContent}</div>`);
      });

      // Update code content
      codeContent.innerHTML = linesHTML.join('');

      // Replace content with line-numbered version
      codeBlock.innerHTML = '';
      codeBlock.appendChild(codeContent);
    });
  }

  /**
   * Static version of findLineNumberForElement used during pre-processing
   */
  private static findLineNumberForElement(element: Element): number | null {
    // Find the nearest code block ancestor
    const codeBlock = element.closest('pre.Agda');
    if (!codeBlock) return null;

    // Find the code container within the code block
    const codeContainer = codeBlock.querySelector('.code-content');
    if (!codeContainer) return null;

    // Get all code lines
    const codeLines = Array.from(codeContainer.querySelectorAll('.code-line'));

    // Find which line contains this element
    for (let i = 0; i < codeLines.length; i++) {
      if (codeLines[i].contains(element) || element === codeLines[i]) {
        return i + 1; // Line numbers are 1-indexed
      }
    }

    // If not found in code lines, check if the element is the code block itself
    if (element === codeBlock) {
      return 1; // Return first line if it's the code block itself
    }

    // Try to find by walking up and then down the DOM
    let parent = element.parentElement;
    while (parent && parent !== codeBlock) {
      // Check if any siblings before this parent contain line numbers
      let sibling = parent.previousElementSibling;
      while (sibling) {
        const lineId = sibling.id;
        if (lineId && lineId.startsWith('LC')) {
          const lineNum = parseInt(lineId.substring(2));
          return lineNum;
        }
        sibling = sibling.previousElementSibling;
      }
      parent = parent.parentElement;
    }

    // Default to beginning of file if we can't determine the exact line
    return 1;
  }
}
