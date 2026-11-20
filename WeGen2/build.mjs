import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Keep critical presentation and interactions in the HTML response.
const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(root, name), "utf8");
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let html = read("index.html");
function replaceBlock(name, content) {
  const pattern = new RegExp(`<!-- INLINE_${name}_START -->[\\s\\S]*?<!-- INLINE_${name}_END -->`);
  if (!pattern.test(html)) throw new Error(`Missing inline ${name} markers`);
  html = html.replace(pattern, () => `<!-- INLINE_${name}_START -->\n${content}\n<!-- INLINE_${name}_END -->`);
}
replaceBlock("STYLE", `<style>\n${read("style.css")}\n</style>`);
const gallery = JSON.parse(read("gallery.json"));
const scroll = JSON.parse(read("scroll.json"));
const byId = new Map(gallery.map((item) => [item.id, item]));
if (scroll.some((group) => group.length !== 7)) throw new Error("Each artwork group needs seven cases");
const scrollIds = scroll.flat();
if (new Set(scrollIds).size !== scrollIds.length || scrollIds.some((id) => !byId.has(id))) {
  throw new Error("Artwork cases must be unique and present in the gallery");
}
const scrollCards = (clone) =>
  scroll
    .map(
      (group, index) =>
        `<div class="art-scroll-group ${index % 2 ? "is-reversed" : ""}" style="--feature-ratio:${byId.get(group[0]).width / byId.get(group[0]).height}">${group
          .map((id, position) => {
            const item = byId.get(id);
            if (!item) throw new Error(`Missing scroll case: ${id}`);
            const asset = escapeHtml(item.asset || item.id);
            const eager = !clone && index === 0 && position === 0;
            const contain = item.preserveLayout || ["Text & layout", "Multi-panel generation"].includes(item.task);
            const previewWidth = position === 0 ? 480 : position === 1 ? 640 : 320;
            return `<button class="art-scroll-card tile-${position}${contain ? " preserve-layout" : ""}${item.width < item.height ? " portrait-preview" : ""}${item.task === "Text & layout" || item.preserveLayout ? " text-rich" : ""}" type="button" data-artwork="${escapeHtml(id)}" aria-label="Explore ${escapeHtml(item.title)}"${clone ? ' tabindex="-1"' : ""}>
  <img ${eager ? "src" : "data-src"}="assets/scroll/${asset}-${previewWidth}.webp" width="${item.width}" height="${item.height}" decoding="async" ${eager ? 'fetchpriority="high"' : ""} alt="${escapeHtml(item.alt)}" draggable="false" />
  <span class="art-scroll-caption"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.task)}</small></span></button>`;
          })
          .join("")}</div>`
    )
    .join("");
replaceBlock(
  "SCROLL",
  `<section class="art-scroll" aria-label="A moving canvas of WeGen2 creations">
  <div class="art-scroll-light" aria-hidden="true"></div>
  <div class="art-scroll-viewport" tabindex="0" aria-label="Artwork panorama. Drag to explore, or use the left and right arrow keys.">
    <div class="art-scroll-track"><div class="art-scroll-cycle">${scrollCards(false)}</div><div class="art-scroll-cycle" aria-hidden="true">${scrollCards(true)}</div></div>
  </div>
  <div class="art-scroll-controls"><p>Many worlds. One model.</p><div><span class="art-scroll-hint">Drag to explore</span><button type="button" data-scroll-toggle aria-pressed="false" aria-label="Pause artwork motion"><i aria-hidden="true"></i><span>Pause</span></button><a href="#gallery">Explore capabilities</a></div></div>
</section>`
);
replaceBlock(
  "GALLERY",
  gallery
    .filter((item) => item.featured === true)
    .map((item) => {
      const id = escapeHtml(item.id);
      const asset = escapeHtml(item.asset || item.id);
      const task = escapeHtml(item.task || "Text to image");
      const frames = item.frames || [];
      const miniatures =
        frames.length > 1
          ? `<span class="gallery-mini-strip" aria-hidden="true">${frames
              .slice(0, -1)
              .map(
                (frame) =>
                  `<span><img src="assets/gallery/${escapeHtml(frame.asset)}-160.webp" width="${frame.width}" height="${frame.height}" loading="lazy" decoding="async" alt="" /><span>${escapeHtml(frame.label)}</span></span>`
              )
              .join("")}<span class="gallery-result-label">${escapeHtml(frames.at(-1).label)} above</span></span>`
          : "";
      return `<figure class="gallery-card" data-category="${task}">
    <button class="gallery-open" type="button" data-artwork="${id}" aria-label="Explore ${escapeHtml(item.title)}">
      <span class="gallery-main-image"><img src="assets/gallery/${asset}-480.webp" srcset="assets/gallery/${asset}-480.webp 480w, assets/gallery/${asset}-960.webp ${Math.min(960, item.width)}w" sizes="(max-width: 600px) calc(100vw - 40px), (max-width: 1000px) 46vw, 30vw" width="${item.width}" height="${item.height}" loading="lazy" decoding="async" alt="${escapeHtml(item.alt)}" />
      <span class="gallery-open-label" aria-hidden="true">${frames.length > 1 ? "Explore the process" : "View artwork"} <span>+</span></span></span>
      ${miniatures}
    </button>
    <figcaption><h3>${escapeHtml(item.title)}</h3><span>${task}${frames.length > 1 ? ` · ${frames.length} images` : ""}</span></figcaption>
  </figure>`;
    })
    .join("\n")
);
replaceBlock(
  "DATA",
  [
    ["reference", "reference-map.json"],
    ["links", "links.json"],
    ["preview", "preview-map.json"],
    ["film-config", "film-config.json"],
    ["gallery", "gallery.json"],
  ]
    .map(
      ([id, file]) => `<script type="application/json" id="${id}-data">${JSON.stringify(JSON.parse(read(file))).replaceAll("<", "\\u003c")}</script>`
    )
    .join("\n")
);
replaceBlock(
  "APP",
  `<script>\n${read("app.js") + "\n" + read("film-player.js") + "\n" + read("gallery.js") + "\n" + read("art-scroll.js")}\n</script>`
);
writeFileSync(join(root, "index.html"), html);
console.log("Prepared standalone WeGen2 HTML");
