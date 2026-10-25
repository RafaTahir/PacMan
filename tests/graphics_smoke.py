"""Real WebGL mesh, graceful fallback, and responsive rendering checks.

Run: python tests/graphics_smoke.py [http://127.0.0.1:5173]
Optional GRAPHICS_PRODUCTION_URL checks the built app without DEV inspection.
Uses default headless Chromium, with only --no-sandbox in the cloud environment.
The report states the actual GL renderer; software results are not device claims.
Indexed GPU uploads/draws and readPixels verify meshes independently of screenshots.
Rare visual states use isolated render fixtures; ordinary pellet consumption uses
keyboard input against the live game. Writes ignored test-results/graphics-* files.
"""
import base64
import json
import os
from pathlib import Path
import platform
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
PRODUCTION_URL = os.environ.get("GRAPHICS_PRODUCTION_URL")
OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
report = {"checks": [], "errors": [], "expectedWarnings": [], "layouts": [], "performance": {},
          "environment": {"url": URL, "productionUrl": PRODUCTION_URL,
                          "platform": platform.platform(), "headless": True,
                          "launchArgs": ["--no-sandbox"], "hardwareMobile": False}}


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
    page.set_default_timeout(7000)
    page.on("pageerror", lambda error: report["errors"].append({"context": name, "type": "pageerror", "message": str(error)}))

    def console(event):
        if event.type not in ("warning", "error"):
            return
        entry = {"context": name, "type": event.type, "message": event.text}
        # Chromium may warn about its software GL implementation. The environment
        # records the actual driver, and this warning is retained in the report.
        if event.type == "warning" or "CONTEXT_LOST_WEBGL" in event.text:
            report["expectedWarnings"].append(entry)
        else:
            report["errors"].append(entry)
    page.on("console", console)


GL_SPY = r"""(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const inspected = new WeakSet();
  window.__GLQA__ = { contexts: [], attempts: [] };
  HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
    const gl = getContext.call(this, kind, ...args);
    if (!/^(webgl2?|experimental-webgl)$/.test(kind)) return gl;
    window.__GLQA__.attempts.push({kind, acquired: !!gl});
    if (!gl || inspected.has(gl)) return gl;
    inspected.add(gl);
    const record = {gl, canvas: this, kind, drawCalls: 0, indices: 0,
      arrayDrawCalls: 0, uploads: 0, buffers: new Map(), bindings: new Map(),
      attributes: [], names: new Map(), shaders: [], lastDraw: null};
    window.__GLQA__.contexts.push(record);
    const wrap = (name, action) => {
      const original = gl[name].bind(gl);
      gl[name] = function(...values) { action(...values); return original(...values); };
    };
    wrap('bindBuffer', (target, buffer) => record.bindings.set(target, buffer));
    wrap('bufferData', (target, data) => {
      record.uploads++;
      const buffer = record.bindings.get(target);
      if (buffer && ArrayBuffer.isView(data)) record.buffers.set(buffer, {target, data: new data.constructor(data)});
    });
    wrap('bufferSubData', (target, offset, data) => {
      const buffer = record.buffers.get(record.bindings.get(target));
      if (buffer && ArrayBuffer.isView(data)) new Uint8Array(buffer.data.buffer).set(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
    });
    const getAttribLocation = gl.getAttribLocation.bind(gl);
    gl.getAttribLocation = function(program, name) { const location=getAttribLocation(program,name);
      record.names.set(location,name); return location; };
    wrap('vertexAttribPointer', (index,size,type,normalized,stride,offset) => {
      record.attributes.push({index,size,type,stride,offset,buffer:record.bindings.get(gl.ARRAY_BUFFER)});
    });
    wrap('shaderSource', (shader,source) => record.shaders.push(source));
    wrap('drawElements', (mode,count,type,offset) => {
      record.drawCalls++; record.indices += count;
      record.lastDraw={mode,count,type,offset};
    });
    wrap('drawArrays', () => record.arrayDrawCalls++);
    return gl;
  };
})();"""

NO_WEBGL = r"""(() => {
  const getContext=HTMLCanvasElement.prototype.getContext;
  window.__blockedWebGLAttempts = 0;
  HTMLCanvasElement.prototype.getContext=function(kind,...args) {
    if (/^(webgl2?|experimental-webgl)$/.test(kind)) {
      window.__blockedWebGLAttempts++; return null;
    }
    return getContext.call(this,kind,...args);
  };
})();"""

