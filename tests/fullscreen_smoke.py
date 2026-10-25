"""Chromium regression checks for fullscreen, large view, and responsive gameplay.

Run: python tests/fullscreen_smoke.py [http://127.0.0.1:5173]
Requires Python Playwright and Chromium; CHROMIUM_PATH can override the executable.
Screenshots and the JSON report use the ignored test-results/fullscreen-* paths.
Fullscreen failures are deliberately injected in isolated browser contexts. Actual
entry/exit uses trusted button and keyboard events against Chromium's native API.
"""
import json
import os
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
report = {"checks": [], "errors": [], "layouts": [], "environment": {"url": URL, "headless": True}}


def require(condition, message):
    assert condition, message


def check(name, run):
    try:
        detail = run()
        report["checks"].append({"name": name, "passed": True, "detail": detail})
        print("PASS", name, flush=True)
    except Exception as error:
        report["checks"].append({"name": name, "passed": False, "error": str(error)})
        print("FAIL", name, str(error), flush=True)


def listen(page, name):
    page.on("pageerror", lambda error: report["errors"].append({"context": name, "type": "pageerror", "message": str(error)}))
    page.on("console", lambda event: report["errors"].append({"context": name, "type": "console", "message": event.text}) if event.type == "error" else None)
    page.set_default_timeout(5000)


def load(page):
    page.goto(URL)
    page.wait_for_function("window.__PACMAN__ !== undefined")
    page.wait_for_selector("#fullscreen-button")
    page.wait_for_timeout(120)


def theater(page):
    return page.locator("body").evaluate("body => body.classList.contains('theater-view')")


def set_theater(page, enabled):
    if theater(page) != enabled:
        page.locator("#view-button").click()
    page.wait_for_function("desired => document.body.classList.contains('theater-view') === desired", arg=enabled)
    page.wait_for_timeout(100)


def snapshot(page):
    return page.evaluate("""() => {
      const s = window.__PACMAN__.game.state;
      return {phase:s.phase, paused:s.paused, score:s.score, remaining:s.remaining,
        lives:s.lives, level:s.level, time:s.time, pellets:[...s.pellets].sort(),
        pacman:{...s.pacman}, activePlayer:window.__PACMAN__.activePlayer};
    }""")


def fixture(page):
    page.locator("#start-button").click()
    page.wait_for_function("window.__PACMAN__.game.state.phase === 'playing'")
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(250)
    page.keyboard.press("p")
    require(page.evaluate("window.__PACMAN__.game.state.paused"), "Fixture did not pause")
    page.evaluate("""() => { window.__VIEW_FIXTURE__ = {
      game:window.__PACMAN__.game, state:window.__PACMAN__.game.state,
      games:window.__PACMAN__.games, renderer:window.__PACMAN__.renderer,
      canvas:document.querySelector('#game-canvas')}; }""")
    return snapshot(page)


def preserved(page, before):
    require(page.evaluate("""() => { const a=window.__VIEW_FIXTURE__, b=window.__PACMAN__;
      return a.game === b.game && a.state === b.game.state && a.games === b.games &&
        a.renderer === b.renderer && a.canvas === document.querySelector('#game-canvas'); }"""),
            "View transition replaced the live game, renderer, state, or canvas")
    require(snapshot(page) == before, "Paused score/pellets/lives/time/position changed during view transition")


