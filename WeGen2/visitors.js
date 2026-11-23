// The counter image records the visit. This endpoint only reads aggregate geography.
const visitorCounter = document.querySelector("#visitor-count");
const visitorDots = document.querySelector("#visitor-dots");
const visitorMapStatus = document.querySelector("#visitor-map-status");

async function drawVisitorRegions() {
  try {
    const [stats, anchors] = await Promise.all(
      ["https://www.stats4u.net/?action=globedata&s4uid=1034861267", "assets/visitor-regions.json"].map(async (url) => {
        const response = await fetch(url, { credentials: "omit", referrerPolicy: "origin" });
        if (!response.ok) throw new Error("Visitor map unavailable");
        return response.json();
      })
    );
    if (!stats.c || typeof stats.c !== "object") throw new Error("Missing visitor regions");
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    const regions = Object.entries(stats.c).filter(([code, counts]) => anchors[code] && counts[0] > 0);
    for (const [code] of regions) {
      const [x, y] = anchors[code];
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", "4");
      const title = document.createElementNS(dot.namespaceURI, "title");
      title.textContent = names.of(code);
      dot.append(title);
      visitorDots.append(dot);
    }
    visitorMapStatus.textContent = regions.length ? "" : "Waiting for the first mapped region.";
  } catch {
    visitorMapStatus.textContent = "Visitor locations are temporarily unavailable.";
  }
}

function onVisitorCountReady() {
  if (!visitorCounter.naturalWidth) {
    visitorCounter.hidden = true;
    visitorCounter.parentElement.textContent = "View visitor count ↗";
  }
  drawVisitorRegions();
}
if (visitorCounter.complete) onVisitorCountReady();
else {
  visitorCounter.addEventListener("load", onVisitorCountReady, { once: true });
  visitorCounter.addEventListener("error", onVisitorCountReady, { once: true });
}
