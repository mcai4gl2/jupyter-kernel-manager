# Changelog

All notable changes to the Jupyter Kernel Manager extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-07

### Added

#### Core
- `kernels.json` configuration file with JSON schema IntelliSense and validation
- File system watcher for automatic reload on config changes
- Cross-platform support (Windows, macOS, Linux) including Windows Store Python sandbox handling

#### Virtual Environment Management
- Create isolated `.venv` per kernel with `Setup All Kernels` / `Setup Kernel...` commands
- MD5 hash-based change detection — skip unchanged kernels on rebuild
- `Force Recreate Kernel...` command to delete and rebuild from scratch
- PyPI mirror auto-detection based on geographic location (Tsinghua, NUS, Fau mirrors)
- Kernel variant support (e.g., CPU/GPU with different requirements files)

#### Kernel Registration
- Register kernels as Jupyter kernelspecs (pure file I/O, no ipykernel CLI needed)
- `Register All Kernels` / `Register Kernel...` / `Unregister Kernel...` commands
- Auto-register after setup (configurable via `autoRegister` setting)
- Windows dual-location registration (AppData + project-local) with robocopy fallback

#### Diagnostics & Notebook Updates
- `Check Kernel Health` command with comprehensive diagnostics output
- `Update Notebook Kernels` to batch-update kernel metadata in `.ipynb` files
- `Update Notebook Kernels (Dry Run)` to preview changes without modifying files

#### UI
- Sidebar tree view with kernel status indicators (Ready, Needs Update, Not Set Up, Error)
- Expandable detail items showing display name, description, requirements, variants, venv path
- Context menus for kernel-specific actions
- Status bar showing active kernel for the current notebook
- `Add New Kernel` wizard for guided kernel creation
- `Open Kernel Shell...` to open a terminal with venv activated

#### Tasks & Automation
- Dynamic VS Code task provider (`jupyter-kernel-manager` task type)
- Global tasks: Setup All, Register All, Check Health, Update Notebooks
- Per-kernel tasks: Setup, Register, Shell

#### Getting Started
- VS Code walkthrough with 5 guided steps
- Starter `kernels.json` template with `Initialize Kernel Config` command

#### CI/CD
- GitHub Actions workflow with lint, type-check, build on 3-OS matrix (Ubuntu, Windows, macOS)
- VSIX artifact upload