def layout(page, name):
    result = page.evaluate("""() => {
      const rect = element => element.getBoundingClientRect().toJSON();
      const shown = element => !!(element.getBoundingClientRect().width && element.getBoundingClientRect().height);
      const selectors = '.scoreboard,.machine-footer,#score,#high-score,#score-p2,#level,#lives,#board-status,#fullscreen-button,#view-button,.game-toolbar button,[data-direction]';
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
        scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
        fullscreen:!!document.fullscreenElement,theater:document.body.classList.contains('theater-view'),
        canvas:rect(document.querySelector('#game-canvas')),
        canvasPixels:[document.querySelector('#game-canvas').width,document.querySelector('#game-canvas').height],
        controls:[...document.querySelectorAll(selectors)].filter(shown).map(element=>({
          id:element.id||element.dataset.direction||element.className,...rect(element),
          reachable:(()=>{const r=element.getBoundingClientRect();
            const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
            return target===element || element.contains(target);})()}))};
    }""")
    result["name"] = name
    report["layouts"].append(result)
    width, height, canvas = result["width"], result["height"], result["canvas"]
    require(result["scrollWidth"] <= width + 1, f"Horizontal overflow: {result}")
    require(result["scrollHeight"] <= height + 1, f"Vertical overflow: {result}")
    require(canvas["x"] >= -1 and canvas["right"] <= width + 1 and canvas["y"] >= -1 and canvas["bottom"] <= height + 1,
            f"Maze cropped: {canvas}, viewport {width}x{height}")
    require(abs(canvas["width"] / canvas["height"] - 28 / 31) < .005, f"Maze distorted: {canvas}")
    for control in result["controls"]:
        require(control["x"] >= -1 and control["right"] <= width + 1 and control["y"] >= -1 and control["bottom"] <= height + 1,
                f"HUD/control outside viewport: {control}")
        # Overlays deliberately cover the canvas, but toolbar buttons must remain usable.
        if control["id"] in ("fullscreen-button", "view-button"):
            require(control["reachable"], f"View control is covered: {control}")
    return result


def fullscreen(page, enabled, via="button"):
    if via == "button":
        page.locator("#fullscreen-button").click()
    else:
        page.keyboard.press("f")
    page.wait_for_function("wanted => !!document.fullscreenElement === wanted", arg=enabled)
    page.wait_for_function("wanted => document.body.classList.contains('fullscreen-view') === wanted", arg=enabled)
    page.wait_for_timeout(120)
    expected = "Exit fullscreen" if enabled else "Enter fullscreen"
    label = page.locator("#fullscreen-label").inner_text().strip()
    require(label == expected or (not enabled and label == "Fullscreen"),
            f"Fullscreen label did not synchronize to {expected}: {label}")
    require(page.locator("#fullscreen-button").get_attribute("aria-label") == expected,
            f"Accessible fullscreen action did not synchronize to {expected}")
    require(page.locator("#fullscreen-button").get_attribute("aria-pressed") == str(enabled).lower(),
            "Fullscreen aria-pressed does not match actual browser state")


