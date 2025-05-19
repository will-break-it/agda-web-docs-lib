#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { AgdaDocsTransformer } from './transformer';

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

      // Process files
      const transformer = new AgdaDocsTransformer(config);
      const files = fs.readdirSync(inputDir).filter((file) => file.endsWith('.html'));

      if (files.length === 0) {
        console.error('Error: No HTML files found in input directory');
        process.exit(1);
      }

      // Add a progress bar
      console.log(`Processing ${files.length} HTML files...`);
      const progressBarWidth = 40;
      let progressCount = 0;

      // Process each file with progress updates
      for (const file of files) {
        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file);
        const content = fs.readFileSync(inputPath, 'utf8');
        transformer.setContent(content);
        const processed = transformer.transform();
        fs.writeFileSync(outputPath, processed);

        // Update progress
        progressCount++;
        const percent = Math.round((progressCount / files.length) * 100);
        const barLength = Math.round((progressCount / files.length) * progressBarWidth);
        const bar = '='.repeat(barLength) + ' '.repeat(progressBarWidth - barLength);
        
        // Clear line and update progress bar (works in most terminals)
        process.stdout.write(`\r[${bar}] ${percent}% (${progressCount}/${files.length})`);
      }
      
      // Add a newline after the progress bar is complete
      process.stdout.write('\n');
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
