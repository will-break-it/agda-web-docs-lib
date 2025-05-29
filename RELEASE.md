# Release Workflow

This project uses an automated tag-based release system with precommit hooks to ensure code quality.

## 🔄 Development Workflow

### Daily Development
1. **Make changes** - Code as usual
2. **Commit** - Precommit hooks automatically:
   - Run `lint-staged` (eslint + prettier on staged files)
   - Run full test suite
3. **Push** - Pre-push hooks automatically:
   - Run full build to ensure everything compiles

### Quality Assurance
- **Precommit hooks** handle all linting, formatting, and testing
- **CI** runs only a lightweight smoke test for additional confidence
- **Main branch** is always stable and ready for release

## 🚀 Creating Releases

### Option 1: Using the Release Script (Recommended)

```bash
# Interactive release (will prompt for version type)
npm run release

# Direct release types
./scripts/release.sh patch   # Bug fixes: 1.0.0 → 1.0.1  
./scripts/release.sh minor   # New features: 1.0.0 → 1.1.0
./scripts/release.sh major   # Breaking changes: 1.0.0 → 2.0.0

# Specific version
./scripts/release.sh 1.2.3
```

### Option 2: Manual Tag Creation

```bash
# Create and push a tag
git tag v1.2.3
git push origin v1.2.3
```

## 🤖 Automated Release Process

When you create a tag (via script or manually), GitHub Actions automatically:

1. **Validates** - Runs full test suite as final safety check
2. **Updates** - Sets package.json version to match the tag
3. **Publishes** - Releases to npm with provenance 
4. **Documents** - Creates GitHub release with auto-generated notes
5. **Notifies** - Provides links to npm package and GitHub release

## 📋 Release Checklist

Before creating a release:

- ✅ All changes committed and pushed to `main`
- ✅ Precommit hooks have validated all code
- ✅ CI smoke test is passing
- ✅ You're satisfied with the current state of `main`

Then simply:
```bash
npm run release
```

## 🏷️ Semantic Versioning

Follow [semantic versioning](https://semver.org/):

- **Patch** (`1.0.1`) - Bug fixes, documentation updates
- **Minor** (`1.1.0`) - New features, backwards-compatible changes  
- **Major** (`2.0.0`) - Breaking changes, API modifications

## 🔗 Related Files

- `.github/workflows/release.yml` - Automated release workflow
- `.github/workflows/ci.yml` - Lightweight CI for smoke testing
- `.husky/pre-commit` - Precommit quality checks
- `.husky/pre-push` - Pre-push build verification
- `scripts/release.sh` - Interactive release helper 