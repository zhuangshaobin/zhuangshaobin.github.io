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
  let selection = highlights,
    current = 0,
    frameIndex = 0,
    frames = [],
    request = 0,
    origin,
    touch,
    loader;
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
    image.alt = frame.alt;
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
    prompt.hidden = !frame.prompt;
    const task = selection[current].task || "";
    prompt.querySelector("summary").textContent =
      frame.role === "input"
        ? "Source prompt"
        : task === "Reference composition"
          ? "Composition prompt"
          : /editing/i.test(task)
            ? "Edit instruction"
            : "Generation prompt";
    modal.querySelector(".artwork-size").textContent = `${frame.width.toLocaleString("en-US")} × ${frame.height.toLocaleString("en-US")}`;
    prompt.querySelector("p").textContent = frame.prompt || "";
    prompt.open = false;
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
    frames = work.frames || [
      { asset: work.asset || work.id, label: "Result", role: "output", width: work.width, height: work.height, alt: work.alt, prompt: work.prompt },
    ];
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