# These helpers inspect bytes read from the GPU framebuffer, not the main 2D
# canvas. All coordinates below use the renderer's unchanged 28x31 board space.
VISUAL_HELPERS = r"""(() => {
  const app=window.__PACMAN__, renderer=app.renderer;
  const original=renderer.render;
  const source=app.game.state;
  const base=()=>({...source,phase:'playing',phaseTime:0,paused:true,time:0,
    pellets:new Set(),energizers:new Set(),fruit:null,popups:[],ghosts:[],
    pacman:{...source.pacman,x:-100,y:-100,moving:true,dir:'right'}});
  window.__meshFixture={base,original,state:null};
  renderer.render=function(state,options) {
    return original.call(this,window.__meshFixture.state||state,options);
  };
  window.__meshCapture=(spec={})=>{
    const f=window.__meshFixture;
    const s=base();
    Object.assign(s,spec);
    if(spec.pacman) s.pacman={...source.pacman,...spec.pacman};
    s.pellets=new Set(spec.pellets||[]); s.energizers=new Set(spec.energizers||[]);
    s.ghosts=(spec.ghosts||[]).map(g=>({...source.ghosts[0],...g}));
    f.state=s;
    const record=window.__GLQA__.contexts.find(r=>r.canvas===renderer.meshCanvas);
    const prior={draws:record.drawCalls,indices:record.indices};
    original.call(renderer,s,{reducedMotion:!!spec.reducedMotion});
    const gl=record.gl,w=record.canvas.width,h=record.canvas.height;
    const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
    let pixels=0,sumX=0,sumY=0,red=0,green=0,blue=0,body=0,br=0,bg=0,bb=0;
    let minX=w,minY=h,maxX=-1,maxY=-1,hash=2166136261;
    const scale=w/(28*24);
    const center=spec.center||[14*24,15.5*24];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const p=((h-y-1)*w+x)*4,a=data[p+3];
      if(a>96) {pixels++;sumX+=x;sumY+=y;red+=data[p];green+=data[p+1];blue+=data[p+2];
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        // Lower body excludes raised ghost eyes and samples actual body lighting.
        if(Math.abs(x-center[0]*scale)<8*scale&&y>(center[1]+3)*scale&&y<(center[1]+8)*scale) {
          body++;br+=data[p];bg+=data[p+1];bb+=data[p+2];
        }
      }
      hash=Math.imul(hash^data[p],16777619);hash=Math.imul(hash^data[p+1],16777619);
      hash=Math.imul(hash^data[p+2],16777619);hash=Math.imul(hash^a,16777619);
    }
    const sample=(x,y)=>{
      const xx=Math.max(0,Math.min(w-1,Math.round(x*scale))),yy=Math.max(0,Math.min(h-1,Math.round(y*scale)));
      return [...data.slice(((h-yy-1)*w+xx)*4,((h-yy-1)*w+xx)*4+4)];
    };
    return {pixels,hash:hash>>>0,centroid:pixels?[sumX/pixels/scale,sumY/pixels/scale]:null,
      bounds:[minX/scale,minY/scale,maxX/scale,maxY/scale],
      mean:pixels?[red/pixels,green/pixels,blue/pixels]:[0,0,0],
      bodyMean:body?[br/body,bg/body,bb/body]:[0,0,0],bodyPixels:body,
      samples:(spec.samples||[]).map(([x,y])=>sample(x,y)),
      gpu:{drawCalls:record.drawCalls-prior.draws,indices:record.indices-prior.indices,error:gl.getError()},
      diagnostics:renderer.graphicsInfo,width:w,height:h};
  };
  window.__meshSave=()=>renderer.meshCanvas.toDataURL('image/png');
})();"""


def load(page, url=URL, dev=True):
    page.goto(url)
    if dev:
        page.wait_for_function("window.__PACMAN__ !== undefined && window.__PACMAN__.renderer.graphicsInfo !== undefined")
    else:
        page.wait_for_selector("#graphics-status")
    page.wait_for_timeout(150)


def save_mesh(page, name):
    encoded = page.evaluate("window.__meshSave()").split(",", 1)[1]
    (OUT / f"graphics-{name}.png").write_bytes(base64.b64decode(encoded))


