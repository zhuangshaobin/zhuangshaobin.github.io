"use strict";
const navigationToggle = document.querySelector(".nav-menu-toggle");
const mainNavigation = document.querySelector("#site-navigation");
function closeNavigation() {
  navigationToggle.setAttribute("aria-expanded", "false");
}
navigationToggle.addEventListener("click", () => {
  navigationToggle.setAttribute("aria-expanded", String(navigationToggle.getAttribute("aria-expanded") !== "true"));
});
mainNavigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeNavigation();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigationToggle.getAttribute("aria-expanded") === "true") {
    closeNavigation();
    navigationToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeNavigation();
});
matchMedia("(max-width: 760px)").addEventListener("change", closeNavigation);
const imagePreviews = JSON.parse(document.querySelector("#preview-data").textContent);
function setPreview(image, filename, sizes) {
  const preview = imagePreviews[filename];
  image.dataset.full = `assets/${filename}`;
  image.decoding = "async";
  if (preview) {
    image.sizes = sizes || preview.sizes;
    image.srcset = preview.srcset;
    image.src = preview.src;
  } else {
    image.removeAttribute("srcset");
    image.src = `assets/${filename}`;
  }
}

const range = document.querySelector("#comparison-range");
const comparison = document.querySelector(".comparison");
function updateComparison() {
  const split = Number(range.value);
  comparison.style.setProperty("--split", `${split}%`);
  range.setAttribute("aria-valuetext", `${split} percent source visible`);
}
range.addEventListener("input", updateComparison);
let comparisonPointer = null;
function moveDivider(clientX) {
  const bounds = comparison.getBoundingClientRect();
  range.value = String(Math.round(Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100))));
  updateComparison();
}
range.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  comparisonPointer = event.pointerId;
  range.setPointerCapture(event.pointerId);
  range.focus({ preventScroll: true });
  moveDivider(event.clientX);
});
range.addEventListener("pointermove", (event) => {
  if (event.pointerId === comparisonPointer) moveDivider(event.clientX);
});
function finishComparisonDrag(event) {
  if (event.pointerId !== comparisonPointer) return;
  comparisonPointer = null;
  if (range.hasPointerCapture(event.pointerId)) range.releasePointerCapture(event.pointerId);
}
range.addEventListener("pointerup", finishComparisonDrag);
range.addEventListener("pointercancel", finishComparisonDrag);
updateComparison();

const edits = {
  paper: {
    before: "paper-world.webp",
    after: "paper-night.webp",
    ratio: "2 / 1",
    inputAlt: "A miniature paper mountain city and red train in warm studio light",
    outputAlt: "The paper mountain city edited into a moonlit scene with illuminated windows",
    description:
      "Reimagine the paper city at night. A reference image guides the architecture, train, and handcrafted material as the lighting changes.",
  },
  season: {
    before: "atrium.webp",
    after: "atrium-winter.webp",
    ratio: "2 / 1",
    inputAlt: "A miniature green mountain city inside a transparent sphere in a museum atrium",
    outputAlt: "The miniature city transformed into a snow-covered winter scene",
    description: "Turn a miniature mountain city into a winter scene, using the original atrium image as visual context.",
  },
  landscape: {
    before: "landscape-input.webp",
    after: "landscape-output.webp",
    inputAlt: "A landscape with mountains, water, and architecture",
    outputAlt: "The landscape translated into a monochrome Chinese ink painting",
    description: "Turn a landscape into an ink painting while retaining its scene. Move the slider to explore the transformation.",
  },
  architecture: {
    before: "architecture-input.webp",
    after: "architecture-output.webp",
    inputAlt: "A rough black-and-white architectural floor-plan sketch",
    outputAlt: "A photorealistic concept rendering of a modern multi-level home with greenery",
    description:
      "Turn a black-and-white sketch into a photorealistic architectural concept. This is a visual interpretation, not a dimensionally verified reconstruction.",
  },
  reef: {
    before: "glass-city.webp",
    after: "glass-reef.webp",
    ratio: "1 / 1",
    inputAlt: "A glass elephant sculpture containing a miniature city and railway",
    outputAlt: "The glass elephant containing an underwater coral garden with fish and sea turtles",
    description:
      "Replace the miniature city inside a glass elephant with a coral reef, using the sculpture, reflections, and viewpoint as visual context.",
  },
};
const tabs = [...document.querySelectorAll("[data-edit]")];
function selectEdit(tab, focus = false) {
  for (const item of tabs) {
    item.setAttribute("aria-selected", String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  }
  const edit = edits[tab.dataset.edit];
  comparison.style.aspectRatio = edit.ratio || "3 / 2";
  const before = comparison.querySelector(".comparison-before");
  const after = comparison.querySelector(".comparison-base");
  setPreview(before, edit.before, "92vw");
  before.alt = edit.inputAlt;
  setPreview(after, edit.after, "92vw");
  after.alt = edit.outputAlt;
  document.querySelector("#edit-description").textContent = edit.description;
  document.querySelector("#edit-panel").setAttribute("aria-labelledby", tab.id);
  range.value = 50;
  updateComparison();
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.id = `edit-tab-${tab.dataset.edit}`;
  tab.addEventListener("click", () => selectEdit(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectEdit(tabs[next], true);
  });
});
selectEdit(tabs[0]);

