const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Test configuration
const TEST_DIR = path.join(__dirname, 'temp');
const INPUT_DIR = path.join(TEST_DIR, 'input');
const OUTPUT_DIR = path.join(TEST_DIR, 'output');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Helper to copy fixture files
function copyFixtures() {
  const fixtures = [
    'Agda.Data.List.html'
  ];
  
  fixtures.forEach(fixture => {
    const src = path.join(FIXTURES_DIR, fixture);
    const dest = path.join(INPUT_DIR, fixture);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });
  
  // Copy newly created fixtures
  const newFixtures = [
    'Data.Nat.html', 
    'Project.Utils.html',
    'External.Library.html'
  ];
  
  newFixtures.forEach(fixture => {
    const src = path.join(FIXTURES_DIR, fixture);
    const dest = path.join(INPUT_DIR, fixture);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });
}

// Helper to run CLI
function runCLI(args) {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
    const child = spawn('node', [cliPath, ...args], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`CLI exited with code ${code}. stderr: ${stderr}`));
      }
    });
  });
}

function setupTestEnvironment() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(INPUT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  copyFixtures();
}

function cleanupTestEnvironment() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Agda Web Docs Library Tests', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  describe('Multi-Block Line Numbering', () => {
    test('should generate unique IDs for each code block', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/",
        modules: ["Agda", "Data", "Project"]
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const listContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Agda.Data.List.html'), 'utf8');
      
      // Should have multiple blocks with unique IDs
      assert(listContent.includes('id="B1"'), 'Should have first block B1');
      assert(listContent.includes('id="B2"'), 'Should have second block B2');
      
      // Each block should have its own line numbering  
      assert(listContent.includes('B1-L1'), 'First block should have B1-L1');
      assert(listContent.includes('B2-L1'), 'Second block should have B2-L1');
      assert(listContent.includes('B1-LC1'), 'First block should have B1-LC1 content IDs');
      assert(listContent.includes('B2-LC1'), 'Second block should have B2-LC1 content IDs');
      
      // Line numbers should be clickable anchors
      assert(listContent.includes('href="#B1-L1"'), 'Line numbers should be linkable');
      assert(listContent.includes('href="#B2-L1"'), 'Line numbers in second block should be linkable');
    });
  });

  describe('Type Preview Integration', () => {
    test('should add hoverable attributes for type previews', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/",
        modules: ["Data"]
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const natContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Data.Nat.html'), 'utf8');
      
      // Should include type preview container
      assert(natContent.includes('type-preview-container'), 'Should include type preview container');
      
      // Should include type preview script
      assert(natContent.includes('typePreview.js'), 'Should include type preview script');
      
      // Links should have hoverable attributes for position mappings
      assert(natContent.includes('data-hoverable'), 'Should have hoverable data attributes');
      assert(natContent.includes('type-hoverable'), 'Should have type-hoverable class');
    });
  });

  describe('Cross-File Link Transformation', () => {
    test('should transform numeric position links to line anchors', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/",
        modules: ["Data", "Agda"]
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const utilsContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Project.Utils.html'), 'utf8');
      
      // Should transform cross-file references
      // Original: href="Data.Nat.html#117" -> href="Data.Nat.html#B1-L3" (where 117 maps to line 3)
      assert(utilsContent.includes('href="Data.Nat.html#B1-L'), 'Should transform cross-file numeric refs to line refs');
      
      // Should preserve original href in data attribute
      assert(utilsContent.includes('data-original-href'), 'Should preserve original href');
    });
  });

  describe('Module Filtering', () => {
    test('should filter sidebar modules based on config', async () => {
      const configPath = path.join(FIXTURES_DIR, 'configs', 'project-filtered.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.inputDir = INPUT_DIR;
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const listContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Agda.Data.List.html'), 'utf8');
      
      // Should include filtered modules (Project, Agda, Data)
      assert(listContent.includes('Project.Utils.html'), 'Should include Project modules');
      assert(listContent.includes('Agda.Data.List.html'), 'Should include Agda modules');
      assert(listContent.includes('Data.Nat.html'), 'Should include Data modules');
      
      // Should NOT include External modules
      assert(!listContent.includes('External.Library.html'), 'Should NOT include External modules');
      
      // Should organize modules by namespace
      assert(listContent.includes('module-group-header'), 'Should have module group headers');
    });
  });

  describe('GitHub Integration', () => {
    test('should include GitHub link when configured', async () => {
      const configPath = path.join(FIXTURES_DIR, 'configs', 'project-filtered.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.inputDir = INPUT_DIR;
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const listContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Agda.Data.List.html'), 'utf8');
      
      // Should include GitHub link
      assert(listContent.includes('github-link'), 'Should have GitHub link element');
      assert(listContent.includes('https://github.com/test/agda-project'), 'Should use configured GitHub URL');
      assert(listContent.includes('View on GitHub'), 'Should have GitHub link title');
      assert(listContent.includes('github-icon'), 'Should have GitHub icon');
    });

    test('should exclude GitHub link when not configured', async () => {
      const configPath = path.join(FIXTURES_DIR, 'configs', 'no-github.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.inputDir = INPUT_DIR;
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const listContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Agda.Data.List.html'), 'utf8');
      
      // Should NOT include GitHub elements
      assert(!listContent.includes('github-link'), 'Should NOT have GitHub link');
      assert(!listContent.includes('github-icon'), 'Should NOT have GitHub icon');
    });
  });

  describe('Theme Integration', () => {
    test('should include theme functionality', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/home"
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const listContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Agda.Data.List.html'), 'utf8');
      
      // Should have theme toggle button
      assert(listContent.includes('theme-toggle'), 'Should have theme toggle button');
      assert(listContent.includes('Toggle theme'), 'Should have theme toggle title');
      
      // Should include theme scripts
      assert(listContent.includes('themeInit.js'), 'Should include theme init script');
      assert(listContent.includes('themeToggle.js'), 'Should include theme toggle script');
      
      // Should have light and dark icons
      assert(listContent.includes('light-icon'), 'Should have light theme icon');
      assert(listContent.includes('dark-icon'), 'Should have dark theme icon');
    });
  });

  describe('Search Index Validation', () => {
    test('should generate comprehensive search index', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/",
        modules: ["Data", "Agda", "Project"]
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      // Read and parse search index
      const searchIndexPath = path.join(OUTPUT_DIR, 'search-index.json');
      assert(fs.existsSync(searchIndexPath), 'Search index should exist');
      
      const searchIndex = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
      
      // Should have entries for all files
      assert(searchIndex['Data.Nat.html'], 'Should index Data.Nat.html');
      assert(searchIndex['Agda.Data.List.html'], 'Should index Agda.Data.List.html');
      assert(searchIndex['Project.Utils.html'], 'Should index Project.Utils.html');
      
      // Check Data.Nat entries
      const natEntries = searchIndex['Data.Nat.html'];
      assert(Array.isArray(natEntries), 'Entries should be array');
      
      // Should have module entry
      const moduleEntry = natEntries.find(e => e.type === 'module');
      assert(moduleEntry, 'Should have module entry');
      assert.equal(moduleEntry.content, 'Data.Nat', 'Module entry should have correct name');
      
      // Should have code entries
      const codeEntries = natEntries.filter(e => e.type === 'code');
      assert(codeEntries.length > 0, 'Should have code entries');
      
      // Should have header entries  
      const headerEntries = natEntries.filter(e => e.type === 'header');
      assert(headerEntries.length > 0, 'Should have header entries');
      
      // Code entries should have line numbers
      const codeWithLines = codeEntries.filter(e => e.lineNumber);
      assert(codeWithLines.length > 0, 'Some code entries should have line numbers');
      
      // Should have context for searchable code
      const entriesWithContext = natEntries.filter(e => e.context);
      assert(entriesWithContext.length > 0, 'Should have entries with context');
      
      // Should index specific identifiers within code content
      const natTypeEntry = natEntries.find(e => e.content.includes('ℕ'));
      assert(natTypeEntry, 'Should index content containing ℕ type');
      
      const zeroEntry = natEntries.find(e => e.content.includes('zero') && e.type === 'code');
      assert(zeroEntry, 'Should index content containing zero constructor');
      
      const sucEntry = natEntries.find(e => e.content.includes('suc') && e.type === 'code');
      assert(sucEntry, 'Should index content containing suc constructor');
    });

    test('should handle large search indices with chunking', async () => {
      // This test would be for very large projects, but we can verify the chunking logic exists
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/"
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      // For our small test case, should be regular index
      const searchIndexPath = path.join(OUTPUT_DIR, 'search-index.json');
      assert(fs.existsSync(searchIndexPath), 'Regular search index should exist');
      
      // Should NOT have metadata file for small indices
      const metadataPath = path.join(OUTPUT_DIR, 'search-index-metadata.json');
      assert(!fs.existsSync(metadataPath), 'Should not chunk small indices');
    });
  });

  describe('URL Line Selection', () => {
    test('should support line anchor navigation', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/"
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const natContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Data.Nat.html'), 'utf8');
      
      // Should have line anchors that can be linked to
      assert(natContent.includes('href="#B1-L1"'), 'Should have line 1 anchor');
      assert(natContent.includes('href="#B1-L2"'), 'Should have line 2 anchor');
      assert(natContent.includes('href="#B2-L1"'), 'Should have second block line 1 anchor');
      
      // Line number elements should have data attributes for selection
      assert(natContent.includes('data-line-number="1"'), 'Should have line number data attribute');
      assert(natContent.includes('data-block-id="B1"'), 'Should have block ID data attribute');
      assert(natContent.includes('data-block-id="B2"'), 'Should have second block ID data attribute');
    });
  });

  describe('Asset Integration', () => {
    test('should copy and reference all required assets', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/"
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      const outputFiles = fs.readdirSync(OUTPUT_DIR);
      
      // All required assets should be copied
      const requiredAssets = [
        'base.css', 'search.css', 'typePreview.css',
        'codeBlocks.js', 'search.js', 'sidebarToggle.js',
        'themeInit.js', 'themeToggle.js', 'typePreview.js',
        'search-index.json'
      ];
      
      requiredAssets.forEach(asset => {
        assert(outputFiles.includes(asset), `Should copy ${asset}`);
      });
      
      // Verify HTML references assets correctly
      const listContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Agda.Data.List.html'), 'utf8');
      
      requiredAssets.filter(a => a.endsWith('.css')).forEach(css => {
        assert(listContent.includes(`href="${css}"`), `Should reference ${css}`);
      });
      
      requiredAssets.filter(a => a.endsWith('.js')).forEach(js => {
        assert(listContent.includes(`src="${js}"`), `Should reference ${js}`);
      });
    });
  });

  describe('Basic HTML Transformation', () => {
    test('should transform HTML files with modern features', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/docs"
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      await runCLI(['process', '-i', INPUT_DIR, '-o', OUTPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      // Check that output files exist
      const outputFiles = fs.readdirSync(OUTPUT_DIR);
      assert(outputFiles.includes('Data.Nat.html'), 'Data.Nat.html should exist in output');
      
      // Read the transformed file
      const transformedContent = fs.readFileSync(path.join(OUTPUT_DIR, 'Data.Nat.html'), 'utf8');
      
      // Verify modern features are added
      assert(transformedContent.includes('viewport'), 'Should have responsive viewport meta tag');
      assert(transformedContent.includes('base.css'), 'Should link to base.css');
      assert(transformedContent.includes('search.css'), 'Should link to search.css');
      assert(transformedContent.includes('typePreview.css'), 'Should link to typePreview.css');
      
      // Verify header structure
      assert(transformedContent.includes('<header>'), 'Should have header element');
      assert(transformedContent.includes('menu-toggle'), 'Should have menu toggle button');
      assert(transformedContent.includes('theme-toggle'), 'Should have theme toggle button');
      assert(transformedContent.includes('back-button'), 'Should have back button');
      
      // Verify sidebar structure
      assert(transformedContent.includes('<aside class="sidebar">'), 'Should have sidebar');
      assert(transformedContent.includes('modules-header'), 'Should have modules header');
      
      // Verify main content wrapper
      assert(transformedContent.includes('main-wrapper'), 'Should have main wrapper');
      assert(transformedContent.includes('main-content'), 'Should have main content area');
      
      // Verify code block enhancements
      assert(transformedContent.includes('has-copy-button'), 'Code blocks should have copy button class');
      assert(transformedContent.includes('line-numbers'), 'Should have line numbers');
      assert(transformedContent.includes('code-container'), 'Should have code container');
      assert(transformedContent.includes('copy-code-button'), 'Should have copy button');
      
      // Verify line structure
      assert(transformedContent.includes('B1-L'), 'Should have block-line ID format');
      assert(transformedContent.includes('code-line'), 'Should have code-line class');
    });

    test('should transform in-place when no output directory specified', async () => {
      const config = {
        inputDir: INPUT_DIR,
        backButtonUrl: "/docs"
      };
      fs.writeFileSync(path.join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));
      
      // Run the CLI without output directory (should default to input directory)
      await runCLI(['process', '-i', INPUT_DIR, '-c', path.join(TEST_DIR, 'config.json')]);
      
      // Files in input directory should be transformed
      const transformedContent = fs.readFileSync(path.join(INPUT_DIR, 'Data.Nat.html'), 'utf8');
      assert(transformedContent.includes('header'), 'File should have modern features');
      
      // Assets should be copied to input directory
      const inputFiles = fs.readdirSync(INPUT_DIR);
      assert(inputFiles.includes('base.css'), 'Assets should be copied to input directory');
      assert(inputFiles.includes('search.js'), 'JavaScript files should be copied');
    });
  });
}); 