def capture(page, spec):
    return page.evaluate("spec=>window.__meshCapture(spec)", spec)


def snapshot(page):
    return page.evaluate("""()=>{const a=window.__PACMAN__,s=a.game.state;
      return {activePlayer:a.activePlayer,state:{...s,pellets:[...s.pellets].sort(),energizers:[...s.energizers].sort()}};}""")


def preserve(page, before):
    require(snapshot(page) == before, "Rendering/view transition changed live gameplay state")
    require(page.evaluate("""()=>{const a=window.__graphicsIdentity,b=window.__PACMAN__;
      return a.game===b.game&&a.state===b.game.state&&a.games===b.games&&a.renderer===b.renderer&&
        a.canvas===document.querySelector('#game-canvas')&&a.meshCanvas===b.renderer.meshCanvas;}"""),
            "Rendering/view transition replaced live game, state, renderer, or canvas")


def layout(page, name):
    result = page.evaluate("""()=>{const c=document.querySelector('#game-canvas'),m=window.__PACMAN__.renderer.meshCanvas;
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
        scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
        canvas:c.getBoundingClientRect().toJSON(),pixels:[c.width,c.height],meshPixels:[m.width,m.height],
        fullscreen:!!document.fullscreenElement,graphics:window.__PACMAN__.renderer.graphicsInfo,
        controls:[...document.querySelectorAll('.scoreboard,.machine-footer,.game-toolbar button,[data-direction]')]
          .filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height)
          .map(e=>({id:e.id||e.dataset.direction||e.className,...e.getBoundingClientRect().toJSON()}))};}""")
    result["name"] = name
    report["layouts"].append(result)
    w, h, c = result["width"], result["height"], result["canvas"]
    require(result["scrollWidth"] <= w + 1 and result["scrollHeight"] <= h + 1, f"Overflow: {result}")
    require(c["left"] >= -1 and c["right"] <= w + 1 and c["top"] >= -1 and c["bottom"] <= h + 1,
            f"Board cropped: {result}")
    require(abs(c["width"] / c["height"] - 28 / 31) < .005, "Maze aspect ratio changed")
    scale = result["graphics"]["renderScale"]
    require(.5 <= scale <= 1, f"Invalid adaptive GPU raster scale: {result}")
    require(result["meshPixels"] == result["graphics"]["renderPixels"], f"Reported GPU dimensions differ: {result}")
    require(all(abs(actual-full*scale) <= 1 for actual,full in zip(result["meshPixels"], result["pixels"])),
            f"Adaptive GPU dimensions do not follow the sharp 2D canvas: {result}")
    require(result["graphics"]["available"], f"Responsive view lost WebGL: {result}")
    for control in result["controls"]:
        require(control["left"] >= -1 and control["right"] <= w + 1 and control["top"] >= -1 and control["bottom"] <= h + 1,
                f"Control outside viewport: {control}")
    return result


def fullscreen(page, enabled, touch=False):
    button = page.locator("#fullscreen-button")
    button.tap() if touch else button.click()
    page.wait_for_function("v=>!!document.fullscreenElement===v", arg=enabled)
    page.wait_for_timeout(120)
    require(button.get_attribute("aria-pressed") == str(enabled).lower(), "Fullscreen action out of sync")


