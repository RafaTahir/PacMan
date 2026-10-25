import { Buttons, NEUTRAL_INPUT, type ArcadeInput, type GameDefinition } from "./shared/contracts";
import { axis, clamp } from "./shared/math";

export class ArcadeControls {
  private readonly abort = new AbortController();
  private keys = new Set<string>();
  private touchX = 0;
  private touchY = 0;
  private aimX = 0;
  private aimY = -127;
  private pointerPaddle = false;
  private heldButtons = 0;
  private aimFiring = false;
  private mouseFiring = false;
  private readonly resetters: (() => void)[] = [];
  constructor(private definition: GameDefinition, private surface: HTMLElement,
    private enabled: () => boolean,
    private projectAim: (x: number, y: number) => { aimX: number; aimY: number }) {
    const signal = this.abort.signal;
    const usable = (target: EventTarget | null) => !(target instanceof Element && target.closest("input,textarea,select,[contenteditable],dialog"));
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      if (!this.enabled() || !usable(event.target) || event.altKey || event.metaKey || event.ctrlKey) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "z", "/", " ", "shift", "enter"].includes(key)) {
        event.preventDefault(); this.keys.add(key);
        if (["arrowleft", "arrowright", "a", "d"].includes(key)) this.pointerPaddle = false;
      }
    }, { signal });
    window.addEventListener("keyup", event => this.keys.delete(event.key.toLowerCase()), { signal });
    window.addEventListener("blur", () => this.clear(), { signal });
    const point = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      const y = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
      const aim = this.projectAim(x, y);
      this.aimX = axis(aim.aimX); this.aimY = axis(aim.aimY);
      if (this.definition.controls === "paddle") this.pointerPaddle = true;
    };
    surface.addEventListener("pointerdown", event => {
      if (!this.enabled() || (event.target instanceof Element && event.target.closest("button,a,input"))) return;
      event.preventDefault(); point(event);
      if (this.definition.controls === "twin-stick") this.mouseFiring = true;
      surface.setPointerCapture(event.pointerId);
    }, { signal });
    surface.addEventListener("pointermove", event => { if (this.enabled()) point(event); }, { signal });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const)
      surface.addEventListener(name, () => { this.mouseFiring = false; }, { signal });
    for (const stick of document.querySelectorAll<HTMLElement>("[data-stick]")) {
      let active: number | null = null;
      const knob = stick.querySelector<HTMLElement>(".stick-knob");
      this.resetters.push(() => {
        const id = active; active = null;
        if (id !== null && stick.hasPointerCapture(id)) stick.releasePointerCapture(id);
        if (knob) knob.style.transform = "";
      });
      const update = (event: PointerEvent) => {
        const rect = stick.getBoundingClientRect(), radius = Math.min(rect.width, rect.height) * 0.36;
        let x = (event.clientX - rect.left - rect.width / 2) / radius;
        let y = (event.clientY - rect.top - rect.height / 2) / radius;
        const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
        if (stick.dataset.stick === "aim") { this.aimX = axis(x * 127); this.aimY = axis(y * 127); this.aimFiring = true; }
        else { this.touchX = axis(x * 127); this.touchY = axis(y * 127); this.pointerPaddle = false; }
        if (knob) knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
      };
      stick.addEventListener("pointerdown", event => {
        if (!this.enabled() || active !== null) return;
        event.preventDefault(); active = event.pointerId; stick.setPointerCapture(event.pointerId); update(event);
      }, { signal });
      stick.addEventListener("pointermove", event => { if (active === event.pointerId && this.enabled()) update(event); }, { signal });
      const release = (event: PointerEvent) => {
        if (active !== event.pointerId) return; active = null;
        if (stick.dataset.stick === "aim") this.aimFiring = false;
        else { this.touchX = 0; this.touchY = 0; }
        if (knob) knob.style.transform = "";
      };
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) stick.addEventListener(name, release, { signal });
    }
    for (const [id, bit] of [["touch-primary", Buttons.PRIMARY], ["touch-secondary", Buttons.SECONDARY], ["touch-launch", Buttons.LAUNCH]] as const) {
      const button = document.getElementById(id)!;
      button.addEventListener("pointerdown", event => {
        if (!this.enabled()) return;
        event.preventDefault(); this.heldButtons |= bit; button.setPointerCapture(event.pointerId); button.classList.add("held");
      }, { signal });
      const release = () => { this.heldButtons &= ~bit; button.classList.remove("held"); };
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) button.addEventListener(name, release, { signal });
      button.addEventListener("click", event => {
        if (event.detail === 0 && this.enabled()) { this.heldButtons |= bit; setTimeout(release, 80); }
      }, { signal });
    }
  }
  read(): ArcadeInput {
    if (!this.enabled()) return { ...NEUTRAL_INPUT };
    const down = (...names: string[]) => names.some(name => this.keys.has(name));
    let x = this.touchX || (Number(down("d", "arrowright")) - Number(down("a", "arrowleft"))) * 127;
    const y = this.touchY || (Number(down("s", "arrowdown")) - Number(down("w", "arrowup"))) * 127;
    let buttons = this.heldButtons;
    if (this.definition.controls === "flippers") {
      x = (Number(down("d")) - Number(down("a"))) * 127;
      if (down("arrowleft", "z")) buttons |= Buttons.PRIMARY;
      if (down("arrowright", "/")) buttons |= Buttons.SECONDARY;
      if (down(" ", "enter")) buttons |= Buttons.LAUNCH;
    } else {
      if (down(" ") || this.mouseFiring || this.aimFiring) buttons |= Buttons.PRIMARY;
      if (down("shift")) buttons |= Buttons.SECONDARY;
      if (down("enter")) buttons |= Buttons.LAUNCH;
    }
    if (this.pointerPaddle) buttons |= Buttons.POINTER;
    return { x: axis(x), y: axis(y), aimX: this.aimX, aimY: this.aimY, buttons };
  }
  clear(): void {
    this.keys.clear(); this.touchX = this.touchY = this.heldButtons = 0;
    this.mouseFiring = this.aimFiring = this.pointerPaddle = false;
    this.resetters.forEach(reset => reset());
    document.querySelectorAll<HTMLElement>(".stick-knob").forEach(knob => { knob.style.transform = ""; });
    document.querySelectorAll("#touch-controls .held").forEach(button => button.classList.remove("held"));
  }
  dispose(): void { this.clear(); this.abort.abort(); }
}
