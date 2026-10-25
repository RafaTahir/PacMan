"""Real Chromium interaction/layout checks against a running Vite development server.

Run: python tests/browser_smoke.py [http://127.0.0.1:5173]
Requires Python Playwright and Chromium (CHROMIUM_PATH overrides /usr/bin/chromium).
Writes ignored screenshots and a machine-readable report under test-results/.
Rare transitions use the development inspection surface as explicit fixtures;
ordinary controls and movement are exercised through browser input.
"""
import json
import os
from pathlib import Path
import platform
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
report = {"checks": [], "errors": [], "layouts": [], "performance": {},
          "environment": {"platform": platform.platform(), "url": URL,
                          "headless": True, "hardware_mobile": False}}


def check(name, fn):
    try:
        detail = fn()
        report["checks"].append({"name": name, "passed": True, "detail": detail})
        print("PASS", name, flush=True)
    except Exception as exc:
        report["checks"].append({"name": name, "passed": False, "error": str(exc)})
        print("FAIL", name, str(exc), flush=True)
        # Avoid a failed check leaving a modal/visibility fixture for later checks.
        if "page" in globals() and not page.is_closed():
            page.keyboard.press("Escape") if page.locator("dialog[open]").count() else None
            page.evaluate("delete document.hidden")


def require(condition, message):
    assert condition, message


def state(page):
    return page.evaluate("""() => { const s = window.__PACMAN__.game.state;
        return {phase:s.phase, paused:s.paused, score:s.score, time:s.time,
                x:s.pacman.x, y:s.pacman.y, dir:s.pacman.nextDir,
                level:s.level, remaining:s.remaining, lives:s.lives}; }""")


def wait_for_resume(page):
    # Playing resumes through the visible, cancellable safety countdown.
    page.wait_for_function("!window.__PACMAN__.game.state.paused && !window.__PACMAN__.resumeCountdown.active", timeout=8000)


def attach_errors(page):
    page.on("pageerror", lambda e: report["errors"].append({"type": "pageerror", "message": str(e)}))
    page.on("console", lambda e: report["errors"].append({"type": "console", "message": e.text}) if e.type == "error" else None)


