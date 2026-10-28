"""Focused capability/copy/objective/score UI checks; no real score writes.

Run against the cloud dev server: python3 tests/capability_smoke.py http://127.0.0.1:5173
All API responses are explicit HTTP fixtures. Graphics denial is injected through
getContext, including separate WebGL2-only and all-WebGL cases in every frame.
Uses installed Chromium and normal --no-sandbox container flag. Mobile is emulated.
"""
import json
import os
import re
import traceback
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
GAMES = ["pacman", "neon-rally", "reactor-breaker", "chrome-siege", "midnight-pinball", "orbit-salvage", "tidal-courier", "prism-circuit", "skybound-stack", "canopy-sprint"]
report = {"checks": [], "errors": [], "fixtures": ["Intercepted empty leaderboard, ranked tickets and result responses; no real API writes.", "Injected WebGL2-only and all-WebGL denial in every document/frame.", "DEV-only terminal fixture for score UI; no forged simulation score."], "environment": {"url": URL, "headless": True, "launchArgs": ["--no-sandbox"], "physicalPhone": False}}


def check(name, run):
    if os.environ.get("CAPABILITY_CHECK_PATTERN") and not re.search(os.environ["CAPABILITY_CHECK_PATTERN"], name):
        return
    try:
        detail = run()
        report["checks"].append({"name": name, "passed": True, "detail": detail})
        print("PASS", name, flush=True)
    except Exception as error:
        report["checks"].append({"name": name, "passed": False, "error": str(error), "trace": traceback.format_exc()})
        print("FAIL", name, traceback.format_exc(), flush=True)


def capabilities(mode):
    return """(() => {
      window.__CAPABILITY_QA__ = { webgl2Requests: 0, webgl1Requests: 0 };
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        if (kind === "webgl2") window.__CAPABILITY_QA__.webgl2Requests++;
        if (/^(webgl|experimental-webgl)$/.test(kind)) window.__CAPABILITY_QA__.webgl1Requests++;
        if (MODE === 'all' ? /^(webgl2?|experimental-webgl)$/.test(kind) : kind === 'webgl2') return null;
        return original.call(this, kind, ...args);
      };
    })();""".replace("MODE", json.dumps(mode))


def fixtures(context, offline=False):
    state = {"hold_finish": False, "pending_finish": None}
    def route_api(route):
        request = route.request
        parsed = urlparse(request.url)
        query = parse_qs(parsed.query)
        if parsed.path == "/api/leaderboards":
            data = {"game": query.get("game", ["pacman"])[0], "scope": query.get("scope", ["all"])[0], "entries": [], "updatedAt": "2026-10-28T00:00:00Z"}
            route.fulfill(status=200, json=data)
        elif parsed.path == "/api/runs" and not offline:
            body = request.post_data_json
            route.fulfill(status=201, json={"runId": "qa-capability-fixture", "seed": 1980, "game": body["game"], "ruleset": body["ruleset"], "tickRate": 60, "maxTicks": 7200, "expiresAt": "2099-01-01T00:00:00Z"})
        elif parsed.path.endswith("/finish") and not offline:
            if state["hold_finish"]:
                state["pending_finish"] = route
                return
            body = request.post_data_json
            route.fulfill(status=200, json={"accepted": True, "score": body["score"], "verified": True, "entry": {"runId": "qa-capability-fixture", "initials": body["initials"], "score": body["score"], "finishedAt": "2026-10-28T00:00:00Z", "verified": True, "rank": None}})
        else:
            route.fulfill(status=503, json={"error": {"code": "unavailable", "message": "QA fixture: global score service unavailable."}})
    context.route("**/api/**", route_api)
    return state


def ready(page):
    page.goto(URL)
    page.wait_for_selector("#arcade-home", state="visible")
    page.wait_for_function("!!window.__ARCADE__")


def geometry(page, name, playing=False):
    data = page.evaluate("""() => {
      const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&!e.closest('[hidden]')&&getComputedStyle(e).visibility!=='hidden';};
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
        controls:[...document.querySelectorAll('button,select,input')].filter(visible).map(e=>({name:e.id||e.dataset.game||e.textContent.trim().slice(0,25),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))};
    }""")
    assert data["scrollWidth"] <= data["width"] + 1, f"{name}: horizontal overflow"
    if playing:
        assert data["scrollHeight"] <= data["height"] + 1, f"{name}: play view scrolls"
    for item in data["controls"]:
        assert item["width"] >= 43.9 and item["height"] >= 43.9, f"{name}: {item} undersized control"
    return data


def home(page):
    if page.locator("#score-dialog").is_visible():
        page.locator("#result-home").click()
    else:
        page.locator("#play-home-button").click()
        if page.locator("#switch-dialog").is_visible():
            page.locator("#switch-confirm").click()
    page.wait_for_selector("#arcade-home", state="visible")


