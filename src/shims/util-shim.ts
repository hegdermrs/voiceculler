// Minimal browser shim for Node's "util", used only so the
// @tensorflow-models/speech-commands bundle (which imports `promisify`)
// resolves in the browser. Only the pieces actually referenced are provided.

export function promisify<T = unknown>(
  fn: (...args: unknown[]) => void,
): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      fn(...args, (err: unknown, result: T) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
}

export function inherits(ctor: { prototype: object; super_?: unknown }, superCtor: { prototype: object }) {
  ctor.super_ = superCtor;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

export function inspect(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default { promisify, inherits, inspect };
