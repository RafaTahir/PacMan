"""Real Chromium checks for play cues, safe resume, and responsive controls.

Run: EXPERIENCE_PRODUCTION_URL=http://127.0.0.1:4173 python tests/experience_smoke.py [dev URL]
Requires Python Playwright and Chromium; CHROMIUM_PATH overrides /usr/bin/chromium.
Only --no-sandbox is passed. DPR2 touch viewports emulate layout/input; they do not
prove behavior on physical phones or hardware GPU performance. Rare frightened and
collision states are explicitly labeled DEV fixtures. Normal starts, countdowns,
keyboard/touch input, dialogs, fullscreen, and scoring use the live application.
Reports and focused screenshots are written to ignored test-results/experience-*.
"""
import json
import os
from pathlib import Path
import platform
import sys
import time

from playwright.sync_api import expect, sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5174"
PRODUCTION_URL = os.environ.get("EXPERIENCE_PRODUCTION_URL")
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
report = {"checks": [], "errors": [], "warnings": [], "layouts": [], "screenshots": [],
          "limitations": ["Headless Chromium; no physical mobile device or hardware performance claim.",
                           "Resize emulates rotation; browser chrome, display cutouts, and OS app switching are not emulated.",
                           "Blur and visibility cancellation are dispatched as labeled browser-event fixtures.",
                           "A late compatibility click after touch cancellation is a labeled browser-event fixture.",
                           "Rare frightened/collision states use labeled DEV state fixtures; production checks use ordinary input."],
          "environment": {"url": URL, "productionUrl": PRODUCTION_URL, "platform": platform.platform(),
                          "headless": True, "launchArgs": ["--no-sandbox"]}}
current_assertions = []


def require(condition, message):
    current_assertions.append({"assertion": message, "passed": bool(condition)})
    assert condition, message


def check(name, run):
    global current_assertions
    current_assertions = []
    started = time.monotonic()
    entry = {"name": name, "assertions": current_assertions}
    try:
        entry.update(passed=True, detail=run())
        print("PASS", name, flush=True)
    except Exception as error:
        entry.update(passed=False, error=str(error))
        print("FAIL", name, str(error), flush=True)
    entry["durationSeconds"] = round(time.monotonic() - started, 3)
    report["checks"].append(entry)


def listen(page, name):
    page.set_default_timeout(7000)
    page.on("pageerror", lambda error: report["errors"].append({"context": name, "message": str(error)}))

    def console(event):
        entry = {"context": name, "message": event.text}
        if event.type == "warning" or "CONTEXT_LOST_WEBGL" in event.text:
            report["warnings"].append(entry)
        elif event.type == "error":
            report["errors"].append(entry)
    page.on("console", console)


def load(page, url=URL, dev=True):
    page.goto(url)
    page.wait_for_selector("#start-button")
    if dev:
        page.wait_for_function("!!window.__PACMAN__?.resumeCountdown")
    page.wait_for_timeout(120)


def start(page, touch=False):
    page.locator("#start-button").tap() if touch else page.locator("#start-button").click()
    page.wait_for_function("window.__PACMAN__.game.state.phase === 'playing' && !window.__PACMAN__.game.state.paused")


def paused(page):
    return page.evaluate("window.__PACMAN__.game.state.paused")


def pause(page):
    if page.evaluate("window.__PACMAN__.resumeCountdown.active"):
        page.locator("#cancel-resume").click()
    elif not paused(page):
        page.keyboard.press("p")
    page.wait_for_function("window.__PACMAN__.game.state.paused && !window.__PACMAN__.resumeCountdown.active")


def snapshot(page, ignore_next=False):
    return page.evaluate("""ignoreNext => {
      const app=window.__PACMAN__, g=app.game, s=g.state;
      const state=JSON.parse(JSON.stringify(s,(_,value)=>value instanceof Set?[...value].sort((a,b)=>a-b):value));
      if(ignoreNext) delete state.pacman.nextDir;
      return {state,randomState:g.randomState,accumulator:g.accumulator,
        activePlayer:app.activePlayer,playerCount:app.playerCount};
    }""", ignore_next)


def remember_identity(page):
    page.evaluate("""() => {const a=window.__PACMAN__;window.__experienceIdentity={
      game:a.game,state:a.game.state,games:a.games,renderer:a.renderer,
      canvas:document.querySelector('#game-canvas'),pellets:a.game.state.pellets,
      energizers:a.game.state.energizers};}""")


def identity(page):
    return page.evaluate("""() => {const a=window.__PACMAN__,i=window.__experienceIdentity;
      return a.game===i.game&&a.game.state===i.state&&a.games===i.games&&a.renderer===i.renderer&&
        document.querySelector('#game-canvas')===i.canvas&&a.game.state.pellets===i.pellets&&
        a.game.state.energizers===i.energizers;}""")


def unchanged(page, before, ignore_next=False):
    require(identity(page), "Live Game, state, player games, renderer, canvas, and pellet Sets retain identity")
    require(snapshot(page, ignore_next) == before, "Paused engine state, score, pellets, lives, clock, RNG, and accumulator are unchanged")


