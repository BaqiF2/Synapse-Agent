import type { PlatformAdapter } from './platform-adapter.ts';
import { LinuxAdapter } from './linux-adapter.ts';
import { MacOSAdapter } from './macos-adapter.ts';

export function getPlatformAdapter(platform: NodeJS.Platform = process.platform): PlatformAdapter {
  switch (platform) {
    case 'darwin':
      return new MacOSAdapter();
    case 'linux':
      return new LinuxAdapter();
    default:
      throw new Error(`Sandbox not supported on platform: ${platform}`);
  }
}
