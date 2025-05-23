#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { AgdaDocsIndexer } from './indexer';
import { AgdaDocsSearcher } from './search';

const program = new Command();

// Default config file names to look for
const DEFAULT_CONFIG_FILES = ['agda-docs.config.json'];

// Small batch sizes to reduce memory usage per worker
const MEMORY_EFFICIENT_BATCH_SIZE = 10;

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

// Worker function to process a batch of files with memory optimization
function processFileBatch(
  inputDir: string,
  outputDir: string,
  files: string[],
  config: Record<string, unknown>
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Create a worker script path
    const workerScriptPath = path.resolve(__dirname, 'worker.js');

    // Check if worker script exists, if not create it
    if (!fs.existsSync(workerScriptPath)) {
      fs.writeFileSync(
        workerScriptPath,
        `
        const { parentPort, workerData } = require('worker_threads');
        const fs = require('fs');
        const path = require('path');
        const { AgdaDocsTransformer } = require('./transformer');
        const { AgdaDocsIndexer } = require('./indexer');

        // Process each file in the batch with memory management
        async function processBatch() {
          const { inputDir, outputDir, files, config, globalMappings } = workerData;
          let processedCount = 0;

          // Set global mappings in the indexer class
          AgdaDocsIndexer.setGlobalMappings(globalMappings);
          
          // Create transformer with config
          const transformer = new AgdaDocsTransformer(config);
          
          for (const file of files) {
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
              
              // Report progress
              processedCount++;
              parentPort.postMessage({ type: 'progress', file });
            } catch (error) {
              parentPort.postMessage({ 
                type: 'error', 
                error: error.message || 'Unknown error',
                file 
              });
            }
          }
          
          return processedCount;
        }
        
        // Start processing and report completion
        processBatch()
          .then(count => {
            parentPort.postMessage({ type: 'complete', count });
          })
          .catch(error => {
            parentPort.postMessage({ 
              type: 'error', 
              error: error.message || 'Unknown worker error' 
            });
          });
      `
      );
    }

    // Get global mappings to pass to worker
    const globalMappings = AgdaDocsIndexer.getGlobalMappings();

    // Create a worker with limited memory
    const worker = new Worker(workerScriptPath, {
      workerData: {
        inputDir,
        outputDir,
        files,
        config,
        globalMappings,
      },
      // Limit worker memory
      resourceLimits: {
        maxOldGenerationSizeMb: 512, // 512MB per worker
        maxYoungGenerationSizeMb: 128, // 128MB for young generation
      },
    });

    // Handle messages from worker
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        // File processed, could update progress here if needed
      } else if (message.type === 'error') {
        console.error(`Error processing ${message.file}: ${message.error}`);
      } else if (message.type === 'complete') {
        // Worker is done
        resolve(message.count);
      }
    });

    // Handle worker errors
    worker.on('error', (error) => {
      reject(new Error(`Worker error: ${error.message}`));
    });

    // Handle worker exit
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// Memory-efficient file processing with streaming
async function processFilesInMemoryEfficientBatches(
  inputDir: string,
  outputDir: string,
  files: string[],
  config: Record<string, unknown>,
  progressCallback: (current: number, total: number) => void
): Promise<void> {
  let processedCount = 0;
  const batchSize = MEMORY_EFFICIENT_BATCH_SIZE;

  // Process files in small sequential batches to minimize memory usage
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    try {
      const count = await processFileBatch(inputDir, outputDir, batch, config);
      processedCount += count;
      progressCallback(processedCount, files.length);

      // Small delay to allow memory cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error processing batch starting at index ${i}:`, error);
      throw error;
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
  .option('-i, --input <path>', 'Input directory containing HTML files', 'static/formal-spec')
  .option('-o, --output <path>', 'Output directory for processed files', 'static/formal-spec')
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

      // Create output directory if it doesn't exist
      const outputDir = path.resolve(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

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

      await processFilesInMemoryEfficientBatches(
        inputDir,
        outputDir,
        files,
        config,
        processingProgressBar
      );

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
