import { STOP_HOOK_MARKER } from '../hooks/stop-hook-constants.ts';

export function extractHookOutput(response: string): string | null {
  const markerIndex = response.lastIndexOf(STOP_HOOK_MARKER);
  if (markerIndex !== -1) {
    return response.slice(markerIndex + STOP_HOOK_MARKER.length).trimStart();
  }
  const pattern = /(^|\n)\[[^\]\r\n]+?\](?=\s|$)/g;
  let lastStart = -1;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(response)) !== null) {
    lastStart = match.index + (match[1] ?? '').length;
  }

  if (lastStart === -1) {
    return null;
  }
  return response.slice(lastStart).trimStart();
}