def performance_sample(page, name):
    previous_state = snapshot(page)
    data = page.evaluate("""async()=>{
      const renderer=window.__PACMAN__.renderer,original=renderer.render,costs=[],intervals=[];
      // The actual engine stays paused. An animated render fixture exercises the
      // active renderer's adaptive raster budget without advancing gameplay.
      const state={...window.__PACMAN__.game.state,phase:'playing',paused:false};
      const startTime=performance.now(),baseTime=state.time;
      const initialGraphics=renderer.graphicsInfo;
      let sampling=false;
      renderer.render=function(_state,options){state.time=baseTime+(performance.now()-startTime)/1000;
        const start=performance.now();const value=original.call(this,state,options);
        if(sampling)costs.push(performance.now()-start);return value;};
      const frames=count=>new Promise(resolve=>{let n=0;function frame(){
        if(++n<count)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
      let previous=0;
      try{await frames(240);sampling=true;
        await new Promise(resolve=>{function frame(t){if(previous)intervals.push(t-previous);previous=t;
          if(intervals.length<120)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});}
      finally{renderer.render=original;}
      const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
      const gl=window.__GLQA__.contexts[0].gl,ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {warmupFrames:240,frames:intervals.length,renderCalls:costs.length,
        meanFrameMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p95FrameMs:percentile(intervals,.95),
        framesOver34ms:intervals.filter(x=>x>34).length,
        meanRenderMs:costs.reduce((a,b)=>a+b,0)/costs.length,p95RenderMs:percentile(costs,.95),
        initialGraphics,graphics:renderer.graphicsInfo,
        canvasPixels:[document.querySelector('#game-canvas').width,document.querySelector('#game-canvas').height],
        meshPixels:[renderer.meshCanvas.width,renderer.meshCanvas.height],
        dpr:devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,
        renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        gpuTimerQueryAvailable:!!(gl.getExtension('EXT_disjoint_timer_query')||gl.getExtension('EXT_disjoint_timer_query_webgl2'))};
    }""")
    require(data["frames"] == 120 and data["renderCalls"] >= 100, f"Insufficient frame sample: {data}")
    require(data["graphics"]["drawCalls"] > 0 and data["graphics"]["submittedTriangles"] > 0,
            "Frame sample submitted no real mesh triangles")
    require(snapshot(page) == previous_state, "Adaptive rendering benchmark changed live gameplay state")
    page.screenshot(path=str(OUT / f"graphics-{name}-steady.png"),
                    style="#pause-overlay { visibility: hidden !important; }")
    report["performance"][name] = data
    return data


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
                                         args=["--no-sandbox"])
    report["environment"]["browser"] = browser.version
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script(GL_SPY)
    page = context.new_page()
    listen(page, "desktop-webgl")
    load(page)

    def gpu_proof():
        data = page.evaluate("""()=>{
          const renderer=window.__PACMAN__.renderer,canvas=renderer.meshCanvas;
          const record=window.__GLQA__.contexts.find(r=>r.canvas===canvas);
          if(!record)return {graphics:renderer.graphicsInfo,contexts:window.__GLQA__.contexts.length};
          const gl=record.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');
          const positions=[];
          for(const a of record.attributes){
            if(!/position/i.test(record.names.get(a.index)||''))continue;
            const b=record.buffers.get(a.buffer);if(!b||!(b.data instanceof Float32Array))continue;
            const stride=a.stride/4||a.size,offset=a.offset/4;let min=Infinity,max=-Infinity,count=0;
            for(let i=offset+2;i<b.data.length;i+=stride){min=Math.min(min,b.data[i]);max=Math.max(max,b.data[i]);count++;}
            positions.push({vertices:count,minZ:min,maxZ:max});
          }
          // Unpreserved WebGL buffers may clear after presentation. Render and
          // read synchronously in one task, as required by the WebGL contract.
          renderer.render(window.__PACMAN__.game.state,{reducedMotion:false});
          const bytes=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
          let pixels=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i]>32)pixels++;
          return {graphics:renderer.graphicsInfo,kind:record.kind,driver:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
            version:gl.getParameter(gl.VERSION),attributes:gl.getContextAttributes(),uploads:record.uploads,
            indexedUploads:[...record.buffers.values()].filter(b=>b.target===gl.ELEMENT_ARRAY_BUFFER).map(b=>({type:b.data.constructor.name,length:b.data.length})),
            drawCalls:record.drawCalls,indices:record.indices,positions,pixels,error:gl.getError(),
            mainContext2D:!!document.querySelector('#game-canvas').getContext('2d')};}""")
        require(data["graphics"]["available"] and data["graphics"]["backend"] == "webgl", f"WebGL unavailable: {data}")
        require(data.get("mainContext2D"), "Existing 2D canvas was replaced")
        require(data.get("uploads", 0) > 0 and data.get("indexedUploads"), f"No actual indexed GPU buffers: {data}")
        require(data.get("drawCalls", 0) > 0 and data.get("indices", 0) > 0, f"No actual gl.drawElements: {data}")
        require(any(p["maxZ"]-p["minZ"] > 1 for p in data.get("positions", [])), f"Uploaded vertex positions are flat: {data}")
        require(data.get("pixels", 0) > 100 and data.get("error") == 0, f"GPU framebuffer is blank or erroneous: {data}")
        report["environment"]["gl"] = {k:data[k] for k in ("driver", "version", "kind", "attributes")}
        page.screenshot(path=str(OUT / "graphics-desktop-title.png"))
        return data
    check("genuine WebGL context, nonplanar indexed buffers, gl.drawElements, and GPU pixels", gpu_proof)

    def consume_pellet():
        page.locator("#start-button").click()
        page.wait_for_function("window.__PACMAN__.game.state.phase==='playing'")
        before = page.evaluate("({score:window.__PACMAN__.game.state.score,pellets:[...window.__PACMAN__.game.state.pellets],graphics:window.__PACMAN__.renderer.graphicsInfo})")
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(500)
        page.keyboard.press("p")
        page.wait_for_timeout(40)
        after = page.evaluate("({paused:window.__PACMAN__.game.state.paused,score:window.__PACMAN__.game.state.score,pellets:[...window.__PACMAN__.game.state.pellets],graphics:window.__PACMAN__.renderer.graphicsInfo})")
        require(after["paused"] and after["score"] > before["score"], "Keyboard did not score and pause normally")
        require(len(after["pellets"]) < len(before["pellets"]), "Actual game retained eaten pellets")
        require(after["graphics"]["pelletCount"] == len(after["pellets"]), "GPU pellet batch differs from live board")
        require(after["graphics"]["pelletBatchBuilds"] > before["graphics"]["pelletBatchBuilds"], "GPU pellet batch did not rebuild after consumption")
        return {"before": before, "after": after, "removed": list(set(before["pellets"])-set(after["pellets"]))}
    check("keyboard consumption removes live pellets and updates GPU batch", consume_pellet)

    page.evaluate("""()=>{const a=window.__PACMAN__;window.__graphicsIdentity={game:a.game,state:a.game.state,games:a.games,
      renderer:a.renderer,canvas:document.querySelector('#game-canvas'),meshCanvas:a.renderer.meshCanvas};}""")
    before = snapshot(page)
    page.evaluate(VISUAL_HELPERS)

    def pacman_visuals():
        directions = {}
        for direction in ("right", "down", "left", "up"):
            directions[direction] = capture(page, {"time": 1.57079632679/23,
                "pacman": {"x": 13.5, "y": 15, "dir": direction, "moving": True}})
            require(directions[direction]["pixels"] > 20, f"Blank Pac-Man {direction}")
            save_mesh(page, f"pacman-{direction}")
        require(len({d["hash"] for d in directions.values()}) == 4, "Four directions produced identical geometry pixels")
        require(directions["right"]["centroid"][0] < directions["left"]["centroid"][0] - .5,
                f"Horizontal mouth does not follow direction: {directions}")
        require(directions["down"]["centroid"][1] < directions["up"]["centroid"][1] - .5,
                f"Vertical mouth does not follow direction: {directions}")
        closed = capture(page, {"time": 4.71238898038/23, "pacman": {"x": 13.5, "y": 15, "dir": "right", "moving": True}})
        require(closed["pixels"] > directions["right"]["pixels"] * 1.03, "Mouth animation does not open/close the actual mesh")
        reduced = [capture(page, {"time": t, "reducedMotion": True, "pacman": {"x": 13.5, "y": 15, "dir": "right", "moving": True}}) for t in (0, 10)]
        require(reduced[0]["hash"] == reduced[1]["hash"], "Reduced motion still animates Pac-Man mesh")
        preserve(page, before)
        return {"directions": directions, "closed": closed, "reducedMotionStable": True}
    check("GPU Pac-Man mouth animates, rotates in four directions, and respects reduced motion", pacman_visuals)

    def ghost_visuals():
        colors = {}
        for ghost_id in ("blinky", "pinky", "inky", "clyde"):
            colors[ghost_id] = capture(page, {"ghosts": [{"id": ghost_id, "x": 13.5, "y": 15, "mode": "normal", "dir": "right"}]})
            require(colors[ghost_id]["bodyPixels"] > 5, f"Ghost body not drawn: {ghost_id}")
            save_mesh(page, f"ghost-{ghost_id}")
        r,g,b = colors["blinky"]["bodyMean"]
        require(r > g*1.3 and r > b*1.2, f"Blinky not red: {colors}")
        r,g,b = colors["pinky"]["bodyMean"]
        require(r > g*1.1 and b > g*1.05, f"Pinky not pink: {colors}")
        r,g,b = colors["inky"]["bodyMean"]
        require(g > r*1.2 and b > r*1.2, f"Inky not cyan: {colors}")
        r,g,b = colors["clyde"]["bodyMean"]
        require(r > g*1.1 and g > b*1.2, f"Clyde not orange: {colors}")
        return colors
    check("four ghost meshes retain distinct red, pink, cyan, and orange colors", ghost_visuals)

    def ghost_modes():
        base = {"id": "blinky", "x": 13.5, "y": 15, "dir": "right"}
        normal = capture(page, {"ghosts": [{**base, "mode": "normal"}]})
        blue = capture(page, {"frightenedRemaining": 6, "ghosts": [{**base, "mode": "frightened"}]})
        save_mesh(page, "frightened-blue")
        white = capture(page, {"frightenedRemaining": 2, "ghosts": [{**base, "mode": "frightened"}]})
        save_mesh(page, "frightened-white")
        require(blue["bodyMean"][2] > blue["bodyMean"][0] * 1.4, f"Frightened body not blue: {blue}")
        require(min(white["mean"]) > max(blue["mean"])*.7 and max(white["mean"])-min(white["mean"]) < 45,
                f"Frightened white flash missing: blue={blue},white={white}")
        eyes = capture(page, {"frightenedRemaining": 2, "ghosts": [{**base, "mode": "eyes", "frightenedVisual": True}]})
        save_mesh(page, "ghost-eyes-only")
        require(eyes["pixels"] > 5 and eyes["pixels"] < normal["pixels"]*.55,
                f"Eyes-only mesh did not remove body: normal={normal},eyes={eyes}")
        require(eyes["bodyPixels"] == 0, f"Eyes-only state retains lower ghost body: {eyes}")
        house = capture(page, {"frightenedRemaining": 6, "ghosts": [{**base, "mode": "house", "frightenedVisual": True}]})
        require(house["hash"] == blue["hash"], "House ghost ignored frightenedVisual")
        reduced = capture(page, {"frightenedRemaining": 2, "reducedMotion": True, "ghosts": [{**base, "mode": "frightened"}]})
        require(reduced["bodyMean"][2] > reduced["bodyMean"][0]*1.4, "Reduced motion still white-flashes frightened mesh")
        return {"normal": normal, "blue": blue, "white": white, "eyes": eyes, "house": house, "reduced": reduced}
    check("GPU frightened blue/white flash, eyes-only, and frightened house visuals", ghost_modes)

    def pellet_pixels():
        # Exercise same-Set invalidation separately from ordinary gameplay above.
        data = page.evaluate("""()=>{
          const f=window.__meshFixture,r=window.__PACMAN__.renderer,s=f.base();
          s.pellets=new Set([29,31,33]);s.energizers=new Set([35]);f.state=s;
          const sample=()=>{f.original.call(r,s,{reducedMotion:true});
            const gl=window.__GLQA__.contexts.find(x=>x.canvas===r.meshCanvas).gl;
            const scale=r.meshCanvas.width/(28*24),p=new Uint8Array(4);
            const at=index=>{const x=Math.round(((index%28)+.5)*24*scale),
              y=Math.round((Math.floor(index/28)+.5)*24*scale);
              gl.readPixels(x,r.meshCanvas.height-y-1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
            return {graphics:r.graphicsInfo,removedPixel:at(29),remainingPixel:at(31),energizerPixel:at(35)};};
          const before=sample(),stable=sample();s.pellets.delete(29);const after=sample();
          return {before,stable,after};}""")
        require(data["before"]["graphics"]["pelletCount"] == 3 and data["after"]["graphics"]["pelletCount"] == 2, f"GPU pellet count stale: {data}")
        require(data["before"]["removedPixel"][3] > 100 and data["after"]["removedPixel"][3] == 0,
                f"Consumed pellet remains in GPU pixels: {data}")
        require(data["after"]["remainingPixel"][3] > 100 and data["after"]["energizerPixel"][3] > 100,
                f"Remaining pellet or energizer disappeared: {data}")
        require(data["stable"]["graphics"]["pelletBatchBuilds"] == data["before"]["graphics"]["pelletBatchBuilds"], "Unchanged pellets rebuilt GPU batch")
        require(data["after"]["graphics"]["pelletBatchBuilds"] == data["before"]["graphics"]["pelletBatchBuilds"]+1,
                "Same-Set pellet removal did not rebuild batch exactly once")
        save_mesh(page, "pellet-removal")
        return data
    check("same-Set pellet removal clears GPU pixels and rebuilds only the changed batch", pellet_pixels)

    page.evaluate("window.__PACMAN__.renderer.render=window.__meshFixture.original;delete window.__meshFixture")
    page.wait_for_timeout(80)

    def desktop_views():
        results = [layout(page, "desktop-large-1440x1000")]
        fullscreen(page, True)
        results.append(layout(page, "desktop-fullscreen-1440x1000"))
        preserve(page, before)
        page.set_viewport_size({"width": 1280, "height": 800})
        page.wait_for_timeout(150)
        results.append(layout(page, "desktop-fullscreen-resize-1280x800"))
        preserve(page, before)
        fullscreen(page, False)
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.wait_for_timeout(150)
        preserve(page, before)
        page.screenshot(path=str(OUT / "graphics-desktop-full-meshes.png"))
        return results
    check("desktop GPU layer refits fullscreen and resize without changing gameplay state", desktop_views)
    check("desktop 120-frame actual mesh workload and frame pacing", lambda: performance_sample(page, "desktop-1440x1000"))

    def context_restore():
        supported = page.evaluate("""()=>{const r=window.__PACMAN__.renderer;
          const a=window.__GLQA__.contexts.find(x=>x.canvas===r.meshCanvas);
          window.__loseGL=a.gl.getExtension('WEBGL_lose_context');return !!window.__loseGL;}""")
        if not supported:
            return {"supported": False, "limitation": "Driver does not expose WEBGL_lose_context"}
        page.evaluate("window.__loseGL.loseContext()")
        page.wait_for_function("window.__PACMAN__.renderer.graphicsInfo.contextLost && !window.__PACMAN__.renderer.graphicsInfo.available")
        require(page.locator("#graphics-status").is_visible(), "Context-loss fallback has no visible status")
        lost = page.evaluate("window.__PACMAN__.renderer.graphicsInfo")
        preserve(page, before)
        page.screenshot(path=str(OUT / "graphics-context-lost-fallback.png"))
        page.evaluate("window.__loseGL.restoreContext()")
        page.wait_for_function("window.__PACMAN__.renderer.graphicsInfo.available && !window.__PACMAN__.renderer.graphicsInfo.contextLost")
        page.wait_for_timeout(150)
        restored = page.evaluate("window.__PACMAN__.renderer.graphicsInfo")
        require(restored["submittedTriangles"] > 0, "Restored GL context submits no triangles")
        preserve(page, before)
        page.screenshot(path=str(OUT / "graphics-context-restored.png"))
        return {"supported": True, "lost": lost, "restored": restored}
    check("actual WEBGL_lose_context falls back and restores meshes without resetting game", context_restore)
    context.close()

    mobile_context = browser.new_context(viewport={"width": 375, "height": 667}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mobile_context.add_init_script(GL_SPY)
    mobile = mobile_context.new_page()
    listen(mobile, "mobile-webgl")
    load(mobile)
    mobile.locator("#start-button").tap()
    mobile.wait_for_function("window.__PACMAN__.game.state.phase==='playing'")
    mobile.locator("#pause-button").tap()
    mobile_before = snapshot(mobile)
    mobile.evaluate("""()=>{const a=window.__PACMAN__;window.__graphicsIdentity={game:a.game,state:a.game.state,games:a.games,
      renderer:a.renderer,canvas:document.querySelector('#game-canvas'),meshCanvas:a.renderer.meshCanvas};}""")

    def mobile_views():
        results=[]
        for width,height,name in ((375,667,"portrait"),(844,390,"landscape"),(375,667,"portrait-restored")):
            mobile.set_viewport_size({"width":width,"height":height})
            mobile.wait_for_timeout(150)
            results.append(layout(mobile,f"mobile-{name}-dpr2"))
            preserve(mobile,mobile_before)
            fullscreen(mobile,True,touch=True)
            results.append(layout(mobile,f"mobile-{name}-fullscreen-dpr2"))
            preserve(mobile,mobile_before)
            fullscreen(mobile,False,touch=True)
            preserve(mobile,mobile_before)
            mobile.screenshot(path=str(OUT / f"graphics-mobile-{name}-dpr2.png"))
        return results
    check("DPR2 mobile portrait, landscape rotation, and fullscreen keep meshes and live state", mobile_views)
    check("mobile DPR2 120-frame actual mesh workload and frame pacing", lambda: performance_sample(mobile,"mobile-375x667-dpr2"))
    mobile_context.close()

    fallback_context = browser.new_context(viewport={"width": 1440, "height": 1000})
    fallback_context.add_init_script(NO_WEBGL)
    fallback = fallback_context.new_page()
    listen(fallback, "webgl-unavailable")
    load(fallback)

    def unavailable():
        info = fallback.evaluate("window.__PACMAN__.renderer.graphicsInfo")
        require(not info["available"] and info["backend"] == "canvas-fallback", f"WebGL failure not reported: {info}")
        require(fallback.evaluate("window.__blockedWebGLAttempts") > 0, "Unavailable fixture did not intercept GL creation")
        require(fallback.locator("#graphics-status").is_visible(), "Fallback needs visible graphics status")
        require("2d" in fallback.locator("#graphics-status").inner_text().lower() or "fallback" in fallback.locator("#graphics-status").inner_text().lower(),
                "Fallback status does not explain active rendering")
        fallback.locator("#start-button").click()
        fallback.wait_for_function("window.__PACMAN__.game.state.phase==='playing'")
        fallback.keyboard.press("ArrowLeft")
        fallback.wait_for_timeout(350)
        require(fallback.evaluate("window.__PACMAN__.game.state.score") > 0, "Fallback breaks ordinary gameplay")
        fallback.screenshot(path=str(OUT / "graphics-webgl-unavailable-fallback.png"))
        return {"graphics": info, "status": fallback.locator("#graphics-status").inner_text()}
    check("unavailable WebGL shows clear 2D fallback and preserves scoring gameplay", unavailable)
    fallback_context.close()

    if PRODUCTION_URL:
        production_context=browser.new_context(viewport={"width":1440,"height":1000})
        production_context.add_init_script(GL_SPY)
        production=production_context.new_page()
        listen(production,"production-webgl")
        load(production,PRODUCTION_URL,dev=False)

        def production_proof():
            data=production.evaluate("""async()=>{
              const record=window.__GLQA__.contexts.find(r=>r.drawCalls>0);
              if(!record)return {contexts:window.__GLQA__.contexts.length};
              // Production has no renderer inspection surface. Read immediately
              // after an actual indexed draw, before its unpreserved buffer can
              // be presented and cleared, then remove this one-frame hook.
              const gl=record.gl,c=record.canvas,original=gl.drawElements;
              return await new Promise((resolve,reject)=>{
                const timeout=setTimeout(()=>{gl.drawElements=original;reject(new Error('No production GPU pixels after indexed draw'));},5000);
                gl.drawElements=function(...args){const value=original.apply(this,args);
                  const p=new Uint8Array(c.width*c.height*4);
                  gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
                  let pixels=0;for(let i=3;i<p.length;i+=4)if(p[i]>32)pixels++;
                  if(pixels>100){clearTimeout(timeout);gl.drawElements=original;
                    resolve({drawCalls:record.drawCalls,indices:record.indices,uploads:record.uploads,pixels,
                      readback:'synchronous-after-drawElements',devSurfacePresent:!!window.__PACMAN__,
                      status:document.querySelector('#graphics-status').textContent});}
                  return value;};
              });}""")
            require(data.get("drawCalls",0)>0 and data.get("indices",0)>0 and data.get("pixels",0)>100,
                    f"Built app is not drawing genuine WebGL meshes: {data}")
            require(not data["devSurfacePresent"],"DEV inspection surface leaked into production")
            production.screenshot(path=str(OUT / "graphics-production-webgl.png"))
            return data
        check("production build draws indexed WebGL meshes without DEV globals",production_proof)
        production_context.close()
    browser.close()

check("no unexpected browser console or page errors", lambda: require(not report["errors"],str(report["errors"])))
report["summary"]={"passed":sum(c["passed"] for c in report["checks"]),"failed":sum(not c["passed"] for c in report["checks"])}
(OUT / "graphics-report.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report["summary"]),flush=True)
sys.exit(1 if report["summary"]["failed"] else 0)