const dialog = document.querySelector(".image-dialog");
let previousFocus;
let fullImageRequest = 0;
function showImage(image) {
  previousFocus = document.activeElement;
  const request = ++fullImageRequest;
  const target = dialog.querySelector("img");
  const caption = dialog.querySelector("p");
  const full = image.dataset?.full || image.src;
  target.src = image.currentSrc || image.src;
  target.alt = image.alt || "WeGen2 image";
  caption.textContent = image.alt || "WeGen2 image";
  dialog.querySelector(".dialog-original").href = full;
  dialog.showModal();
  if (full && full !== target.src) {
    const original = new Image();
    original.decoding = "async";
    original.onload = () => {
      if (request === fullImageRequest && dialog.open) target.src = original.src;
    };
    original.src = full;
  }
}

for (const image of document.querySelectorAll("img[data-zoom]")) {
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.setAttribute("aria-label", `View full image: ${image.alt}`);
  image.addEventListener("click", () => showImage(image));
  image.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showImage(image);
    }
  });
}
for (const button of document.querySelectorAll("[data-open-image]"))
  button.addEventListener("click", () => {
    const existing = [...document.querySelectorAll("img[data-full]")].find(
      (image) => image.dataset.full.split("?")[0] === `assets/${button.dataset.openImage}`.split("?")[0]
    );
    showImage(existing || { src: `assets/${button.dataset.openImage}`, alt: "Full WeGen2 generation" });
  });
dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => {
  fullImageRequest++;
  previousFocus?.focus({ preventScroll: true });
});

const stage = document.querySelector(".reference-stage");
const output = document.querySelector("#tryon-result");
const lineCanvas = document.querySelector("#reference-lines");
const referenceStatus = document.querySelector("#reference-status");
const referenceButtons = [...document.querySelectorAll("[data-reference]")];
let referenceItems = [],
  activeReference = null;
