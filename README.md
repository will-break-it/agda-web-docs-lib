# Agda Web Docs Library

A library for enhancing Agda HTML documentation with modern web features.

## Features

- Clean, responsive layout with sidebar navigation
- Dark/light theme toggle
- Line numbers and syntax highlighting
- Type definition preview on hover
- Position-to-line mappings (converts `#123` to `#L42`)
- Cross-file reference resolution
- Code block copying
- Full-text search (Ctrl+K/Cmd+K)

## Feature Examples

### Modern Layout & Navigation

Transform your Agda documentation with a clean, responsive design featuring an intelligent sidebar navigation, theme switching, and seamless GitHub integration.

![Modern Layout](static/layout.png)

**Key features:**
- **Responsive sidebar navigation**: Automatically generated from your module structure
- **Dark/light theme toggle**: Seamless switching with system preference detection
- **GitHub integration**: Direct links to source files when `githubUrl` is configured
- **Clean typography**: Optimized for reading mathematical notation and code
- **Mobile-friendly**: Responsive design works perfectly on all screen sizes
- **Breadcrumb navigation**: Easy navigation through nested module hierarchies

### Full-Text Search

Powerful search functionality lets you quickly find modules, functions, types, and code blocks across your entire documentation.

![Search Interface](static/search.png)

**Key features:**
- **Instant search**: Press `Ctrl+K` (or `Cmd+K` on Mac) to open search anywhere
- **Module discovery**: Find modules by name or partial matches
- **Code block search**: Search within function definitions and type signatures
- **Cross-reference search**: Locate definitions across multiple files
- **Fuzzy matching**: Smart search handles typos and partial queries
- **Keyboard navigation**: Navigate results without touching the mouse
- **Context preservation**: Search results maintain syntax highlighting and formatting

### Line Highlighting

The library provides GitHub-like line highlighting with shareable URLs. You can select single lines or ranges by clicking line numbers, and the selection becomes part of the URL for easy sharing.

![Line Highlighting](static/line-highlighting.png)

**Key features:**
- Click line numbers to select single lines (`#L42`)
- Hold Shift and click to select ranges (`#L42-L48`)  
- Selections are automatically reflected in the URL
- Direct linking to specific lines works seamlessly
- Full support for `.lagda` files with multiple code blocks
- Preserves selections when navigating between files

### Type Definition Preview

Hover over any type or function reference to see a rich preview with the complete definition, including documentation and parameter information.

![Type Preview with Parameters](static/type-preview-with-params.png)

**Key features:**
- **Cross-file resolution**: Shows definitions from other modules as code block previews
- **Contextual documentation**: Automatically includes comments that immediately precede the definition
- **Parameter tables**: Function parameters are transformed into readable tables with types and descriptions
- **Syntax highlighting**: Preview maintains full syntax highlighting and formatting
- **Quick access**: No need to navigate away from your current context

## Installation

```bash
npm install agda-web-docs-lib
```

## Usage

### GitHub Actions

The easiest way to integrate this library into your CI/CD pipeline is using the provided GitHub Actions.

#### Option 1: Using the Action Directly

Add this step to your workflow:

```yaml
- name: 🔄 Transform Agda documentation
  uses: will-break-it/agda-web-docs-lib@v0.7.1
  with:
    input-dir: 'html/'
    config-file: 'agda-docs.config.json'
    github-url: 'https://github.com/your-user/your-project'
    modules: 'Your.Module.Prefix'
```

#### Option 2: Using the Reusable Workflow

Create `.github/workflows/docs.yml`:

```yaml
name: 'Build Documentation'

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-agda-docs:
    uses: will-break-it/agda-web-docs-lib/.github/workflows/transform-agda-docs.yml@v0.7.1
    with:
      input-dir: 'html/'
      config-file: 'agda-docs.config.json'
      github-url: 'https://github.com/your-user/your-project'
      modules: 'Your.Module.Prefix'
      artifact-name: 'enhanced-agda-docs'
      
  deploy:
    needs: build-agda-docs
    runs-on: ubuntu-latest
    steps:
      - name: 📥 Download transformed docs
        uses: actions/download-artifact@v4
        with:
          name: enhanced-agda-docs
          path: docs/
          
      - name: 🚀 Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: docs/
```

#### Complete Integration Example

Here's a complete workflow that generates Agda documentation and enhances it:

```yaml
name: 'Generate and Deploy Agda Documentation'

on:
  push:
    branches: [main]

jobs:
  generate-agda-html:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: 🏗️ Setup Agda
        uses: wenkokke/setup-agda@v2
        with:
          agda-version: '2.6.4'
          
      - name: 📚 Generate HTML documentation
        run: |
          agda --html --html-dir=html/ src/Main.agda
          
      - name: 📤 Upload HTML artifacts
        uses: actions/upload-artifact@v4
        with:
          name: agda-html-raw
          path: html/

  enhance-documentation:
    needs: generate-agda-html
    uses: will-break-it/agda-web-docs-lib/.github/workflows/transform-agda-docs.yml@v0.7.1
    with:
      input-dir: 'html/'
      github-url: ${{ github.server_url }}/${{ github.repository }}
      modules: 'Your.Module.Prefix'
      back-button-url: '/'
      artifact-name: 'enhanced-agda-docs'
      
  deploy:
    needs: enhance-documentation
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: 📥 Download enhanced docs
        uses: actions/download-artifact@v4
        with:
          name: enhanced-agda-docs
          path: docs/
          
      - name: 🚀 Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
        with:
          artifact: enhanced-agda-docs
```

#### Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `input-dir` | Directory containing HTML files to transform | ✅ | |
| `output-dir` | Output directory (defaults to in-place transformation) | ❌ | `''` |
| `config-file` | Path to configuration file | ❌ | `agda-docs.config.json` |
| `back-button-url` | URL for the back button | ❌ | `''` |
| `modules` | Comma-separated module prefixes | ❌ | `''` |
| `github-url` | GitHub repository URL for source links | ❌ | `''` |
| `node-options` | Node.js memory/performance options | ❌ | `--max-old-space-size=2048` |

#### Action Outputs

| Output | Description |
|--------|-------------|
| `files-processed` | Number of HTML files processed |
| `output-directory` | Path to the transformed files |

### Configuration

Create `agda-docs.config.json` in your project root:

```json
{
  "backButtonUrl": "/",
  "inputDir": "html/",
  "modules": ["Your.Module.Prefix"],
  "githubUrl": "https://github.com/your-user/your-project"
}
```

### CLI

```bash
# Process HTML files (default config)
npx agda-docs process

# Custom config file
npx agda-docs process -c path/to/config.json

# Custom directories
npx agda-docs process -i input/path -o output/path
```

### Programmatic Usage

```typescript
import { AgdaDocsTransformer } from 'agda-web-docs-lib';
import { AgdaDocsIndexer } from 'agda-web-docs-lib/dist/indexer';

// Config
const config = {
  backButtonUrl: '/',
  inputDir: 'html/',
  modules: ['Your.Module'],
  githubUrl: 'https://github.com/your-user/your-project'
};

// Build index
AgdaDocsIndexer.buildPositionMappings('path/to/html');

// Process file
const transformer = new AgdaDocsTransformer(config);
transformer.setContent(htmlContent, 'file.html');
const processed = transformer.transform();
```

## Examples

- [Leios Formal Specification](https://leios.cardano-scaling.org/formal-spec/Leios.Base.html)

## License

MIT
