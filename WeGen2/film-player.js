(() => {
  const video = document.querySelector(".showcase-film");
  const start = document.querySelector(".film-start");
  const button = document.querySelector("#film-start-button");
  const quality = document.querySelector("#film-quality");
  const status = document.querySelector(".film-playback-status");
  const config = JSON.parse(document.querySelector("#film-config-data").textContent);
  const mediaRoot = new URL(config.mediaPath, document.baseURI).href;
  const origins = [mediaRoot, ...config.mirrors];
  let preferredOrigin = 0;
  let hls = null;
  let libraryPromise = null;
  let initializing = null;
  let mode = "";
  let started = false;
  let wantedPlayback = false;
  let pendingSeek = null;
  let recoveryCount = 0;
  let statusTimer = null;
  let fallbackTimer = null;

  video.controls = false;
  start.hidden = false;
  video.dataset.player = "adaptive";

  function message(text = "") {
    status.textContent = text;
    status.hidden = !text;
  }
  function showRetry() {
    start.hidden = false;
    button.disabled = false;
    button.querySelector(".film-start-label").textContent = "Resume film";
    message("Playback interrupted. Resume here, or download the film below.");
  }
  function playNative() {
    video.play().catch((error) => {
      if (error.name !== "AbortError" && wantedPlayback) showRetry();
    });
  }
  function applySeek() {
    if (pendingSeek === null || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(pendingSeek, Math.max(0, video.duration - 0.1));
    pendingSeek = null;
  }
  function updateQuality(height) {
    video.dataset.quality = String(height);
    quality.options[0].textContent = quality.value === "auto" ? `Auto (${height}p)` : "Auto";
  }

  function loadLibrary() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      let attempts = 0;
      let failures = 0;
      let finished = false;
      const scripts = [];
      const urls = [new URL(config.library, document.baseURI).href, config.libraryFallback];
      function done() {
        if (!window.Hls || finished) return;
        finished = true;
        clearTimeout(hedge);
        resolve(window.Hls);
      }
      function attempt() {
        if (finished || attempts === urls.length) return;
        const script = document.createElement("script");
        script.src = urls[attempts++];
        script.async = true;
        script.integrity = config.libraryIntegrity;
        script.crossOrigin = "anonymous";
        script.onload = done;
        script.onerror = () => {
          failures++;
          if (attempts < urls.length) attempt();
          if (failures === urls.length && !finished) {
            finished = true;
            clearTimeout(hedge);
            reject(new Error("Video player could not load"));
          }
        };
        scripts.push(script);
        document.head.append(script);
      }
      const hedge = setTimeout(attempt, 2500);
      attempt();
      setTimeout(() => {
        if (finished) return;
        finished = true;
        scripts.forEach((script) => script.remove());
        reject(new Error("Video player timed out"));
      }, 15000);
    }).catch((error) => {
      libraryPromise = null;
      throw error;
    });
    return libraryPromise;
  }

  // Keep HLS transport retries below the player: a failed route retries the same
  // small segment elsewhere, preserving the buffered timeline and current frame.
  function resilientLoader(Hls) {
    const Base = Hls.DefaultConfig.loader;
    return class {
      constructor(settings) {
        this.settings = settings;
        this.inner = new Base(settings);
        this.stats = this.inner.stats;
        this.context = null;
        this.cancelled = false;
        this.timer = null;
      }
      load(context, settings, callbacks) {
        this.context = context;
        const marker = "/film-hls-v1/";
        const position = context.url.indexOf(marker);
        const relative = position >= 0 ? context.url.slice(position + marker.length) : null;
        const order = relative === null ? [0] : [preferredOrigin, ...origins.map((_, i) => i).filter((i) => i !== preferredOrigin)];
        let attemptIndex = 0;
        const attempt = () => {
          if (this.cancelled) return;
          const route = order[attemptIndex++];
          this.inner.destroy();
          this.inner = new Base(this.settings);
          Object.assign(this.stats, this.inner.stats);
          this.inner.stats = this.stats;
          const requestContext = { ...context, url: relative === null ? context.url : origins[route] + relative };
          let done = false;
          let lastBytes = 0;
          let lastProgress = performance.now();
          const cleanup = () => {
            clearInterval(this.timer);
            this.timer = null;
          };
          const failed = (kind, args) => {
            if (done || this.cancelled) return;
            done = true;
            cleanup();
            if (attemptIndex < order.length) attempt();
            else callbacks[kind](...args);
          };
          const wrapped = {
            onSuccess: (response, stats, ignored, network) => {
              if (done || this.cancelled) return;
              done = true;
              cleanup();
              preferredOrigin = route;
              video.dataset.delivery = new URL(origins[route]).hostname;
              // Preserve the logical URL for relative playlist resolution.
              callbacks.onSuccess({ ...response, url: context.url }, stats, context, network);
            },
            onError: (error, ignored, network, stats) => failed("onError", [error, context, network, stats]),
            onTimeout: (stats, ignored, network) => failed("onTimeout", [stats, context, network]),
            onAbort: (stats, ignored, network) => callbacks.onAbort?.(stats, context, network),
            onProgress: (stats, ignored, data, network) => callbacks.onProgress?.(stats, context, data, network),
          };
          this.timer = setInterval(() => {
            if (this.stats.loaded !== lastBytes) {
              lastBytes = this.stats.loaded;
              lastProgress = performance.now();
            } else if (lastBytes > 0 && performance.now() - lastProgress > 2500 && attemptIndex < order.length) {
              failed("onTimeout", [this.stats, context, null]);
            }
          }, 250);
          const policy = { ...settings.loadPolicy, maxTimeToFirstByteMs: 2500, maxLoadTimeMs: 20000, timeoutRetry: null, errorRetry: null };
          this.inner.load(requestContext, { ...settings, loadPolicy: policy }, wrapped);
        };
        attempt();
      }
      abort() {
        this.cancelled = true;
        clearInterval(this.timer);
        this.inner.abort();
      }
      destroy() {
        this.cancelled = true;
        clearInterval(this.timer);
        this.inner.destroy();
      }
      getCacheAge() {
        return this.inner.getCacheAge?.() ?? null;
      }
      getResponseHeader(name) {
        return this.inner.getResponseHeader?.(name) ?? null;
      }
    };
  }

  function applyQuality() {
    if (mode === "hls") {
      const level = quality.value === "auto" ? -1 : hls.levels.findIndex((item) => item.height === Number(quality.value));
      hls.currentLevel = level;
      if (level === -1) quality.options[0].textContent = `Auto (${video.dataset.quality || 480}p)`;
      else quality.options[0].textContent = "Auto";
    } else if (mode === "native-hls") {
      pendingSeek = video.currentTime;
      video.src = mediaRoot + (quality.value === "auto" ? "master.m3u8" : `${quality.value}/index.m3u8`);
      video.load();
      if (wantedPlayback) playNative();
    } else if (mode === "mp4") fallbackMP4(pendingSeek ?? video.currentTime);
  }

  function fallbackMP4(position = 0) {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    mode = "mp4";
    video.dataset.player = "mp4-fallback";
    pendingSeek = position;
    const height = quality.value === "1080" ? 1080 : quality.value === "720" ? 720 : 480;
    updateQuality(height);
    video.src = `assets/wegen2-film${height === 1080 ? "" : "-" + height}.mp4`;
    video.load();
    if (wantedPlayback) playNative();
  }

  async function initialize() {
    if (initializing) return initializing;
    initializing = (async () => {
      let Hls;
      try {
        Hls = await loadLibrary();
      } catch {
        fallbackMP4(pendingSeek ?? 0);
        return;
      }
      if (Hls.isSupported()) {
        mode = "hls";
        video.dataset.player = "hls";
        hls = new Hls({
          loader: resilientLoader(Hls),
          startLevel: quality.value === "auto" ? 1 : [360, 480, 720, 1080].indexOf(Number(quality.value)),
          startPosition: pendingSeek ?? 0,
          capLevelToPlayerSize: true,
          maxDevicePixelRatio: 1.5,
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
          backBufferLength: 30,
          abrEwmaDefaultEstimate: 450000,
          abrBandWidthFactor: 0.8,
          abrBandWidthUpFactor: 0.6,
          maxStarvationDelay: 2,
          maxLoadingDelay: 2,
          enableWorker: true,
          progressive: false,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (quality.value !== "auto") applyQuality();
          if (wantedPlayback) playNative();
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => updateQuality(hls.levels[data.level].height));
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryCount++ < 2) {
            message("Reconnecting…");
            hls.startLoad(pendingSeek ?? video.currentTime);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryCount++ < 2) hls.recoverMediaError();
          else fallbackMP4(pendingSeek ?? video.currentTime);
        });
        hls.attachMedia(video);
        hls.loadSource(mediaRoot + "master.m3u8");
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        mode = "native-hls";
        video.dataset.player = "native-hls";
        video.src = mediaRoot + "master.m3u8";
        if (wantedPlayback) playNative();
      } else fallbackMP4(pendingSeek ?? 0);
    })();
    return initializing;
  }

  function playFilm(position) {
    wantedPlayback = true;
    started = true;
    if (Number.isFinite(position)) pendingSeek = Math.max(0, position);
    video.controls = true;
    start.hidden = true;
    message(mode ? "" : "Loading film…");
    if (!mode) initialize();
    else {
      if (hls) hls.startLoad(pendingSeek ?? video.currentTime);
      applySeek();
      playNative();
    }
  }
  button.addEventListener("click", () => playFilm());
  document.querySelectorAll("[data-seek]").forEach((item) => item.addEventListener("click", () => playFilm(Number(item.dataset.seek))));
  quality.addEventListener("change", applyQuality);
  video.addEventListener("loadedmetadata", applySeek);
  video.addEventListener("play", () => {
    wantedPlayback = true;
    if (hls) hls.startLoad(video.currentTime);
  });
  video.addEventListener("playing", () => {
    clearTimeout(statusTimer);
    clearTimeout(fallbackTimer);
    start.hidden = true;
    message("");
    recoveryCount = 0;
  });
  video.addEventListener("waiting", () => {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      if (!video.paused && video.readyState < 3) message("Buffering…");
    }, 900);
    if (mode === "mp4" && quality.value === "auto" && video.dataset.quality !== "480") {
      clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        if (!video.paused && video.readyState < 3) fallbackMP4(video.currentTime);
      }, 2500);
    }
  });
  video.addEventListener("pause", () => {
    wantedPlayback = false;
    clearTimeout(statusTimer);
    message("");
  });
  video.addEventListener("error", () => {
    if (mode === "mp4" || mode === "native-hls") showRetry();
  });
  window.addEventListener("offline", () => {
    if (!wantedPlayback) return;
    if (hls) hls.stopLoad();
    message("Waiting for connection…");
  });
  window.addEventListener("online", () => {
    if (!wantedPlayback) return;
    if (hls) hls.startLoad(pendingSeek ?? video.currentTime);
    else if (video.error) video.load();
    playNative();
  });
  if ("IntersectionObserver" in window) {
    const warmup = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadLibrary().catch(() => {});
          warmup.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    warmup.observe(video);
    new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting && started && !document.pictureInPictureElement) {
        video.pause();
        if (hls) hls.stopLoad();
      }
    }).observe(video);
  }
})();
