/** Probe the API needed by the nine Three.js cabinets, independently of
 * Pac-Man's WebGL1 renderer. Release the disposable probe immediately. */
export function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch { return false; }
}
