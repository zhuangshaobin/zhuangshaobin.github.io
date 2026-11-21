// A single, gently moving canvas. Full-resolution artwork stays in the case viewer.
(() => {
  const root = document.querySelector(".art-scroll");
  if (!root) return;
  const viewport = root.querySelector(".art-scroll-viewport");
  const track = root.querySelector(".art-scroll-track");
  const cycle = track.firstElementChild;
  const upperTrack = root.querySelector(".art-scroll-upper-track");
  const upperCycle = upperTrack.firstElementChild;
  let upperPeriod = 1;
  const toggle = root.querySelector("[data-scroll-toggle]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let offset = 0,
    period = 1,
    frame = 0,
    last = 0;
  let visible = false,
    hovered = false,
    focused = false,
    paused = motion.matches;
  let pointer = null,
    dragged = false,
    suppressClick = false;
  const modulo = (value) => ((value % period) + period) % period;

  const loader = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (img.dataset.src) {
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
            delete img.dataset.srcset;
          }
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        loader.unobserve(img);
      }
    },
    { root: viewport, rootMargin: "0px 64px", threshold: 0 }
  );
  const observeImages = (parent) => parent.querySelectorAll("img[data-src]").forEach((img) => loader.observe(img));
  observeImages(track);
  observeImages(upperTrack);

  function paint() {
    track.style.transform = `translate3d(${-offset}px,0,0)`;
    upperTrack.style.transform = `translate3d(${-(offset / period) * upperPeriod}px,0,0)`;
  }
  function resize() {
    const old = period;
    const measured = cycle.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap || 0);
    if (!measured) return;
    // Align each repeat to physical pixels. The subpixel overlap prevents a
    // bright hairline or a change in rasterization when the canvas wraps.
    const deviceScale = window.devicePixelRatio || 1;
    period = Math.floor(measured * deviceScale) / deviceScale;
    track.style.setProperty("--cycle-overlap", `${measured - period}px`);
    const upperMeasured = upperCycle.getBoundingClientRect().width;
    upperPeriod = Math.floor(upperMeasured * deviceScale) / deviceScale;
    upperTrack.style.setProperty("--upper-cycle-overlap", `${upperMeasured - upperPeriod}px`);
    offset = modulo((offset * period) / old);
    const copies = Math.max(2, Math.ceil(viewport.clientWidth / period) + 1);
    while (track.children.length < copies) {
      const clone = cycle.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("button").forEach((b) => (b.tabIndex = -1));
      track.append(clone);
      observeImages(clone);
    }
    const upperCopies = Math.max(2, Math.ceil(viewport.clientWidth / upperPeriod) + 1);
    while (upperTrack.children.length < upperCopies) {
      const clone = upperCycle.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("button").forEach((b) => (b.tabIndex = -1));
      upperTrack.append(clone);
      observeImages(clone);
    }
    paint();
  }
  function canMove() {
    return visible && !document.hidden && !paused && !hovered && !focused && !pointer && !document.body.classList.contains("artwork-open");
  }
  function tick(now) {
    frame = 0;
    if (!canMove()) return;
    if (last) offset = modulo(offset + Math.min(now - last, 64) * 0.024);
    last = now;
    paint();
    frame = requestAnimationFrame(tick);
  }
  function update() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    root.dataset.playing = String(canMove());
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", paused ? "Play artwork motion" : "Pause artwork motion");
    toggle.querySelector("span").textContent = paused ? "Play" : "Pause";
    if (canMove()) frame = requestAnimationFrame(tick);
  }
  toggle.addEventListener("click", () => {
    paused = !paused;
    update();
  });
  motion.addEventListener("change", () => {
    paused = motion.matches;
    update();
  });
  document.addEventListener("visibilitychange", update);
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      update();
    },
    { threshold: 0 }
  ).observe(viewport);
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  new ResizeObserver(resize).observe(cycle);
  new ResizeObserver(resize).observe(upperCycle);
  viewport.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") {
      hovered = true;
      update();
    }
  });
  viewport.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") {
      hovered = false;
      update();
    }
  });
  viewport.addEventListener("focusin", (e) => {
    focused = e.target.matches(":focus-visible");
    update();
    const button = e.target.closest("[data-artwork]");
    if (!button || pointer) return;
    const a = button.getBoundingClientRect(),
      b = viewport.getBoundingClientRect();
    if (a.left < b.left - 1 || a.right > b.right + 1) {
      const upper = upperTrack.contains(button);
      const scale = upper ? upperPeriod / period : 1;
      offset = modulo(offset + (a.left - b.left - (b.width - a.width) / 2) / scale);
      paint();
    }
  });
  viewport.addEventListener("focusout", () => {
    queueMicrotask(() => {
      focused = viewport.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
      update();
    });
  });
  viewport.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    focused = true;
    update();
    if (e.key === "Home") offset = 0;
    else if (e.key === "End") offset = Math.max(0, period - viewport.clientWidth);
    else offset = modulo(offset + (e.key === "ArrowRight" ? 1 : -1) * viewport.clientWidth * 0.6);
    paint();
  });
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const capture = e.target.closest("[data-artwork]") || viewport;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, start: offset, capture };
    capture.setPointerCapture(e.pointerId);
    dragged = false;
    update();
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const dx = e.clientX - pointer.x,
      dy = e.clientY - pointer.y;
    if (!dragged && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
      dragged = true;
      root.classList.add("is-dragging");
    }
    if (dragged) {
      e.preventDefault();
      offset = modulo(pointer.start - dx);
      paint();
    }
  });
  function endPointer(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (dragged) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 100);
    }
    if (pointer.capture.hasPointerCapture(e.pointerId)) pointer.capture.releasePointerCapture(e.pointerId);
    pointer = null;
    dragged = false;
    root.classList.remove("is-dragging");
    update();
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("lostpointercapture", endPointer);
  viewport.addEventListener(
    "click",
    (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );
  viewport.addEventListener("dragstart", (e) => e.preventDefault());
  window.addEventListener("blur", () => {
    pointer = null;
    dragged = false;
    hovered = false;
    root.classList.remove("is-dragging");
    update();
  });
  root.classList.add("is-enhanced");
  resize();
  update();
})();
