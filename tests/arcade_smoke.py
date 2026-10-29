"""Browser integration checks for After Hours Arcade.

Run: python tests/arcade_smoke.py http://127.0.0.1:5173
ARCADE_PRODUCTION_URL optionally checks the built bundle; ARCADE_API_URL enables
the real D1/API submission check. Chromium uses only --no-sandbox. DPR2 mobile
viewports emulate touch and rotation; they make no physical-device or GPU-speed
claim. All screenshots capture live unpaused games. Injected HTTP and rare result
states are labeled fixtures in the report. Writes ignored test-results/arcade-*.
"""
import json
import os
from pathlib import Path
import platform
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
PRODUCTION_URL = os.environ.get("ARCADE_PRODUCTION_URL")
API_URL = os.environ.get("ARCADE_API_URL")
CHECK_PATTERN = os.environ.get("ARCADE_CHECK_PATTERN")
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
GAMES = ["neon-rally", "reactor-breaker", "chrome-siege", "midnight-pinball", "orbit-salvage", "tidal-courier", "prism-circuit", "skybound-stack", "canopy-sprint"]
report = {"checks": [], "errors": [], "warnings": [], "layouts": [], "screenshots": [], "gpu": [],
          "environment": {"url": URL, "productionUrl": PRODUCTION_URL, "apiUrl": API_URL,
                          "platform": platform.platform(), "headless": True, "launchArgs": ["--no-sandbox"], "checkPattern": CHECK_PATTERN},
          "limitations": ["Headless Chromium. Touch viewports and resizing emulate layout and input, not physical phone behavior.",
                          "The actual WebGL driver is recorded. Software-rendered timing is not a hardware performance claim.",
                          "Blur and visibility cancellation are explicitly labeled browser-event fixtures.",
                          "Loading, empty, error, and populated leaderboard UI states use labeled HTTP fixtures."]}
assertions = []


def require(condition, message):
    assertions.append({"assertion": message, "passed": bool(condition)})
    assert condition, message


def check(name, run, fixture=None):
    global assertions
    if CHECK_PATTERN and not re.search(CHECK_PATTERN, name):
        return
    assertions = []
    entry = {"name": name, "assertions": assertions}
    if fixture:
        entry["fixture"] = fixture
    started = time.monotonic()
    try:
        entry.update(passed=True, detail=run())
        print("PASS", name, flush=True)
    except Exception as error:
        entry.update(passed=False, error=str(error))
        print("FAIL", name, str(error), flush=True)
    entry["durationSeconds"] = round(time.monotonic() - started, 3)
    report["checks"].append(entry)


INSTRUMENT = r"""(() => {
  const q=window.__ARCADE_QA__={contexts:[],pending:new Set(),rafRequests:0,rafFrames:0,audio:[]};
  const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>{let id;id=request(t=>{q.pending.delete(id);q.rafFrames++;callback(t);});q.pending.add(id);q.rafRequests++;return id;};
  window.cancelAnimationFrame=id=>{q.pending.delete(id);return cancel(id);};
  for(const name of ['AudioContext','webkitAudioContext']) if(window[name]) {
    const Original=window[name];window[name]=new Proxy(Original,{construct(target,args){const a=Reflect.construct(target,args);q.audio.push(a);return a;}});
  }
  const original=HTMLCanvasElement.prototype.getContext,seen=new WeakSet();
  HTMLCanvasElement.prototype.getContext=function(kind,...args){
    const gl=original.call(this,kind,...args);
    if(!gl||!/^(webgl2?|experimental-webgl)$/.test(kind)||seen.has(gl)) return gl;
    seen.add(gl);const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const r={gl,canvas:this,kind,driver:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      draws:0,indices:0,triangles:0,uploads:0,deletedBuffers:0,deletedPrograms:0,depthDraws:0,depthRange:0,lost:0,
      buffers:new Map(),bound:new Map(),names:new Map()};q.contexts.push(r);
    const wrap=(name,action)=>{const f=gl[name].bind(gl);gl[name]=function(...a){action(...a);return f(...a);};};
    wrap('bindBuffer',(target,buffer)=>r.bound.set(target,buffer));
    wrap('bufferData',(target,data)=>{r.uploads++;if(ArrayBuffer.isView(data))r.buffers.set(r.bound.get(target),new data.constructor(data));});
    wrap('deleteBuffer',()=>r.deletedBuffers++);wrap('deleteProgram',()=>r.deletedPrograms++);
    const attrib=gl.getAttribLocation.bind(gl);gl.getAttribLocation=(program,name)=>{const n=attrib(program,name);r.names.set(n,name);return n;};
    wrap('vertexAttribPointer',(index,size,type,normalized,stride,offset)=>{
      const a=r.buffers.get(r.bound.get(gl.ARRAY_BUFFER));
      if(r.names.get(index)==='position'&&size===3&&type===gl.FLOAT&&a&&(stride===0||stride===12)){
        let lo=Infinity,hi=-Infinity;for(let i=2+offset/4;i<a.length;i+=(stride||12)/4){lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);}
        r.depthRange=Math.max(r.depthRange,hi-lo);
      }
    });
    const draw=(mode,count)=>{r.draws++;r.indices+=count;if(mode===gl.TRIANGLES)r.triangles+=count/3;if(r.draws<50&&gl.isEnabled(gl.DEPTH_TEST))r.depthDraws++;};
    wrap('drawElements',(mode,count)=>draw(mode,count));
    if(gl.drawElementsInstanced)wrap('drawElementsInstanced',(mode,count,type,offset,instances)=>draw(mode,count*instances));
    const extension=gl.getExtension.bind(gl);gl.getExtension=name=>{const e=extension(name);
      if(e&&name==='WEBGL_lose_context'&&!e.__qa){e.__qa=true;const lose=e.loseContext.bind(e);e.loseContext=()=>{r.lost++;return lose();};}return e;};
    return gl;
  };
})();"""

