/** Reject a compatibility click retargeted after another control hides itself.
 * A fresh real pointer press on this button and keyboard/AT clicks still work. */
export function guardedActivation(button: HTMLElement, action: () => void): void {
  let pointerOrigin: EventTarget | null = null;
  window.addEventListener("pointerdown", event => { pointerOrigin = event.target; }, { capture: true });
  button.addEventListener("click", event => {
    const pointerType = "pointerType" in event ? String(event.pointerType) : "";
    const pointerDriven = event.detail > 0 || pointerType !== "";
    if (pointerDriven && (!(pointerOrigin instanceof Node) || !button.contains(pointerOrigin))) {
      event.preventDefault();
      return;
    }
    action();
  });
}