def layout(page, name, width, height):
    data = page.evaluate("""() => ({width:innerWidth,height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
      canvas:document.querySelector('#game-canvas').getBoundingClientRect().toJSON(),
      controls:[...document.querySelectorAll('.game-toolbar button, [data-direction]')]
        .filter(x=>x.getBoundingClientRect().width).map(x=>({id:x.id||x.dataset.direction,...x.getBoundingClientRect().toJSON()}))})""")
    data["name"] = name
    report["layouts"].append(data)
    require(data["scrollWidth"] <= width, f"Horizontal overflow: {data}")
    board = data["canvas"]
    require(board["left"] >= 0 and board["right"] <= width + 1 and board["top"] >= 0 and board["bottom"] <= height + 1,
            f"Board outside viewport: {board}")
    require(abs(board["width"] / board["height"] - 28 / 31) < .005, "Board aspect ratio distorted")
    if width < 500:
        require(data["scrollHeight"] <= height + 1, f"Portrait requires scrolling: {data['scrollHeight']}")
        require(all(c["bottom"] <= height + 1 for c in data["controls"]), "Touch controls below viewport")
    return data


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
    report["environment"]["browser"] = browser.version
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.set_default_timeout(5000)
    attach_errors(page)
    page.goto(URL)
    page.wait_for_function("window.__PACMAN__ !== undefined")
    page.screenshot(path=str(OUT / "desktop-title.png"))
    check("desktop 1440x1000 layout", lambda: layout(page, "desktop-title", 1440, 1000))

    def movement():
        page.locator("#start-button").click()
        page.wait_for_function("window.__PACMAN__.game.state.phase === 'playing'")
        before = state(page)
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(750)
        after = state(page)
        require(after["score"] > before["score"] and after["x"] != before["x"], f"No scoring movement: {before}, {after}")
        page.keyboard.press("d")
        require(state(page)["dir"] == "right", "WASD input did not queue direction")
        page.screenshot(path=str(OUT / "desktop-playing.png"))
        return {"before": before, "after": after}
    check("start and scoring keyboard movement", movement)

    def pause():
        page.keyboard.press("p")
        require(state(page)["paused"], "P did not pause")
        before = state(page)
        page.keyboard.press("ArrowUp")
        page.wait_for_timeout(350)
        require(state(page) == before, "Simulation or queued input changed while paused")
        page.screenshot(path=str(OUT / "desktop-paused.png"))
        page.locator("#resume-button").click()
        wait_for_resume(page)
        page.wait_for_timeout(100)
        require(not state(page)["paused"] and state(page)["time"] > before["time"], "Resume did not resume simulation")
    check("pause freeze and resume", pause)

    def restart():
        before = state(page)
        best = page.locator("#high-score").inner_text()
        page.locator("#restart-button").click()
        require(page.locator("#restart-dialog").is_visible() and state(page)["paused"], "Restart confirmation must pause")
        page.keyboard.press("Escape")
        wait_for_resume(page)
        require(not page.locator("#restart-dialog").is_visible() and not state(page)["paused"], "Escape did not cancel restart")
        require(state(page)["score"] >= before["score"], "Cancel reset score")
        page.locator("#restart-button").click()
        page.locator("#confirm-restart").click()
        require(state(page)["score"] == 0 and state(page)["lives"] == 3, "Confirmed restart did not reset run")
        require(int(page.locator("#high-score").inner_text()) >= int(best), "Restart lost personal best")
        return {"preserved_best": page.locator("#high-score").inner_text()}
    check("restart confirmation cancel and best preservation", restart)

    def help_keyboard():
        page.locator("#help-button").click()
        require(state(page)["paused"], "Help did not pause")
        require(page.evaluate("document.querySelector('#help-dialog').contains(document.activeElement)"), "Help did not receive focus")
        for _ in range(12):
            page.keyboard.press("Tab")
            require(page.evaluate("document.activeElement === document.body || document.querySelector('#help-dialog').contains(document.activeElement)"), "Tab reached underlying app controls")
        # Chromium's native dialog permits browser chrome in its tab cycle (BODY).
        page.keyboard.press("Tab")
        require(page.evaluate("document.querySelector('#help-dialog').contains(document.activeElement)"), "Tab did not cycle back into dialog")
        page.keyboard.press("Escape")
        wait_for_resume(page)
        require(not page.locator("#help-dialog").is_visible() and not state(page)["paused"], "Help Escape did not restore game")
        require(page.evaluate("document.activeElement.id") in ("help-button", "pause-button"), "Help/countdown did not restore a usable focus target")
        page.keyboard.press("p")
        page.locator("#help-button").click()
        page.locator("#help-done").click()
        require(state(page)["paused"], "Help resumed an already-paused game")
        page.locator("#resume-button").click()
        wait_for_resume(page)
    check("help focus containment Escape and pause restoration", help_keyboard)

    def preferences():
        page.locator("#sound-button").click()
        require(page.locator("#sound-button").get_attribute("aria-pressed") == "false", "Mute state not exposed")
        page.locator("#help-button").click()
        page.locator("#dialog-motion-toggle").check()
        page.locator("#help-done").click()
        best = page.locator("#high-score").inner_text()
        page.reload()
        page.wait_for_function("window.__PACMAN__ !== undefined")
        require(page.locator("#sound-button").get_attribute("aria-pressed") == "false", "Mute not persisted")
        require(page.locator("#motion-toggle").is_checked() and page.locator("body").evaluate("x=>x.classList.contains('reduced-motion')"), "Reduced motion not persisted")
        require(page.locator("#high-score").inner_text() == best, "Best not persisted on reload")
        page.locator("#help-button").click()
        page.locator("#dialog-motion-toggle").uncheck()
        page.locator("#help-done").click()
        page.locator("#start-button").click()
    check("mute reduced motion and best survive reload", preferences)

    def background():
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        require(state(page)["paused"], "Window blur did not pause")
        page.locator("#resume-button").click()
        wait_for_resume(page)
        page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'))")
        before = state(page)
        page.wait_for_timeout(150)
        require(state(page)["paused"] and state(page) == before, "Visibility event did not freeze game")
        page.evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))")
        require(state(page)["paused"], "Returning to foreground resumed without consent")
        page.locator("#resume-button").click()
        wait_for_resume(page)
        return "Synthetic blur/visibility events; hidden document property fixture"
    check("background blur and visibility pause", background)

    def two_player():
        page.evaluate("window.__PACMAN__.setPlayerCount(2); window.__PACMAN__.startGame()")
        page.wait_for_function("window.__PACMAN__.game.state.phase === 'playing'")
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(500)
        original = page.evaluate("({score:window.__PACMAN__.game.state.score, pellets:[...window.__PACMAN__.game.state.pellets].sort()})")
        require(original["score"] > 0, "P1 did not earn score")
        page.evaluate("Object.assign(window.__PACMAN__.game.state, {phase:'dying',phaseTime:1.99,lives:2})")
        page.wait_for_function("window.__PACMAN__.activePlayer === 1")
        require(state(page)["score"] == 0 and state(page)["remaining"] == 244, "P2 did not get independent board")
        require(page.locator("#p2-cell").is_visible(), "P2 score missing")
        page.evaluate("Object.assign(window.__PACMAN__.game.state, {phase:'dying',phaseTime:1.99,lives:2})")
        page.wait_for_function("window.__PACMAN__.activePlayer === 0")
        restored = page.evaluate("({score:window.__PACMAN__.game.state.score, pellets:[...window.__PACMAN__.game.state.pellets].sort()})")
        require(restored == original, "P1 score or board lost on turn switch")
        return {"preserved_p1_score": original["score"], "fixture": "Death animation completion"}
    check("two-player death switch preserves each board", two_player)

    def game_over():
        page.evaluate("window.__PACMAN__.setPlayerCount(1); window.__PACMAN__.startGame(); Object.assign(window.__PACMAN__.game.state, {phase:'dying',phaseTime:1.99,lives:0})")
        page.wait_for_selector("#gameover-overlay", state="visible")
        require(page.locator("#pause-button").is_disabled(), "Pause should be disabled after game over")
        page.wait_for_function("document.activeElement.id === 'again-button'")
        page.keyboard.press("Enter")
        require(state(page)["phase"] == "ready" and state(page)["lives"] == 3, "Game over play again failed")
        return "Last-life death completion fixture"
    check("game over focus and play again", game_over)

    def level_clear():
        page.evaluate("Object.assign(window.__PACMAN__.game.state, {phase:'level-clear',phaseTime:1.39,level:2})")
        page.wait_for_function("window.__PACMAN__.intermission !== null")
        page.screenshot(path=str(OUT / "intermission.png"))
        page.keyboard.press("p")
        before = page.evaluate("window.__PACMAN__.intermission.elapsed")
        page.wait_for_timeout(150)
        require(page.evaluate("window.__PACMAN__.intermission.elapsed") == before, "Intermission not paused")
        page.locator("#resume-button").click()
        page.evaluate("window.__PACMAN__.intermission.elapsed = 5.99")
        page.wait_for_function("window.__PACMAN__.intermission === null")
        page.wait_for_function("window.__PACMAN__.game.state.level === 3")
        require(state(page)["remaining"] == 244 and state(page)["lives"] == 3, "Next level failed to refill board/preserve lives")
        return "Level-clear fixture and accelerated end of six-second intermission"
    check("level clear intermission pause and next level", level_clear)

    def performance(target=page, name="desktop"):
        target.evaluate("window.__PACMAN__.startGame()")
        target.wait_for_function("window.__PACMAN__.game.state.phase === 'playing'")
        result = target.evaluate("""async () => {
          const renderer = window.__PACMAN__.renderer;
          const original = renderer.render; const costs = [], intervals = [];
          renderer.render = function(...args) { const start=performance.now();
            const result=original.apply(this,args); costs.push(performance.now()-start); return result; };
          let previous=0;
          await new Promise(resolve=>{function frame(t){if(previous)intervals.push(t-previous);previous=t;
            if(intervals.length<120)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame)});
          renderer.render=original;
          const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
          return {frames:intervals.length,meanFrameMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,
            p95FrameMs:percentile(intervals,.95),framesOver34ms:intervals.filter(x=>x>34).length,
            renderCalls:costs.length,meanRenderMs:costs.reduce((a,b)=>a+b,0)/costs.length,
            p95RenderMs:percentile(costs,.95),devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,
            canvasPixels:[document.querySelector('#game-canvas').width,document.querySelector('#game-canvas').height]};
        }""")
        require(result["renderCalls"] > 0, "Renderer instrumentation recorded no calls")
        report["performance"][name] = result
        return result
    check("desktop frame pacing and renderer workload sample", performance)
    page.set_viewport_size({"width": 1280, "height": 800})
    page.wait_for_timeout(150)
    check("desktop 1280x800 layout", lambda: layout(page, "desktop-small-playing", 1280, 800))
    page.screenshot(path=str(OUT / "desktop-small-playing.png"))
    context.close()

    for width, height in [(390, 844), (375, 667), (844, 390)]:
        mobile_context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mobile = mobile_context.new_page()
        mobile.set_default_timeout(5000)
        attach_errors(mobile)
        mobile.goto(URL)
        mobile.wait_for_function("window.__PACMAN__ !== undefined")
        mobile.locator("#start-button").tap()
        mobile.wait_for_function("window.__PACMAN__.game.state.phase === 'playing'")
        check(f"touch layout {width}x{height}", lambda: layout(mobile, f"touch-{width}x{height}", width, height))

        def touch():
            for direction in ["up", "right", "down", "left"]:
                mobile.locator(f'[data-direction="{direction}"]').tap()
                require(state(mobile)["dir"] == direction, f"D-pad {direction} failed")
            mobile.wait_for_timeout(300)
            require(state(mobile)["score"] > 0, "Touch game did not score")
            require(mobile.locator(".held").count() == 0, "D-pad stuck after tap")
            rect = mobile.locator("#game-canvas").bounding_box()
            x, y = rect["x"] + rect["width"] / 2, rect["y"] + rect["height"] / 2
            cdp = mobile_context.new_cdp_session(mobile)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + 45, "y": y}]})
            require(state(mobile)["dir"] == "right", "Swipe right failed")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []})
            mobile.locator('[data-direction="up"]').tap()
            require(state(mobile)["dir"] == "up", "Direction failed after swipe cancellation")
            pad = mobile.locator('[data-direction="left"]').bounding_box()
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": pad["x"]+pad["width"]/2, "y": pad["y"]+pad["height"]/2}]})
            require(mobile.locator(".held").count() == 1, "D-pad press feedback missing")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []})
            require(mobile.locator(".held").count() == 0, "D-pad stuck after pointer cancel")
            cdp.detach()
        check(f"touch D-pad swipe cancel {width}x{height}", touch)
        mobile.screenshot(path=str(OUT / f"touch-{width}x{height}-playing.png"))
        if width == 375:
            check("touch viewport frame pacing and renderer workload sample", lambda: performance(mobile, "touch-375x667-dpr2"))
        def mobile_help():
            mobile.locator("#help-button").tap()
            require(mobile.locator("#help-dialog").is_visible(), "Help dialog unavailable")
            mobile.screenshot(path=str(OUT / f"touch-{width}x{height}-help.png"))
        check(f"mobile help {width}x{height}", mobile_help)
        mobile_context.close()
    browser.close()

check("no browser console or page errors", lambda: require(not report["errors"], str(report["errors"])))
report["summary"] = {"passed": sum(c["passed"] for c in report["checks"]), "failed": sum(not c["passed"] for c in report["checks"])}
(OUT / "browser-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report["summary"]), flush=True)
sys.exit(1 if report["summary"]["failed"] else 0)