NO_WEBGL = """(() => {
  const context=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(kind,...args){
    return /^(webgl2?|experimental-webgl)$/.test(kind)?null:context.call(this,kind,...args);
  };
})();"""

# This adapter only reads the app's DEV hook. Browser actions below always use
# actual DOM controls, keyboard events, mouse events, or browser touch dispatch.
APP = """() => {
  const a=window.__ARCADE__,c=a.controller;
  const simulation=a.simulation||c?.simulation;
  return {selection:a.selection,phase:c?.phase??a.phase,paused:c?.paused??a.paused,countdown:c?.countdown??a.countdown,
    state:simulation?.state,input:c?.input??a.input};
}"""


def listen(page, name, expected_gl_failure=False):
    page.set_default_timeout(8000)
    page.on("pageerror", lambda error: report["errors"].append({"context": name, "type": "pageerror", "message": str(error)}))

    def console(event):
        if event.type not in ("error", "warning"):
            return
        entry = {"context": name, "type": event.type, "message": event.text}
        if "INVALID_OPERATION" in event.text or "INVALID_VALUE" in event.text:
            report["errors"].append(entry)
            return
        if event.type == "warning" or "CONTEXT_LOST_WEBGL" in event.text or "status of 503" in event.text or (expected_gl_failure and "WebGL" in event.text):
            report["warnings"].append(entry)
        else:
            report["errors"].append(entry)
    page.on("console", console)


def load(page, url=URL, dev=True):
    page.goto(url)
    page.wait_for_selector("#arcade-home", state="visible")
    page.wait_for_selector('[data-game="chrome-siege"]')
    if dev:
        page.wait_for_function("!!window.__ARCADE__")


def app(page):
    return page.evaluate(APP)


def select(page, game, touch=False):
    if page.locator("#arcade-home").is_hidden():
        home(page, touch=touch)
    card = page.locator(f'[data-game="{game}"]')
    card.tap() if touch else card.click()
    page.wait_for_selector("#arcade-play", state="visible")
    if game != "pacman":
        page.wait_for_selector("#play-start-button", state="visible")


def start(page, game, touch=False, ranked=False):
    select(page, game, touch)
    button = page.locator("#play-start-button" if ranked else "#play-practice-button")
    button.tap() if touch else button.click()
    page.wait_for_function("""() => {const a=window.__ARCADE__,c=a.controller,s=a.simulation||c?.simulation;
      return s?.state.status==='playing'&&s.state.tick>2&&(c?.paused??a.paused)===false;}""")
    page.wait_for_selector("#play-overlay", state="hidden")


def home(page, touch=False):
    if page.locator("#score-dialog").is_visible():
        page.locator("#result-home").tap() if touch else page.locator("#result-home").click()
        page.wait_for_selector("#arcade-home", state="visible")
        return
    button = page.locator("#play-home-button")
    button.tap() if touch else button.click()
    if page.locator("#switch-dialog").is_visible():
        page.locator("#switch-confirm").tap() if touch else page.locator("#switch-confirm").click()
    page.wait_for_selector("#arcade-home", state="visible")


def snapshot(page):
    return page.evaluate("""() => {const a=window.__ARCADE__,s=a.simulation||a.controller?.simulation;return JSON.stringify(s?.state);}""")


def screenshot(page, name, playing=False):
    if playing:
        state = app(page)
        require(state["state"]["status"] == "playing" and state["paused"] is False,
                "Screenshot records a live unpaused simulation")
        require(page.locator("#play-overlay").is_hidden(), "Gameplay screenshot has no intro, pause, countdown, or result overlay")
    target = OUT / f"arcade-{name}.png"
    page.screenshot(path=str(target))
    report["screenshots"].append({"file": str(target), "playing": playing})


def layout(page, name, playing=False):
    result = page.evaluate("""() => {
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]');};
      const rect=e=>e.getBoundingClientRect().toJSON();
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,
        scrollHeight:document.documentElement.scrollHeight,fullscreen:!!document.fullscreenElement,
        canvas:[...document.querySelectorAll('#play-stage canvas,#pacman-frame')].filter(visible).map(rect),
        controls:[...document.querySelectorAll('button,select,input,[role=button]')].filter(visible).map(e=>{
          const r=rect(e),p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {id:e.id||e.dataset.game||e.textContent.trim().slice(0,30),...r,reachable:e===p||e.contains(p)};})};
    }""")
    result["name"] = name
    report["layouts"].append(result)
    width, height = result["width"], result["height"]
    require(result["scrollWidth"] <= width + 1, f"{name}: no horizontal page overflow")
    if playing:
        require(result["scrollHeight"] <= height + 1, f"{name}: play stage fits without vertical scrolling")
        require(len(result["canvas"]) == 1, f"{name}: exactly one visible game surface")
        for surface in result["canvas"]:
            require(surface["width"] >= 150 and surface["height"] >= 120, f"{name}: game surface has useful visible dimensions")
            require(surface["left"] >= -1 and surface["right"] <= width + 1 and surface["top"] >= -1 and surface["bottom"] <= height + 1,
                    f"{name}: full game surface is inside the viewport")
    for control in result["controls"]:
        require(control["width"] >= 43.9 and control["height"] >= 43.9, f"{name}: {control['id']} is at least 44×44 CSS pixels")
        if playing:
            require(control["left"] >= -1 and control["right"] <= width + 1 and control["top"] >= -1 and control["bottom"] <= height + 1,
                    f"{name}: {control['id']} stays inside viewport")
            require(control["reachable"], f"{name}: {control['id']} can be reached at its center")
    return result


