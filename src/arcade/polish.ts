import "./polish.css";
import { cabinets } from "./catalog";
import { preference, store } from "./preferences";

const root = document.documentElement;
const motionOk = (): boolean => !preference.reducedMotion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const byId = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

function slideIn(element: Element | null, delay = 0): void {
  element?.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
}

// Featured-game dots, accent colour and slide-in, driven by events from main.ts.
const controls = document.querySelector<HTMLElement>(".featured-controls");
const previous = byId("featured-previous");
const dots: HTMLButtonElement[] = [];
if (controls && previous) {
  const nav = document.createElement("div");
  nav.className = "featured-dots";
  nav.setAttribute("role", "group");
  nav.setAttribute("aria-label", "Choose featured game");
  cabinets.forEach((cabinet, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "featured-dot";
    dot.style.setProperty("--dot", cabinet.accent);
    dot.setAttribute("aria-label", `Feature ${cabinet.title}`);
    dot.addEventListener("click", () => document.dispatchEvent(new CustomEvent("featured-select", { detail: index })));
    dots.push(dot);
    nav.append(dot);
  });
  controls.insertBefore(nav, previous);
}
let firstFeatured = true;
document.addEventListener("featured-change", (event) => {
  const { index, accent } = (event as CustomEvent<{ index: number; accent: string }>).detail;
  root.style.setProperty("--page-accent", accent);
  dots.forEach((dot, i) => (i === index ? dot.setAttribute("aria-current", "true") : dot.removeAttribute("aria-current")));
  if (firstFeatured) { firstFeatured = false; return; }
  if (!motionOk()) return;
  slideIn(byId("hero-title"));
  slideIn(byId("featured-copy"), 60);
});

// Staggered entrance for the hero copy.
if (motionOk()) document.querySelectorAll(".hero-copy > *").forEach((element, index) => slideIn(element, index * 70));

// Header shrinks once the page scrolls.
const header = document.querySelector(".site-header");
const onScroll = (): void => { header?.classList.toggle("is-scrolled", window.scrollY > 24); };
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Cursor-following spotlight on cabinet cards.
for (const card of document.querySelectorAll<HTMLElement>(".cabinet-card")) {
  card.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  }, { passive: true });
}

// Scroll reveal. Content stays visible if the observer never fires.
if (motionOk() && "IntersectionObserver" in window) {
  const targets = [...document.querySelectorAll<HTMLElement>(".cabinet-card, .library-section .section-heading")];
  const finish = (element: HTMLElement): void => { element.classList.add("revealed"); element.classList.remove("in-view"); };
  let fired = false;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      fired = true;
      const element = entry.target as HTMLElement;
      observer.unobserve(element);
      element.style.setProperty("--d", `${(targets.indexOf(element) % 5) * 70}ms`);
      element.classList.add("in-view");
      setTimeout(() => finish(element), 1100);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  root.classList.add("js-polish");
  targets.forEach((target) => observer.observe(target));
  setTimeout(() => { if (!fired) targets.forEach(finish); }, 2500);
}

// Leaderboard: highlight the player's own initials; animate rows only when the data actually changed.
const board = byId("leaderboard-body");
if (board) {
  let lastSignature = "";
  new MutationObserver(() => {
    const mine = store.get("initials");
    for (const row of board.querySelectorAll("tr")) row.classList.toggle("is-you", !!mine && row.children[1]?.textContent === mine);
    const signature = board.textContent ?? "";
    if (signature === lastSignature) return;
    lastSignature = signature;
    if (!motionOk()) return;
    board.dataset.fresh = "true";
    setTimeout(() => delete board.dataset.fresh, 1200);
  }).observe(board, { childList: true });
}

// Result screen: score count-up and a confetti burst for a new personal best.
const scoreDialog = byId<HTMLDialogElement>("score-dialog");
const CONFETTI_COLOURS = ["#f4df6b", "#ff779c", "#76e8e0", "#bc9aff", "#ffb56d", "#b2e875"];
function confetti(parent: HTMLElement): void {
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 52; i++) {
    const piece = document.createElement("i");
    const side = Math.random() * 2 - 1;
    piece.style.setProperty("--c", CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]);
    piece.style.setProperty("--dx", `${side * (140 + Math.random() * 260)}px`);
    piece.style.setProperty("--uy", `${-(110 + Math.random() * 140)}px`);
    piece.style.setProperty("--dy", `${160 + Math.random() * 320}px`);
    piece.style.setProperty("--r", `${(Math.random() * 2 - 1) * 900}deg`);
    piece.style.setProperty("--dl", `${Math.random() * 0.25}s`);
    layer.append(piece);
  }
  parent.append(layer);
  setTimeout(() => layer.remove(), 2600);
}
function countUp(element: HTMLElement): void {
  const text = element.textContent ?? "";
  const target = Number(text.replace(/\D/g, ""));
  if (!Number.isFinite(target) || target <= 0) return;
  const started = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - started) / 900);
    if (t >= 1 || !scoreDialog?.open) { element.textContent = text; return; }
    element.textContent = Math.round(target * (1 - (1 - t) ** 3)).toLocaleString();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
if (scoreDialog) {
  new MutationObserver(() => {
    if (!scoreDialog.open || !motionOk()) return;
    const score = byId("result-score");
    if (score) countUp(score);
    if (scoreDialog.dataset.newBest === "true") setTimeout(() => confetti(scoreDialog), 60);
  }).observe(scoreDialog, { attributes: true, attributeFilter: ["open"] });
}