SPY = """(() => {
  const request=Element.prototype.requestFullscreen;
  window.__fullscreenRequests=[];
  if(request) Element.prototype.requestFullscreen=function(...args) {
    window.__fullscreenRequests.push({active:navigator.userActivation.isActive,target:this.tagName});
    return request.apply(this,args);
  };
})();"""


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
    report["environment"]["browser"] = browser.version
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script(SPY)
    page = context.new_page()
    listen(page, "desktop")
    load(page)

    def defaults():
        require(theater(page), "Fresh browser should start with the larger board")
        require(not page.evaluate("!!document.fullscreenElement"), "Load entered fullscreen automatically")
        require(page.evaluate("window.__fullscreenRequests.length") == 0, "Fullscreen was requested without a user gesture")
        require(page.locator("#view-label").inner_text().strip() == "Cabinet view", "Large view has no clear exit label")
        require(page.locator("#view-button").get_attribute("aria-pressed") == "true", "Large view aria-pressed missing")
        for selector in ("#fullscreen-button", "#view-button"):
            require(page.locator(selector).is_visible() and page.locator(selector).is_enabled(), f"View action unavailable: {selector}")
        page.screenshot(path=str(OUT / "fullscreen-desktop-title.png"))
        return layout(page, "desktop-large-title")
    check("fresh browser defaults to large view with explicit fullscreen action", defaults)

    def preference():
        large = page.locator("#game-canvas").bounding_box()
        set_theater(page, False)
        cabinet = page.locator("#game-canvas").bounding_box()
        require(large["height"] >= cabinet["height"] * 1.10, f"Large board is not materially larger: large {large}, cabinet {cabinet}")
        require(page.locator("#view-label").inner_text().strip() == "Large view", "Cabinet view has no enlarge label")
        load(page)
        require(not theater(page), "Cabinet preference lost on reload")
        set_theater(page, True)
        load(page)
        require(theater(page), "Large-view preference lost on reload")
        require(not page.evaluate("!!document.fullscreenElement"), "Saved large-view preference entered native fullscreen")
        return {"largeHeight": large["height"], "cabinetHeight": cabinet["height"], "growth": large["height"] / cabinet["height"]}
    check("large board is larger and browser-local view preference survives reload", preference)

    before = fixture(page)

    def view_identity():
        page.keyboard.press("v")
        require(not theater(page), "V did not restore cabinet")
        preserved(page, before)
        page.keyboard.press("v")
        require(theater(page), "V did not enlarge")
        preserved(page, before)
        return {"score": before["score"], "remaining": before["remaining"], "lives": before["lives"], "time": before["time"]}
    check("V view shortcuts preserve the live game, renderer, score, pellets, and time", view_identity)

    def restore_preference_after_fullscreen():
        set_theater(page, False)
        fullscreen(page, True)
        require(theater(page), "Native fullscreen did not expand the board from cabinet view")
        require(page.locator("#view-button").is_hidden(), "Cabinet toggle should not conflict with the active fullscreen exit")
        page.keyboard.press("v")
        require(theater(page), "V collapsed the board while fullscreen remained active")
        require(page.evaluate("localStorage.getItem('afterhours.pacman.view')") == "cabinet", "Temporary fullscreen expansion overwrote cabinet preference")
        preserved(page, before)
        fullscreen(page, False)
        require(not theater(page), "Native fullscreen exit did not restore preceding cabinet view")
        require(page.locator("#view-button").is_visible(), "Fullscreen exit did not restore the separate view toggle")
        preserved(page, before)
        set_theater(page, True)
    check("native fullscreen temporarily enlarges cabinet and restores its saved preference on exit", restore_preference_after_fullscreen)

    def real_fullscreen():
        fullscreen(page, True)
        require(page.evaluate("document.fullscreenElement === document.documentElement"), "Fullscreen omitted app controls by targeting the canvas")
        preserved(page, before)
        result = layout(page, "desktop-native-fullscreen")
        page.screenshot(path=str(OUT / "fullscreen-desktop-paused.png"))
        page.set_viewport_size({"width": 1280, "height": 800})
        page.wait_for_timeout(150)
        layout(page, "desktop-native-fullscreen-resize-1280x800")
        preserved(page, before)
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.wait_for_timeout(150)
        layout(page, "desktop-native-fullscreen-resize-1440x1000")
        fullscreen(page, False)
        preserved(page, before)
        return result
    check("trusted fullscreen button enters and exits native fullscreen without resetting game", real_fullscreen)

    def external_exit():
        fullscreen(page, True, "keyboard")
        page.evaluate("document.exitFullscreen()")
        page.wait_for_function("!document.fullscreenElement && !document.body.classList.contains('fullscreen-view')")
        require(page.locator("#fullscreen-button").get_attribute("aria-label") == "Enter fullscreen", "External browser exit left stale label")
        require(page.locator("#fullscreen-button").get_attribute("aria-pressed") == "false", "External browser exit left stale aria-pressed")
        preserved(page, before)
        requests = page.evaluate("window.__fullscreenRequests")
        require(requests and all(request["active"] and request["target"] == "HTML" for request in requests), f"Fullscreen request lacked activation or used wrong target: {requests}")
        return requests
    check("F shortcut and browser fullscreenchange synchronize actual state with user activation", external_exit)

    def fullscreen_dialogs():
        fullscreen(page, True)
        for trigger, dialog in (("#help-button", "#help-dialog"), ("#restart-button", "#restart-dialog")):
            page.locator(trigger).click()
            require(page.locator(dialog).is_visible(), f"Dialog unavailable in fullscreen: {dialog}")
            require(page.locator(dialog).evaluate("element => element.contains(document.activeElement)"), "Fullscreen dialog did not receive focus")
            page.keyboard.press("Escape")
            page.wait_for_selector(dialog, state="hidden")
            require(page.evaluate("!!document.fullscreenElement"), "Dialog Escape unexpectedly closed fullscreen")
            preserved(page, before)
        page.keyboard.press("Escape")
        page.wait_for_function("!document.fullscreenElement && !document.body.classList.contains('fullscreen-view')")
        require(page.locator("#fullscreen-button").get_attribute("aria-label") == "Enter fullscreen", "Escape exit left stale fullscreen label")
        preserved(page, before)
    check("fullscreen help/restart dialogs and Escape preserve focus and live run", fullscreen_dialogs)

    def escape_views():
        # Native fullscreen exit can emit a late Escape; allow that transition
        # to settle before exercising a separate user's large-view Escape.
        page.wait_for_timeout(300)
        set_theater(page, True)
        page.locator("#help-button").click()
        page.keyboard.press("v")
        require(theater(page), "View shortcut changed layout underneath modal")
        page.keyboard.press("Escape")
        require(theater(page), "Modal Escape also exited large view")
        preserved(page, before)
        page.keyboard.press("Escape")
        require(not theater(page), "Escape did not exit large view")
        preserved(page, before)
        page.keyboard.press("Escape")
        page.wait_for_function("!window.__PACMAN__.game.state.paused && !window.__PACMAN__.resumeCountdown.active", timeout=8000)
        require(not page.evaluate("window.__PACMAN__.game.state.paused"), "Cabinet Escape lost existing pause/resume shortcut")
        page.keyboard.press("ArrowRight")
        require(page.evaluate("window.__PACMAN__.game.state.pacman.nextDir") == "right", "Arrow controls broken after view transitions")
        page.keyboard.press("a")
        require(page.evaluate("window.__PACMAN__.game.state.pacman.nextDir") == "left", "WASD controls broken after view transitions")
        page.keyboard.press("p")
        set_theater(page, True)
    check("modal shortcuts, large-view Escape, cabinet pause, and keyboard movement coexist", escape_views)

    resize_before = snapshot(page)

    def desktop_resize():
        results = []
        for width, height in ((1280, 800), (1440, 1000)):
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(150)
            results.append(layout(page, f"desktop-resize-{width}x{height}"))
            preserved(page, resize_before)
        fullscreen(page, True)
        preserved(page, resize_before)
        page.keyboard.press("p")
        page.wait_for_timeout(100)
        page.screenshot(path=str(OUT / "fullscreen-desktop-playing.png"))
        page.keyboard.press("p")
        fullscreen(page, False)
        page.keyboard.press("p")
        page.wait_for_timeout(100)
        page.screenshot(path=str(OUT / "fullscreen-large-desktop.png"))
        page.keyboard.press("p")
        return results
    check("large view refits desktop resize without cropping HUD or resetting run", desktop_resize)
    context.close()

    for width, height in ((390, 844), (375, 667), (844, 390)):
        mobile_context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mobile = mobile_context.new_page()
        listen(mobile, f"touch-{width}x{height}")
        load(mobile)

        def touch_case():
            require(theater(mobile), "Touch browser did not default to large view")
            result = layout(mobile, f"touch-large-{width}x{height}")
            mobile.locator("#start-button").tap()
            mobile.wait_for_function("window.__PACMAN__.game.state.phase === 'playing'")
            for direction in ("up", "right", "down", "left"):
                mobile.locator(f'[data-direction="{direction}"]').tap()
                require(mobile.evaluate("window.__PACMAN__.game.state.pacman.nextDir") == direction, f"Touch {direction} failed after enlargement")
            page_name = f"fullscreen-touch-{width}x{height}"
            mobile.screenshot(path=str(OUT / f"{page_name}.png"))
            mobile.locator("#pause-button").tap()
            mobile_before = snapshot(mobile)
            mobile.locator("#view-button").tap()
            require(not theater(mobile), "Touch cannot exit large view")
            require(snapshot(mobile) == mobile_before, "Touch view exit changed live run")
            mobile.locator("#view-button").tap()
            require(theater(mobile), "Touch cannot enlarge board")
            require(snapshot(mobile) == mobile_before, "Touch enlargement changed live run")
            mobile.screenshot(path=str(OUT / f"{page_name}-paused.png"))
            mobile.locator("#fullscreen-button").tap()
            mobile.wait_for_function("document.fullscreenElement === document.documentElement")
            mobile.wait_for_timeout(100)
            layout(mobile, f"touch-native-fullscreen-{width}x{height}")
            require(snapshot(mobile) == mobile_before, "Touch fullscreen entry changed live run")
            require(mobile.locator("#fullscreen-label").inner_text().strip() == "Exit fullscreen", "Touch fullscreen has no visible exit")
            mobile.set_viewport_size({"width": height, "height": width})
            mobile.wait_for_timeout(150)
            layout(mobile, f"touch-native-fullscreen-rotated-{height}x{width}")
            require(snapshot(mobile) == mobile_before, "Touch fullscreen rotation changed live run")
            mobile.set_viewport_size({"width": width, "height": height})
            mobile.wait_for_timeout(150)
            mobile.locator("#fullscreen-button").tap()
            mobile.wait_for_function("!document.fullscreenElement")
            require(snapshot(mobile) == mobile_before, "Touch fullscreen exit changed live run")
            mobile.locator("#help-button").tap()
            require(mobile.locator("#help-dialog").is_visible(), "Touch help unavailable in large view")
            mobile.locator("#help-done").tap()
            require(snapshot(mobile) == mobile_before, "Help changed paused run")
            # A single live page changes orientation, preserving its run and controls.
            mobile.set_viewport_size({"width": height, "height": width})
            mobile.wait_for_timeout(150)
            rotated = layout(mobile, f"touch-rotated-{height}x{width}")
            require(snapshot(mobile) == mobile_before, "Orientation change reset live run")
            mobile.screenshot(path=str(OUT / f"{page_name}-rotated.png"))
            return {"initial": result, "rotated": rotated}
        check(f"touch {width}x{height}: complete maze/HUD, controls, view toggle, help, and rotation", touch_case)
        mobile_context.close()

    for mode in ("reject", "unavailable"):
        fallback_context = browser.new_context(viewport={"width": 1280, "height": 800})
        fallback_context.add_init_script("""(() => {
          window.__fullscreenRequests=[];
          Element.prototype.requestFullscreen = """ + ("function(){window.__fullscreenRequests.push({active:navigator.userActivation.isActive});return Promise.reject(new DOMException('Fullscreen denied by test fixture','NotAllowedError'));}" if mode == "reject" else "undefined") + ";})();")
        fallback = fallback_context.new_page()
        listen(fallback, f"fallback-{mode}")
        load(fallback)

        def fallback_case():
            set_theater(fallback, False)
            fallback.locator("#fullscreen-button").click()
            fallback.wait_for_function("document.body.classList.contains('theater-view')")
            require(not fallback.evaluate("!!document.fullscreenElement"), "Fallback falsely entered native fullscreen")
            require(not fallback.locator("body").evaluate("body => body.classList.contains('fullscreen-view')"), "Fallback claimed native fullscreen state")
            require(fallback.locator("#fullscreen-button").get_attribute("aria-pressed") == "false", "Fallback announced native fullscreen as active")
            require(fallback.locator("#view-label").inner_text().strip() == "Cabinet view", "Fallback large view has no visible exit")
            result = layout(fallback, f"fallback-{mode}-large")
            fallback.screenshot(path=str(OUT / f"fullscreen-fallback-{mode}.png"))
            fallback.locator("#view-button").click()
            require(not theater(fallback), "Fallback cannot exit large view")
            requests = fallback.evaluate("window.__fullscreenRequests")
            require(len(requests) == (1 if mode == "reject" else 0), f"Fullscreen {mode} fixture did not exercise intended API path: {requests}")
            require(all(request["active"] for request in requests), "Fallback requested fullscreen outside user gesture")
            return {"layout": result, "requests": requests}
        check(f"fullscreen API {mode} falls back to an enlarged board with visible exit", fallback_case)
        fallback_context.close()

    browser.close()

check("no browser errors or unhandled rejected fullscreen promises", lambda: require(not report["errors"], str(report["errors"])))
report["summary"] = {"passed": sum(item["passed"] for item in report["checks"]), "failed": sum(not item["passed"] for item in report["checks"])}
(OUT / "fullscreen-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report["summary"]), flush=True)
sys.exit(1 if report["summary"]["failed"] else 0)
