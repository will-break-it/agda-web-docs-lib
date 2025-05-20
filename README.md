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

## Installation

```bash
npm install agda-web-docs-lib
```

## Usage

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
