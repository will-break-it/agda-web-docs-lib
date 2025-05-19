#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { AgdaDocsIndexer } from './indexer';
import { AgdaDocsSearcher } from './search';

const program = new Command();

// Default config file names to look for
const DEFAULT_CONFIG_FILES = ['agda-docs.config.json'];

// Determine optimal number of workers based on CPU cores
const MAX_WORKERS = Math.max(1, cpus().length);

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

// Worker function to process a batch of files
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
        const { AgdaDocsSearcher } = require('./search');

        // Process each file in the batch
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

    // Create a worker
    const worker = new Worker(workerScriptPath, {
      workerData: {
        inputDir,
        outputDir,
        files,
        config,
        globalMappings,
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
  .option(
    '-p, --parallel <number>',
    'Number of parallel workers (default: auto-detect based on CPU cores)',
    String(MAX_WORKERS)
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

      // Create a progress bar for the indexing phase
      const indexingProgressBar = createProgressBar();

      // Build position mappings, passing the progress callback
      AgdaDocsIndexer.buildPositionMappings(inputDir, indexingProgressBar);
      
      // Build search index
      const searchIndex = AgdaDocsSearcher.buildSearchIndex(
        AgdaDocsIndexer.getGlobalMappings(),
        inputDir
      );
      
      // Write search index to output directory
      console.log('Writing search index to output directory...');
      AgdaDocsSearcher.writeSearchIndex(outputDir, searchIndex);
      
      // Copy search script to output directory
      console.log('Copying search script to output directory...');
      const searchScriptPath = AgdaDocsSearcher.getSearchScriptPath();
      if (searchScriptPath) {
        fs.copyFileSync(searchScriptPath, path.join(outputDir, 'search.js'));
      } else {
        console.warn('Warning: Could not find search script to copy');
      }

      // Determine number of workers to use
      const numWorkers = Math.min(
        parseInt(options.parallel) || MAX_WORKERS,
        MAX_WORKERS,
        files.length // Don't use more workers than files
      );

      console.log(
        `Processing ${files.length} HTML files using ${numWorkers} worker${numWorkers > 1 ? 's' : ''}...`
      );

      // Create progress tracking with progress bar
      let processedCount = 0;
      const processingProgressBar = createProgressBar();

      // Split files into batches for workers
      const batchSize = Math.ceil(files.length / numWorkers);
      const batches: string[][] = [];

      for (let i = 0; i < files.length; i += batchSize) {
        batches.push(files.slice(i, i + batchSize));
      }

      // Process batches in parallel
      const workerPromises = batches.map((batch) => {
        return processFileBatch(inputDir, outputDir, batch, config).then((count) => {
          processedCount += count;
          processingProgressBar(processedCount, files.length);
          return count;
        });
      });

      // Wait for all workers to complete
      await Promise.all(workerPromises);

      // Build search index after all files are processed
      const positionMappings = AgdaDocsIndexer.getGlobalMappings();
      const searchIndexAfterProcessing = AgdaDocsSearcher.buildSearchIndex(positionMappings, outputDir);
      AgdaDocsSearcher.writeSearchIndex(outputDir, searchIndexAfterProcessing);

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
