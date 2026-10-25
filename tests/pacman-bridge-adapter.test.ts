import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PacmanAdapter } from "../src/arcade/pacman-adapter";
import { issueRun, type RankedRun } from "../src/arcade/api";
import { PACMAN_BRIDGE } from "../src/pacman-host";

vi.mock("../src/arcade/api", () => ({ issueRun: vi.fn() }));

class FakeFrame extends EventTarget {
  id = ""; src = ""; title = ""; allow = ""; allowFullscreen = false;
  style = { cssText: "" };
  contentWindow = { postMessage: vi.fn() };
  focus = vi.fn(); remove = vi.fn();
}

const challenge = (runId: string, seed: number): RankedRun => ({ runId, seed, game: "pacman", maxTicks: 7272, tickRate: 60.60606060606061, ruleset: "after-hours-v1", expiresAt: "2026-10-25T00:00:00Z" });

describe("Pac-Man iframe host boundary", () => {
  let frame: FakeFrame;
  let fakeWindow: EventTarget;
  let callbacks: { overlay: ReturnType<typeof vi.fn>; hud: ReturnType<typeof vi.fn>; result: ReturnType<typeof vi.fn>; notice: ReturnType<typeof vi.fn>; isModalOpen: () => boolean; fullscreen: ReturnType<typeof vi.fn> };
  let adapter: PacmanAdapter;
  let mount: { append: ReturnType<typeof vi.fn> };

  function send(type: string, extra: Record<string, unknown> = {}, origin = "https://arcade.test", source: unknown = frame.contentWindow) {
    const event = new Event("message");
    Object.assign(event, { origin, source, data: { channel: PACMAN_BRIDGE, type, ...extra } });
    fakeWindow.dispatchEvent(event);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(issueRun).mockReset();
    frame = new FakeFrame();
    fakeWindow = new EventTarget();
    Object.assign(fakeWindow, { location: { origin: "https://arcade.test" }, setTimeout });
    const fakeDocument = new EventTarget();
    Object.assign(fakeDocument, { createElement: () => frame, hidden: false, activeElement: frame, hasFocus: () => true });
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);
    callbacks = { overlay: vi.fn(), hud: vi.fn(), result: vi.fn(), notice: vi.fn(), isModalOpen: () => false, fullscreen: vi.fn() };
    mount = { append: vi.fn() };
    adapter = new PacmanAdapter(mount as unknown as HTMLElement, callbacks);
  });

  afterEach(() => {
    adapter.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("appends its iframe and only accepts a handshake from that same-origin window", () => {
    expect(mount.append).toHaveBeenCalledWith(frame);
    expect(frame.id).toBe("pacman-frame");
    expect(frame.src).toBe("/pacman.html?arcade=1");
    expect(frame.allowFullscreen).toBe(true);
    send("ready", {}, "https://other.test");
    send("ready", {}, "https://arcade.test", {});
    expect(adapter.phase).toBe("loading");
    send("ready");
    expect(adapter.phase).toBe("intro");
    expect(callbacks.overlay).toHaveBeenLastCalledWith("intro", "PAC-MAN", expect.any(String));
  });

  it("uses the server-issued identity, ignores stale/duplicate results and issues a new restart challenge", async () => {
    const first = challenge("server-one", 11);
    const second = challenge("server-two", 22);
    vi.mocked(issueRun).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    send("ready");
    await adapter.start("ranked");
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "start", seed: 11, session: 1 }), "https://arcade.test");
    const result = { score: 120, frames: 10, inputs: [[0, -127, 0, 0, 0, 0]], victory: false, runId: "untrusted" };
    send("finished", { session: 1, result });
    send("finished", { session: 1, result });
    expect(callbacks.result).toHaveBeenCalledTimes(1);
    expect(callbacks.result.mock.calls[0][0].run).toBe(first);
    await adapter.restart();
    expect(issueRun).toHaveBeenCalledTimes(2);
    send("finished", { session: 1, result });
    expect(callbacks.result).toHaveBeenCalledTimes(1);
    send("finished", { session: 2, result });
    expect(callbacks.result).toHaveBeenCalledTimes(2);
    expect(callbacks.result.mock.calls[1][0].run).toBe(second);
  });

  it("reports real pause/countdown states while the original child owns its overlays", async () => {
    send("ready");
    await adapter.start("practice");
    const hud = { score: 0, level: 1, lives: 3, remaining: 244, frames: 0, paused: true, phase: "playing" };
    send("status", { session: 1, phase: "paused", hud });
    expect(adapter.paused).toBe(true);
    expect(callbacks.overlay).toHaveBeenLastCalledWith("paused", "PAC-MAN", "", undefined);
    send("status", { session: 1, phase: "countdown", hud, countdown: 3 });
    expect(callbacks.overlay).toHaveBeenLastCalledWith("countdown", "PAC-MAN", "", 3);
    send("fullscreen", { session: 1 });
    expect(callbacks.fullscreen).toHaveBeenCalledTimes(1);
  });

  it("settles pending handshake work and removes listeners on disposal", async () => {
    const pending = adapter.start("ranked");
    adapter.dispose();
    await pending;
    send("ready");
    vi.advanceTimersByTime(20_000);
    expect(issueRun).not.toHaveBeenCalled();
    expect(frame.remove).toHaveBeenCalledTimes(1);
    expect(callbacks.notice).not.toHaveBeenCalled();
    expect(adapter.phase).toBe("disposed");
  });

  it("ignores an issued run that completes after the iframe was disposed", async () => {
    let resolve: (run: RankedRun) => void = () => {};
    vi.mocked(issueRun).mockReturnValue(new Promise<RankedRun>(done => { resolve = done; }));
    send("ready");
    const pending = adapter.start("ranked");
    await Promise.resolve();
    adapter.dispose();
    resolve(challenge("late", 7));
    await pending;
    expect(frame.contentWindow.postMessage.mock.calls.some(([message]) => message.type === "start")).toBe(false);
    expect(callbacks.result).not.toHaveBeenCalled();
  });

  it("holds a fresh ranked game paused when preparation was interrupted", async () => {
    let resolve: (run: RankedRun) => void = () => {};
    vi.mocked(issueRun).mockReturnValue(new Promise<RankedRun>(done => { resolve = done; }));
    send("ready");
    const pending = adapter.start("ranked");
    await Promise.resolve();
    adapter.pause();
    resolve(challenge("interrupted", 123));
    await pending;
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "start", paused: true }), "https://arcade.test");
    expect(adapter.phase).toBe("paused");
    expect(frame.focus).not.toHaveBeenCalled();
  });

  it("bounds the handshake timeout and cannot leave a later start pending forever", async () => {
    vi.advanceTimersByTime(10_001);
    expect(adapter.phase).toBe("unavailable");
    expect(callbacks.notice).toHaveBeenCalledTimes(1);
    await adapter.start("ranked");
    expect(issueRun).not.toHaveBeenCalled();
  });
});
