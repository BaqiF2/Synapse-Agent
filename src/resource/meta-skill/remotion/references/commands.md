# Remotion Commands

## Development

```bash
npm run dev        # Start preview server
npm run preview    # Preview rendered frames
```

## Rendering

```bash
npm run build           # Render all compositions
npm run build -- --help # See rendering options

# Specific options
npm run build -- --composition=MyVideo --fps=30 --duration=10
npm run build -- --out=./output -- codec=mp4 --quality=100
```

## Still Frames

```bash
npm run still -- --composition=MyVideo
```

## Useful Flags

| Flag | Description |
|------|-------------|
| `--composition` | Select specific composition |
| `--codec` | Video codec (mp4, gif, webm) |
| `--quality` | Render quality (0-100) |
| `--fps` | Frames per second |
| `--width` | Video width |
| `--height` | Video height |
| `--out` | Output directory |

## Environment Variables

```bash
REMOTION_GPU_MODE=vulkan    # GPU acceleration
REMOTION_DISABLE_GPU=1      # Disable GPU
```
