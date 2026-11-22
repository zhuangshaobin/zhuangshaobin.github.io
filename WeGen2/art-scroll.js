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
    animations = [];
  let visible = false,
    hovered = false,
    focused = false,
    paused = motion.matches;
  let pointer = null,
    dragged = false,
    suppressClick = false;
  const modulo = (value) => ((value % period) + period) % period;
  const sheets = new Map();
  const nearby = new Set();
  let detailTimer = 0,
    detailRequests = 0;
  const wantsDetail = () => devicePixelRatio > 1.25 && !navigator.connection?.saveData;
  function showSheet(img, sheet) {
    const source = img.parentElement.querySelector("source");
    if (source) {
      const avif = !sheet.avifFailed && !(sheet.detailReady && sheet.detailAvifFailed);
      if (avif) source.srcset = sheet.detailReady ? sheet.detailAvif : sheet.previewAvif;
      else source.removeAttribute("srcset");
      delete source.dataset.srcset;
    }
    img.src = sheet.detailReady ? sheet.detail : sheet.preview;
    delete img.dataset.src;
  }
  function scheduleDetails() {
    clearTimeout(detailTimer);
    detailTimer = setTimeout(loadDetails, 200);
  }
  function loadDetails() {
    if (!wantsDetail() || !visible || document.hidden || document.body.classList.contains("artwork-open")) return;
    const wanted = new Set([...nearby].map((card) => card.querySelector("img").dataset.atlas));
    // Finish the visible, light previews before spending bandwidth on detail.
    if ([...wanted].some((id) => !sheets.get(id)?.ready)) return;
    for (const id of wanted) {
      const sheet = sheets.get(id);
      if (detailRequests >= 2) break;
      if (sheet.detailStarted) continue;
      sheet.detailStarted = true;
      detailRequests++;
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.onload = async () => {
        try {
          await image.decode();
          sheet.detailReady = true;
          root.querySelectorAll(`img[data-atlas="${id}"]`).forEach((img) => {
            if (img.hasAttribute("src")) showSheet(img, sheet);
          });
        } catch {
          // Keep the complete preview if a detail image cannot be decoded.
        } finally {
          detailRequests--;
          scheduleDetails();
        }
      };
      image.onerror = () => {
        if (sheet.avif && !sheet.detailAvifFailed) {
          sheet.detailAvifFailed = true;
          image.src = sheet.detail;
          return;
        }
        detailRequests--;
        scheduleDetails();
      };
      image.src = sheet.avif ? sheet.detailAvif : sheet.detail;
    }
  }
  function loadPreview(img) {
    const id = img.dataset.atlas;
    let sheet = sheets.get(id);
    if (!sheet) {
      const source = img.parentElement.querySelector("source");
      sheet = {
        preview: img.dataset.src || img.getAttribute("src"),
        detail: img.dataset.detail,
        previewAvif: source?.dataset.srcset || source?.getAttribute("srcset"),
        detailAvif: source?.dataset.detail,
      };
      sheets.set(id, sheet);
    }
    if (sheet.started) {
      showSheet(img, sheet);
      return;
    }
    sheet.started = true;
    const cleanup = () => {
      img.removeEventListener("load", ready);
      img.removeEventListener("error", failed);
    };
    const ready = () => {
      cleanup();
      sheet.ready = true;
      sheet.avif = img.currentSrc.endsWith(".avif");
      scheduleDetails();
    };
    const failed = () => {
      if (sheet.previewAvif && !sheet.avifFailed) {
        sheet.avifFailed = true;
        root.querySelectorAll(`img[data-atlas="${id}"]`).forEach((other) => {
          if (other.hasAttribute("src")) showSheet(other, sheet);
        });
        return;
      }
      cleanup();
      sheet.started = false;
    };
    img.addEventListener("load", ready);
    img.addEventListener("error", failed);
    showSheet(img, sheet);
    if (img.complete && img.naturalWidth) ready();
  }
  const loader = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          nearby.add(entry.target);
          loadPreview(entry.target.querySelector("img"));
        } else {
          nearby.delete(entry.target);
        }
      }
      scheduleDetails();
    },
    { root: viewport, rootMargin: "0px 64px", threshold: 0 }
  );
  // Observe the artwork bounds, not the larger image sheet clipped inside it.
  const observeImages = (parent) => parent.querySelectorAll("[data-artwork]").forEach((card) => loader.observe(card));
  observeImages(track);
  observeImages(upperTrack);

  function sampleOffset() {
    if (animations[0]) offset = modulo((animations[0].currentTime || 0) * 0.024);
  }
  function paint() {
    if (animations.length) {
      for (const animation of animations) animation.currentTime = offset / 0.024;
    } else {
      track.style.transform = `translate3d(${-offset}px,0,0)`;
      upperTrack.style.transform = `translate3d(${-(offset / period) * upperPeriod}px,0,0)`;
    }
  }
  function resize() {
    sampleOffset();
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
    // Let the compositor move both ribbons; JavaScript runs only on interaction
    // or a layout change, rather than rewriting styles on every animation frame.
    for (const animation of animations) animation.cancel();
    animations = [track, upperTrack].map((element, index) => {
      const distance = index === 0 ? period : upperPeriod;
      const animation = element.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-distance}px,0,0)` }], {
        duration: period / 0.024,
        iterations: Infinity,
        easing: "linear",
      });
      animation.pause();
      return animation;
    });
    paint();
    update();
  }
  function canMove() {
    return visible && !document.hidden && !paused && !hovered && !focused && !pointer && !document.body.classList.contains("artwork-open");
  }
  function update() {
    sampleOffset();
    const moving = canMove();
    root.dataset.playing = String(moving);
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", paused ? "Play artwork motion" : "Pause artwork motion");
    toggle.querySelector("span").textContent = paused ? "Play" : "Pause";
    scheduleDetails();
    const time = offset / 0.024;
    for (const animation of animations) {
      if (moving) {
        if (animation.playState !== "running") {
          animation.currentTime = time;
          animation.play();
        }
      } else {
        animation.pause();
        animation.currentTime = time;
      }
    }
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
    sampleOffset();
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