def blocked_lobby(browser, mode, width, height):
    context = browser.new_context(viewport={"width": width, "height": height}, has_touch=width < 500, device_scale_factor=2 if width < 500 else 1)
    context.add_init_script(capabilities(mode)); fixtures(context)
    page = context.new_page(); page.set_default_timeout(10000)
    page.on("pageerror", lambda error: report["errors"].append({"case": f"{mode}-{width}", "message": str(error)}))
    ready(page)
    assert page.locator("#graphics-capability").is_visible()
    assert "WebGL 2" in page.locator("#graphics-capability").inner_text()
    assert page.locator(".cabinet-capability").count() == 9
    assert page.locator(".cabinet-card").count() == 10
    assert page.locator("#leaderboard-game option").count() == 10
    assert page.locator("#leaderboard-scope").input_value() == "all"
    assert page.locator("#leaderboard-body tr").count() == 0
    artwork = page.locator("#showroom .showroom-static .static-cabinet-screen svg")
    assert artwork.is_visible() and artwork.locator("path,circle,rect,ellipse").count() >= 3
    initial = artwork.inner_html()
    page.locator("#featured-next").click()
    assert "NEON RALLY" in page.locator("#featured-caption").inner_text()
    assert artwork.inner_html() != initial, "Static artwork must follow feature selection"
    page.locator("#featured-previous").click(); page.locator("#featured-previous").click()
    assert "CANOPY SPRINT" in page.locator("#featured-caption").inner_text()
    assert page.locator("#showroom .showroom-static").inner_text().endswith("CANOPY SPRINT")
    assert "View requirements" in page.locator("#featured-play-label").inner_text()
    page.locator("#quick-play").click()
    assert "CANOPY SPRINT needs WebGL 2" in page.locator("#overlay-title").inner_text()
    home(page)
    page.locator("#featured-next").click()
    detail = geometry(page, f"{mode}-{width}-lobby")
    page.screenshot(path=str(OUT / f"capability-{mode}-{width}-lobby.png"))
    probes = page.evaluate("window.__CAPABILITY_QA__.webgl2Requests")
    page.locator('[data-game="midnight-pinball"]').click()
    page.wait_for_selector("#play-practice-button", state="visible")
    assert "needs WebGL 2" in page.locator("#overlay-title").inner_text()
    assert page.locator("#play-start-button").is_hidden()
    assert "No run started" in page.locator("#score-save-status").inner_text()
    assert page.evaluate("window.__CAPABILITY_QA__.webgl2Requests") == probes, "Unavailable cabinet must not retry Stage creation"
    page.locator("#play-practice-button").click()
    page.wait_for_function("window.__ARCADE__.pacman?.phase==='intro'")
    child = page.frame_locator("#pacman-frame")
    graphics = child.locator("#graphics-status").inner_text()
    copy = page.locator("#overlay-copy").inner_text()
    assert ("2D fallback" in copy) if "2D" in graphics else ("3D mesh" in copy), (graphics, copy)
    assert ("2D" in graphics) if mode == "all" else ("3D" in graphics), f"{mode}: WebGL1 distinction"
    detail["pacmanGraphics"] = graphics; detail["pacmanCopy"] = copy
    geometry(page, f"{mode}-{width}-pacman-intro", playing=True)
    if width < 500:
        page.set_viewport_size({"width": 844, "height": 390}); geometry(page, f"{mode}-landscape-pacman-intro", playing=True)
    context.close()
    return detail


def start_pinball(page, ranked=False):
    page.locator('[data-game="midnight-pinball"]').click()
    page.locator("#play-start-button" if ranked else "#play-practice-button").click()
    page.wait_for_function("window.__ARCADE__.controller?.phase==='playing'", timeout=15000)
    assert "Island Tour" in page.locator("#play-objective").inner_text()


def finish_fixture(page):
    page.evaluate("""() => { window.__ARCADE__.simulation.state.status = 'victory'; window.__ARCADE__.controller.finish(); }""")
    page.wait_for_selector("#score-dialog", state="visible")
    page.wait_for_timeout(500)