function svgNode(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
  return el;
}
function drawReference() {
  lineCanvas.replaceChildren();
  if (!activeReference) return;
  const item = referenceItems.find((i) => i.id === activeReference);
  if (!item?.enabled) return;
  const parent = stage.getBoundingClientRect(),
    im = output.getBoundingClientRect();
  const button = referenceButtons.find((b) => Number(b.dataset.reference) === item.id).getBoundingClientRect();
  lineCanvas.setAttribute("viewBox", `0 0 ${parent.width} ${parent.height}`);
  const [x0, y0, x1, y1] = item.bbox;
  const bx = im.left - parent.left + x0 * im.width,
    by = im.top - parent.top + y0 * im.height,
    bw = (x1 - x0) * im.width,
    bh = (y1 - y0) * im.height;
  const startX = button.right - parent.left,
    startY = button.top - parent.top + button.height / 2;
  const endX = bx - 3,
    endY = by + bh / 2;
  const middle = (startX + endX) / 2;
  const path = `M${startX},${startY} C${middle},${startY} ${middle},${endY} ${endX},${endY}`;
  // On narrow screens the selected source and result outline communicate the
  // relationship without drawing a line across the other reference images.
  if (matchMedia("(min-width: 761px)").matches) {
    lineCanvas.append(svgNode("path", { d: path, fill: "none", stroke: "#fafbf7df", "stroke-width": 4, "stroke-linecap": "round" }));
    lineCanvas.append(svgNode("path", { d: path, fill: "none", stroke: "#16885a", "stroke-width": 1.5, "stroke-linecap": "round" }));
  }
  lineCanvas.append(
    svgNode("rect", {
      x: bx - 3,
      y: by - 3,
      width: bw + 6,
      height: bh + 6,
      rx: Math.min(6, bh / 3),
      fill: "#0db16e0a",
      stroke: "#ffffffdf",
      "stroke-width": 4,
    })
  );
  lineCanvas.append(
    svgNode("rect", {
      x: bx - 3,
      y: by - 3,
      width: bw + 6,
      height: bh + 6,
      rx: Math.min(6, bh / 3),
      fill: "none",
      stroke: "#16885a",
      "stroke-width": 1.5,
    })
  );
  if (matchMedia("(min-width: 761px)").matches) {
    lineCanvas.append(svgNode("circle", { cx: endX, cy: endY, r: 3, fill: "#16885a", stroke: "white", "stroke-width": 1.5 }));
  }
}
function selectReference(id) {
  activeReference = id;
  referenceButtons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.reference) === id)));
  const item = referenceItems.find((i) => i.id === id);
  if (!item) {
    referenceStatus.textContent = "Select a reference to explore the outfit.";
    lineCanvas.replaceChildren();
    return;
  }
  referenceStatus.textContent = item.enabled
    ? `${String(id).padStart(2, "0")} / ${item.label} — visible correspondence in the generated outfit.`
    : "07 / Dark glasses — shown as a reference; the generated frame shape differs.";
  drawReference();
}
referenceButtons.forEach((b) => b.addEventListener("click", () => selectReference(Number(b.dataset.reference))));
document.querySelector("#clear-reference").addEventListener("click", () => selectReference(null));
Promise.resolve(JSON.parse(document.querySelector("#reference-data").textContent))
  .then((items) => {
    referenceItems = items;
  })
  .catch(() => {
    referenceStatus.textContent = "Reference images guide the generated outfit.";
  });
new ResizeObserver(drawReference).observe(stage);
output.addEventListener("load", drawReference);

