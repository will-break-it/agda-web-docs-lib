# Agda Web Docs Library

A specialized library that enhances Agda-generated HTML documentation with navigation features, making formal specifications more accessible and user-friendly.

## Overview

Agda Web Docs Library transforms standard Agda HTML documentation by adding:

- **Module Navigation**: A customizable sidebar that displays all available modules with optional filtering
- **Themed Header**: A consistent header with optional back button for improved navigation
- **Preserved Interactivity**: Maintains all native Agda documentation features including type links and interactive elements
- **Simple Integration**: Works as both a CLI tool and a programmatic library

## Installation

```bash
npm install agda-web-docs-lib
```

## Configuration

The library accepts the following configuration options:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `inputDir` | string | Yes | Directory containing the Agda-generated HTML files |
| `backButtonUrl` | string | No | URL for the back button in the header (e.g., "/docs") |
| `modules` | string[] | No | Array of module names to include in the sidebar. If not provided, all modules will be shown |

## Usage

### CLI Usage

1. Create a configuration file (e.g., `agda-docs.config.json`):

```json
{
  "backButtonUrl": "/docs",
  "modules": ["Leios", "Leios.Ledger"]
}
```

2. Process your Agda HTML documentation:

```bash
npx agda-docs process /path/to/agda/html agda-docs.config.json
```

### Programmatic Usage

```typescript
import { AgdaDocsRenderer } from 'agda-web-docs-lib';

const config = {
  backButtonUrl: '/docs',
  modules: ['Leios', 'Leios.Ledger']
};

const renderer = new AgdaDocsRenderer(config);
renderer.processDirectory('/path/to/agda/html');
```

## Integration Example: Docusaurus

This library can be easily integrated with documentation frameworks like Docusaurus. Here's an example workflow:

1. Add the build script to your `package.json`:

```json
{
  "scripts": {
    "build-agda-docs": "bash scripts/build-and-process-agda-docs.sh"
  }
}
```

2. Create a build script that:
   - Generates Agda HTML documentation (e.g., using Nix)
   - Copies the generated HTML to your static directory
   - Processes the HTML using this library

3. Link to the processed HTML files from your documentation

For a complete example, see our [build script](scripts/build-and-process-agda-docs.sh) that handles the integration between Nix-generated Agda docs and Docusaurus.

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test
```
