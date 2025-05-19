# Agda Web Docs Library

A library for enhancing Agda HTML documentation with modern web features, including:

- A clean, responsive layout with sidebar navigation
- Dark/light theme toggle
- Line numbers and line highlighting
- Cross-file reference resolution with position-to-line mapping
- Code block copying
- Full-text search (Ctrl+K/Cmd+K)

## Installation

```bash
npm install agda-web-docs-lib
```

## Usage

### Configuration

Create a configuration file named `agda-docs.config.json` in your project root:

```json
{
  "backButtonUrl": "/",
  "inputDir": "html/",
  "modules": [
    "Your.Module.Prefix"
  ],
  "githubUrl": "https://github.com/your-user/your-project"
}
```

### CLI Usage

```bash
# Process the HTML files using the default config file
npx agda-docs process

# Or specify a custom config file
npx agda-docs process -c path/to/config.json

# Customize input and output directories
npx agda-docs process -i path/to/input -o path/to/output

# Control number of parallel workers
npx agda-docs process -p 4
```

### Programmatic Usage

```typescript
import { AgdaDocsTransformer } from 'agda-web-docs-lib';
import { AgdaDocsIndexer } from 'agda-web-docs-lib/dist/indexer';

// Config options
const config = {
  backButtonUrl: '/',
  inputDir: 'html/',
  modules: ['Your.Module'],
  githubUrl: 'https://github.com/your-user/your-project'
};

// Build position mappings index
AgdaDocsIndexer.buildPositionMappings('path/to/html');

// Process a single file
const transformer = new AgdaDocsTransformer(config);
const htmlContent = fs.readFileSync('path/to/file.html', 'utf-8');
transformer.setContent(htmlContent, 'file.html');
const processed = transformer.transform();

fs.writeFileSync('path/to/output/file.html', processed);
```

## Features

### Position-to-Line Mappings

Agda HTML documentation uses numeric position references (e.g., `#123`) in links, which are difficult to work with. This library converts these to line number references (e.g., `#L42`) for better readability and usability.

To toggle between position references and line numbers, press `Alt+P` on any page.

### Indexing System

The library builds the following index during processing:

1. **Position Mappings**: Maps Agda's numeric position references to actual line numbers

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `backButtonUrl` | string | (Optional) URL for the back button in the header |
| `inputDir` | string | Directory containing Agda-generated HTML files |
| `modules` | string[] | (Optional) List of module prefixes to include in sidebar |
| `githubUrl` | string | (Optional) Link to GitHub repository |

## License

MIT
