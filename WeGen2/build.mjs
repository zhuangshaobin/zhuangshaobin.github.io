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
replaceBlock(
  "STYLE",
  `<style>\n${read("style.css")}
${read("editorial.css")}\n</style>`
);
const gallery = JSON.parse(read("gallery.json"));
const scroll = JSON.parse(read("scroll.json"));
const byId = new Map(gallery.map((item) => [item.id, item]));
if (scroll.some((group) => ![4, 7, 10].includes(group.length))) throw new Error("Each artwork group needs four, seven or ten cases");
const scrollIds = scroll.flat();
if (new Set(scrollIds).size !== scrollIds.length || scrollIds.some((id) => !byId.has(id))) {
  throw new Error("Artwork cases must be unique and present in the gallery");
}
// The upper ribbon uses original image ratios at a common height. A separate
// repeat period lets it cover the whole band without cropping or letterboxing.
const canopyIds = JSON.parse(read("canopy.json")).flat();
if (new Set(canopyIds).size !== canopyIds.length || canopyIds.some((id) => !byId.has(id))) {
  throw new Error("Upper-ribbon works must be distinct and present in the gallery");
}
const preview = (item, width) => `assets/canvas/${escapeHtml(item.asset || item.id)}-${width}.webp`;
const atlas = JSON.parse(read("canvas-atlas.json"));
const atlasGroups = new Map(atlas.groups.map((group) => [group.id, group]));
const canvasImage = (item, eager, priority = false) => {
  const tile = atlas.items[item.id];
  if (!tile) throw new Error(`Rebuild canvas atlases for ${item.id}`);
  const group = atlasGroups.get(tile.group);
  const style = `width:${(100 * group.width) / tile.width}%;height:${(100 * group.height) / tile.height}%;left:${(-100 * tile.x) / tile.width}%;top:${(-100 * tile.y) / tile.height}%`;
  return `<img class="art-scroll-atlas" data-atlas="${group.id}" data-detail="${group.detail}" style="${style}" ${eager ? "src" : "data-src"}="${group.preview}" width="${item.width}" height="${item.height}" decoding="async"${priority ? ' fetchpriority="high"' : ""} alt="${escapeHtml(item.alt)}" draggable="false" />`;
};
const canopy = (clone) =>
  canopyIds
    .map((id, index) => {
      const item = byId.get(id);
      const eager = !clone && index < 3;
      return `<button class="art-scroll-card art-scroll-upper-card" style="aspect-ratio:${item.width}/${item.height}" type="button" data-artwork="${escapeHtml(id)}" aria-label="Explore ${escapeHtml(item.title)}"${clone ? ' tabindex="-1"' : ""}>
      ${canvasImage(item, eager, eager && index === 0)}
    </button>`;
    })
    .join("");
