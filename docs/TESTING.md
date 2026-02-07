# Testing & Publishing Guide

## Local Testing

### Method 1: F5 Debug Launch (Recommended)

The fastest way to test the extension interactively:

1. Open the extension project in VS Code:
   ```bash
   code /home/ligeng/Codes/vscode-jupyter-extension
   ```

2. Press **F5** (or Run > Start Debugging).
   - This runs the **"Run Extension"** launch configuration
   - A new VS Code window opens with the extension loaded (the "[Extension Development Host]" window)
   - The webpack watcher auto-compiles on save

3. In the Extension Development Host window, open a workspace that has a `kernels.json` file. You can use the existing `jupyter-notebooks` project:
   - File > Open Folder > select `/home/ligeng/Codes/jupyter-notebooks`

4. The extension should activate automatically (you'll see "Jupyter Kernels" in the Activity Bar sidebar).

5. Test the features:

   | What to test | How |
   |---|---|
   | **Tree view** | Click the Jupyter Kernels icon in the Activity Bar. You should see all 5 kernels (common, image_audio, kaggle_course, pytorch_study, random) with status indicators. |
   | **Refresh** | Click the refresh icon in the tree view title bar. |
   | **Edit config** | Click the edit icon in the tree view title bar — should open `kernels.json`. |
   | **JSON IntelliSense** | Open `kernels.json` and verify you get autocomplete and validation. |
   | **Setup Kernel** | Right-click a kernel in the tree > "Setup Kernel..." (or `Ctrl+Shift+P` > "Setup Kernel..."). Watch the Output panel ("Jupyter Kernel Manager" channel) for progress. |
   | **Setup All Kernels** | `Ctrl+Shift+P` > "Setup All Kernels". A progress notification should appear showing each kernel being set up. |
   | **Register Kernel** | Right-click a kernel > "Register Kernel...". Check that it appears in `jupyter kernelspec list`. |
   | **Register All Kernels** | `Ctrl+Shift+P` > "Register All Kernels". |
   | **Unregister Kernel** | Right-click > "Unregister Kernel...". Confirm the dialog. |
   | **Check Health** | `Ctrl+Shift+P` > "Check Kernel Health". Review the diagnostics output in the Output panel. |
   | **Update Notebook Kernels (Dry Run)** | `Ctrl+Shift+P` > "Update Notebook Kernels (Dry Run)". Check the Output panel for what would change. |
   | **Update Notebook Kernels** | `Ctrl+Shift+P` > "Update Notebook Kernels". Confirm the dialog. Verify notebooks have updated metadata. |
   | **Open Kernel Shell** | Right-click a kernel > "Open Kernel Shell...". A terminal should open with the venv activated (you should see `(.venv)` in the prompt). |
   | **Add New Kernel** | Click the `+` icon in the tree view title bar, or `Ctrl+Shift+P` > "Add New Kernel". Follow the wizard. |
   | **Initialize Config** | Open a new empty folder (`File > Open Folder`), then `Ctrl+Shift+P` > "Initialize Kernel Config". |
   | **Status bar** | Open a `.ipynb` file — the status bar (bottom right) should show the kernel name. Click it for a quick-pick menu. |
   | **Walkthrough** | `Ctrl+Shift+P` > "Get Started" > search for "Jupyter Kernel Manager". |
   | **Tasks** | `Ctrl+Shift+P` > "Tasks: Run Task" > select "jupyter-kernel-manager". |

6. Check the **Debug Console** in the main VS Code window for any errors or warnings.

### Method 2: Install VSIX Locally

Test the packaged extension as an end user would experience it:

1. Build the VSIX package:
   ```bash
   cd /home/ligeng/Codes/vscode-jupyter-extension
   npm install
   npm run package
   npx @vscode/vsce package --no-dependencies
   ```

2. Install it in VS Code:
   ```bash
   code --install-extension jupyter-kernel-manager-0.1.0.vsix
   ```

3. Reload VS Code (`Ctrl+Shift+P` > "Developer: Reload Window").

4. Open a workspace with `kernels.json` and test all features as above.

5. To uninstall after testing:
   ```bash
   code --uninstall-extension jupyter-kernel-manager.jupyter-kernel-manager
   ```

### Method 3: Command-Line Sideload

Useful for quick testing without the full debug UI:

```bash
cd /home/ligeng/Codes/vscode-jupyter-extension
npm run compile
code --extensionDevelopmentPath="$(pwd)" /home/ligeng/Codes/jupyter-notebooks
```

This opens VS Code with the extension loaded directly from source, pointing at the jupyter-notebooks workspace.

---

## Running Unit Tests

### From the command line

```bash
cd /home/ligeng/Codes/vscode-jupyter-extension
npm test
```

This compiles the TypeScript, bundles with webpack, downloads VS Code (if needed), and runs all test suites. On Linux, if you see display errors, wrap with xvfb:

```bash
xvfb-run -a npm test
```

### From VS Code

1. Open the extension project in VS Code
2. Press `Ctrl+Shift+P` > "Tasks: Run Test Task"
3. Or use the **"Extension Tests"** launch configuration (F5 with the dropdown set to "Extension Tests")

### Test suites

| File | Tests | What it covers |
|---|---|---|
| `config.test.ts` | 14 | Config validation — valid/invalid configs, edge cases |
| `hashTracker.test.ts` | 8 | MD5 hashing, hash storage, freshness detection |
| `platform.test.ts` | 7 | Cross-platform path resolution, Jupyter data dir, safe directory removal |
| `notebookUpdater.test.ts` | 10 | Notebook-to-kernel mapping by directory path |

---

## Testing Checklist

Use this before publishing:

- [ ] Extension activates when `kernels.json` is present
- [ ] Extension does NOT activate in workspaces without `kernels.json`
- [ ] Tree view shows all kernels with correct status icons
- [ ] Tree items expand to show detail sub-items (display name, description, requirements, venv path)
- [ ] "Initialize Kernel Config" creates a valid starter config
- [ ] "Add New Kernel" wizard creates directory + updates config
- [ ] JSON schema validation highlights errors in `kernels.json`
- [ ] "Setup Kernel" creates a `.venv` and installs packages
- [ ] "Setup All Kernels" processes all kernels with progress
- [ ] Re-running setup on unchanged requirements is skipped (hash match)
- [ ] Re-running setup on changed requirements triggers rebuild
- [ ] "Force Recreate" deletes and rebuilds the venv
- [ ] "Register Kernel" creates a kernelspec in Jupyter data dir
- [ ] Registered kernel appears in `jupyter kernelspec list`
- [ ] "Unregister Kernel" removes the kernelspec
- [ ] "Check Kernel Health" prints a full diagnostic report
- [ ] "Update Notebook Kernels (Dry Run)" shows what would change
- [ ] "Update Notebook Kernels" modifies notebook metadata correctly
- [ ] "Open Kernel Shell" opens terminal with activated venv
- [ ] Status bar shows kernel name when a notebook is open
- [ ] Status bar hides when no notebook is active
- [ ] Walkthrough appears under "Get Started"
- [ ] All settings work (configPath, kernelsDir, kernelPrefix, pypiMirror, pythonPath, autoRegister)
- [ ] Cancelling a long-running operation (Setup All) works
- [ ] Extension works on Linux
- [ ] Extension works on macOS (if available)
- [ ] Extension works on Windows (if available)
- [ ] All unit tests pass (`npm test`)

---

## Publishing

### Prerequisites

1. **Create a publisher account** on the [VS Code Marketplace](https://marketplace.visualstudio.com/manage):
   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with a Microsoft account
   - Create a publisher (e.g., `your-publisher-id`)

2. **Create a Personal Access Token (PAT)**:
   - Go to https://dev.azure.com
   - Click your profile icon (top right) > "Personal access tokens"
   - Click "New Token"
   - **Name**: `vsce` (or any name)
   - **Organization**: Select "All accessible organizations"
   - **Scopes**: Click "Custom defined", then find and check **Marketplace > Manage**
   - Click "Create" and **copy the token** (you won't see it again)

3. **Install vsce** (if not already):
   ```bash
   npm install -g @vscode/vsce
   ```

### Update package.json

Update the `publisher` field in `package.json` to match your publisher ID:

```bash
cd /home/ligeng/Codes/vscode-jupyter-extension
```

Edit `package.json`:
```json
{
  "publisher": "your-publisher-id",
  ...
}
```

Also consider adding a `repository` field:
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/jupyter-kernel-manager"
  },
  ...
}
```

### Login to vsce

```bash
vsce login your-publisher-id
```

Paste your Personal Access Token when prompted.

### Package and Verify

```bash
# Build production bundle
npm run package

# Create VSIX
vsce package --no-dependencies

# This creates: jupyter-kernel-manager-0.1.0.vsix
```

Inspect the VSIX contents to make sure nothing sensitive is included:

```bash
# List files in the VSIX (it's a zip)
unzip -l jupyter-kernel-manager-0.1.0.vsix
```

Verify that **none** of the following are included:
- `src/` (TypeScript source)
- `node_modules/`
- `out/` (test build output)
- `.env` or credential files

### Publish

```bash
# Publish to the marketplace
vsce publish

# Or publish a specific version bump:
vsce publish minor    # 0.1.0 -> 0.2.0
vsce publish patch    # 0.1.0 -> 0.1.1
```

### Verify Publication

1. Visit `https://marketplace.visualstudio.com/items?itemName=your-publisher-id.jupyter-kernel-manager`
2. Wait a few minutes for the listing to appear
3. Install from VS Code: `Ctrl+Shift+X` > search "Jupyter Kernel Manager"

### Publishing Updates

For subsequent releases:

1. Update `CHANGELOG.md` with the new version's changes
2. Bump the version:
   ```bash
   vsce publish patch   # or minor / major
   ```
   This automatically increments the version in `package.json`, creates the VSIX, and publishes.

   Or do it manually:
   ```bash
   npm version patch    # bumps package.json version
   vsce publish         # packages and publishes
   ```

### CI/CD Publishing (Optional)

To automate publishing from GitHub Actions, add a secret `VSCE_PAT` to your repository settings, then add a release job to `.github/workflows/ci.yml`:

```yaml
  publish:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm install -g @vscode/vsce
      - run: vsce publish -p ${{ secrets.VSCE_PAT }}
```

Then to publish a release:
```bash
git tag v0.1.0
git push origin v0.1.0
```

The CI pipeline will build, test, and publish automatically when a version tag is pushed.
