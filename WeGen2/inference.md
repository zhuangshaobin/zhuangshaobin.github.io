# WeGen2 inference guide

[English overview](../README.md) · [中文使用说明](usage.zh-CN.md)

## Quick start

### 1. Install

Use Python 3.10 or newer. Install PyTorch for your accelerator environment first, then:

```bash
git clone git@github.com:zhuangshaobin/WeGen2.git
cd WeGen2
pip install -e .
```

**H20 planning estimate:** 2 × NVIDIA H20 (96 GB). BF16 weights alone occupy approximately **57.9 / 56.6 GiB** across the two GPUs with the default layer split. Runtime buffers and context require additional memory. These are checkpoint-based estimates; H20 peak memory and latency have not been measured.

### 2. Download the checkpoint

The model repository is private during release preparation. An authorized Hugging Face account is required. Once weights are available:

```bash
pip install -U huggingface_hub
hf auth login
hf download GrayShine/WeGen2 --local-dir ./weights/WeGen2
```

The model directory contains `config.json`, `tokenizer.json`, and indexed `.safetensors` shards. The loader reads local files without executing checkpoint-supplied Python.

### 3. Generate an image

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 generate \
  --prompt "A luminous underwater opera house, elaborate coral architecture, cinematic lighting" \
  --size 1024 1024 --seed 42 --output ./outputs/opera.png
```

## Image editing

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 generate \
  --image ./input.png \
  --prompt "Change the red mug to cobalt blue. Preserve the table, napkin, lighting, and composition." \
  --size 512 512 --seed 42 --output ./outputs/edit.png
```

Reference images keep their aspect ratio, subject to patch alignment and the reference pixel budget. Output sizes are `WIDTH HEIGHT`; both dimensions must be multiples of 32.

## Multiple references

Supply references in the order used by your instruction:

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 generate \
  --image ./subject.png --image ./setting.png \
  --prompt "Place the subject from the first image in the setting of the second image." \
  --size 1024 768 --output ./outputs/composition.png
```

The model accepts more than two references. Reference count and image size increase memory use and context length.

## Multi-turn creation

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 sequence \
  --request ./examples/story.json --output ./outputs/story
```

A JSON request lists ordered turns. Each generated image becomes context for the next turn; no manual image path is needed between turns. Additional `images` paths are resolved relative to the request file. The output directory must be new. Each turn produces an image and an entry in `results.json`.

```json
[
  { "prompt": "A small fox beside a lighthouse at sunset.", "size": [1024, 768] },
  { "prompt": "Add a red sailboat at the dock. Preserve the fox and lighthouse.", "size": [1024, 768] }
]
```

## Python API

```python
from wegen2 import SamplingConfig, WeGen2Pipeline

pipe = WeGen2Pipeline.from_pretrained("./weights/WeGen2", devices="cuda:0,cuda:1")

image = pipe.generate(
    "A cinematic underwater opera house, intricate coral architecture.",
    size=(1024, 1024),
    sampling=SamplingConfig(seed=42),
)
image.save("opera.png")

session = pipe.session()
first = session.generate("A glossy blue mug beside a white napkin on an oak table.")
second = session.generate("Add a lemon to the right of the mug. Preserve the scene.")
third = session.generate("Place a silver spoon on the napkin. Keep the mug and lemon.")
third.save("third-turn.png")
session.reset()
```

For a single edit, pass `images=["input.png"]` to `pipe.generate(...)`. For multiple references, pass an ordered list. If omitted, sampling uses text guidance 4.0 and 50 schedule points (49 Euler updates); reference-conditioned requests select the corresponding guidance rescaling automatically. A fixed seed supports reproducibility within the same runtime and device configuration.