def gpu(page, game):
    result = page.evaluate("""() => window.__ARCADE_QA__.contexts.filter(r=>r.canvas.isConnected).map(r=>({kind:r.kind,driver:r.driver,
      draws:r.draws,indices:r.indices,triangles:r.triangles,uploads:r.uploads,depthDraws:r.depthDraws,depthRange:r.depthRange,
      lost:r.lost,error:r.gl.getError(),pixels:[r.canvas.width,r.canvas.height]}))""")
    require(len(result) == 1, "One connected WebGL surface renders the selected game")
    r = result[0]
    require(r["draws"] > 10 and r["indices"] > 100 and r["triangles"] > 20,
            "Actual indexed triangle draws reached WebGL")
    require(r["uploads"] > 5 and r["depthRange"] > .1 and r["depthDraws"] > 0,
            "GPU receives three-dimensional mesh positions and depth-tested draws")
    require(r["error"] == 0, "The live WebGL context reports NO_ERROR")
    require(min(r["pixels"]) > 100, "Actual GPU framebuffer has useful resolution")
    r["game"] = game
    report["gpu"].append(r)
    return r


def hold_key(page, key, milliseconds):
    page.keyboard.down(key)
    page.wait_for_timeout(milliseconds)
    page.keyboard.up(key)


def demonstrate(page, game):
    before = app(page)["state"]
    if game == "neon-rally":
        hold_key(page, "ArrowLeft", 360)
        require(app(page)["state"]["player"]["x"] < before["player"]["x"] - .2, "Keyboard steering moves the actual vehicle")
        nitro = app(page)["state"]["player"]["nitro"]
        hold_key(page, "Space", 400)
        require(app(page)["state"]["player"]["nitro"] < nitro - 1, "Boost consumes simulation nitro")
    elif game == "reactor-breaker":
        hold_key(page, "ArrowRight", 350)
        require(app(page)["state"]["paddle"]["x"] > before["paddle"]["x"] + .2, "Keyboard moves the actual paddle")
        hold_key(page, "Space", 100)
        page.wait_for_timeout(350)
        state = app(page)["state"]
        require(len(state["balls"]) >= 1 and any(abs(ball["vy"]) > .1 for ball in state["balls"]), "Launch sends a simulated ball into play")
    elif game == "chrome-siege":
        hold_key(page, "ArrowLeft", 260)
        require(app(page)["state"]["player"]["x"] < before["player"]["x"] - .2, "Keyboard moves the actual hovercraft")
        hold_key(page, "Space", 260)
        require(len(app(page)["state"]["bullets"]) > 0, "Fire creates actual simulated projectiles")
        hold_key(page, "Shift", 100)
        require(app(page)["state"]["player"]["dashCooldown"] > 0, "Dash starts its simulation cooldown")
    elif game == "orbit-salvage":
        hold_key(page, "ArrowRight", 250)
        require(app(page)["state"]["player"]["x"] > before["player"]["x"] + .1, "Thrust accelerates actual spaceship")
        hold_key(page, "Space", 180)
        require(len(app(page)["state"]["shots"]) > 0, "Cannon creates actual projectiles")
    elif game == "tidal-courier":
        page.keyboard.down("ArrowRight")
        hold_key(page, "Space", 350)
        page.keyboard.up("ArrowRight")
        after = app(page)["state"]
        require(after["player"]["x"] > before["player"]["x"] + .1, "Steering moves actual courier boat")
        require(after["player"]["fuel"] < 98, "Boat boost spends fuel")
    elif game == "prism-circuit":
        hold_key(page, "ArrowRight", 70)
        after = app(page)["state"]
        require(after["selected"] != before["selected"], "Keyboard selects a circuit tile")
        selected = after["selected"]; rotation = after["tiles"][selected]["rotation"]
        hold_key(page, "Space", 60)
        require(app(page)["state"]["tiles"][selected]["rotation"] == (rotation + 1) % 4, "Rotate changes actual circuit")
        hold_key(page, "Shift", 60)
        require(app(page)["state"]["tiles"][selected]["rotation"] == rotation, "Undo restores circuit rotation")
    elif game == "skybound-stack":
        hold_key(page, "ArrowRight", 100)
        require(app(page)["state"]["piece"]["x"] > before["piece"]["x"], "Keyboard moves the falling shape")
        pieces = app(page)["state"]["pieces"]
        hold_key(page, "Shift", 80)
        require(app(page)["state"]["pieces"] > pieces, "Hard drop locks an actual shape")
    elif game == "canopy-sprint":
        hold_key(page, "ArrowLeft", 90)
        require(app(page)["state"]["lane"] == 0, "Keyboard changes runner lane")
        hold_key(page, "Space", 180)
        require(app(page)["state"]["height"] > .4, "Jump lifts actual runner")
    else:
        hold_key(page, "Space", 600)
        page.wait_for_timeout(200)
        require(any(ball["mode"] != "plunger" for ball in app(page)["state"]["balls"]), "Releasing a charged launch sends the actual pinball")
        page.keyboard.down("z")
        page.wait_for_timeout(160)
        require(app(page)["state"]["flippers"][0]["angle"] < -.3, "Left flipper rotates in the actual simulation")
        page.keyboard.up("z")
        page.keyboard.down("/")
        page.wait_for_timeout(160)
        require(app(page)["state"]["flippers"][1]["angle"] > 3.4, "Right flipper rotates in the actual simulation")
        page.keyboard.up("/")
    page.wait_for_timeout(180)
    require(app(page)["state"]["tick"] > before["tick"] + 10, "The live fixed-step play loop advances")


def trusted_touch(page, x, y, dx=0, dy=0, duration=250, during=None):
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    if dx or dy:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx, "y": y + dy}]})
    page.wait_for_timeout(duration)
    result = during() if during else None
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()
    return result