const diagramStart =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 400" aria-hidden="true"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto-start-reverse"><path d="M1 1 6 4 1 7" fill="none" stroke="#51705c" stroke-width="1.5"/></marker></defs><g style="font-family:var(--sans)" fill="#073f32">';
const diagramEnd = "</g></svg>";
const box = (x, y, w, h, label, fill = "#f8fcf5", stroke = "#b7cdb5", size = 17) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="15" fill="${fill}" stroke="${stroke}"/><text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-size="${size}">${label}</text>`;
const line = (x1, y1, x2, y2, color = "#51705c", both = false) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2" marker-end="url(#arrow)" ${both ? 'marker-start="url(#arrow)"' : ""}/>`;
const small = (x, y, text) => `<text x="${x}" y="${y}" font-size="13" fill="#637b67">${text}</text>`;
function pixelGrid(x, y) {
  let str = "";
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      str += `<rect x="${x + c * 18}" y="${y + r * 18}" width="15" height="15" rx="2" fill="${["#0db16e", "#56bc80", "#b5e3af", "#285f42", "#e7c99b"][(r * 3 + c) % 5]}"/>`;
  return str;
}
const features = {
  pixels: {
    number: "01",
    heading: "Directly in image space.",
    description:
      "Learned patch modules connect RGB images and the backbone. No separate pretrained vision encoder or latent autoencoder is used at inference.",
    alt: "RGB image patches are connected directly to the multimodal backbone through learned input and output modules.",
    svg:
      diagramStart +
      small(34, 68, "RGB INPUT") +
      pixelGrid(34, 91) +
      line(128, 134, 180, 134) +
      box(188, 103, 158, 62, "Patchify") +
      line(352, 134, 403, 134) +
      box(410, 78, 300, 112, "Multimodal backbone", "#d4efcf", "#87bd91", 22) +
      `<path d="M560 195 V251 H350" fill="none" stroke="#51705c" stroke-width="2" marker-end="url(#arrow)"/>` +
      box(188, 220, 158, 62, "Unpatchify") +
      line(183, 251, 129, 251) +
      pixelGrid(34, 213) +
      small(34, 335, "RGB OUTPUT") +
      small(410, 335, "Learned modules. Native pixels.") +
      diagramEnd,
  },
  mot: {
    number: "02",
    heading: "Two roles. Joint attention.",
    description:
      "Understanding reads text and clean images. Generation reconstructs the target through its own image and timestep residual pathways. Joint attention connects the branches.",
    alt: "Understanding and generation are connected through joint attention. Image residual and timestep residual pathways are contained inside Generation.",
    svg:
      diagramStart +
      small(42, 42, "CONTEXT") +
      small(425, 42, "TARGET") +
      box(42, 60, 286, 44, "Text + clean images", "#f8fcf5", "#b7cdb5", 15) +
      box(425, 60, 286, 44, "Noise image + timestep", "#f8fcf5", "#b7cdb5", 15) +
      line(185, 111, 185, 145) +
      line(568, 111, 568, 145) +
      box(42, 155, 286, 105, "Understanding", "#f8fcf5", "#96bca0", 22) +
      '<g id="generation-branch"><rect x="425" y="155" width="286" height="207" rx="15" fill="#e6f4e5" stroke="#88b996" stroke-width="2"/><text x="568" y="191" text-anchor="middle" font-size="22" font-weight="600">Generation</text><path d="M443 207 H693" stroke="#a9cdb0"/>' +
      box(443, 224, 250, 48, "Image residual", "#cef0d5", "#a9cdb0", 16) +
      box(443, 292, 250, 48, "Timestep residual", "#cef0d5", "#a9cdb0", 16) +
      "</g>" +
      line(339, 197, 413, 197) +
      line(413, 220, 339, 220) +
      '<text x="376" y="278" text-anchor="middle" font-size="13">Joint</text><text x="376" y="295" text-anchor="middle" font-size="13">attention</text>' +
      small(42, 341, "A-MoT / Asymmetrical branches") +
      diagramEnd,
  },
  moe: {
    number: "03",
    heading: "Shared knowledge. Routed expertise.",
    description:
      "Every token receives the shared expert’s output. A router also selects specialized experts for that token, and their contributions are combined.",
    alt: "Every token uses a shared expert and a router-selected subset of experts. Their outputs are combined.",
    svg:
      diagramStart +
      box(28, 170, 116, 54, "Token") +
      `<path d="M148 197 H190 V92 H232 M190 197 V293 H232" fill="none" stroke="#51705c" stroke-width="2" marker-end="url(#arrow)"/>` +
      box(239, 63, 198, 59, "Shared expert", "#b6e9be", "#6cba84", 19) +
      small(275, 145, "Always active") +
      box(239, 263, 116, 59, "Router", "#f8fcf5", "#b7cdb5", 18) +
      line(360, 292, 403, 292) +
      box(412, 231, 56, 45, "1", "#b6e9be", "#6cba84", 15) +
      box(479, 231, 56, 45, "2", "#edf2e8", "#c4d2c0", 15) +
      box(546, 231, 56, 45, "3", "#b6e9be", "#6cba84", 15) +
      box(412, 288, 56, 45, "4", "#edf2e8", "#c4d2c0", 15) +
      box(479, 288, 56, 45, "5", "#b6e9be", "#6cba84", 15) +
      box(546, 288, 56, 45, "6", "#edf2e8", "#c4d2c0", 15) +
      small(410, 365, "Illustrative expert selection") +
      `<path d="M442 93 H657 V174 M610 281 H657 V216" fill="none" stroke="#51705c" stroke-width="2" marker-end="url(#arrow)"/><circle cx="657" cy="196" r="22" fill="#f8fcf5" stroke="#8dbb98"/><text x="657" y="203" text-anchor="middle" font-size="24">+</text>` +
      line(684, 196, 730, 196) +
      diagramEnd,
  },
};
const methodTabs = [...document.querySelectorAll("[data-method]")];
function setMethod(key, focus = false) {
  const f = features[key];
  document.querySelector("#method-panel").setAttribute("aria-labelledby", `method-tab-${key}`);
  methodTabs.forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.method === key));
    b.tabIndex = b.dataset.method === key ? 0 : -1;
    if (focus && b.dataset.method === key) b.focus();
  });
  document.querySelector("#method-number").textContent = f.number;
  document.querySelector("#method-heading").textContent = f.heading;
  document.querySelector("#method-description").textContent = f.description;
  const d = document.querySelector("#model-diagram");
  d.innerHTML = f.svg;
  d.setAttribute("aria-label", f.alt);
}
methodTabs.forEach((b, i) => {
  b.id = `method-tab-${b.dataset.method}`;
  b.setAttribute("aria-controls", "method-panel");
  b.addEventListener("click", () => setMethod(b.dataset.method));
  b.addEventListener("keydown", (e) => {
    let n;
    if (e.key === "ArrowRight") n = (i + 1) % methodTabs.length;
    if (e.key === "ArrowLeft") n = (i + methodTabs.length - 1) % methodTabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = methodTabs.length - 1;
    if (n !== undefined) {
      e.preventDefault();
      setMethod(methodTabs[n].dataset.method, true);
    }
  });
});
setMethod("pixels");

