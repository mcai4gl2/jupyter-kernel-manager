# Jupyter Kernel Manager

Manage isolated Python virtual environments and Jupyter kernels for any project, directly from VS Code.

Define your kernels in a simple `kernels.json` file, and the extension handles venv creation, dependency installation, and Jupyter kernelspec registration — with full cross-platform support.

## Features

- **Declarative kernel config** — Define kernels in `kernels.json` with JSON schema IntelliSense and validation
- **Isolated virtual environments** — Each kernel gets its own `.venv` with pinned dependencies
- **Smart change detection** — MD5 hash tracking skips unchanged kernels on rebuild
- **Jupyter kernelspec registration** — Kernels appear in the VS Code / Jupyter notebook kernel picker
- **Kernel variants** — Support for CPU/GPU or other variant-based requirements (e.g., `requirements-cpu.txt`)
- **PyPI mirror auto-detection** — Selects the fastest mirror based on your geographic location
- **Cross-platform** — Full support for Windows (including Windows Store Python sandbox), macOS, and Linux
- **Sidebar tree view** — Visual kernel status with setup/register/health indicators
- **Diagnostics** — Health checks for Python environment, venv status, and registered kernelspecs
- **Notebook migration** — Batch-update kernel metadata across all notebooks in a workspace
- **Integrated terminal** — Open a shell with the kernel's venv pre-activated
- **Dynamic tasks** — VS Code tasks generated from your kernel config
- **Status bar** — Shows active kernel for the current notebook
- **Add New Kernel wizard** — Guided creation of new kernel definitions

## Quick Start

1. Open your project in VS Code
2. Run **"Jupyter Kernel Manager: Initialize Kernel Config"** from the Command Palette (`Ctrl+Shift+P`)
3. Edit the generated `kernels.json` to define your kernels
4. Add `requirements.txt` files in each `kernels/<name>/` directory
5. Run **"Jupyter Kernel Manager: Setup All Kernels"**
6. Open a notebook and select your kernel from the kernel picker

Or use the **Getting Started** walkthrough: `Ctrl+Shift+P` > "Get Started: Jupyter Kernel Manager"

## Configuration

### kernels.json

The `kernels.json` file in your workspace root defines all managed kernels:

```jsonc
{
  "kernels": {
    "data_science": {
      "display_name": "Python (Data Science)",
      "description": "pandas, numpy, matplotlib, seaborn",
      "requirements_file": "requirements.txt"
    },
    "pytorch": {
      "display_name": "Python (PyTorch)",
      "description": "Deep learning with PyTorch",
      "python_version": "3.10",
      "env": {
        "CUDA_VISIBLE_DEVICES": "0"
      },
      "variants": {
        "cpu": {
          "display_name": "Python (PyTorch - CPU)",
          "requirements_file": "requirements-cpu.txt"
        },
        "gpu": {
          "display_name": "Python (PyTorch - GPU)",
          "requirements_file": "requirements-gpu.txt"
        }
      }
    }
  }
}
```

### Kernel Definition Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `display_name` | string | Yes | Name shown in Jupyter kernel picker |
| `description` | string | No | Documentation / tooltip text |
| `requirements_file` | string | No | Path to requirements file (default: `requirements.txt`) |
| `python_version` | string | No | Minimum Python version (e.g., `"3.10"`) |
| `env` | object | No | Extra environment variables for the kernel |
| `variants` | object | No | Named variants with different requirements |

### Directory Structure

```
your-project/
├── kernels.json
├── kernels/
│   ├── data_science/
│   │   ├── requirements.txt
│   │   └── .venv/              ← created by extension
│   └── pytorch/
│       ├── requirements-cpu.txt
│       ├── requirements-gpu.txt
│       └── .venv/              ← created by extension
└── notebooks/
    └── analysis.ipynb
```

### Extension Settings

| Setting | Default | Description |
|---|---|---|
| `jupyterKernelManager.configPath` | `kernels.json` | Path to config file relative to workspace root |
| `jupyterKernelManager.kernelsDir` | `kernels` | Base directory for kernel venvs |
| `jupyterKernelManager.kernelPrefix` | `py-learn` | Prefix for Jupyter kernelspec names (e.g., `py-learn-data_science`) |
| `jupyterKernelManager.pypiMirror` | `auto` | PyPI mirror URL (`auto` for geo-detection, or explicit URL) |
| `jupyterKernelManager.pythonPath` | (empty) | Path to Python interpreter (empty for system default) |
| `jupyterKernelManager.autoRegister` | `true` | Auto-register kernels after setup |
| `jupyterKernelManager.autoSetupOnOpen` | `false` | Auto-setup kernels when workspace opens |
| `jupyterKernelManager.showNotifications` | `true` | Show notifications for kernel operations |

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P`) under the "Jupyter Kernel Manager" category:

| Command | Description |
|---|---|
| Initialize Kernel Config | Create a starter `kernels.json` file |
| Edit Kernel Config | Open `kernels.json` in the editor |
| Setup All Kernels | Create/update venvs for all kernels |
| Setup Kernel... | Set up a single kernel (with variant picker) |
| Force Recreate Kernel... | Delete and rebuild a kernel's venv |
| Register All Kernels | Register all kernels as Jupyter kernelspecs |
| Register Kernel... | Register a single kernel |
| Unregister Kernel... | Remove a kernel from the Jupyter kernel picker |
| Check Kernel Health | Run diagnostics and print a health report |
| Update Notebook Kernels | Batch-update kernel metadata in workspace notebooks |
| Update Notebook Kernels (Dry Run) | Preview notebook kernel changes without modifying files |
| Open Kernel Shell... | Open a terminal with the kernel's venv activated |
| Add New Kernel | Guided wizard to add a new kernel definition |
| Refresh | Reload the kernel tree view |

## Sidebar Tree View

The extension adds a **Jupyter Kernels** panel to the Activity Bar showing all defined kernels with status indicators:

- **Green check** — Ready (venv valid, requirements up to date)
- **Yellow warning** — Needs Update (requirements changed since last setup)
- **Gray circle** — Not Set Up (no venv created yet)
- **Red error** — Error (venv exists but is broken)

Right-click a kernel for context menu actions (setup, register, open shell).

## Troubleshooting

Run **"Check Kernel Health"** to get a full diagnostic report including:

- Python environment and version
- Jupyter data directory status
- Per-kernel venv, package, and registration status
- Recommendations for fixing common issues

### Common Issues

**Kernel not appearing in notebook picker:**
- Ensure the kernel is registered (green check + "Registered" in tree view)
- Restart VS Code after registration
- Check that the Jupyter extension is installed

**Setup fails on Windows:**
- Windows Store Python has restricted file I/O — the extension handles this automatically via robocopy
- If using a custom Python path, set it in `jupyterKernelManager.pythonPath`

**Slow package installation:**
- The extension auto-detects the fastest PyPI mirror for your location
- Override with a specific mirror in `jupyterKernelManager.pypiMirror`

## Requirements

- VS Code 1.85.0 or later
- Python 3.8+ installed and available on PATH
- [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) (for notebook support)

## License

MIT
