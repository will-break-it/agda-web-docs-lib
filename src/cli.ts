#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { AgdaDocsIndexer } from './indexer';
import { AgdaDocsSearcher } from './search';
import { AgdaDocsTransformer } from './transformer';
import { AgdaDocsConfig } from './types';

const program = new Command();

// Default config file names to look for
const DEFAULT_CONFIG_FILES = ['agda-docs.config.json'];

function findConfigFile(): string | null {
  const currentDir = process.cwd();
  for (const configFile of DEFAULT_CONFIG_FILES) {
    const configPath = path.join(currentDir, configFile);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

// Default batch size for processing files
const DEFAULT_BATCH_SIZE = 50;

// Process files in batches to manage memory usage
async function processFiles(
  inputDir: string,
  outputDir: string,
  files: string[],
  config: AgdaDocsConfig,
  progressCallback: (current: number, total: number) => void,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<void> {
  let processedCount = 0;
  const totalBatches = Math.ceil(files.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, files.length);
    const batchFiles = files.slice(batchStart, batchEnd);

    // Create a fresh transformer for each batch to release memory
    const transformer = new AgdaDocsTransformer(config);

    for (const file of batchFiles) {
      try {
        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file);
        const content = fs.readFileSync(inputPath, 'utf8');

        // Process the file
        transformer.setContent(content, file);
        const processed = transformer.transform();

        // Ensure output directory exists
        const outputDirForFile = path.dirname(outputPath);
        if (!fs.existsSync(outputDirForFile)) {
          fs.mkdirSync(outputDirForFile, { recursive: true });
        }

        fs.writeFileSync(outputPath, processed);

        processedCount++;
        progressCallback(processedCount, files.length);
      } catch (error) {
        console.error(`Error processing ${file}:`, error);
        throw error;
      }
    }

    // Clean up transformer after each batch
    transformer.cleanup();

    // Hint to garbage collector between batches (non-blocking)
    if (global.gc) {
      global.gc();
    }
  }
}

/**
 * Creates a progress bar in the terminal
 */
function createProgressBar(width: number = 40): (current: number, total: number) => void {
  return (current: number, total: number) => {
    const percent = Math.round((current / total) * 100);
    const barLength = Math.round((current / total) * width);
    const bar = '='.repeat(barLength) + ' '.repeat(width - barLength);

    // Clear line and update progress bar
    process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total})`);

    // Add a newline when complete
    if (current === total) {
      process.stdout.write('\n');
    }
  };
}

/**
 * Copies script and style assets to the output directory
 */
function copyAssets(outputDir: string): void {
  // Find all script and style files
  const possibleScriptDirs = [
    // Production path (when installed as a package)
    path.join(__dirname, 'scripts'),
    // Development path
    path.join(__dirname, '..', 'src', 'scripts'),
    // Alternative development path
    path.join(__dirname, '..', '..', 'src', 'scripts'),
  ];

  const possibleStyleDirs = [
    // Production path (when installed as a package)
    path.join(__dirname, 'styles'),
    // Development path
    path.join(__dirname, '..', 'src', 'styles'),
    // Alternative development path
    path.join(__dirname, '..', '..', 'src', 'styles'),
  ];

  // Find the first existing scripts directory
  let scriptsDir: string | null = null;
  for (const dir of possibleScriptDirs) {
    if (fs.existsSync(dir)) {
      scriptsDir = dir;
      break;
    }
  }

  // Find the first existing styles directory
  let stylesDir: string | null = null;
  for (const dir of possibleStyleDirs) {
    if (fs.existsSync(dir)) {
      stylesDir = dir;
      break;
    }
  }

  // Copy all JavaScript files from the scripts directory
  if (scriptsDir) {
    try {
      const scriptFiles = fs.readdirSync(scriptsDir).filter((file) => file.endsWith('.js'));

      for (const file of scriptFiles) {
        const sourcePath = path.join(scriptsDir, file);
        const destPath = path.join(outputDir, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied script: ${file}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not copy script files: ${error}`);
    }
  } else {
    console.warn('Warning: Could not find scripts directory');
  }

  // Copy all CSS files from the styles directory
  if (stylesDir) {
    try {
      const styleFiles = fs.readdirSync(stylesDir).filter((file) => file.endsWith('.css'));

      for (const file of styleFiles) {
        const sourcePath = path.join(stylesDir, file);
        const destPath = path.join(outputDir, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied style: ${file}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not copy style files: ${error}`);
    }
  } else {
    console.warn('Warning: Could not find styles directory');
  }
}

program
  .name('agda-docs')
  .description('Process Agda-generated HTML documentation')
  .version('0.1.0')
  .command('process')
  .description('Process Agda HTML files with custom navigation')
  .option(
    '-c, --config <path>',
    'Path to config file (defaults to agda-docs.config.json in current directory)'
  )
  .option('-i, --input <path>', 'Input directory containing HTML files', '.')
  .option(
    '-o, --output <path>',
    'Output directory for processed files (defaults to input directory)'
  )
  .action(async (options) => {
    try {
      // Find config file
      let configPath = options.config;
      if (!configPath) {
        configPath = findConfigFile();
        if (!configPath) {
          console.error(
            'Error: No config file found. Please specify a config file with -c or place agda-docs.config.json in the current directory'
          );
          process.exit(1);
        }
        console.log('Using config file:', configPath);
      }

      // Read and parse config
      if (!fs.existsSync(configPath)) {
        console.error('Error: Config file not found at', configPath);
        process.exit(1);
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Ensure input directory exists
      const inputDir = path.resolve(options.input);
      if (!fs.existsSync(inputDir)) {
        console.error('Error: Input directory not found at', inputDir);
        process.exit(1);
      }

      // Create output directory if it doesn't exist - default to input dir if not specified
      const outputDir = path.resolve(options.output || options.input);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Ensure config has required inputDir property
      const agdaConfig: AgdaDocsConfig = {
        ...config,
        inputDir: inputDir,
      };

      // Get list of HTML files
      const files = fs.readdirSync(inputDir).filter((file) => file.endsWith('.html'));

      if (files.length === 0) {
        console.error('Error: No HTML files found in input directory');
        process.exit(1);
      }

      console.log(`Found ${files.length} HTML files to process`);

      // Build position mappings BEFORE processing files so transformation can use them
      const indexingProgressBar = createProgressBar();
      await AgdaDocsIndexer.buildPositionMappings(inputDir, indexingProgressBar);

      // Copy assets to output directory first
      console.log('Copying scripts and styles to output directory...');
      copyAssets(outputDir);

      // Process files using memory-efficient batching
      console.log('Processing HTML files ...');

      const processingProgressBar = createProgressBar();

      await processFiles(inputDir, outputDir, files, agdaConfig, processingProgressBar);

      // Build search index after processing using the existing position mappings
      const searchIndex = await AgdaDocsSearcher.buildSearchIndex(
        AgdaDocsIndexer.getGlobalMappings(),
        outputDir
      );

      AgdaDocsSearcher.writeSearchIndex(outputDir, searchIndex);

      // Copy search script to output directory
      console.log('Copying search script to output directory...');
      const searchScriptPath = AgdaDocsSearcher.getSearchScriptPath();
      if (searchScriptPath) {
        fs.copyFileSync(searchScriptPath, path.join(outputDir, 'search.js'));
      } else {
        console.warn('Warning: Could not find search script to copy');
      }

      console.log('Successfully processed', files.length, 'HTML files');
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('An unknown error occurred');
      }
      process.exit(1);
    }
  });

program.parse();
