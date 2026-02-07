#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.0
#
# This script will:
#   1. Validate the version format
#   2. Check for a clean git working tree
#   3. Update the version in package.json
#   4. Run lint, type check, and build
#   5. Package the VSIX
#   6. Commit the version bump
#   7. Create a git tag (v<version>)
#   8. Publish to the VS Code Marketplace
#   9. Push the commit and tag to origin

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

# Validate semver format (x.y.z)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g., 1.2.3)"
  exit 1
fi

TAG="v${VERSION}"

# Check for clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

# Check the tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag $TAG already exists."
  exit 1
fi

# Check vsce is available
if ! command -v vsce >/dev/null 2>&1; then
  echo "Error: vsce is not installed. Run: npm install -g @vscode/vsce"
  exit 1
fi

echo "=== Releasing $TAG ==="
echo ""

# Step 1: Update version in package.json
echo "--- Updating package.json version to $VERSION ---"
npm version "$VERSION" --no-git-tag-version

# Step 2: Install dependencies (ensure lock file is up to date)
echo "--- Installing dependencies ---"
npm ci

# Step 3: Lint
echo "--- Linting ---"
npm run lint

# Step 4: Type check
echo "--- Type checking ---"
npx tsc --noEmit

# Step 5: Production build
echo "--- Building ---"
npm run package

# Step 6: Package VSIX
echo "--- Packaging VSIX ---"
vsce package --no-dependencies
VSIX_FILE="jupyter-kernel-manager-${VERSION}.vsix"
if [ ! -f "$VSIX_FILE" ]; then
  echo "Error: Expected VSIX file not found: $VSIX_FILE"
  exit 1
fi
echo "Created: $VSIX_FILE"

# Step 7: Commit version bump
echo "--- Committing version bump ---"
git add package.json package-lock.json
git commit -m "release: v${VERSION}"

# Step 8: Create tag
echo "--- Tagging $TAG ---"
git tag -a "$TAG" -m "Release $VERSION"

# Step 9: Publish to marketplace
echo "--- Publishing to VS Code Marketplace ---"
vsce publish --no-dependencies
echo "Published $VERSION to marketplace."

# Step 10: Push commit and tag
echo "--- Pushing to origin ---"
git push origin HEAD
git push origin "$TAG"

echo ""
echo "=== Release $TAG complete ==="
echo "  VSIX: $VSIX_FILE"
echo "  Marketplace: https://marketplace.visualstudio.com/items?itemName=mcai4gl2.jupyter-kernel-manager"
echo "  Tag: $TAG"
