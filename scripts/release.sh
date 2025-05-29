#!/bin/bash

# Release helper script for agda-web-docs-lib
# Usage: ./scripts/release.sh [patch|minor|major|<version>]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Agda Web Docs Library Release Helper${NC}"
echo

# Check if we're on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
    echo -e "${RED}❌ Error: Must be on main branch to create a release${NC}"
    echo -e "Current branch: ${YELLOW}$BRANCH${NC}"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Error: Working directory is not clean${NC}"
    echo "Please commit or stash your changes first."
    git status --short
    exit 1
fi

# Pull latest changes
echo -e "${BLUE}📥 Pulling latest changes...${NC}"
git pull origin main

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}v$CURRENT_VERSION${NC}"

# Determine new version
if [ $# -eq 0 ]; then
    echo
    echo "Please specify version bump type:"
    echo "  patch  - Bug fixes (1.0.0 → 1.0.1)"
    echo "  minor  - New features (1.0.0 → 1.1.0)"  
    echo "  major  - Breaking changes (1.0.0 → 2.0.0)"
    echo "  X.Y.Z  - Specific version"
    echo
    read -p "Version bump [patch]: " VERSION_TYPE
    VERSION_TYPE=${VERSION_TYPE:-patch}
else
    VERSION_TYPE=$1
fi

# Calculate new version
if [[ "$VERSION_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+.*$ ]]; then
    NEW_VERSION=$VERSION_TYPE
else
    case $VERSION_TYPE in
        patch|minor|major)
            NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version --dry-run | sed 's/v//')
            ;;
        *)
            echo -e "${RED}❌ Invalid version type: $VERSION_TYPE${NC}"
            exit 1
            ;;
    esac
fi

echo -e "New version will be: ${GREEN}v$NEW_VERSION${NC}"
echo

# Confirm
read -p "Create release v$NEW_VERSION? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Release cancelled."
    exit 0
fi

echo
echo -e "${BLUE}🏗️  Creating release v$NEW_VERSION...${NC}"

# Create and push tag
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"

echo
echo -e "${GREEN}✅ Release tag created successfully!${NC}"
echo -e "${BLUE}🔗 GitHub Actions will now:${NC}"
echo "   • Run full test suite"
echo "   • Update package.json version"
echo "   • Publish to npm"
echo "   • Create GitHub release"
echo
echo -e "${BLUE}📦 Track progress at:${NC}"
echo "   https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
echo
echo -e "${GREEN}🎉 Release v$NEW_VERSION initiated!${NC}" 