def screenshot(page, name, playing=False, fixture=None, dev=True):
    if playing:
        if dev:
            require(page.evaluate("window.__PACMAN__.game.state.phase==='playing'&&!window.__PACMAN__.game.state.paused"),
                    "Gameplay evidence is captured during actual unpaused playing phase")
        require(page.locator("#title-overlay").is_hidden() and page.locator("#pause-overlay").is_hidden()
                and page.locator("#resume-countdown").is_hidden(), "Gameplay screenshot has no title, pause, or resume overlay")
    target = OUT / f"experience-{name}.png"
    page.screenshot(path=str(target))
    report["screenshots"].append({"file": str(target), "playing": playing, "fixture": fixture})


def layout(page, name, title=False):
    result = page.evaluate("""() => {
      const rect=e=>e.getBoundingClientRect().toJSON();
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);
        return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden]');};
      const buttons=[...document.querySelectorAll('button,.brand')].filter(visible).map(e=>{
        const r=rect(e),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {id:e.id||e.dataset.direction||e.className,...r,reachable:target===e||e.contains(target)};});
      const controls=[...document.querySelectorAll('.scoreboard,.machine-footer,.game-toolbar,.touch-controls,#board-status,#input-cue,#graphics-status')]
        .filter(visible).map(e=>({id:e.id||e.className,...rect(e)}));
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
        scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
        canvas:rect(document.querySelector('#game-canvas')),footer:rect(document.querySelector('.machine-footer')),
        status:rect(document.querySelector('#board-status')),buttons,controls,
        fullscreen:!!document.fullscreenElement,footerRows:getComputedStyle(document.querySelector('.machine-footer')).gridTemplateRows};
    }""")
    result["name"] = name
    report["layouts"].append(result)
    w, h, maze = result["width"], result["height"], result["canvas"]
    require(result["scrollWidth"] <= w + 1 and result["scrollHeight"] <= h + 1,
            f"{name}: page fits {w}×{h} without horizontal or vertical scrolling")
    require(maze["x"] >= -1 and maze["y"] >= -1 and maze["right"] <= w + 1 and maze["bottom"] <= h + 1,
            f"{name}: entire maze stays inside viewport")
    require(abs(maze["width"] / maze["height"] - 28 / 31) < .005,
            f"{name}: maze retains 28:31 aspect ratio")
    for control in result["controls"]:
        require(control["x"] >= -1 and control["y"] >= -1 and control["right"] <= w + 1 and control["bottom"] <= h + 1,
                f"{name}: {control['id']} stays inside viewport")
    for button in result["buttons"]:
        require(button["width"] >= 43.9 and button["height"] >= 43.9,
                f"{name}: {button['id']} has a target of at least 44×44 CSS pixels")
        require(button["x"] >= -1 and button["y"] >= -1 and button["right"] <= w + 1 and button["bottom"] <= h + 1,
                f"{name}: {button['id']} stays inside viewport")
        # Ready coach intentionally covers playfield; header and toolbar must stay reachable.
        if button["id"] in ("help-button", "fullscreen-button", "view-button", "start-button", "one-player", "two-players", "pause-button", "restart-button", "sound-button", "up", "down", "left", "right"):
            require(button["reachable"], f"{name}: {button['id']} center can be reached")
    require(result["status"]["y"] >= result["footer"]["y"] - 1 and result["status"]["bottom"] <= result["footer"]["bottom"] + 1,
            f"{name}: new play status remains within existing footer")
    next_cue = next((control for control in result["controls"] if control["id"] == "input-cue"), None)
    if next_cue:
        require(abs(next_cue["y"] + next_cue["height"] / 2 - result["status"]["y"] - result["status"]["height"] / 2) < 3,
                f"{name}: queued-turn cue shares the existing status row")
    if title:
        selector = ".touch-play-hint" if w <= 760 or page.evaluate("matchMedia('(pointer: coarse)').matches") else ".keyboard-play-hint"
        require(page.locator(selector).is_visible(), f"{name}: title shows guidance suited to current input")
        require("queue" in page.locator(".title-play-hint").inner_text().lower(), f"{name}: title explains queued turns")
    return result


def begin_resume(page):
    page.locator("#resume-button").click()
    page.wait_for_selector("#resume-countdown", state="visible")
    require(paused(page), "Engine remains paused when resume countdown opens")
    require(page.locator("#resume-number").inner_text() == "3", "Each resume countdown starts freshly at three")


def finish_resume(page):
    page.wait_for_function("!window.__PACMAN__.game.state.paused && !window.__PACMAN__.resumeCountdown.active", timeout=9000)
    require(page.locator("#resume-countdown").is_hidden(), "Resume countdown closes when play resumes")


def trusted_swipe(page, dx, dy):
    """Chromium dispatches genuine touch/pointer events through the browser."""
    bounds = page.locator("#game-canvas").bounding_box()
    x, y = bounds["x"] + bounds["width"] * .2, bounds["y"] + bounds["height"] * .2
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx, "y": y + dy}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()


