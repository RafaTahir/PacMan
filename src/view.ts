/** View changes only resize the existing canvas; simulation state is never replaced. */
export function setupViewControls(options: {
  resize: () => void;
  isModalOpen: () => boolean;
}) {
  const fullscreenButton = document.getElementById(
    "fullscreen-button",
  ) as HTMLButtonElement;
  const viewButton = document.getElementById(
    "view-button",
  ) as HTMLButtonElement;
  const fullscreenLabel = document.getElementById("fullscreen-label")!;
  const viewLabel = document.getElementById("view-label")!;
  const notice = document.getElementById("view-notice")!;
  let theater = true;
  try {
    theater = localStorage.getItem("afterhours.pacman.view") !== "cabinet";
  } catch {
    /* Optional persistence. */
  }
  let beforeFullscreen = theater;
  let fullscreen = Boolean(document.fullscreenElement);
  let pending = false;
  let scheduled = 0;
  let lastFullscreenExit = -Infinity;
  let noticeTimer = 0;

  function message(text: string) {
    clearTimeout(noticeTimer);
    notice.textContent = text;
    notice.hidden = false;
    noticeTimer = window.setTimeout(() => {
      notice.hidden = true;
    }, 5500);
  }

  function fit() {
    scheduled = 0;
    if (theater || fullscreen) {
      const stage = document.querySelector<HTMLElement>(".arcade-layout")!;
      const controls = document.querySelector<HTMLElement>(".touch-controls")!;
      const frame = document.querySelector<HTMLElement>(".screen-frame")!;
      const header = document.querySelector<HTMLElement>(".site-header")!;
      const width = window.visualViewport?.width ?? innerWidth;
      const height = window.visualViewport?.height ?? innerHeight;
      const touch = getComputedStyle(controls).display !== "none";
      const beside = touch && width > height && width >= 600;
      document.body.classList.toggle("touch-beside", beside);
      const stageStyle = getComputedStyle(stage);
      const frameStyle = getComputedStyle(frame);
      const number = (value: string) => parseFloat(value) || 0;
      const paddingX =
        number(stageStyle.paddingLeft) + number(stageStyle.paddingRight);
      const paddingY =
        number(stageStyle.paddingTop) + number(stageStyle.paddingBottom);
      const frameX =
        number(frameStyle.paddingLeft) +
        number(frameStyle.paddingRight) +
        number(frameStyle.borderLeftWidth) +
        number(frameStyle.borderRightWidth);
      const frameY =
        number(frameStyle.paddingTop) +
        number(frameStyle.paddingBottom) +
        number(frameStyle.borderTopWidth) +
        number(frameStyle.borderBottomWidth);
      const hud = [".scoreboard", ".machine-footer", ".game-toolbar"].reduce(
        (sum, selector) =>
          sum +
          document.querySelector(selector)!.getBoundingClientRect().height,
        0,
      );
      const controlsBox = controls.getBoundingClientRect();
      const gap = number(stageStyle.gap);
      const headerHeight =
        getComputedStyle(header).position === "absolute"
          ? 0
          : header.getBoundingClientRect().height;
      const availableHeight =
        height -
        headerHeight -
        paddingY -
        hud -
        frameY -
        (touch && !beside ? controlsBox.height + gap : 0);
      const availableWidth =
        width - paddingX - frameX - (beside ? controlsBox.width + gap : 0);
      const canvasWidth = Math.max(
        100,
        Math.min(availableWidth, (availableHeight * 28) / 31),
      );
      document.body.style.setProperty(
        "--play-width",
        `${Math.floor(canvasWidth + frameX)}px`,
      );
    } else {
      document.body.style.removeProperty("--play-width");
      document.body.classList.remove("touch-beside");
    }
    options.resize();
  }

  function scheduleFit() {
    if (!scheduled) scheduled = requestAnimationFrame(fit);
  }

  function update() {
    document.body.classList.toggle("theater-view", theater);
    document.body.classList.toggle("fullscreen-view", fullscreen);
    fullscreenLabel.textContent = fullscreen ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.setAttribute(
      "aria-label",
      fullscreen ? "Exit fullscreen" : "Enter fullscreen",
    );
    fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
    fullscreenButton.disabled = pending;
    viewLabel.textContent = theater ? "Cabinet view" : "Large view";
    viewButton.setAttribute(
      "aria-label",
      theater ? "Return to cabinet view" : "Expand to large view",
    );
    viewButton.setAttribute("aria-pressed", String(theater));
    // Native fullscreen always keeps the expanded layout; its separate exit stays visible.
    viewButton.hidden = fullscreen;
    scheduleFit();
  }

  function setTheater(value: boolean, persist = true) {
    theater = value;
    if (persist) {
      try {
        localStorage.setItem(
          "afterhours.pacman.view",
          value ? "large" : "cabinet",
        );
      } catch {
        /* Optional persistence. */
      }
    }
    update();
  }

  async function toggleFullscreen() {
    if (pending) return;
    pending = true;
    if (!document.fullscreenElement) beforeFullscreen = theater;
    update();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (
        typeof document.documentElement.requestFullscreen === "function" &&
        document.fullscreenEnabled !== false
      ) {
        // Called directly from a click or key event, preserving transient user activation.
        await document.documentElement.requestFullscreen({
          navigationUI: "hide",
        });
      } else {
        setTheater(true);
        message(
          "Large view enabled. Fullscreen isn’t available in this browser.",
        );
      }
    } catch {
      if (document.fullscreenElement)
        message("Use Esc or your browser’s exit control to leave fullscreen.");
      else {
        setTheater(true);
        message("Large view enabled. Your browser couldn’t enter fullscreen.");
      }
    } finally {
      pending = false;
      update();
    }
  }

  document.addEventListener("fullscreenchange", () => {
    const wasFullscreen = fullscreen;
    fullscreen = Boolean(document.fullscreenElement);
    if (fullscreen && !wasFullscreen && !pending) beforeFullscreen = theater;
    if (fullscreen) setTheater(true, false);
    else if (wasFullscreen) {
      lastFullscreenExit = performance.now();
      setTheater(beforeFullscreen, false);
    }
    update();
  });
  fullscreenButton.addEventListener("click", () => {
    void toggleFullscreen();
  });
  viewButton.addEventListener("click", () => setTheater(!theater));
  window.addEventListener("resize", scheduleFit);
  window.addEventListener("orientationchange", scheduleFit);
  window.visualViewport?.addEventListener("resize", scheduleFit);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(scheduleFit);
    for (const selector of [
      ".site-header",
      ".scoreboard",
      ".machine-footer",
      ".game-toolbar",
      ".touch-controls",
    ]) {
      observer.observe(document.querySelector(selector)!);
    }
  }
  update();
  return {
    handleKey(event: KeyboardEvent): boolean {
      if (
        options.isModalOpen() ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return false;
      const key = event.key.toLowerCase();
      if (key === "f" && !event.repeat) {
        event.preventDefault();
        void toggleFullscreen();
        return true;
      }
      if (key === "v" && !event.repeat && !fullscreen) {
        event.preventDefault();
        setTheater(!theater);
        return true;
      }
      if (key === "escape") {
        if (fullscreen) {
          event.preventDefault();
          void toggleFullscreen();
          return true;
        }
        if (performance.now() - lastFullscreenExit < 250) return true;
        if (theater) {
          event.preventDefault();
          setTheater(false);
          return true;
        }
      }
      return false;
    },
  };
}
