export function shouldStartMapPan(input: {
  button: number;
  targetIsInteractive: boolean;
}): boolean {
  return input.button === 0 && !input.targetIsInteractive;
}
