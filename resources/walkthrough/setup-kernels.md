## Set Up Virtual Environments

Run **"Setup All Kernels"** to create isolated venvs and install packages:

1. A `.venv` directory is created inside each `kernels/<name>/` folder
2. pip is upgraded, then requirements are installed
3. A hash of your requirements file is stored for change detection

On subsequent runs, kernels with unchanged requirements are **skipped automatically** — only modified kernels are rebuilt.

You can also set up individual kernels from the sidebar tree view (right-click a kernel).

PyPI mirror detection works automatically based on your geographic location for faster downloads.
