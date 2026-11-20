// The gallery shares no loading or playback state with the film player.
(() => {
  const works = JSON.parse(document.querySelector("#gallery-data").textContent);
  const section = document.querySelector("#gallery");
  const modal = document.querySelector(".gallery-dialog");
  const image = modal.querySelector(".artwork-image");
  const status = modal.querySelector(".artwork-load-state");
  let selection = works;
  let current = 0;
  let request = 0;
  let origin;
  let touch;
  const cards = [...section.querySelectorAll(".gallery-card")];
  const filters = [...section.querySelectorAll("[data-gallery-filter]")];
  const count = section.querySelector(".gallery-count");
  function updateCount() {
    count.textContent = `${selection.length} ${selection.length === 1 ? "artwork" : "artworks"}`;
  }
  function renderArtwork(index) {
    current = (index + selection.length) % selection.length;
    const work = selection[current];
    const version = ++request;
    const full = `assets/gallery/${work.id}.webp`;
    image.src = `assets/gallery/${work.id}-960.webp`;
    image.alt = work.alt;
    image.width = work.width;
    image.height = work.height;
    modal.querySelector("#artwork-title").textContent = work.title;
    modal.querySelector(".artwork-category").textContent = work.category;
    modal.querySelector(".artwork-position").textContent = `${current + 1} / ${selection.length}`;
    modal.querySelector(".artwork-original").href = full;
    modal.querySelector(".artwork-prompt p").textContent = work.prompt;
    modal.querySelector(".artwork-prompt").open = false;
    modal.querySelector("[data-artwork-prev]").disabled = selection.length < 2;
    modal.querySelector("[data-artwork-next]").disabled = selection.length < 2;
    status.textContent = "Loading full image…";
    const original = new Image();
    original.decoding = "async";
    original.onload = () => {
      if (version !== request || !modal.open) return;
      image.src = original.src;
      status.textContent = "";
    };
    original.onerror = () => {
      if (version === request && modal.open) status.textContent = "Preview shown. Use “Open full image” to retry.";
    };
    original.src = full;
  }
  filters.forEach((button) =>
    button.addEventListener("click", () => {
      const category = button.dataset.galleryFilter;
      selection = works.filter((work) => category === "All" || work.category === category);
      filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      cards.forEach((card) => {
        card.hidden = category !== "All" && card.dataset.category !== category;
      });
      updateCount();
    })
  );
  section.querySelectorAll("[data-artwork]").forEach((button) =>
    button.addEventListener("click", () => {
      origin = button;
      modal.showModal();
      document.body.classList.add("artwork-open");
      renderArtwork(selection.findIndex((work) => work.id === button.dataset.artwork));
    })
  );
  modal.querySelector(".artwork-close").addEventListener("click", () => modal.close());
  modal.querySelector("[data-artwork-prev]").addEventListener("click", () => renderArtwork(current - 1));
  modal.querySelector("[data-artwork-next]").addEventListener("click", () => renderArtwork(current + 1));
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    renderArtwork(current + (event.key === "ArrowLeft" ? -1 : 1));
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      const rect = modal.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
    }
  });
  const stage = modal.querySelector(".artwork-stage");
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
      const dx = event.changedTouches[0].clientX - touch.x;
      const dy = event.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) renderArtwork(current + (dx < 0 ? 1 : -1));
      touch = null;
    },
    { passive: true }
  );
  stage.addEventListener("touchcancel", () => {
    touch = null;
  });
  modal.addEventListener("close", () => {
    request++;
    image.removeAttribute("src");
    document.body.classList.remove("artwork-open");
    origin?.focus({ preventScroll: true });
  });
  updateCount();
})();