const scrollCards = (clone) =>
  scroll
    .map((group, index) => {
      const ratios = group.map((id) => byId.get(id).width / byId.get(id).height);
      const compact = group.length === 4;
      const dense = group.length === 10;
      const featurePositions = compact ? [0, 2] : dense ? [0, 4, 7] : [0, 4];
      const leftPositions = dense ? [2, 5, 8] : [2, 5];
      const rightPositions = dense ? [3, 6, 9] : [3, 6];
      const stackHeight = (positions) => positions.reduce((sum, position) => sum + 1 / ratios[position], 0);
      // Fit two complete-image stacks and one wide image to a common height.
      // The widths follow the artwork ratios, so no tile needs to be cropped.
      const leftPair = compact ? 0 : 1 / stackHeight(leftPositions);
      const rightPair = compact ? 0 : 1 / stackHeight(rightPositions);
      const pairRatio = leftPair + rightPair;
      const dimensions = compact
        ? `--feature-stack:${stackHeight(featurePositions)};--feature-gaps:1;--cluster-stack:${1 / ratios[1] + 1 / ratios[3]};--cluster-gaps:1`
        : `--feature-stack:${stackHeight(featurePositions)};--feature-gaps:${featurePositions.length - 1};--cluster-stack:${1 / ratios[1] + 1 / pairRatio};--cluster-gaps:${leftPositions.length - 1 / pairRatio};--pair-share:${leftPair / pairRatio}`;
      const cards = group.map((id, position) => {
        const item = byId.get(id);
        if (!item) throw new Error(`Missing scroll case: ${id}`);
        const eager = !clone && index === 0;
        const contain = item.preserveLayout || ["Text & layout", "Multi-panel generation"].includes(item.task);
        return `<button class="art-scroll-card tile-${position}${contain ? " preserve-layout" : ""}${item.task === "Text & layout" || item.preserveLayout ? " text-rich" : ""}" style="aspect-ratio:${item.width}/${item.height}" type="button" data-artwork="${escapeHtml(id)}" aria-label="Explore ${escapeHtml(item.title)}"${clone ? ' tabindex="-1"' : ""}>
  ${canvasImage(item, eager, eager && position === 0)}
  <span class="art-scroll-caption"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.task)}</small></span></button>`;
      });
      const mosaic = compact
        ? `<div class="art-scroll-feature">${cards[0]}${cards[2]}</div><div class="art-scroll-cluster">${cards[1]}${cards[3]}</div>`
        : `<div class="art-scroll-feature">${featurePositions.map((p) => cards[p]).join("")}</div><div class="art-scroll-cluster">${cards[1]}<div class="art-scroll-pairs"><div>${leftPositions.map((p) => cards[p]).join("")}</div><div>${rightPositions.map((p) => cards[p]).join("")}</div></div></div>`;
      return `<div class="art-scroll-group ${index % 2 ? "is-reversed" : ""}${dense ? " is-dense" : ""}" style="${dimensions}"><div class="art-scroll-mosaic">${mosaic}</div></div>`;
    })
    .join("");
replaceBlock(
  "SCROLL",
  `<section class="art-scroll" aria-label="A moving canvas of WeGen2 creations">
  <div class="art-scroll-light" aria-hidden="true"></div>
  <div class="art-scroll-viewport" tabindex="0" aria-label="Artwork panorama. Drag to explore, or use the left and right arrow keys.">
    <div class="art-scroll-veil" aria-hidden="true"></div>
    <div class="art-scroll-upper-track"><div class="art-scroll-upper-cycle">${canopy(false)}</div><div class="art-scroll-upper-cycle" aria-hidden="true">${canopy(true)}</div></div>
    <div class="art-scroll-track"><div class="art-scroll-cycle">${scrollCards(false)}</div><div class="art-scroll-cycle" aria-hidden="true">${scrollCards(true)}</div></div>
  </div>
  <div class="art-scroll-controls"><p>A collection of imagined worlds.</p><div><span class="art-scroll-hint">Drag to explore</span><button type="button" data-scroll-toggle aria-pressed="false" aria-label="Pause artwork motion"><i aria-hidden="true"></i><span>Pause</span></button><a href="#gallery">Explore capabilities</a></div></div>
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
      const capability = { "Text & layout": "Create", "Multi-turn editing": "Edit", "Reference composition": "Combine" }[item.task];
      const frames = item.frames || [];
      const miniatures =
        frames.length > 1
          ? `<span class="gallery-mini-strip" aria-hidden="true">${frames
              .slice(0, -1)
              .map(
                (frame) =>
                  `<span><img data-src="assets/gallery/${escapeHtml(frame.asset)}-160.webp" width="${frame.width}" height="${frame.height}" decoding="async" alt="" /><span>${escapeHtml(frame.label)}</span></span>`
              )
              .join("")}<span class="gallery-result-label">${escapeHtml(frames.at(-1).label)} above</span></span>`
          : "";
      return `<figure class="gallery-card" data-category="${task}">
    <p class="gallery-capability">${escapeHtml(capability)}</p>
    <button class="gallery-open" type="button" data-artwork="${id}" aria-label="Explore ${escapeHtml(item.title)}">
      <span class="gallery-main-image"><img data-src="${preview(item, 480)}" data-srcset="${preview(item, 480)} 480w, assets/gallery/${asset}-960.webp ${Math.min(960, item.width)}w" sizes="(max-width: 600px) calc(100vw - 40px), (max-width: 1000px) 46vw, 30vw" width="${item.width}" height="${item.height}" decoding="async" alt="${escapeHtml(item.alt)}" />
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
