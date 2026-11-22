// Original images are loaded only when a visitor opens a case or selects a frame.
(() => {
  const works = JSON.parse(document.querySelector("#gallery-data").textContent);
  const highlights = works.filter((work) => work.featured === true);
  const section = document.querySelector("#gallery");
  const modal = document.querySelector(".gallery-dialog");
  const image = modal.querySelector(".artwork-image");
  const status = modal.querySelector(".artwork-load-state");
  const frameList = modal.querySelector(".artwork-frames");
  const stage = modal.querySelector(".artwork-stage");
  const prompt = modal.querySelector(".artwork-prompt");
  const detailRequests = new Map();
  const detailReady = new Set(works.filter((work) => !work.detailUrl).map((work) => work.id));
  const detailErrors = new Set();
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry";
  retry.hidden = true;
  retry.dataset.promptRetry = "";
  prompt.querySelector(".artwork-prompt-actions").append(retry);
  function loadDetails(work) {
    if (detailReady.has(work.id)) return Promise.resolve(work);
    if (detailRequests.has(work.id)) return detailRequests.get(work.id);
    detailErrors.delete(work.id);
    const pending = fetch(work.detailUrl, { priority: "high" })
      .then((response) => {
        if (!response.ok) throw new Error("Artwork details unavailable");
        return response.json();
      })
      .then((detail) => {
        if (detail.id !== work.id) throw new Error("Artwork details do not match");
        Object.assign(work, detail);
        detailReady.add(work.id);
        return work;
      })
      .catch((error) => {
        detailRequests.delete(work.id);
        detailErrors.add(work.id);
        throw error;
      });
    detailRequests.set(work.id, pending);
    return pending;
  }
  const framesFor = (work) =>
    work.frames || [
      {
        asset: work.asset || work.id,
        label: "Result",
        role: "output",
        width: work.width,
        height: work.height,
        alt: work.alt || work.title,
        prompt: work.prompt,
      },
    ];
  // Browser-native lazy loading can fetch the entire next section during the
  // opening canvas. Only release these previews when visitors approach it.
  const previewObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (img.dataset.srcset) {
          img.srcset = img.dataset.srcset;
          delete img.dataset.srcset;
        }
        img.src = img.dataset.src;
        delete img.dataset.src;
        previewObserver.unobserve(img);
      }
    },
    { rootMargin: "200px 0px" }
  );
  section.querySelectorAll("img[data-src]").forEach((img) => previewObserver.observe(img));
  let selection = highlights,
    current = 0,
    frameIndex = 0,
    frames = [],
    request = 0,
    origin,
    touch,
    loader;
  function renderPrompt() {
    const work = selection[current],
      frame = frames[frameIndex];
    const ready = detailReady.has(work.id),
      failed = detailErrors.has(work.id);
    prompt.hidden = ready && !frame.prompt;
    prompt.querySelector("summary").textContent =
      frame.role !== "input" && work.task === "Reference composition"
        ? "Original composition prompt"
        : frame.role !== "input" && frames.length > 1
          ? "Original editing prompt"
          : "Original generation prompt";
    prompt.querySelector("p").textContent = ready
      ? frame.prompt || ""
      : failed
        ? "The original prompt could not be loaded. Please retry."
        : "Loading original prompt…";
    prompt.open = !ready || Boolean(frame.prompt);
    retry.hidden = ready || !failed;
    modal.querySelector("[data-copy-prompt]").disabled = !ready || !frame.prompt;
    modal.querySelector(".artwork-copy-state").textContent = "";
  }
  function hydrateCurrent(work) {
    const pending = loadDetails(work);
    renderPrompt();
    pending
      .then(() => {
        if (!modal.open || selection[current].id !== work.id) return;
        frames = framesFor(work);
        image.alt = frames[frameIndex].alt || work.title;
        modal.querySelector(".artwork-description").textContent = work.description || "";
        renderPrompt();
      })
      .catch(() => {
        if (modal.open && selection[current].id === work.id) renderPrompt();
      });
  }
  retry.addEventListener("click", () => hydrateCurrent(selection[current]));
  // Warm only the case a visitor is about to open, never the whole collection.
  function warmDetails(event) {
    const button = event.target.closest("[data-artwork]");
    if (!button || button.contains(event.relatedTarget)) return;
    const work = works.find((item) => item.id === button.dataset.artwork);
    if (work) loadDetails(work).catch(() => {});
  }
  document.addEventListener("pointerover", warmDetails, { passive: true });
  document.addEventListener("focusin", warmDetails);
  function renderFrame(index, focus = false) {
    frameIndex = (index + frames.length) % frames.length;
    const frame = frames[frameIndex],
      version = ++request;
    if (loader) {
      loader.onload = null;
      loader.onerror = null;
      loader.removeAttribute("src");
      loader = null;
    }
    const full = `assets/gallery/${frame.asset}.webp`;
    image.src = `assets/gallery/${frame.asset}-960.webp`;
    image.alt = frame.alt || selection[current].title;
    image.width = frame.width;
    image.height = frame.height;
    frameList.querySelectorAll("button").forEach((button, i) => {
      button.setAttribute("aria-selected", String(i === frameIndex));
      button.tabIndex = i === frameIndex ? 0 : -1;
      if (i === frameIndex) {
        stage.setAttribute("aria-labelledby", button.id);
        const tabBounds = button.getBoundingClientRect(),
          stripBounds = frameList.getBoundingClientRect();
        if (tabBounds.right > stripBounds.right) frameList.scrollLeft += tabBounds.right - stripBounds.right + 12;
        if (tabBounds.left < stripBounds.left) frameList.scrollLeft -= stripBounds.left - tabBounds.left + 12;
        if (focus) button.focus({ preventScroll: true });
      }
    });
    modal.querySelector(".artwork-original").href = full;
    renderPrompt();
    modal.querySelector(".artwork-size").textContent = `${frame.width.toLocaleString("en-US")} × ${frame.height.toLocaleString("en-US")}`;
    status.textContent = "Loading full image…";
    const original = new Image();
    loader = original;
    original.decoding = "async";
    original.onload = () => {
      if (version === request && modal.open) {
        image.src = original.src;
        status.textContent = "";
      }
    };
    original.onerror = () => {
      if (version === request && modal.open) status.textContent = "Preview shown. Use “Open full image” to retry.";
    };
    original.src = full;
  }
  function renderArtwork(index) {
    current = (index + selection.length) % selection.length;
    const work = selection[current];
    modal.scrollTop = 0;
    modal.querySelector(".artwork-caption").scrollTop = 0;
    frames = framesFor(work);
    modal.querySelector("#artwork-title").textContent = work.title;
    modal.querySelector(".artwork-category").textContent = work.task || "Text to image";
    modal.querySelector(".artwork-description").textContent = work.description || "";
    modal.querySelector(".artwork-position").textContent = `Case ${current + 1} / ${selection.length}`;
    modal.querySelector("[data-artwork-prev]").disabled = selection.length < 2;
    modal.querySelector("[data-artwork-next]").disabled = selection.length < 2;
    frameList.replaceChildren();
    frameList.hidden = frames.length < 2;
    stage.removeAttribute("aria-labelledby");
    stage.removeAttribute("role");
    if (frames.length > 1) {
      stage.setAttribute("role", "tabpanel");
      frames.forEach((frame, i) => {
        const button = document.createElement("button");
        button.type = "button";
        button.id = `frame-${work.id}-${i}`;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", "artwork-stage");
        const thumb = document.createElement("img");
        thumb.src = `assets/gallery/${frame.asset}-160.webp`;
        thumb.alt = "";
        thumb.width = 96;
        thumb.height = 64;
        thumb.decoding = "async";
        const label = document.createElement("span");
        label.textContent = frame.label;
        button.append(thumb, label);
        button.addEventListener("click", () => renderFrame(i));
        button.addEventListener("keydown", (event) => {
          let next;
          if (event.key === "ArrowRight") next = i + 1;
          if (event.key === "ArrowLeft") next = i - 1;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = frames.length - 1;
          if (next === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          renderFrame(next, true);
        });
        frameList.append(button);
      });
    }
    renderFrame(frames.length - 1);
    hydrateCurrent(work);
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-artwork]");
    if (!button || !works.some((work) => work.id === button.dataset.artwork)) return;
    selection = section.contains(button) ? highlights : works;
    origin = button;
    modal.showModal();
    document.body.classList.add("artwork-open");
    renderArtwork(selection.findIndex((work) => work.id === button.dataset.artwork));
  });
  modal.querySelector("[data-copy-prompt]").addEventListener("click", async () => {
    const version = request;
    const value = prompt.querySelector("p").textContent;
    const feedback = modal.querySelector(".artwork-copy-state");
    try {
      await navigator.clipboard.writeText(value);
      if (version === request) feedback.textContent = "Copied";
    } catch {
      if (version === request) feedback.textContent = "Select the text to copy.";
    }
  });
  modal.querySelector(".artwork-close").addEventListener("click", () => modal.close());
  modal.querySelector("[data-artwork-prev]").addEventListener("click", () => renderArtwork(current - 1));
  modal.querySelector("[data-artwork-next]").addEventListener("click", () => renderArtwork(current + 1));
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    renderArtwork(current + (event.key === "ArrowLeft" ? -1 : 1));
  });
  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    const r = modal.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
  });
  stage.addEventListener(
    "touchstart",
    (event) => {
      touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchend",
    (event) => {
      if (!touch || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touch.x,
        dy = event.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (frames.length > 1) renderFrame(frameIndex + (dx < 0 ? 1 : -1));
        else renderArtwork(current + (dx < 0 ? 1 : -1));
      }
      touch = null;
    },
    { passive: true }
  );
  stage.addEventListener("touchcancel", () => {
    touch = null;
  });
  modal.addEventListener("close", () => {
    // A queued close event must not clear an artwork that has already reopened.
    if (modal.open) return;
    request++;
    if (loader) {
      loader.onload = null;
      loader.onerror = null;
      loader.removeAttribute("src");
      loader = null;
    }
    image.removeAttribute("src");
    document.body.classList.remove("artwork-open");
    selection = highlights;
    origin?.focus({ preventScroll: true });
  });
})();
