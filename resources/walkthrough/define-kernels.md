## Define Your Kernels

Each kernel gets its own isolated virtual environment. Define as many as you need:

```json
{
  "kernels": {
    "data_science": {
      "display_name": "Python (Data Science)",
      "description": "pandas, numpy, matplotlib",
      "requirements_file": "requirements.txt"
    },
    "ml_training": {
      "display_name": "Python (ML Training)",
      "description": "PyTorch with GPU support",
      "variants": {
        "cpu": { "requirements_file": "requirements-cpu.txt" },
        "gpu": { "requirements_file": "requirements-gpu.txt" }
      }
    }
  }
}
```

Place a `requirements.txt` in each kernel's directory under `kernels/<name>/`.

The JSON schema provides IntelliSense and validation as you edit.