def touch_control(page, selector, dx=0, dy=0, duration=250, during=None):
    bounds = page.locator(selector).bounding_box()
    require(bounds is not None, f"Touch control {selector} is visible")
    return trusted_touch(page, bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2,
                         dx=dx, dy=dy, duration=duration, during=during)


def demonstrate_touch(page, game):
    before = app(page)["state"]
    if game == "neon-rally":
        touch_control(page, '[data-stick="move"]', dx=-24, duration=350)
        require(app(page)["state"]["player"]["x"] < before["player"]["x"] - .15, "Trusted touch steering moves the actual vehicle")
        nitro = app(page)["state"]["player"]["nitro"]
        touch_control(page, "#touch-primary", duration=350)
        require(app(page)["state"]["player"]["nitro"] < nitro - 1, "Holding touch boost spends actual nitro")
    elif game == "reactor-breaker":
        bounds = page.locator("#play-stage").bounding_box()
        trusted_touch(page, bounds["x"] + bounds["width"] * .72, bounds["y"] + bounds["height"] * .78,
                      dx=20, duration=250)
        require(app(page)["state"]["paddle"]["x"] > before["paddle"]["x"] + .15, "Dragging the actual touch surface positions the paddle")
        touch_control(page, "#touch-primary", duration=100)
        page.wait_for_timeout(250)
        require(any(abs(ball["vy"]) > .1 for ball in app(page)["state"]["balls"]), "Touch launch sends the simulated ball into play")
    elif game == "chrome-siege":
        touch_control(page, '[data-stick="move"]', dx=-24, duration=250)
        require(app(page)["state"]["player"]["x"] < before["player"]["x"] - .15, "Touch movement stick moves the actual hovercraft")
        held = touch_control(page, '[data-stick="aim"]', dx=15, dy=-24, duration=250, during=lambda: app(page)["state"])
        require(len(held["bullets"]) > 0 and held["player"]["aimY"] < 0, "The actual right touch stick aims and fires projectiles")
        touch_control(page, "#touch-secondary", duration=100)
        require(app(page)["state"]["player"]["dashCooldown"] > 0, "Touch dash triggers the actual cooldown")
    elif game == "orbit-salvage":
        touch_control(page, '[data-stick="move"]', dx=24, duration=250)
        require(app(page)["state"]["player"]["x"] > before["player"]["x"] + .1, "Touch thrust moves the spaceship")
        held = touch_control(page, '[data-stick="aim"]', dy=-24, duration=180, during=lambda: app(page)["state"])
        require(len(held["shots"]) > 0, "Touch aim fires cannon")
    elif game == "tidal-courier":
        touch_control(page, '[data-stick="move"]', dx=24, duration=350)
        require(app(page)["state"]["player"]["x"] > before["player"]["x"] + .1, "Touch steers actual boat")
    elif game == "prism-circuit":
        touch_control(page, '[data-stick="move"]', dx=24, duration=80)
        after = app(page)["state"]; selected = after["selected"]; rotation = after["tiles"][selected]["rotation"]
        require(selected != before["selected"], "Touch selects circuit tile")
        touch_control(page, '#touch-primary', duration=80)
        require(app(page)["state"]["tiles"][selected]["rotation"] == (rotation+1)%4, "Touch rotates actual circuit")
    elif game == "skybound-stack":
        touch_control(page, '[data-stick="move"]', dx=24, duration=100)
        require(app(page)["state"]["piece"]["x"] > before["piece"]["x"], "Touch moves actual falling shape")
        touch_control(page, '#touch-secondary', duration=80)
        require(app(page)["state"]["pieces"] > before["pieces"], "Touch drops and locks actual shape")
    elif game == "canopy-sprint":
        touch_control(page, '[data-stick="move"]', dx=-24, duration=80)
        require(app(page)["state"]["lane"] == 0, "Touch changes runner lane")
        held = touch_control(page, '#touch-primary', duration=180, during=lambda: app(page)["state"])
        require(held["height"] > .4, "Touch jump lifts runner")
    else:
        touch_control(page, "#touch-launch", duration=500)
        page.wait_for_timeout(180)
        require(any(ball["mode"] != "plunger" for ball in app(page)["state"]["balls"]), "Releasing the actual touch launch plunges the ball")
        before_tilt = app(page)["state"]["tilt"]
        nudged = touch_control(page, "#touch-nudge-left", duration=350, during=lambda: app(page)["state"])
        require(nudged["tilt"] > before_tilt + .2, "Touch nudge moves the real table and increases tilt")
        left = touch_control(page, "#touch-primary", duration=150, during=lambda: app(page)["state"])
        require(left["flippers"][0]["angle"] < -.3, "Holding the touch left flipper rotates the simulated bat")
        right = touch_control(page, "#touch-secondary", duration=150, during=lambda: app(page)["state"])
        require(right["flippers"][1]["angle"] > 3.4, "Holding the touch right flipper rotates the simulated bat")
    require(app(page)["state"]["tick"] > before["tick"] + 3, "Trusted touch actions advance the actual fixed-step play loop")