def normal_pinball(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 900}, has_touch=True); fixture_state = fixtures(context)
    page = context.new_page(); page.set_default_timeout(10000)
    page.on("pageerror", lambda error: report["errors"].append({"case": "normal-pinball", "message": str(error)}))
    ready(page)
    assert page.locator("#graphics-capability").is_hidden()
    assert page.locator("#showroom canvas").is_visible()
    # Lose only the live lobby context, not the discarded capability probe.
    page.evaluate("""() => { const gl = document.querySelector('#showroom canvas').getContext('webgl2'); gl.getExtension('WEBGL_lose_context').loseContext(); }""")
    page.wait_for_selector("#showroom .showroom-static .static-cabinet-screen svg", state="visible")
    assert page.locator("#showroom canvas").count() == 0
    start_pinball(page)
    assert "local" in page.locator("#score-save-status").inner_text().lower()
    page.evaluate("""() => { window.__statusMutations = 0; new MutationObserver(() => window.__statusMutations++).observe(document.querySelector('#score-save-status'), {childList:true, characterData:true, subtree:true}); }""")
    page.wait_for_timeout(400)
    assert page.evaluate("window.__statusMutations") == 0, "Stable live status must not be reassigned every HUD update"
    geometry(page, "normal-pinball-desktop", playing=True)
    page.evaluate("window.__ARCADE__.simulation.state.tilted=true")
    page.wait_for_function("document.querySelector('#play-objective').textContent.includes('TILT')")
    page.evaluate("window.__ARCADE__.simulation.state.tilted=false")
    page.wait_for_function("document.querySelector('#play-objective').textContent.includes('Island Tour')")
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(100); geometry(page, "normal-pinball-portrait", playing=True)
    page.set_viewport_size({"width": 844, "height": 390}); page.wait_for_timeout(100); geometry(page, "normal-pinball-landscape", playing=True)
    page.set_viewport_size({"width": 1280, "height": 900})
    finish_fixture(page)
    assert "local best only" in page.locator("#score-save-status").inner_text()
    assert page.locator("#initials-field").is_hidden()
    home(page); start_pinball(page, ranked=True)
    page.wait_for_function("document.querySelector('#score-save-status').textContent.includes('not posted yet')")
    assert "not posted yet" in page.locator("#score-save-status").inner_text()
    finish_fixture(page)
    assert "not saved" in page.locator("#score-save-status").inner_text()
    page.locator("#score-initials").fill("QAQ")
    fixture_state["hold_finish"] = True
    page.locator("#score-submit").click()
    page.wait_for_function("document.querySelector('#score-save-status').textContent.includes('verifying')")
    page.wait_for_timeout(500)
    assert "verifying" in page.locator("#score-save-status").inner_text()
    pending = fixture_state["pending_finish"]; assert pending
    pending.fulfill(status=503, json={"error": {"code": "unavailable", "message": "QA fixture: temporary save failure."}})
    page.wait_for_function("document.querySelector('#score-save-status').textContent.includes('not saved')")
    page.wait_for_timeout(500)
    assert "not saved" in page.locator("#score-save-status").inner_text()
    fixture_state["hold_finish"] = False
    page.locator("#score-submit").click()
    page.wait_for_function("document.querySelector('#score-save-status').textContent.includes('saved ·')")
    page.wait_for_timeout(500)
    assert "saved · available" in page.locator("#score-save-status").inner_text()
    assert page.locator("#score-submit").is_disabled()
    context.close()
    return {"localResult": "local only", "rankedResult": "pending→verifying→error→saved (HTTP fixtures)", "pinballObjective": "goals and tilt", "lobbyContextLoss": "static art restored"}


def offline_ranked(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 900}); fixtures(context, offline=True)
    page = context.new_page(); page.set_default_timeout(10000); ready(page)
    start_pinball(page, ranked=True)
    assert "local" in page.locator("#score-save-status").inner_text().lower()
    assert "GLOBAL" not in page.locator("#play-mode").inner_text()
    finish_fixture(page)
    assert "local best only" in page.locator("#score-save-status").inner_text()
    assert page.locator("#initials-field").is_hidden()
    context.close()
    return "Failed ticket falls back honestly to local practice; no global submit offered."


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        report["environment"]["browser"] = browser.version
        for mode in ["webgl2", "all"]:
            for width, height in [(1280, 900), (390, 844)]:
                check(f"{mode} denied: upfront lobby, changing static art, real Pac-Man mode, {width}px layout", lambda mode=mode, width=width, height=height: blocked_lobby(browser, mode, width, height))
        check("normal WebGL: context-loss fallback, pinball objectives/layout and durable score-saving states", lambda: normal_pinball(browser))
        check("ranked service offline: honest local fallback/result status", lambda: offline_ranked(browser))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        report["errors"].append({"case": "harness", "message": str(error)})
    finally:
        report["passed"] = bool(report["checks"]) and all(c["passed"] for c in report["checks"]) and not report["errors"]
        (OUT / ("capability-filtered-report.json" if os.environ.get("CAPABILITY_CHECK_PATTERN") else "capability-report.json")).write_text(json.dumps(report, indent=2) + "\n")
    sys.exit(0 if report["passed"] else 1)
