(() => {
  const trigger = document.getElementById("brand-modal-trigger");
  const modal = document.getElementById("brand-image-modal");
  const navbar = document.getElementById("navbar");

  if (!trigger || !modal || !navbar) return;

  const closeButton = modal.querySelector("[data-brand-modal-close]");
  const root = document.documentElement;
  const opticalTopVideo = document.getElementById("optical-guide-top-video");
  const allVideos = Array.from(modal.querySelectorAll("video"));
  const genericVideos = allVideos.filter((video) => video !== opticalTopVideo);

  const GENERIC_MAX_RETRIES = 3;
  const GENERIC_INITIAL_HEALTH_MS = [1000, 2500, 5000];
  const GENERIC_HEALTH_LOOP_MS = 2000;

  const OPTICAL_MAX_RETRIES = 20;
  const OPTICAL_HEALTH_LOOP_MS = 2000;

  const genericRetryCounts = new WeakMap();
  const genericRetryTimers = new WeakMap();
  const genericHealthTimers = new WeakMap();
  const genericPendingReadyHandlers = new WeakMap();
  const genericLastObservedTime = new WeakMap();

  let opticalRetryCount = 0;
  let opticalLastObservedTime = 0;
  let opticalRetryTimerId = null;
  let opticalHealthTimerId = null;

  const isOpen = () => modal.classList.contains("is-open");

  const getStartTime = (video) => {
    const start = Number(video.dataset.start);
    return Number.isFinite(start) && start >= 0 ? start : 0;
  };

  const setModalTop = () => {
    const height = navbar.offsetHeight || 0;
    root.style.setProperty("--brand-modal-top", `${height}px`);
  };

  const clearTimers = (store, video) => {
    const timers = store.get(video);
    if (!timers) return;
    timers.forEach((timerId) => clearTimeout(timerId));
    store.delete(video);
  };

  const registerTimer = (store, video, timerId) => {
    const timers = store.get(video) || [];
    timers.push(timerId);
    store.set(video, timers);
  };

  const clearGenericPendingReadyHandlers = (video) => {
    const handlers = genericPendingReadyHandlers.get(video);
    if (!handlers) return;
    video.removeEventListener("loadedmetadata", handlers.onReady);
    video.removeEventListener("canplay", handlers.onReady);
    genericPendingReadyHandlers.delete(video);
  };

  const safePlay = (video, onRejected) => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (typeof onRejected === "function") onRejected();
      });
    }
  };

  const scheduleGenericRetry = (video) => {
    if (!isOpen()) return;
    const retries = genericRetryCounts.get(video) || 0;
    if (retries >= GENERIC_MAX_RETRIES) return;
    genericRetryCounts.set(video, retries + 1);
    const delay = 250 * 2 ** retries;
    const timerId = setTimeout(() => {
      if (!isOpen()) return;
      playGenericVideoFromConfiguredStart(video, true, true);
    }, delay);
    registerTimer(genericRetryTimers, video, timerId);
  };

  const seekAndPlayGenericVideo = (video, fromRetry = false) => {
    try {
      video.currentTime = getStartTime(video);
    } catch (_) {
      // Ignore seek timing errors and still try to play.
    }

    safePlay(video, () => {
      if (!fromRetry) scheduleGenericRetry(video);
    });
  };

  const playGenericVideoFromConfiguredStart = (video, forceReload = false, fromRetry = false) => {
    clearGenericPendingReadyHandlers(video);

    if (!forceReload && video.readyState >= 1) {
      seekAndPlayGenericVideo(video, fromRetry);
      return;
    }

    const onReady = () => {
      clearGenericPendingReadyHandlers(video);
      if (!isOpen()) return;
      seekAndPlayGenericVideo(video, fromRetry);
    };

    genericPendingReadyHandlers.set(video, { onReady });
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.load();
  };

  const runGenericHealthCheck = (video) => {
    if (!isOpen()) return;
    const current = Number(video.currentTime) || 0;
    const previous = genericLastObservedTime.get(video) ?? current;
    const progressed = current - previous > 0.05;
    const healthy = !video.paused && progressed;

    if (!healthy) scheduleGenericRetry(video);
    genericLastObservedTime.set(video, current);
  };

  const scheduleGenericHealthChecks = (video) => {
    clearTimers(genericHealthTimers, video);

    GENERIC_INITIAL_HEALTH_MS.forEach((delay) => {
      const timerId = setTimeout(() => runGenericHealthCheck(video), delay);
      registerTimer(genericHealthTimers, video, timerId);
    });

    const loop = () => {
      if (!isOpen()) return;
      runGenericHealthCheck(video);
      const timerId = setTimeout(loop, GENERIC_HEALTH_LOOP_MS);
      registerTimer(genericHealthTimers, video, timerId);
    };

    const loopTimerId = setTimeout(loop, GENERIC_HEALTH_LOOP_MS);
    registerTimer(genericHealthTimers, video, loopTimerId);
  };

  const resetOpticalTimers = () => {
    if (opticalRetryTimerId) {
      clearTimeout(opticalRetryTimerId);
      opticalRetryTimerId = null;
    }
    if (opticalHealthTimerId) {
      clearTimeout(opticalHealthTimerId);
      opticalHealthTimerId = null;
    }
  };

  const recoverOpticalVideo = (forceReload = false) => {
    if (!opticalTopVideo || !isOpen()) return;

    if (forceReload) {
      try {
        opticalTopVideo.currentTime = 0;
      } catch (_) {
        // Ignore seek timing errors.
      }
      opticalTopVideo.load();
    }

    safePlay(opticalTopVideo, () => {
      scheduleOpticalRetry();
    });
  };

  const scheduleOpticalRetry = () => {
    if (!opticalTopVideo || !isOpen()) return;
    if (opticalRetryCount >= OPTICAL_MAX_RETRIES) return;
    opticalRetryCount += 1;

    const delay = Math.min(4000, 200 * 2 ** Math.min(opticalRetryCount, 6));
    if (opticalRetryTimerId) clearTimeout(opticalRetryTimerId);
    opticalRetryTimerId = setTimeout(() => {
      opticalRetryTimerId = null;
      if (!isOpen()) return;
      recoverOpticalVideo(true);
    }, delay);
  };

  const runOpticalHealthCheck = () => {
    if (!opticalTopVideo || !isOpen()) return;
    const current = Number(opticalTopVideo.currentTime) || 0;
    const progressed = current - opticalLastObservedTime > 0.05;
    const healthy = !opticalTopVideo.paused && opticalTopVideo.readyState >= 2 && progressed;

    if (!healthy) {
      scheduleOpticalRetry();
    }

    opticalLastObservedTime = current;
    opticalHealthTimerId = setTimeout(runOpticalHealthCheck, OPTICAL_HEALTH_LOOP_MS);
  };

  const startOpticalController = () => {
    if (!opticalTopVideo) return;
    resetOpticalTimers();
    opticalRetryCount = 0;
    opticalLastObservedTime = 0;

    try {
      opticalTopVideo.currentTime = 0;
    } catch (_) {
      // Ignore seek timing errors.
    }

    opticalTopVideo.load();
    recoverOpticalVideo(false);
    opticalHealthTimerId = setTimeout(runOpticalHealthCheck, OPTICAL_HEALTH_LOOP_MS);
  };

  const stopOpticalController = () => {
    if (!opticalTopVideo) return;
    resetOpticalTimers();
    opticalRetryCount = 0;
    opticalLastObservedTime = 0;
    opticalTopVideo.pause();
  };

  const openModal = () => {
    setModalTop();
    root.classList.add("brand-modal-open");
    document.body.classList.add("brand-modal-open");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    genericVideos.forEach((video) => {
      genericRetryCounts.set(video, 0);
      genericLastObservedTime.set(video, getStartTime(video));
      playGenericVideoFromConfiguredStart(video, true);
      scheduleGenericHealthChecks(video);
    });

    startOpticalController();

    if (closeButton) closeButton.focus();
  };

  const closeModal = () => {
    genericVideos.forEach((video) => {
      video.pause();
      try {
        video.currentTime = getStartTime(video);
      } catch (_) {
        // Ignore seek timing errors during teardown.
      }
      genericRetryCounts.set(video, 0);
      clearGenericPendingReadyHandlers(video);
      clearTimers(genericRetryTimers, video);
      clearTimers(genericHealthTimers, video);
    });

    stopOpticalController();

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    root.classList.remove("brand-modal-open");
    document.body.classList.remove("brand-modal-open");
  };

  trigger.addEventListener("click", (event) => {
    // Respect "open in new tab/window" intent.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openModal();
  });

  if (closeButton) {
    closeButton.addEventListener("click", closeModal);
  }

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  genericVideos.forEach((video) => {
    video.addEventListener("loadeddata", () => {
      if (!isOpen()) return;
      if (video.paused) playGenericVideoFromConfiguredStart(video);
      genericLastObservedTime.set(video, Number(video.currentTime) || 0);
    });
    video.addEventListener("ended", () => {
      if (!isOpen()) return;
      playGenericVideoFromConfiguredStart(video);
    });
    video.addEventListener("stalled", () => scheduleGenericRetry(video));
    video.addEventListener("error", () => scheduleGenericRetry(video));
  });

  if (opticalTopVideo) {
    ["stalled", "waiting", "error", "suspend", "pause"].forEach((eventName) => {
      opticalTopVideo.addEventListener(eventName, () => {
        if (!isOpen()) return;
        scheduleOpticalRetry();
      });
    });

    opticalTopVideo.addEventListener("loadeddata", () => {
      if (!isOpen()) return;
      opticalLastObservedTime = Number(opticalTopVideo.currentTime) || 0;
      if (opticalTopVideo.paused) recoverOpticalVideo(false);
    });

    opticalTopVideo.addEventListener("ended", () => {
      if (!isOpen()) return;
      try {
        opticalTopVideo.currentTime = 0;
      } catch (_) {
        // Ignore seek timing errors.
      }
      recoverOpticalVideo(false);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) closeModal();
  });

  window.addEventListener("resize", () => {
    if (isOpen()) setModalTop();
  });
})();
