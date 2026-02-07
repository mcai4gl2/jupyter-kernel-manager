## Create kernels.json

The `kernels.json` file is the heart of your kernel configuration. It defines which Python environments to create and manage.

Run **"Initialize Kernel Config"** from the Command Palette to create a starter file, or create one manually in your workspace root:

```json
{
  "kernels": {
    "default": {
      "display_name": "Python (Default)",
      "description": "Default kernel with common packages"
    }
  }
}
```

The extension activates automatically when `kernels.json` is present in your workspace.