GL_CAPTURE = """(() => {
  const original=HTMLCanvasElement.prototype.getContext;
  window.__experienceGL=[];
  HTMLCanvasElement.prototype.getContext=function(kind,...args){
    const gl=original.call(this,kind,...args);
    if(gl&&/^(webgl2?|experimental-webgl)$/.test(kind)&&!window.__experienceGL.some(x=>x.gl===gl)){
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      window.__experienceGL.push({gl,canvas:this,driver:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});
    }return gl;
  };
})();"""

NO_WEBGL = """(() => {
  const original=HTMLCanvasElement.prototype.getContext;window.__blockedWebGLAttempts=0;
  HTMLCanvasElement.prototype.getContext=function(kind,...args){
    if(/^(webgl2?|experimental-webgl)$/.test(kind)){window.__blockedWebGLAttempts++;return null;}
    return original.call(this,kind,...args);
  };
})();"""


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
    report["environment"]["browser"] = browser.version
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script(GL_CAPTURE)
    page = context.new_page()
    listen(page, "desktop")
    load(page)

    def defaults():
        require(page.locator("#title-overlay").is_visible(), "New session opens on title")
        require(page.locator("#input-cue").is_hidden() and page.locator("#power-meter").is_hidden(), "Title has no live-player turn or power cue")
        menu_before = snapshot(page)
        page.wait_for_timeout(350)
        require(snapshot(page) == menu_before, "Title demo never advances the live player game, clock, pellets, or lives")
        result = layout(page, "desktop-title-1440x1000", title=True)
        page.locator("#help-button").click()
        require(page.locator("#cues-toggle").is_checked(), "Play cues are enabled by default")
        require(not page.locator("#contrast-toggle").is_checked(), "Higher contrast is optional by default")
        require(page.locator("#help-dialog").evaluate("e=>e.contains(document.activeElement)"), "Instructions receive modal focus")
        for selector in ("#close-help", "#help-done", ".dialog-preference", ".dialog-motion"):
            for target in page.locator(selector).all():
                bounds = target.bounding_box()
                require(bounds["width"] >= 44 and bounds["height"] >= 44, f"Instructions target {selector} is at least 44×44 CSS pixels")
        page.locator("#cues-toggle").uncheck()
        page.locator("#contrast-toggle").check()
        page.locator("#dialog-motion-toggle").check()
        page.locator("#help-done").click()
        load(page)
        page.locator("#help-button").click()
        require(not page.locator("#cues-toggle").is_checked(), "Play-cue preference persists after reload")
        require(page.locator("#contrast-toggle").is_checked() and page.locator("body").evaluate("e=>e.classList.contains('high-contrast')"),
                "Contrast preference and body presentation persist after reload")
        require(page.locator("#dialog-motion-toggle").is_checked(), "Reduced-motion preference persists after reload")
        page.locator("#cues-toggle").check()
        page.locator("#dialog-motion-toggle").uncheck()
        page.locator("#help-done").click()
        return result
    check("title controls and persistent optional experience preferences", defaults)

    def first_tip():
        page.locator("#start-button").click()
        require(page.evaluate("window.__PACMAN__.game.state.phase==='ready'"), "Ordinary start uses original ready phase")
        require(page.locator("#coach-hint").is_visible(), "First run presents a brief queued-turn hint during ready")
        dismiss = page.locator("#coach-dismiss").bounding_box()
        require(dismiss["width"] >= 44 and dismiss["height"] >= 44, "Coach dismissal target is at least 44×44")
        page.locator("#coach-dismiss").click()
        require(page.locator("#coach-hint").is_hidden(), "Coach hint can be dismissed")
        require("turns" in page.evaluate("localStorage.getItem('afterhours.pacman.tips-v1')"), "Dismissed hint is remembered locally")
        page.wait_for_function("window.__PACMAN__.game.state.phase==='playing'")
        require(page.locator("#coach-hint").is_hidden(), "Coach hint does not cover active play")
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(250)
        require(page.evaluate("window.__PACMAN__.game.state.score>0"), "Ordinary keyboard movement consumes pellets and scores")
        screenshot(page, "desktop-playing", playing=True)
        pause(page)
        remember_identity(page)
        return snapshot(page)
    check("brief dismissible first-run guidance and real scoring gameplay", first_tip)

    def countdown():
        before = snapshot(page, True)
        old_next = page.evaluate("window.__PACMAN__.game.state.pacman.nextDir")
        page.keyboard.press("ArrowUp")
        require(page.evaluate("window.__PACMAN__.game.state.pacman.nextDir") == old_next, "Ordinary pause blocks movement input")
        begin_resume(page)
        require(page.locator("#coach-hint").is_hidden(), "Coach tip stays hidden during resume countdown")
        started = time.monotonic()
        page.keyboard.press("ArrowUp")
        page.keyboard.press("d")
        page.keyboard.press("s")
        require(page.evaluate("window.__PACMAN__.game.state.pacman.nextDir==='down'"), "Newest countdown direction wins across arrows and WASD")
        expect(page.locator("#input-cue")).to_have_text("NEXT ↓")
        require(page.locator("#input-cue").inner_text() == "NEXT ↓", "Queued-turn cue mirrors actual nextDir")
        unchanged(page, before, True)
        page.wait_for_timeout(1050)
        require(paused(page), "Engine stays paused through the countdown's first second")
        require(page.locator("#resume-number").inner_text() in ("1", "2"), "Countdown visibly advances from three")
        unchanged(page, before, True)
        page.evaluate("""() => {window.__resumeObserved=null;const observe=()=>{
          const a=window.__PACMAN__;if(!a.game.state.paused){window.__resumeObserved={time:a.game.state.time,
            nextDir:a.game.state.pacman.nextDir,rng:a.game.randomState};return;}requestAnimationFrame(observe);
        };requestAnimationFrame(observe);}""")
        finish_resume(page)
        page.wait_for_function("window.__resumeObserved !== null")
        elapsed = time.monotonic() - started
        observed = page.evaluate("window.__resumeObserved")
        require(elapsed >= 2.8, "Resume waits about three real seconds before unpausing")
        require(observed["time"] == before["state"]["time"], "First resumed frame applies no countdown elapsed-time jump")
        require(observed["rng"] == before["randomState"], "Countdown completion does not consume engine RNG")
        require(observed["nextDir"] == "down", "Queued input survives the first resumed frame")
        require(identity(page), "Resume preserves live game and renderer identities")
        pause(page)
        return {"wallSeconds": round(elapsed, 3), "firstResumedFrame": observed}
    check("three-second resume freezes engine, queues newest turn, and resumes with no time jump", countdown)

    def cancellations():
        results = []
        for action in ("keyboard P", "Keep paused button", "toolbar pause", "background blur", "hidden document"):
            before = snapshot(page)
            begin_resume(page)
            page.wait_for_timeout(180)
            if action == "keyboard P":
                page.keyboard.press("p")
            elif action == "Keep paused button":
                page.locator("#cancel-resume").click()
            elif action == "toolbar pause":
                page.locator("#pause-button").click()
            elif action == "background blur":
                page.evaluate("window.dispatchEvent(new Event('blur'))")
            else:
                page.evaluate("""() => {Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
                  document.dispatchEvent(new Event('visibilitychange'));}""")
                page.wait_for_timeout(80)
                page.evaluate("""() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}""")
            page.wait_for_function("!window.__PACMAN__.resumeCountdown.active")
            require(paused(page), f"{action} cancels countdown and keeps engine paused")
            page.wait_for_timeout(3100)
            unchanged(page, before)
            require(page.locator("#pause-overlay").is_visible(), f"{action} restores a usable pause overlay without delayed resume")
            results.append({"action": action, "pausedAfterOldDeadline": True})
        return results
    check("countdown cancellation by keyboard, both buttons, blur, and visibility stays safe past old deadline", cancellations)

    def dialogs():
        before = snapshot(page)
        # An already paused game remains paused when instructions close.
        page.locator("#help-button").click()
        old_next = page.evaluate("window.__PACMAN__.game.state.pacman.nextDir")
        page.keyboard.press("ArrowLeft")
        page.keyboard.press("d")
        require(page.evaluate("window.__PACMAN__.game.state.pacman.nextDir") == old_next, "Instructions block arrow and WASD movement shortcuts")
        page.wait_for_timeout(200)
        page.keyboard.press("Escape")
        require(not page.evaluate("window.__PACMAN__.resumeCountdown.active"), "Closing instructions from existing pause does not initiate resume")
        unchanged(page, before)
        # An interrupted countdown starts afresh after help; no old timer survives.
        begin_resume(page)
        page.wait_for_timeout(1000)
        page.locator("#help-button").click()
        require(not page.evaluate("window.__PACMAN__.resumeCountdown.active"), "Opening instructions cancels active countdown")
        page.wait_for_timeout(2200)
        unchanged(page, before)
        page.locator("#help-done").click()
        require(page.locator("#resume-number").inner_text() == "3" and paused(page), "Instructions close restarts interrupted countdown at three while engine remains paused")
        finish_resume(page)
        # Actual running-game help and restart cancellation each use the new clock.
        for trigger, close, dialog in (("#help-button", "#help-done", "#help-dialog"),
                                       ("#restart-button", "#cancel-restart", "#restart-dialog")):
            page.locator(trigger).click()
            require(page.locator(dialog).is_visible() and paused(page), f"{dialog} pauses running game")
            during = snapshot(page)
            page.wait_for_timeout(250)
            unchanged(page, during)
            page.locator(close).click()
            require(paused(page) and page.locator("#resume-number").inner_text() == "3", f"{dialog} dismissal uses fresh three-second resume")
            finish_resume(page)
        pause(page)
        return {"runningHelpAndRestartCancel": "each waits full countdown", "interruptedCountdown": "fresh three seconds"}
    check("help and restart dialogs freeze gameplay and safely start or restart resume countdown", dialogs)

    def collision_freeze():
        # DEV fixture only: a normal ghost overlaps Pac-Man. Every pause surface
        # must prevent simulation/collision processing, rather than merely hide it.
        page.evaluate("""() => {const s=window.__PACMAN__.game.state;
          window.__collisionOriginal={ghosts:s.ghosts.map(g=>({...g,target:{...g.target}}))};
          s.ghosts[0].x=s.pacman.x;s.ghosts[0].y=s.pacman.y;s.ghosts[0].mode='normal';}""")
        before = snapshot(page)
        begin_resume(page)
        page.wait_for_timeout(2400)
        unchanged(page, before)
        require(page.evaluate("window.__PACMAN__.game.state.phase==='playing'"), "Overlapping dangerous ghost cannot cause death during countdown")
        page.locator("#cancel-resume").click()
        page.locator("#help-button").click()
        page.wait_for_timeout(300)
        unchanged(page, before)
        require(page.evaluate("window.__PACMAN__.game.state.lives") == before["state"]["lives"], "Instructions cannot process a hidden collision or consume a life")
        page.locator("#help-done").click()
        page.evaluate("""() => {window.__PACMAN__.game.state.paused=false;
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
          document.dispatchEvent(new Event('visibilitychange'));}""")
        page.wait_for_timeout(300)
        unchanged(page, before)
        page.evaluate("""() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
          const s=window.__PACMAN__.game.state;s.ghosts.forEach((g,i)=>Object.assign(g,window.__collisionOriginal.ghosts[i]));
          delete window.__collisionOriginal;}""")
        require(paused(page), "Returning from hidden document keeps dangerous collision fixture safely paused")
        return {"fixture": "DEV overlapping normal ghost", "countdownObservedSeconds": 2.4, "livesLost": 0}
    check("DEV collision fixture cannot cause countdown, instructions, or hidden-page deaths", collision_freeze)

    def cue_fixtures():
        # DEV fixture only: hold a rare frightened state by pausing its engine.
        page.evaluate("""() => {const s=window.__PACMAN__.game.state;s.phase='playing';s.frightenedRemaining=5.25;
          s.ghosts.forEach((g,i)=>{g.mode=['frightened','eyes','normal','house'][i];g.frightenedVisual=i===3;});
          s.pacman.nextDir='up';}""")
        page.wait_for_function("document.querySelector('#power-meter').hidden===false")
        require(page.locator("#power-meter").get_attribute("data-ending") == "false", "Power meter reads non-expiring frightened time")
        accessible = page.locator("#board-status").get_attribute("aria-label")
        require("6 seconds" in accessible and "1 roaming ghost is edible" in accessible,
                "Power cue rounds engine time and counts only mode=frightened ghosts")
        require("Other ghosts remain dangerous" in accessible, "Power cue does not claim normal, eyes, or house ghosts are safely edible")
        require(page.locator("#input-cue").inner_text() == "NEXT ↑", "Rare-state cue uses actual nextDir")
        page.evaluate("window.__PACMAN__.game.state.frightenedRemaining=1.7")
        page.wait_for_function("document.querySelector('#power-meter').dataset.ending==='true'")
        require("2 seconds" in page.locator("#board-status").get_attribute("aria-label"), "Expiry cue derives rounded seconds from current engine clock")
        page.locator("#help-button").click()
        during = snapshot(page)
        page.locator("#dialog-motion-toggle").check()
        page.locator("#cues-toggle").uncheck()
        require(page.locator("#input-cue").is_hidden() and page.locator("#power-meter").is_hidden(), "Turning cues off hides queued turn and power meter")
        unchanged(page, during)
        page.locator("#cues-toggle").check()
        page.locator("#help-done").click()
        styles = page.evaluate("""() => {const e=document.querySelector('#power-meter');return {
          bodyReduced:document.body.classList.contains('reduced-motion'),
          animation:getComputedStyle(e,'::after').animationName,
          transition:getComputedStyle(e,'::after').transitionDuration,
          progress:e.style.getPropertyValue('--power-progress')};}""")
        require(styles["bodyReduced"] and styles["animation"] == "none" and all(float(s.strip().removesuffix("s")) == 0 for s in styles["transition"].split(",")),
                "Reduced-motion power expiry indicator has no CSS animation or transition")
        require(abs(float(styles["progress"]) - 1.7 / 6) < .001, "Power meter progress uses engine frightenedRemaining / actual level duration")
        page.evaluate("window.__PACMAN__.game.state.ghosts[0].mode='normal'")
        page.wait_for_function("document.querySelector('#board-status').getAttribute('aria-label').includes('0 roaming ghosts')")
        require("0 roaming ghosts are edible" in page.locator("#board-status").get_attribute("aria-label"), "No frightened roaming ghost produces zero edible count")
        page.evaluate("window.__PACMAN__.game.state.frightenedRemaining=0")
        page.wait_for_function("document.querySelector('#power-meter').hidden")
        require(page.locator("#power-meter").is_hidden(), "Power meter disappears at engine expiry")
        return {"fixture": "DEV paused frightened modes", "reducedMotionStyles": styles}
    check("DEV frightened fixtures verify engine-derived duration, edible count, cue switch, and static reduced-motion expiry", cue_fixtures)

    def fullscreen_state():
        before = snapshot(page)
        page.locator("#fullscreen-button").click()
        page.wait_for_function("document.fullscreenElement===document.documentElement")
        expect(page.locator("#fullscreen-button")).to_have_attribute("aria-label", "Exit fullscreen")
        require(page.locator("#fullscreen-button").get_attribute("aria-label") == "Exit fullscreen", "Native fullscreen action reflects actual entry")
        require(page.locator("body").evaluate("e=>e.classList.contains('high-contrast')"), "Higher contrast survives native fullscreen")
        layout(page, "desktop-native-fullscreen")
        unchanged(page, before)
        page.locator("#fullscreen-button").click()
        page.wait_for_function("!document.fullscreenElement")
        unchanged(page, before)
        return {"nativeFullscreen": True}
    check("actual native fullscreen keeps preference and live state with new cue HUD", fullscreen_state)

    def gl_recovery():
        info = page.evaluate("window.__PACMAN__.renderer.graphicsInfo")
        drivers = page.evaluate("window.__experienceGL.map(x=>x.driver)")
        report["environment"]["glDrivers"] = drivers
        require(info["backend"] == "webgl", "Default Chromium supplies actual WebGL before context-loss test")
        supported = page.evaluate("""() => {const r=window.__experienceGL.find(x=>x.canvas===window.__PACMAN__.renderer.meshCanvas);
          window.__experienceLose=r.gl.getExtension('WEBGL_lose_context');return !!window.__experienceLose;}""")
        if not supported:
            report["limitations"].append("WEBGL_lose_context unavailable; real GL loss/recovery was not exercised.")
            return {"supported": False, "graphics": info}
        before = snapshot(page)
        page.evaluate("window.__experienceLose.loseContext()")
        page.wait_for_function("window.__PACMAN__.renderer.graphicsInfo.contextLost")
        expect(page.locator("#graphics-status")).to_have_text("2D fallback")
        require("fallback" in page.locator("#graphics-status").inner_text().lower(), "Context loss visibly enables 2D fallback")
        unchanged(page, before)
        page.evaluate("window.__experienceLose.restoreContext()")
        page.wait_for_function("window.__PACMAN__.renderer.graphicsInfo.available&&!window.__PACMAN__.renderer.graphicsInfo.contextLost")
        page.wait_for_timeout(150)
        require(page.locator("#graphics-status").inner_text() == "3D", "Restored context visibly returns to 3D")
        unchanged(page, before)
        return {"supported": True, "before": info, "restored": page.evaluate("window.__PACMAN__.renderer.graphicsInfo"), "drivers": drivers}
    check("real WebGL context loss/recovery retains cue settings and live engine", gl_recovery)

    def confirmed_restart():
        begin_resume(page)
        page.locator("#restart-button").click()
        require(page.locator("#restart-dialog").is_visible() and not page.evaluate("window.__PACMAN__.resumeCountdown.active"),
                "Restart dialog cancels active countdown before confirmation")
        page.locator("#confirm-restart").click()
        require(page.evaluate("""() => {const a=window.__PACMAN__,s=a.game.state;return a.game!==window.__experienceIdentity.game&&
          s.phase==='ready'&&s.score===0&&s.lives===3&&s.remaining===244&&!a.resumeCountdown.active;}"""),
                "Confirmed restart replaces run with original ready phase, zero score, 244 pellets, three lives, and no stale countdown")
        page.keyboard.press("p")
        require(paused(page), "Original ready phase can be paused")
        page.keyboard.press("p")
        require(not paused(page) and not page.evaluate("window.__PACMAN__.resumeCountdown.active"),
                "Ready phase resumes immediately using original ready timing")
        page.keyboard.press("p")
        remember_identity(page)
        before = snapshot(page)
        page.wait_for_timeout(3200)
        unchanged(page, before)
        require(paused(page), "Old countdown cannot resume a replacement run after its deadline")
        return {"freshLives": 3, "freshPellets": 244, "oldDeadlineObservedSeconds": 3.2}
    check("confirmed restart during countdown cancels old clock and restores original ready timing", confirmed_restart)
    context.close()

    for width, height in ((375, 667), (390, 844), (844, 390), (320, 568)):
        touch_context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mobile = touch_context.new_page()
        listen(mobile, f"touch-{width}x{height}")
        load(mobile)

        def mobile_case():
            results = [layout(mobile, f"touch-title-{width}x{height}", title=True)]
            start(mobile, touch=True)
            for direction in ("up", "right", "down", "left"):
                mobile.locator(f'[data-direction="{direction}"]').tap()
                require(mobile.evaluate("window.__PACMAN__.game.state.pacman.nextDir") == direction,
                        f"Real touch {direction} updates actual nextDir")
            results.append(layout(mobile, f"touch-playing-{width}x{height}"))
            screenshot(mobile, f"touch-{width}x{height}-playing", playing=True)
            mobile.locator("#pause-button").tap()
            remember_identity(mobile)
            before = snapshot(mobile, True)
            mobile.locator("#resume-button").tap()
            mobile.wait_for_selector("#resume-countdown", state="visible")
            mobile.locator('[data-direction="up"]').tap()
            mobile.locator('[data-direction="right"]').tap()
            require(mobile.evaluate("window.__PACMAN__.game.state.pacman.nextDir==='right'"), "Touch countdown accepts latest queued direction")
            mobile.evaluate("""() => {window.__swipeTrust=[];document.querySelector('#resume-countdown').addEventListener(
              'pointerdown',e=>window.__swipeTrust.push(e.isTrusted),{capture:true});}""")
            trusted_swipe(mobile, 0, -30)
            require(mobile.evaluate("window.__PACMAN__.game.state.pacman.nextDir==='up'"), "Trusted upward swipe on countdown overlay queues up")
            trusted_swipe(mobile, 30, 0)
            require(mobile.evaluate("window.__PACMAN__.game.state.pacman.nextDir==='right'"), "Newest trusted rightward swipe replaces queued countdown direction")
            trust = mobile.evaluate("window.__swipeTrust")
            require(len(trust) >= 2 and all(trust), "Countdown swipe tests receive trusted browser pointer events")
            unchanged(mobile, before, True)
            results.append(layout(mobile, f"touch-countdown-{width}x{height}"))
            mobile.locator("#cancel-resume").tap()
            mobile.wait_for_function("""() => window.__PACMAN__.game.state.paused &&
              !window.__PACMAN__.resumeCountdown.active && !document.querySelector('#pause-overlay').hidden""")
            require(paused(mobile) and not mobile.evaluate("window.__PACMAN__.resumeCountdown.active"),
                    "Trusted touch Keep paused cancels the countdown before fullscreen or rotation")
            # A touch pointer-up can hide its button before the browser emits
            # the same gesture's compatibility click. The one-way action must
            # remain paused even if that delayed event is delivered afterward.
            mobile.evaluate("""() => {
              document.querySelector('#cancel-resume').dispatchEvent(
                new MouseEvent('click', {bubbles:true,cancelable:true,detail:1}));
              document.querySelector('#resume-button').dispatchEvent(new PointerEvent('click',
                {bubbles:true,cancelable:true,detail:1,pointerType:'touch'}));
            }""")
            require(paused(mobile) and not mobile.evaluate("window.__PACMAN__.resumeCountdown.active"),
                    "Labeled late compatibility-click fixtures on Keep paused and replacement Resume cannot restart the countdown")
            before = snapshot(mobile)
            mobile.locator("#fullscreen-button").tap()
            mobile.wait_for_function("document.fullscreenElement===document.documentElement")
            results.append(layout(mobile, f"touch-fullscreen-{width}x{height}"))
            unchanged(mobile, before)
            rotated = {"width": 844, "height": 390} if height > width else {"width": 390, "height": 844}
            mobile.set_viewport_size(rotated)
            mobile.wait_for_timeout(150)
            results.append(layout(mobile, f"touch-fullscreen-rotation-from-{width}x{height}"))
            unchanged(mobile, before)
            mobile.locator("#fullscreen-button").tap()
            mobile.wait_for_function("!document.fullscreenElement")
            unchanged(mobile, before)
            if width == 375:
                mobile.set_viewport_size({"width": width, "height": height})
                mobile.wait_for_timeout(150)
                begin_resume(mobile)
                finish_resume(mobile)
                # DEV fixture only: mixed modes at an otherwise real playing frame.
                mobile.evaluate("""() => {const s=window.__PACMAN__.game.state;s.frightenedRemaining=5.25;
                  s.ghosts.forEach((g,i)=>{g.mode=['frightened','eyes','normal','house'][i];g.frightenedVisual=i===3;});
                  s.pacman.nextDir='up';}""")
                expect(mobile.locator("#board-status")).to_have_text("BLUE GHOSTS 6s")
                require(mobile.locator("#board-status").inner_text() == "BLUE GHOSTS 6s", "Active power cue displays actual rounded engine blue time")
                mobile.evaluate("window.__PACMAN__.game.state.frightenedRemaining=1.7")
                expect(mobile.locator("#board-status")).to_have_text("BLUE ENDS 2s")
                require(mobile.locator("#power-meter").get_attribute("data-ending") == "true", "Active ending power cue and meter agree")
                results.append(layout(mobile, "touch-playing-power-expiry-and-next-375x667"))
                screenshot(mobile, "touch-375x667-power-expiry-playing", playing=True,
                           fixture="DEV frightened timer and mixed ghost modes during real unpaused playing phase")
                mobile.evaluate("""() => {const s=window.__PACMAN__.game.state;s.frightenedRemaining=5.25;
                  s.ghosts.forEach((g,i)=>{g.mode=['normal','eyes','normal','house'][i];});}""")
                expect(mobile.locator("#board-status")).to_have_text("BLUE 6s · NONE OUT")
                require(mobile.locator("#board-status").inner_text() == "BLUE 6s · NONE OUT", "Active zero-edible cue says NONE OUT instead of implying safety")
                pause(mobile)
            return results
        check(f"DPR2 touch {width}×{height}: title, active play, queue, native fullscreen, rotation, 44px controls", mobile_case)
        touch_context.close()

    fallback_context = browser.new_context(viewport={"width": 375, "height": 667}, device_scale_factor=2, is_mobile=True, has_touch=True)
    fallback_context.add_init_script(NO_WEBGL)
    fallback = fallback_context.new_page()
    listen(fallback, "webgl-unavailable-fixture")
    load(fallback)

    def fallback_case():
        require(fallback.evaluate("window.__blockedWebGLAttempts>0"), "Labeled unavailable-WebGL fixture actually rejects GL creation")
        require("fallback" in fallback.locator("#graphics-status").inner_text().lower(), "Unavailable WebGL has a clear fallback label")
        start(fallback, touch=True)
        fallback.locator('[data-direction="left"]').tap()
        fallback.wait_for_timeout(250)
        require(fallback.evaluate("window.__PACMAN__.game.state.score>0"), "2D fallback supports ordinary scoring gameplay")
        screenshot(fallback, "fallback-touch-playing", playing=True, fixture="WebGL creation deliberately unavailable")
        fallback.locator("#pause-button").tap()
        remember_identity(fallback)
        before = snapshot(fallback, True)
        fallback.locator("#resume-button").tap()
        fallback.wait_for_selector("#resume-countdown", state="visible")
        fallback.locator('[data-direction="up"]').tap()
        expect(fallback.locator("#input-cue")).to_have_text("NEXT ↑")
        require(fallback.locator("#input-cue").inner_text() == "NEXT ↑", "Queued-turn cue works in 2D fallback during resume")
        unchanged(fallback, before, True)
        finish_resume(fallback)
        require(fallback.evaluate("window.__PACMAN__.renderer.graphicsInfo.backend==='canvas-fallback'"), "Countdown completion keeps active fallback renderer")
        return {"graphics": fallback.evaluate("window.__PACMAN__.renderer.graphicsInfo")}
    check("unavailable-WebGL fixture keeps mobile gameplay, cues, and safe resume", fallback_case)
    fallback_context.close()

    if PRODUCTION_URL:
        production_context = browser.new_context(viewport={"width": 1440, "height": 1000})
        production = production_context.new_page()
        listen(production, "production")
        load(production, PRODUCTION_URL, dev=False)

        def production_case():
            require(not production.evaluate("!!window.__PACMAN__"), "Production build exposes no DEV game or countdown surface")
            layout(production, "production-desktop-title", title=True)
            production.locator("#help-button").click()
            require(production.locator("#cues-toggle").is_checked(), "Production instructions expose play-cue preference")
            production.locator("#contrast-toggle").check()
            production.locator("#help-done").click()
            production.locator("#start-button").click()
            production.wait_for_function("/DOTS TO GO/.test(document.querySelector('#board-status').textContent)")
            production.keyboard.press("ArrowLeft")
            production.wait_for_timeout(250)
            require(int(production.locator("#score").inner_text()) > 0, "Built app scores from ordinary keyboard gameplay")
            screenshot(production, "production-desktop-playing", playing=True, dev=False)
            production.locator("#pause-button").click()
            score = production.locator("#score").inner_text()
            production.locator("#resume-button").click()
            started = time.monotonic()
            production.wait_for_selector("#resume-countdown", state="visible")
            require(production.locator("#resume-number").inner_text() == "3", "Built app starts actual three-second resume")
            production.keyboard.press("ArrowUp")
            production.wait_for_timeout(1000)
            require(production.locator("#score").inner_text() == score and production.locator("#resume-countdown").is_visible(),
                    "Built app holds score and countdown before resume")
            require(production.locator("#input-cue").inner_text() == "NEXT ↑", "Built app displays queued direction during countdown")
            production.wait_for_selector("#resume-countdown", state="hidden", timeout=9000)
            elapsed = time.monotonic() - started
            require(elapsed >= 2.8 and production.locator("#pause-label").inner_text() == "Pause", "Built app completes three-second resume and restores pause action")
            require(production.locator("body").evaluate("e=>e.classList.contains('high-contrast')"), "Built app keeps higher contrast during resumed play")
            return {"wallSeconds": round(elapsed, 3), "scoreBeforeResume": score, "productionHasDevSurface": False}
        check("production build supports ordinary gameplay, settings, queue, and actual three-second resume", production_case)
        production_context.close()
    else:
        report["limitations"].append("EXPERIENCE_PRODUCTION_URL not set; built application was not exercised by this invocation.")
    browser.close()

check("no unexpected browser console errors or page exceptions", lambda: require(not report["errors"], "All observed browser contexts have no unexpected errors"))
report["summary"] = {"passed": sum(c["passed"] for c in report["checks"]),
                     "failed": sum(not c["passed"] for c in report["checks"]),
                     "assertions": sum(len(c["assertions"]) for c in report["checks"]),
                     "layouts": len(report["layouts"]), "screenshots": len(report["screenshots"])}
(OUT / "experience-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report["summary"]), flush=True)
sys.exit(1 if report["summary"]["failed"] else 0)
