# WeGen2 使用说明

[返回 README](../README.md) · [项目页](https://zhuangshaobin.github.io/WeGen2/) · [模型仓库](https://huggingface.co/GrayShine/WeGen2)

WeGen2 支持文生图、单图编辑、多图参考和多轮编辑。当前为私有预览，模型下载需要仓库访问权限。

## 环境与安装

Python 3.10 或更高版本。先安装适配设备的 PyTorch，再在仓库根目录运行：

```bash
pip install -e .
```

**H20 部署估算：** 两张 NVIDIA H20（每张 96 GB）。按默认层分配，BF16 权重预计分别占用 **57.9 / 56.6 GiB**，运行时缓存、上下文和中间结果另需显存。这是基于权重文件的估算；尚未实测 H20 峰值显存与推理速度。

权重可用后，下载至本地目录：

```bash
pip install -U huggingface_hub
hf auth login
hf download GrayShine/WeGen2 --local-dir ./weights/WeGen2
```

## 生成图片

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 generate \
  --prompt "一座位于海底的歌剧院，精致的珊瑚建筑，电影感光线" \
  --size 1024 1024 --seed 42 --output ./outputs/opera.png
```

`--size` 的顺序是宽、高，均须为 32 的倍数。请根据设备显存选择足够多的卡。

## 编辑与多图参考

在生成命令中加入 `--image ./input.png` 即可编辑。多个 `--image` 按顺序提供多张参考图，提示词也应按该顺序描述图像。

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 generate \
  --image ./person.png --image ./outfit.png \
  --prompt "让第一张图的人物穿上第二张图的服装，保留人物身份和场景。" \
  --size 768 1024 --output ./outputs/result.png
```

参考图按比例缩放，并适配图像块对齐和像素预算，不会被直接拉伸为正方形。

## 多轮编辑

```bash
wegen2 --model ./weights/WeGen2 --devices cuda:0,cuda:1 sequence \
  --request ./examples/story.json --output ./outputs/story
```

上一轮生成图会自动成为下一轮的上下文。JSON 中额外的 `images` 路径相对于该 JSON 文件所在目录解析。请使用新的输出目录，避免覆盖已有结果。

## 常用参数

| 参数               | 含义                                         |
| ------------------ | -------------------------------------------- |
| `--seed`           | 随机种子；固定运行环境下便于复现             |
| `--steps`          | 采样时间点数；默认 50，对应 49 次 Euler 更新 |
| `--text-guidance`  | 文本引导强度；默认 4.0                       |
| `--image-guidance` | 图像引导强度；默认 1.0                       |
| `--devices`        | 指定设备列表；`auto` 自动选择可见 CUDA 设备  |

Python 调用及会话示例见 [推理指南](inference.md#python-api)。文字问答接口目前属于实验功能，当前图像 checkpoint 可能输出重复标点，不能视为已验证的问答能力。