def fullscreen(page, enabled):
    page.locator("#play-fullscreen-button").click()
    page.wait_for_function("expected=>!!document.fullscreenElement===expected", arg=enabled)
    page.wait_for_timeout(120)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
        report["environment"]["browser"] = browser.version
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.add_init_script(INSTRUMENT)
        page = context.new_page()
        listen(page, "desktop")
        load(page)

        def landing():
            for game in ["pacman", *GAMES]:
                require(page.locator(f'[data-game="{game}"]').count() == 1, f"{game}: exactly one selectable game card")
            require(page.locator("#leaderboard-game").is_visible() and page.locator("#leaderboard-body").count() == 1,
                    "Global scoreboard is on the main landing page")
            require(page.locator("#leaderboard-scope").input_value() == "all", "The primary global board defaults to all time")
            require(page.locator('input[type=email],input[type=password]').count() == 0, "Guest landing does not ask for real personal information")
            layout(page, "desktop-home")
            screenshot(page, "desktop-home")
        check("landing exposes ten games and the all-time global leaderboard", landing)

        def carousel():
            page.locator('#featured-next').click()
            require('NEON RALLY' in page.locator('#hero-title').inner_text(), 'Manual next selects next featured game')
            page.locator('#featured-previous').click()
            page.locator('#featured-previous').click()
            require('CANOPY SPRINT' in page.locator('#hero-title').inner_text(), 'Previous wraps to tenth cabinet')
            page.locator('#featured-toggle').click()
            require(page.locator('#featured-toggle').get_attribute('aria-pressed') == 'true', 'Rotation can be paused explicitly')
            page.locator('#quick-play').click()
            page.wait_for_function("window.__ARCADE__.selection==='canopy-sprint'")
            home(page)
            page.locator('#featured-next').click()
        check('featured carousel wraps, pauses and launches selected cabinet', carousel)

        for game in GAMES:
            def desktop_play(game=game):
                if page.locator("#arcade-home").is_hidden():
                    home(page)
                start(page, game)
                demonstrate(page, game)
                layout(page, f"desktop-{game}", playing=True)
                detail = gpu(page, game)
                screenshot(page, f"desktop-{game}", playing=True)
                home(page)
                return detail
            check(f"{game}: actual desktop controls, 3D draws, and live screenshot", desktop_play)

        def lifecycle():
            start(page, "chrome-siege")
            page.keyboard.down("ArrowRight")
            page.wait_for_timeout(120)
            page.locator("#play-pause-button").click()
            page.keyboard.up("ArrowRight")
            page.wait_for_function("(window.__ARCADE__.controller?.paused??window.__ARCADE__.paused)===true")
            frozen = snapshot(page)
            page.wait_for_timeout(250)
            require(snapshot(page) == frozen, "Pause freezes the complete simulation")
            page.locator("#play-pause-button").click()
            page.wait_for_timeout(150)
            require(snapshot(page) == frozen, "Resume countdown freezes the complete simulation")
            page.evaluate("window.dispatchEvent(new Event('blur'))")
            page.wait_for_timeout(150)
            after_blur = snapshot(page)
            before_state, after_state = json.loads(frozen), json.loads(after_blur)
            changed = [key for key in before_state if before_state[key] != after_state.get(key)]
            require(after_blur == frozen, f"Blur cancels a pending resume without advancing simulation (before tick {before_state['tick']}, after {after_state['tick']}; changed {changed})")
            page.locator("#play-pause-button").click()
            page.wait_for_function("(window.__ARCADE__.controller?.paused??window.__ARCADE__.paused)===false", timeout=7000)
            before = app(page)["state"]["player"]["x"]
            page.wait_for_timeout(200)
            require(abs(app(page)["state"]["player"]["x"] - before) < .01, "Pause and blur clear held movement input")
            fullscreen(page, True)
            layout(page, "desktop-fullscreen", playing=True)
            fullscreen(page, False)
            page.locator("#play-restart-button").click()
            if page.locator("#switch-dialog").is_visible():
                page.locator("#switch-confirm").click()
            page.wait_for_function("(window.__ARCADE__.simulation||window.__ARCADE__.controller?.simulation)?.state.tick<20")
            require(app(page)["state"]["score"] == 0, "Restart resets score through the actual controller")
            home(page)
            q = page.evaluate("""() => ({pending:window.__ARCADE_QA__.pending.size,
              connected:window.__ARCADE_QA__.contexts.filter(r=>r.canvas.isConnected).length,
              gameSurfaces:document.querySelectorAll('#play-stage canvas').length,
              contexts:window.__ARCADE_QA__.contexts.map(r=>({connected:r.canvas.isConnected,lost:r.lost,deletedBuffers:r.deletedBuffers,deletedPrograms:r.deletedPrograms})),
              audio:window.__ARCADE_QA__.audio.map(a=>a.state)})""")
            require(q["gameSurfaces"] == 0 and q["connected"] <= 1, "Returning home removes every game WebGL surface and retains only the cabinet showroom")
            require(q["pending"] <= 1, "Returning home leaves at most one shell animation callback")
            require(all(c["deletedBuffers"] > 0 and c["deletedPrograms"] > 0 for c in q["contexts"] if not c["connected"]),
                    "Every switched-out Three stage disposes GPU buffers and shader programs")
            require(all(state in ("closed", "suspended") for state in q["audio"]), "The menu leaves no running game audio context")
            require(sum(state != "closed" for state in q["audio"]) <= 1, "Repeated game switches retain at most one reusable audio context")
            return q
        check("pause, safe resume, blur, fullscreen, restart, and switch cleanup", lifecycle,
              fixture="Browser blur event dispatched to exercise interruption cancellation")

        def victory_fixture_and_replay():
            start(page, "chrome-siege")
            # Labeled DEV fixture for a rare terminal branch. No fake score is
            # added, no ranked ticket exists, and no request reaches the API.
            page.evaluate("""() => {const a=window.__ARCADE__;const s=a.simulation||a.controller?.simulation;
              s.state.status='victory';}""")
            page.wait_for_selector("#score-dialog", state="visible")
            require(app(page)["phase"] == "ended", "Controller stops its simulation on victory and opens results")
            require(page.locator("#initials-field").is_hidden(), "A local practice result does not offer a global score submission")
            page.locator("#result-again").click()
            page.wait_for_selector("#score-dialog", state="hidden")
            page.wait_for_function("""() => {const a=window.__ARCADE__,c=a.controller,s=a.simulation||c?.simulation;
              return s?.state.status==='playing'&&s.state.tick>2&&(c?.paused??a.paused)===false;}""", timeout=9000)
            require(app(page)["state"]["score"] == 0 and app(page)["state"]["tick"] < 60,
                    "One more round creates a fresh run and resumes through the actual controller")
            home(page)
        check("victory results and one-more-round replay", victory_fixture_and_replay,
              fixture="DEV terminal-status fixture only; no score change or ranked API submission")

        def context_recovery():
            start(page, "reactor-breaker")
            page.evaluate("""() => {const r=window.__ARCADE_QA__.contexts.findLast(r=>r.canvas.isConnected);
              window.__arcadeContextFault=r.gl.getExtension('WEBGL_lose_context');window.__arcadeContextFault.loseContext();}""")
            page.wait_for_function("(window.__ARCADE__.controller?.phase??window.__ARCADE__.phase)==='unavailable'")
            frozen = snapshot(page)
            page.wait_for_timeout(220)
            require(snapshot(page) == frozen, "An actual WebGL context loss freezes simulation state")
            require("graphics" in page.locator("#overlay-title").inner_text().lower(), "Graphics interruption is explicitly identified")
            page.evaluate("window.__arcadeContextFault.restoreContext()")
            page.wait_for_function("(window.__ARCADE__.controller?.phase??window.__ARCADE__.phase)==='paused'", timeout=10000)
            require(snapshot(page) == frozen, "Restoring WebGL preserves the same simulation and waits for deliberate resume")
            page.locator("#play-resume-button").click()
            page.wait_for_function("(window.__ARCADE__.controller?.paused??window.__ARCADE__.paused)===false", timeout=9000)
            page.wait_for_timeout(120)
            gpu(page, "restored-reactor-breaker")
            home(page)
        check("actual WebGL context loss, frozen recovery, and deliberate resume", context_recovery,
              fixture="WEBGL_lose_context fault injection; actual loss/restoration events")

        def legacy():
            select(page, "pacman")
            frame = page.frame_locator("#pacman-frame")
            frame.locator("#start-button").wait_for(state="visible")
            require(page.locator("#pacman-frame").get_attribute("src").split("?")[0].endswith("pacman.html"), "Pac-Man uses the preserved standalone application")
            page.locator("#play-practice-button").click()
            page.wait_for_selector("#play-overlay", state="hidden")
            frame.locator("#start-button").click()
            frame.locator("#title-overlay").wait_for(state="hidden")
            page.wait_for_timeout(2300)
            before = page.evaluate("""() => {const s=document.querySelector('#pacman-frame').contentWindow.__PACMAN__.game.state;
              return {time:s.time,score:s.score,paused:s.paused,phase:s.phase};}""")
            frame.locator("#game-canvas").click()
            page.keyboard.press("ArrowLeft")
            page.wait_for_timeout(350)
            after = page.evaluate("""() => {const s=document.querySelector('#pacman-frame').contentWindow.__PACMAN__.game.state;
              return {time:s.time,score:s.score,paused:s.paused,phase:s.phase};}""")
            require(frame.locator("#game-canvas").is_visible() and not after["paused"] and after["time"] > before["time"],
                    "Trusted iframe focus and keyboard input keep the original Pac-Man simulation playing")
            screenshot(page, "pacman-iframe")
            home(page)
            require(page.locator("#pacman-frame").count() == 0, "Leaving Pac-Man destroys its iframe and owned loops")
        check("fifth game opens and leaves the playable preserved Pac-Man iframe", legacy)

        def dev_ranked_proxy():
            select(page, "chrome-siege")
            with page.expect_response(lambda response: response.url.endswith("/api/runs") and response.request.method == "POST") as issued_response:
                page.locator("#play-start-button").click()
            issued = issued_response.value
            require(issued.status == 201, "An actual browser Origin reaches the ranked Worker through the Vite proxy")
            ticket = issued.json()
            page.wait_for_function("window.__ARCADE__.controller?.ranked?.runId!==undefined")
            require(page.evaluate("window.__ARCADE__.controller.ranked.runId") == ticket["runId"],
                    "The development UI keeps its real server-issued ranked ticket")
            home(page)
            return {"runId": ticket["runId"], "game": ticket["game"]}
        check("development browser obtains a ranked ticket through the same-origin API proxy", dev_ranked_proxy)

        def unsupported_graphics():
            blocked_context = browser.new_context(viewport={"width": 1280, "height": 900})
            blocked_context.add_init_script(NO_WEBGL)
            blocked = blocked_context.new_page()
            listen(blocked, "WebGL-unavailable-fixture", expected_gl_failure=True)
            load(blocked)
            blocked.locator('[data-game="neon-rally"]').click()
            blocked.wait_for_function("document.querySelector('#overlay-title').textContent.toLowerCase().includes('webgl 2')")
            require(blocked.locator("#play-stage canvas").count() == 0, "A 3D game with no WebGL reports unavailable without substituting a flat game")
            require(blocked.evaluate("window.__ARCADE__.controller===null&&window.__ARCADE__.simulation===null"), "Unsupported graphics never creates an invisible simulation")
            home(blocked)
            select(blocked, "pacman")
            legacy_frame = blocked.frame_locator("#pacman-frame")
            legacy_frame.locator("#start-button").wait_for(state="visible")
            require("2d" in legacy_frame.locator("#graphics-status").inner_text().lower(), "Preserved Pac-Man explicitly labels its playable 2D fallback")
            blocked_context.close()
        check("unsupported WebGL explicitly disables 3D while preserving labeled Pac-Man fallback", unsupported_graphics,
              fixture="getContext returns null for WebGL in this isolated browser context")

        # Response fixtures deliberately exercise asynchronous UI states without
        # putting invented records into the application or its public database.
        def leaderboard_fixtures():
            if page.locator("#arcade-home").is_hidden():
                home(page)
            pending = []
            page.route("**/api/leaderboards?**", lambda route: pending.append(route))
            page.locator("#leaderboard-refresh").click()
            page.wait_for_function("document.querySelector('#leaderboard-state').textContent.toLowerCase().match(/load|fetch|connect/)")
            page.wait_for_timeout(80)
            require(len(pending) == 1, "Refresh issues one leaderboard request")
            pending.pop().fulfill(json={"game": "chrome-siege", "scope": "all", "entries": [], "updatedAt": "2026-10-25T00:00:00.000Z"})
            page.wait_for_function("document.querySelector('#leaderboard-state').textContent.toLowerCase().match(/empty|first|no (runs|scores)/)")
            require(page.locator("#leaderboard-body tr").count() == 0, "An empty response shows no invented score rows")
            page.locator("#leaderboard-refresh").click()
            page.wait_for_timeout(50)
            pending.pop().fulfill(status=503, json={"error": {"code": "database_unavailable", "message": "Global leaderboards are temporarily unavailable. Please try again later."}})
            page.wait_for_function("document.querySelector('#leaderboard-state').textContent.toLowerCase().match(/unavailable|retry|try again/)")
            page.locator("#leaderboard-game").select_option("chrome-siege")
            if not pending:
                page.locator("#leaderboard-refresh").click()
            page.wait_for_timeout(50)
            for route in pending[:]:
                route.fulfill(json={"game": "chrome-siege", "scope": "all", "entries": [
                    {"rank": 1, "initials": "QAT", "score": 4321, "runId": "fixture-a", "finishedAt": "2026-10-25T00:00:00.000Z", "verified": True},
                    {"rank": 2, "initials": "QAT", "score": 1234, "runId": "fixture-b", "finishedAt": "2026-10-25T00:00:01.000Z", "verified": True}], "updatedAt": "2026-10-25T00:00:02.000Z"})
            pending.clear()
            page.wait_for_function("document.querySelectorAll('#leaderboard-body tr').length===2")
            require(page.locator("#leaderboard-body").inner_text().count("QAT") == 2, "Duplicate three-letter initials are display names, not unique accounts")
            page.locator("#leaderboard-scope").select_option("daily")
            page.wait_for_timeout(50)
            require(any("scope=daily" in route.request.url for route in pending), "Daily board uses a scoped API request")
            for route in pending:
                route.fulfill(json={"game": "chrome-siege", "scope": "daily", "entries": [], "updatedAt": "2026-10-25T00:00:03.000Z"})
            page.unroute("**/api/leaderboards?**")
            page.locator("#leaderboard-scope").select_option("all")
        check("leaderboard loading, empty, unavailable, duplicate initials, and daily UI", leaderboard_fixtures,
              fixture="HTTP response fixtures; records are not saved to the database")

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        mobile.add_init_script(INSTRUMENT)
        phone = mobile.new_page()
        listen(phone, "mobile-DPR2")
        load(phone)
        def mobile_landing():
            detail = layout(phone, "mobile-home")
            screenshot(phone, "mobile-home")
            return detail
        check("390px touch landing fits ten games and leaderboard", mobile_landing)

        def touch_resume_guard():
            start(phone, "chrome-siege", touch=True)
            phone.locator("#play-pause-button").tap()
            phone.wait_for_function("window.__ARCADE__.controller.phase==='paused'")
            frozen = snapshot(phone)
            phone.locator("#play-resume-button").tap()
            phone.wait_for_function("window.__ARCADE__.controller.phase==='countdown'")
            bounds = phone.locator("#play-stage").bounding_box()
            trusted_touch(phone, bounds["x"] + bounds["width"] * .15, bounds["y"] + bounds["height"] * .2,
                          dx=28, duration=60)
            phone.locator("#play-keep-paused").tap()
            phone.wait_for_function("window.__ARCADE__.controller.phase==='paused'&&window.__ARCADE__.controller.countdown===0")
            require(snapshot(phone) == frozen, "Trusted touch cancellation after a swipe preserves the complete simulation")
            phone.evaluate("""() => {
              document.querySelector('#play-keep-paused').dispatchEvent(new MouseEvent('click',
                {bubbles:true,cancelable:true,detail:1}));
              document.querySelector('#play-resume-button').dispatchEvent(new PointerEvent('click',
                {bubbles:true,cancelable:true,detail:1,pointerType:'touch'}));
            }""")
            require(app(phone)["phase"] == "paused" and snapshot(phone) == frozen,
                    "Labeled duplicate and retargeted compatibility-click fixtures cannot restart the countdown")
            phone.locator("#play-resume-button").focus()
            phone.keyboard.press("Enter")
            phone.wait_for_function("window.__ARCADE__.controller.phase==='countdown'")
            require(snapshot(phone) == frozen, "Keyboard activation still starts a legitimate frozen resume countdown")
            phone.locator("#play-keep-paused").tap()
            phone.wait_for_function("window.__ARCADE__.controller.phase==='paused'")
            phone.locator("#play-resume-button").tap()
            phone.wait_for_function("window.__ARCADE__.controller.phase==='playing'", timeout=9000)
            require(app(phone)["state"]["status"] == "playing", "A fresh deliberate touch resumes play through the guarded button")
            home(phone, touch=True)
        check("touch Keep paused rejects retargeted compatibility clicks and allows deliberate resume", touch_resume_guard,
              fixture="Positive-detail late compatibility-click fixtures after actual trusted touch cancellation")
        for game in GAMES:
            def mobile_play(game=game):
                if phone.locator("#arcade-home").is_hidden():
                    home(phone, touch=True)
                start(phone, game, touch=True)
                phone.wait_for_timeout(250)
                layout(phone, f"portrait-{game}", playing=True)
                demonstrate_touch(phone, game)
                screenshot(phone, f"mobile-{game}", playing=True)
                gpu(phone, game)
                phone.set_viewport_size({"width": 844, "height": 390})
                phone.wait_for_timeout(180)
                layout(phone, f"landscape-{game}", playing=True)
                screenshot(phone, f"landscape-{game}", playing=True)
                home(phone, touch=True)
                phone.set_viewport_size({"width": 390, "height": 844})
            check(f"{game}: DPR2 touch start, portrait and landscape live 3D surface", mobile_play)
        mobile.close()

        if PRODUCTION_URL:
            def production():
                built = context.new_page()
                listen(built, "production")
                load(built, PRODUCTION_URL, dev=False)
                require(built.evaluate("typeof window.__ARCADE__==='undefined'"), "Production bundle exposes no arcade simulation inspection hook")
                built.locator('[data-game="chrome-siege"]').click()
                built.locator("#play-practice-button").click()
                built.wait_for_selector("#play-overlay", state="hidden", timeout=9000)
                built.wait_for_timeout(300)
                gpu(built, "production-chrome-siege")
                require(built.evaluate("typeof window.__ARCADE__==='undefined'"), "Playing production still exposes no DEV inspection hook")
                built.close()
            check("built production bundle plays 3D without DEV hooks", production)
        if API_URL:
            def real_ranked_run():
                # Production UI and real Worker/D1. No clock or state fixtures:
                # ordinary no-input Chrome Siege naturally ends in a short run.
                ranked_context = browser.new_context(viewport={"width": 1280, "height": 900})
                ranked = ranked_context.new_page()
                listen(ranked, "real-Worker-D1")
                load(ranked, API_URL, dev=False)
                ranked.locator('[data-game="chrome-siege"]').click()
                with ranked.expect_response(lambda response: response.url.endswith("/api/runs") and response.request.method == "POST") as issued_response:
                    ranked.locator("#play-start-button").click()
                issued = issued_response.value
                require(issued.status == 201, "Actual ranked UI obtains its seed and run ID from the Worker")
                run = issued.json()
                require(run["game"] == "chrome-siege" and isinstance(run["seed"], int), "Real run ticket identifies the selected game and server seed")
                ranked.wait_for_selector("#play-overlay", state="hidden", timeout=12000)
                ranked.wait_for_selector("#score-dialog", state="visible", timeout=60000)
                field = ranked.locator("#score-initials")
                require(field.get_attribute("maxlength") == "3", "Ranked result entry allows exactly three initials")
                field.fill("Q4")
                require(not field.evaluate("e=>e.checkValidity()"), "Result form rejects a short or nonletter display name")
                field.fill("QAQ")
                require(field.evaluate("e=>e.checkValidity()"), "Three uppercase initials are accepted without an account")
                with ranked.expect_response(lambda response: f"/api/runs/{run['runId']}/finish" in response.url) as accepted_response:
                    ranked.locator("#score-submit").click()
                accepted_http = accepted_response.value
                accepted = accepted_http.json()
                require(accepted_http.ok and accepted.get("accepted") is True and accepted.get("verified") is True,
                        f"Real Worker replays and accepts the naturally completed run: {accepted}")
                entry = accepted["entry"]
                require(entry["initials"] == "QAQ" and entry["runId"] == run["runId"], "Saved global row uses the actual server run ID and guest initials")
                require(entry["score"] == accepted["score"], "Displayed result score matches server replay verification")
                request = accepted_http.request.post_data_json
                require(request["frames"] > 1 and isinstance(request["inputs"], list), "Client submits real frame count and compressed input replay")
                ranked_context.close()
                fresh_context = browser.new_context(viewport={"width": 1280, "height": 900})
                fresh = fresh_context.new_page()
                listen(fresh, "fresh-global-reader")
                load(fresh, API_URL, dev=False)
                fresh.locator("#leaderboard-game").select_option("chrome-siege")
                fresh.locator("#leaderboard-refresh").click()
                fresh.wait_for_function("document.querySelector('#leaderboard-body').textContent.includes('QAQ')", timeout=10000)
                require(fresh.locator("#leaderboard-body").inner_text().count("QAQ") >= 1,
                        "A separate browser context sees the accepted result on the landing page")
                for scope in ["all", "daily"]:
                    response = fresh_context.request.get(f"{API_URL.rstrip('/')}/api/leaderboards?game=chrome-siege&scope={scope}")
                    require(response.ok, f"Real {scope} leaderboard responds successfully")
                    rows = response.json()["entries"]
                    require(any(row["runId"] == run["runId"] and row["verified"] is True for row in rows),
                            f"Real {scope} leaderboard includes the replay-verified run")
                screenshot(fresh, "real-global-score")
                fresh_context.close()
                return {"runId": run["runId"], "frames": request["frames"], "inputChanges": len(request["inputs"]),
                        "score": accepted["score"], "verified": accepted["verified"]}
            check("real Worker/D1 ranked death, replay submission, and cross-context global persistence", real_ranked_run)
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        report["errors"].append({"context": "harness", "type": type(error).__name__, "message": str(error)})
        print("FAIL harness", str(error), flush=True)
    finally:
        report["passed"] = all(check["passed"] for check in report["checks"]) and not report["errors"]
        target = OUT / ("arcade-filtered-report.json" if CHECK_PATTERN else "arcade-report.json")
        target.write_text(json.dumps(report, indent=2) + "\n")
        print(f"Report: {target}", flush=True)
    sys.exit(0 if report["passed"] else 1)