const copyButton = document.querySelector(".copy-code");
copyButton.addEventListener("click", async () => {
  const code = document.querySelector(".code-card code").textContent;
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(code);
    status.textContent = "Python example copied.";
    copyButton.textContent = "Copied";
    setTimeout(() => (copyButton.textContent = "Copy"), 1800);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(".code-card code"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = "Code selected. Use your device’s copy command.";
  }
});
const icons = {
  github: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-17-2 20"/>',
  weights: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  paper: '<path d="M6 2h8l4 4v16H6zM14 2v5h4M9 11h6M9 15h6"/>',
};
Promise.resolve(JSON.parse(document.querySelector("#links-data").textContent))
  .then((links) => {
    const container = document.querySelector("#resource-links");
    const resourceUrl = (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : null;
      } catch {
        return null;
      }
    };
    const makeResource = (key, label, pill = false) => {
      const url = resourceUrl(links[key]);
      const node = document.createElement(url ? "a" : "span");
      node.dataset.resource = key;
      if (pill) node.className = "resource-pill";
      if (url) {
        node.href = url;
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      } else {
        node.setAttribute("role", "link");
        node.setAttribute("aria-disabled", "true");
        node.title = `${label} will be available after release`;
        node.classList.add("resource-unavailable");
      }
      const icon = pill ? "" : `<svg class="resource-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`;
      node.innerHTML = `${icon}<span>${label}</span>${url ? "" : "<small>Coming soon</small>"}`;
      return node;
    };
    container.replaceChildren();
    for (const [key, label] of [
      ["paper", "Paper"],
      ["github", "Code"],
      ["weights", "Weights"],
    ]) {
      container.append(makeResource(key, label));
      document.querySelectorAll(`.hero-resources [data-resource="${key}"]`).forEach((el) => {
        el.replaceWith(makeResource(key, label, true));
      });
      const url = resourceUrl(links[key]);
      if (url)
        document.querySelectorAll(`a[data-resource="${key}"]`).forEach((el) => {
          el.href = url;
        });
    }
    container.hidden = false;
  })
  .catch(() => {});
// Sections remain visible without animation or script-dependent reveal states.
