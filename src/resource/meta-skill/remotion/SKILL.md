---
name: remotion
description: Create professional videos using Remotion (React-based video creation framework). Use when users want to: (1) Create videos programmatically with React, (2) Build animations or motion graphics, (3) Generate video from code/components, (4) Automate video production workflows.
---

# Remotion Video Creator

Create videos programmatically using React components with Remotion.

## Quick Start

### Initialize a new Remotion project

```bash
npx create-remotion@latest
# Or
npm init remotion
```

### Create a simple video

1. Edit `src/Root.tsx` with your video content
2. Run `npm run build` to render

## Project Structure

```
project/
├── src/
│   ├── Root.tsx          # Main video component
│   ├── Title.tsx         # Optional sub-components
│   └── assets/           # Images, fonts, audio
├── package.json
└── remotion.config.ts    # Configuration
```

## Core Concepts

### Composition

Remotion uses compositions to define videos:

```tsx
import { Composition } from 'remotion';

export const MyVideo = () => {
  return (
    <Composition
      id="my-video"
      component={VideoComponent}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
```

### Frames

- **1 second = 30 frames** (default fps)
- Duration in frames = seconds × fps

### Audio

Add audio to compositions:

```tsx
import { Audio } from 'remotion';

<AbsoluteFill>
  <Audio src="/music.mp3" />
</AbsoluteFill>
```

## Common Tasks

### Text and Typography

```tsx
import { Text } from 'remotion';

<Text
  fontSize={80}
  color="white"
  fontFamily="Arial"
>
  Hello World
</Text>
```

### Shapes and Colors

```tsx
import { Circle, Rect } from 'remotion';

<AbsoluteFill style={{ background: 'linear-gradient(to right, red, blue)' }}>
  <Circle radius={100} fill="white" />
</AbsoluteFill>
```

### Animations

Use `useVideoConfig` for frame-based animations:

```tsx
import { useVideoConfig, useCurrentFrame } from 'remotion';

const MyAnimatedComponent = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = frame / 100;
  
  return <div style={{ opacity }}>Fading in</div>;
};
```

### Images and Assets

```tsx
import { staticFile, Img } from 'remotion';

<Img 
  src={staticFile("logo.png")} 
  width={200} 
/>
```

## Rendering

### Build a video

```bash
npm run build
# Outputs to out/ folder
```

### Build with specific composition

```bash
npm run build -- --composition=my-video
```

### Still frame

```bash
npm run still -- --composition=my-video
```

## Configuration

Edit `remotion.config.ts`:

```tsx
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

## Best Practices

1. **Keep compositions simple** - Break complex videos into components
2. **Use constants** - Define colors, fonts as reusable constants
3. **Optimize assets** - Compress images, use appropriate formats
4. **Test locally** - Use `npm run preview` before rendering

## Useful Packages

- `@remotion/cli` - Command line tools
- `@remotion/player` - Video player component
- `@remotion/three` - 3D graphics with Three.js
- `@remotion/gif` - GIF support
- `remotion-utils` - Utility functions
