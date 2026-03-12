(() => {
  const PLAYER_BUILD = "reports-video-20260312-3";
  const videos = Array.from(document.querySelectorAll("video[data-report-video]"));
  const newsCards = Array.from(document.querySelectorAll("[data-report-news-card]"));
  const newsModal = document.querySelector("[data-report-news-modal]");

  const initNewsCards = () => {
    if (!newsCards.length || !newsModal) return;

    const modalImage = newsModal.querySelector("[data-report-news-modal-image]");
    const modalTitle = newsModal.querySelector("[data-report-news-modal-title]");
    const modalDate = newsModal.querySelector("[data-report-news-modal-date]");
    const modalLink = newsModal.querySelector("[data-report-news-modal-link]");
    const modalClosers = Array.from(newsModal.querySelectorAll("[data-report-news-close]"));
    let lastTrigger = null;

    const closeModal = () => {
      newsModal.classList.remove("is-open");
      newsModal.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("reports-news-modal-open");
      document.body.classList.remove("reports-news-modal-open");
      if (lastTrigger) {
        lastTrigger.setAttribute("aria-expanded", "false");
        lastTrigger.focus();
      }
    };

    const openModal = (toggle) => {
      const title = toggle.dataset.reportNewsTitle || "";
      const date = toggle.dataset.reportNewsDate || "";
      const image = toggle.dataset.reportNewsImage || "";
      const link = toggle.dataset.reportNewsLink || "";

      if (modalImage) {
        modalImage.src = image;
        modalImage.alt = title;
      }
      if (modalTitle) modalTitle.textContent = title;
      if (modalDate) {
        const hasDate = date && date !== "未标注日期";
        modalDate.textContent = hasDate ? date : "";
        modalDate.hidden = !hasDate;
      }
      if (modalLink) modalLink.href = link;

      if (lastTrigger && lastTrigger !== toggle) {
        lastTrigger.setAttribute("aria-expanded", "false");
      }

      lastTrigger = toggle;
      toggle.setAttribute("aria-expanded", "true");
      newsModal.classList.add("is-open");
      newsModal.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("reports-news-modal-open");
      document.body.classList.add("reports-news-modal-open");
      const closeButton = newsModal.querySelector(".reports-news-modal__close");
      if (closeButton) closeButton.focus();
    };

    newsCards.forEach((card) => {
      const toggle = card.querySelector("[data-report-news-toggle]");
      if (!toggle) return;

      toggle.addEventListener("click", () => {
        openModal(toggle);
      });
    });

    modalClosers.forEach((node) => {
      node.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && newsModal.classList.contains("is-open")) {
        closeModal();
      }
    });
  };

  initNewsCards();

  if (!videos.length) return;

  document.documentElement.dataset.reportsVideoBuild = PLAYER_BUILD;

  const SEEK_SETTLE_EPSILON = 0.35;
  const SEEK_MAX_RECOVERY_MS = 6500;
  const SEEK_MAX_REPOSITION_ATTEMPTS = 3;
  const SEEK_REPOSITION_INTERVAL_MS = 300;
  const SEEK_AUTOPLAY_TIMEOUT_MS = 3000;
  const SEEK_WATCHDOG_INTERVAL_MS = 250;
  const PROGRESS_STALL_TIMEOUT_MS = 2500;
  const SEEK_STABLE_PLAYBACK_WINDOW_MS = 500;
  const SEEK_PROGRESS_CONFIRM_EPSILON = 0.2;
  const PLAYBACK_STALL_TIMEOUT_MS = 3000;
  const METADATA_LOAD_TIMEOUT_MS = 4000;
  const SEEK_STALL_RECOVERY_THRESHOLD = 2;
  const PLAYBACK_STALL_RECOVERY_THRESHOLD = 2;
  const MAX_FORCE_RELOAD_ATTEMPTS = 2;
  const DEBUG_PLAYER = false;
  const state = new WeakMap();
  let activeVideo = null;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const getState = (video) => {
    let videoState = state.get(video);

    if (!videoState) {
      const cover = video.closest(".report-cover");
      const controls = cover ? cover.querySelector("[data-report-player-controls]") : null;
      const progress = controls ? controls.querySelector("[data-report-progress]") : null;

      videoState = {
        mode: "idle",
        targetSeekTime: null,
        seekToken: 0,
        shouldAutoplayAfterSeek: false,
        wasPlayingBeforeSeek: false,
        seekStartedAt: 0,
        seekRetryCount: 0,
        lastSeekAttemptAt: 0,
        autoplayAttempted: false,
        autoplayStartedAt: 0,
        seekWatchdogId: null,
        autoplayWatchdogId: null,
        lastProgressTimestamp: 0,
        lastReadyState: 0,
        seekResumeConfirmedAt: 0,
        seekResumeStartTime: 0,
        seekTargetReached: false,
        lastObservedCurrentTime: 0,
        wasResourceReleased: false,
        lastKnownTime: 0,
        lastKnownDuration: 0,
        lastPlaybackSrc: video.currentSrc || video.dataset.playbackSrc || "",
        activeSourceSrc: video.currentSrc || video.dataset.playbackSrc || "",
        hasSourceFallback: false,
        sourceSwitchToken: 0,
        pendingSourceSwitch: null,
        pendingRecoveryTime: null,
        forceReloadAttemptCount: 0,
        consecutiveSeekStalls: 0,
        consecutivePlaybackStalls: 0,
        playbackWatchdogId: null,
        metadataWatchdogId: null,
        metadataFallbackStage: "idle",
        isInactive: true,
        isDeactivating: false,
        isProgrammaticPause: false,
        suppressSeekIntent: false,
        isDraggingProgress: false,
        controls: {
          toggle: controls ? controls.querySelector("[data-report-player-toggle]") : null,
          progress,
          buffered: controls ? controls.querySelector("[data-report-buffered]") : null,
          played: controls ? controls.querySelector("[data-report-played]") : null,
          thumb: controls ? controls.querySelector("[data-report-thumb]") : null,
          currentTime: controls ? controls.querySelector("[data-report-current-time]") : null,
          duration: controls ? controls.querySelector("[data-report-duration]") : null,
        },
      };

      state.set(video, videoState);
    }

    return videoState;
  };

  const logDebug = (...args) => {
    if (!DEBUG_PLAYER) return;
    console.debug("[reports-video]", ...args);
  };

  const getStatusEl = (video) => {
    const cover = video.closest(".report-cover");
    return cover ? cover.querySelector("[data-report-video-status]") : null;
  };

  const showStatus = (video, text, tone = "info") => {
    const status = getStatusEl(video);
    if (!status) return;

    status.textContent = text;
    status.classList.add("is-visible");
    status.classList.toggle("is-error", tone === "error");
  };

  const clearStatus = (video) => {
    const status = getStatusEl(video);
    if (!status) return;

    status.textContent = "";
    status.classList.remove("is-visible", "is-error");
  };

  const updateToggle = (video) => {
    const videoState = getState(video);
    const button = videoState.controls.toggle;
    if (!button) return;

    let label = "播放";
    if (videoState.mode === "playing") {
      label = "暂停";
    } else if (videoState.mode === "seek_failed") {
      label = "继续播放";
    } else if (video.ended) {
      label = "重播";
    } else if (videoState.mode === "loading" || videoState.mode === "seeking") {
      label = "加载中";
    }

    button.textContent = label;
    button.setAttribute("aria-label", `${label}视频`);
  };

  const updateTimeline = (video, previewTime = null) => {
    const videoState = getState(video);
    const { progress, buffered, played, thumb, currentTime, duration } = videoState.controls;

    const totalDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(previewTime) ? previewTime : video.currentTime;
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const playedRatio = totalDuration > 0 ? Math.min(Math.max(safeCurrent / totalDuration, 0), 1) : 0;

    if (currentTime) currentTime.textContent = formatTime(safeCurrent);
    if (duration) duration.textContent = formatTime(totalDuration);

    if (played) played.style.width = `${playedRatio * 100}%`;
    if (thumb) thumb.style.left = `${playedRatio * 100}%`;

    let bufferedRatio = 0;
    if (totalDuration > 0 && video.buffered.length > 0) {
      bufferedRatio = Math.min(Math.max(video.buffered.end(video.buffered.length - 1) / totalDuration, 0), 1);
    }
    if (buffered) buffered.style.width = `${bufferedRatio * 100}%`;

    if (progress) {
      progress.setAttribute("aria-valuemax", String(Math.round(totalDuration > 0 ? totalDuration : 0)));
      progress.setAttribute("aria-valuenow", String(Math.round(safeCurrent)));
      progress.setAttribute("aria-valuetext", `${formatTime(safeCurrent)} / ${formatTime(totalDuration)}`);
      progress.setAttribute("aria-disabled", totalDuration > 0 ? "false" : "true");
    }
  };

  const resetSeekState = (video) => {
    const videoState = getState(video);
    if (videoState.seekWatchdogId) {
      window.clearInterval(videoState.seekWatchdogId);
      videoState.seekWatchdogId = null;
    }
    if (videoState.autoplayWatchdogId) {
      window.clearTimeout(videoState.autoplayWatchdogId);
      videoState.autoplayWatchdogId = null;
    }
    if (videoState.playbackWatchdogId) {
      window.clearTimeout(videoState.playbackWatchdogId);
      videoState.playbackWatchdogId = null;
    }
    if (videoState.metadataWatchdogId) {
      window.clearTimeout(videoState.metadataWatchdogId);
      videoState.metadataWatchdogId = null;
    }
    videoState.targetSeekTime = null;
    videoState.shouldAutoplayAfterSeek = false;
    videoState.wasPlayingBeforeSeek = false;
    videoState.seekStartedAt = 0;
    videoState.seekRetryCount = 0;
    videoState.lastSeekAttemptAt = 0;
    videoState.autoplayAttempted = false;
    videoState.autoplayStartedAt = 0;
    videoState.lastProgressTimestamp = 0;
    videoState.lastReadyState = video.readyState;
    videoState.seekResumeConfirmedAt = 0;
    videoState.seekResumeStartTime = 0;
    videoState.seekTargetReached = false;
    videoState.lastObservedCurrentTime = video.currentTime;
    if (videoState.mode === "seeking" || videoState.mode === "loading") {
      videoState.mode = video.paused ? "paused" : "playing";
    }
  };

  const clearPlaybackWatchdog = (video) => {
    const videoState = getState(video);
    if (videoState.playbackWatchdogId) {
      window.clearTimeout(videoState.playbackWatchdogId);
      videoState.playbackWatchdogId = null;
    }
  };

  const clearMetadataWatchdog = (video) => {
    const videoState = getState(video);
    if (videoState.metadataWatchdogId) {
      window.clearTimeout(videoState.metadataWatchdogId);
      videoState.metadataWatchdogId = null;
    }
  };

  const resetMetadataFallbackState = (video) => {
    const videoState = getState(video);
    videoState.metadataFallbackStage = "idle";
  };

  const resetPlaybackStallTracking = (video) => {
    const videoState = getState(video);
    videoState.consecutiveSeekStalls = 0;
    videoState.consecutivePlaybackStalls = 0;
    clearPlaybackWatchdog(video);
  };

  const cancelPendingSeek = (video) => {
    const videoState = getState(video);
    if (!Number.isFinite(videoState.targetSeekTime)) return;

    resetSeekState(video);
    videoState.mode = video.paused ? "paused" : "playing";
    updateToggle(video);
  };

  const deactivateVideo = (video, mode = "paused") => {
    if (!video) return;

    const videoState = getState(video);
    videoState.isDeactivating = true;
    videoState.isInactive = true;

    resetSeekState(video);
    clearStatus(video);
    videoState.lastKnownTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    videoState.lastKnownDuration = Number.isFinite(video.duration) ? video.duration : 0;
    videoState.lastPlaybackSrc = video.currentSrc || video.dataset.playbackSrc || videoState.lastPlaybackSrc;

    if (!video.paused) {
      videoState.isProgrammaticPause = true;
      video.pause();
      videoState.isProgrammaticPause = false;
    }

    video.preload = "metadata";
    videoState.mode = mode;
    videoState.wasResourceReleased = true;
    updateToggle(video);

    updateTimeline(video);
    logDebug("deactivate", video.dataset.reportId || video.currentSrc || video.src);

    videoState.isDeactivating = false;
  };

  const failSeek = (video, token, message = "已定位到目标进度，自动续播失败，请点击播放继续。") => {
    const videoState = getState(video);
    if (videoState.seekToken !== token) return;

    videoState.consecutiveSeekStalls += 1;
    videoState.pendingRecoveryTime = Number.isFinite(videoState.targetSeekTime)
      ? videoState.targetSeekTime
      : Number.isFinite(video.currentTime)
        ? video.currentTime
        : videoState.lastKnownTime;

    if (videoState.consecutiveSeekStalls >= SEEK_STALL_RECOVERY_THRESHOLD) {
      if (maybeFallbackToOriginalSource(video)) {
        return;
      }

      if (forceReloadVideo(video, videoState.pendingRecoveryTime, true, "正在强制恢复播放...")) {
        return;
      }
    }

    resetSeekState(video);
    videoState.mode = "seek_failed";
    updateToggle(video);
    updateTimeline(video);
    showStatus(video, message, "error");
  };

  const withSuppressedSeek = (video, callback) => {
    const videoState = getState(video);
    videoState.suppressSeekIntent = true;

    try {
      callback();
    } finally {
      window.setTimeout(() => {
        videoState.suppressSeekIntent = false;
      }, 0);
    }
  };

  const markSeekProgress = (video) => {
    const videoState = getState(video);
    videoState.lastProgressTimestamp = Date.now();
    videoState.lastReadyState = video.readyState;
    videoState.lastObservedCurrentTime = video.currentTime;
  };

  const completeSeekRecovery = (video) => {
    const videoState = getState(video);
    videoState.seekResumeConfirmedAt = Date.now();
    resetSeekState(video);
    resetPlaybackStallTracking(video);
    videoState.forceReloadAttemptCount = 0;
    videoState.pendingRecoveryTime = null;
    videoState.mode = video.paused ? "paused" : "playing";
    updateToggle(video);
    clearStatus(video);
    updateTimeline(video);
  };

  const startSeekWatchdog = (video, token) => {
    const videoState = getState(video);
    if (videoState.seekWatchdogId) {
      window.clearInterval(videoState.seekWatchdogId);
    }

    videoState.seekWatchdogId = window.setInterval(() => {
      const latestState = getState(video);
      if (latestState.seekToken !== token || !Number.isFinite(latestState.targetSeekTime)) {
        if (latestState.seekWatchdogId) {
          window.clearInterval(latestState.seekWatchdogId);
          latestState.seekWatchdogId = null;
        }
        return;
      }

      resolveSeek(video, token);
    }, SEEK_WATCHDOG_INTERVAL_MS);
  };

  const startAutoplayWatchdog = (video, token) => {
    const videoState = getState(video);
    if (videoState.autoplayWatchdogId) {
      window.clearTimeout(videoState.autoplayWatchdogId);
    }

    videoState.autoplayWatchdogId = window.setTimeout(() => {
      const latestState = getState(video);
      if (latestState.seekToken !== token || !Number.isFinite(latestState.targetSeekTime)) return;
      if (latestState.mode === "playing" || !video.paused) return;

      failSeek(video, token);
    }, SEEK_AUTOPLAY_TIMEOUT_MS);
  };

  const activateVideo = (video) => {
    if (activeVideo && activeVideo !== video) {
      deactivateVideo(activeVideo, "paused");
    }

    activeVideo = video;
    const videoState = getState(video);
    videoState.isInactive = false;
    videoState.isDeactivating = false;
    video.preload = "auto";
    logDebug("activate", video.dataset.reportId || video.currentSrc || video.src);
  };

  const getConfiguredPlaybackSrc = (video) => video.dataset.playbackSrc || "";

  const getConfiguredOriginalSrc = (video) => video.dataset.originalSrc || getConfiguredPlaybackSrc(video);

  const shouldRestrictSeekToBuffered = (video) => video.dataset.reportBufferedSeekOnly === "true";

  const shouldDisableHardRecovery = (video) => video.dataset.reportDisableHardRecovery === "true";

  const getActiveSourceSrc = (video) => {
    const videoState = getState(video);
    return videoState.activeSourceSrc || video.currentSrc || getConfiguredPlaybackSrc(video) || getConfiguredOriginalSrc(video);
  };

  const isUsingOriginalSource = (video) => getActiveSourceSrc(video) === getConfiguredOriginalSrc(video);

  const isLowBitrateFallbackCandidate = (video) => {
    const playbackSrc = getConfiguredPlaybackSrc(video);
    const originalSrc = getConfiguredOriginalSrc(video);
    return Boolean(playbackSrc && originalSrc && playbackSrc !== originalSrc && !isUsingOriginalSource(video));
  };

  const setVideoSource = (video, nextSrc) => {
    const source = video.querySelector("source");
    if (source) {
      source.src = nextSrc;
    }

    video.removeAttribute("src");
    video.load();

    const videoState = getState(video);
    videoState.activeSourceSrc = nextSrc;
    videoState.lastPlaybackSrc = nextSrc;
  };

  const refreshCurrentSource = (video, nextSrc = null) => {
    const targetSrc = nextSrc || getActiveSourceSrc(video);
    if (!targetSrc) return false;

    setVideoSource(video, targetSrc);
    return true;
  };

  const getBufferedSeekLimit = (video, duration = Number.isFinite(video.duration) ? video.duration : 0) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      return Number.isFinite(video.currentTime) ? Math.max(video.currentTime, 0) : 0;
    }

    if (!video.buffered || video.buffered.length === 0) {
      return Number.isFinite(video.currentTime) ? Math.min(Math.max(video.currentTime, 0), duration) : 0;
    }

    let bufferedEnd = 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      bufferedEnd = Math.max(bufferedEnd, video.buffered.end(index));
    }

    return Math.min(Math.max(bufferedEnd, 0), duration);
  };

  const handleMetadataLoadFailure = (video) => {
    const videoState = getState(video);
    clearMetadataWatchdog(video);

    if (Number.isFinite(video.duration) && video.duration > 0) {
      resetMetadataFallbackState(video);
      return;
    }

    if (shouldDisableHardRecovery(video)) {
      resetSeekState(video);
      videoState.pendingSourceSwitch = null;
      videoState.pendingRecoveryTime = null;
      resetMetadataFallbackState(video);
      videoState.mode = "seek_failed";
      updateToggle(video);
      updateTimeline(video);
      showStatus(video, "视频尚未缓冲到该位置，请稍后重试。", "error");
      return;
    }

    if (videoState.metadataFallbackStage === "idle") {
      videoState.metadataFallbackStage = "reloading_playback";
      if (refreshCurrentSource(video, getConfiguredPlaybackSrc(video))) {
        showStatus(video, "正在重新加载视频元数据...");
        startMetadataWatchdog(video);
        return;
      }
    }

    if (videoState.metadataFallbackStage !== "fallback_original") {
      videoState.metadataFallbackStage = "fallback_original";
      if (maybeFallbackToOriginalSource(video)) {
        return;
      }
    }

    resetSeekState(video);
    videoState.pendingSourceSwitch = null;
    videoState.pendingRecoveryTime = null;
    resetMetadataFallbackState(video);
    videoState.mode = "seek_failed";
    updateToggle(video);
    updateTimeline(video);
    showStatus(video, "视频元数据加载失败，请刷新页面或打开原文件。", "error");
  };

  const startMetadataWatchdog = (video) => {
    const videoState = getState(video);
    clearMetadataWatchdog(video);

    if (Number.isFinite(video.duration) && video.duration > 0) {
      return;
    }

    videoState.metadataWatchdogId = window.setTimeout(() => {
      handleMetadataLoadFailure(video);
    }, METADATA_LOAD_TIMEOUT_MS);
  };

  const forceReloadVideo = (video, resumeTime, shouldResume = true, statusText = "正在重新加载视频...") => {
    const videoState = getState(video);
    if (shouldDisableHardRecovery(video)) {
      return false;
    }
    if (videoState.forceReloadAttemptCount >= MAX_FORCE_RELOAD_ATTEMPTS) {
      return false;
    }

    const duration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
    const boundedResumeTime =
      Number.isFinite(duration) && duration > 0 ? Math.min(Math.max(resumeTime || 0, 0), duration) : Math.max(resumeTime || 0, 0);

    resetSeekState(video);
    clearPlaybackWatchdog(video);
    videoState.forceReloadAttemptCount += 1;
    videoState.pendingRecoveryTime = boundedResumeTime;
    videoState.wasResourceReleased = false;
    videoState.mode = "loading";
    videoState.lastKnownTime = boundedResumeTime;
    startMetadataWatchdog(video);
    updateToggle(video);
    showStatus(video, statusText);

    const restoreAfterLoad = () => {
      video.removeEventListener("loadedmetadata", restoreAfterLoad);
      video.removeEventListener("loadeddata", restoreAfterLoad);

      if (boundedResumeTime > 0 && Number.isFinite(video.duration)) {
        withSuppressedSeek(video, () => {
          video.currentTime = Math.min(Math.max(boundedResumeTime, 0), video.duration);
        });
      }

      if (!shouldResume) {
        videoState.mode = video.paused ? "paused" : "playing";
        updateToggle(video);
        updateTimeline(video);
        showStatus(video, "视频已重新加载，可点击播放继续。");
        return;
      }

      void video.play().catch(() => {
        videoState.mode = "seek_failed";
        updateToggle(video);
        updateTimeline(video);
        showStatus(video, "视频重新加载失败，请点击播放继续。", "error");
      });
    };

    video.addEventListener("loadedmetadata", restoreAfterLoad);
    video.addEventListener("loadeddata", restoreAfterLoad);

    if (!video.paused) {
      videoState.isProgrammaticPause = true;
      video.pause();
      videoState.isProgrammaticPause = false;
    }

    video.load();
    return true;
  };

  const maybeFallbackToOriginalSource = (video) => {
    const videoState = getState(video);
    if (shouldDisableHardRecovery(video)) {
      return false;
    }
    if (!isLowBitrateFallbackCandidate(video) || videoState.hasSourceFallback) {
      return false;
    }

    const resumeTime = Number.isFinite(video.currentTime) ? video.currentTime : videoState.lastKnownTime;
    const duration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
    const boundedResumeTime =
      Number.isFinite(duration) && duration > 0 ? Math.min(Math.max(resumeTime, 0), duration) : Math.max(resumeTime, 0);
    const shouldResume = !video.paused && !video.ended;

    resetSeekState(video);
    videoState.hasSourceFallback = true;
    videoState.sourceSwitchToken += 1;
    videoState.pendingSourceSwitch = {
      token: videoState.sourceSwitchToken,
      resumeTime: boundedResumeTime,
      shouldResume,
    };
    videoState.metadataFallbackStage = "fallback_original";
    videoState.mode = "loading";
    videoState.lastKnownTime = boundedResumeTime;
    updateToggle(video);
    showStatus(video, "低码率视频恢复失败，正在切换原始视频...");
    setVideoSource(video, getConfiguredOriginalSrc(video));
    return true;
  };

  const restoreAfterSourceSwitch = (video) => {
    const videoState = getState(video);
    const pending = videoState.pendingSourceSwitch;
    if (!pending) return;

    videoState.pendingSourceSwitch = null;
    videoState.wasResourceReleased = false;
    videoState.lastKnownTime = pending.resumeTime;
    videoState.pendingRecoveryTime = pending.resumeTime;

    if (pending.resumeTime > 0 && Number.isFinite(video.duration)) {
      withSuppressedSeek(video, () => {
        video.currentTime = Math.min(Math.max(pending.resumeTime, 0), video.duration);
      });
    }

    if (!pending.shouldResume) {
      videoState.mode = video.paused ? "paused" : "playing";
      updateToggle(video);
      updateTimeline(video);
      showStatus(video, "已切换到原始视频，可点击播放继续。");
      return;
    }

    videoState.mode = "loading";
    updateToggle(video);
    showStatus(video, "已切换到原始视频，正在恢复播放...");
    void video.play().catch(() => {
      videoState.mode = "seek_failed";
      updateToggle(video);
      updateTimeline(video);
      showStatus(video, "已切换到原始视频，请点击播放继续。", "error");
    });
  };

  const reactivateVideo = (video, intent = "resume") => {
    const videoState = getState(video);

    activateVideo(video);

    if (intent === "restart") {
      videoState.lastKnownTime = 0;
      videoState.wasResourceReleased = false;
      return;
    }

    if (videoState.wasResourceReleased && Number.isFinite(videoState.lastKnownTime) && videoState.lastKnownTime > 0 && !video.ended) {
      withSuppressedSeek(video, () => {
        video.currentTime = videoState.lastKnownTime;
      });
    }

    videoState.wasResourceReleased = false;
  };

  const playVideo = (video, intent = "resume") => {
    const videoState = getState(video);

    reactivateVideo(video, intent);
    videoState.mode = "loading";
    updateToggle(video);
    clearStatus(video);

    void video.play().catch(() => {
      videoState.mode = "paused";
      updateToggle(video);
      showStatus(video, "播放失败，请再次点击播放按钮。", "error");
    });
  };

  const recoverPlayback = (video, reason = "manual") => {
    const videoState = getState(video);
    const fallbackTime = Number.isFinite(videoState.pendingRecoveryTime)
      ? videoState.pendingRecoveryTime
      : Number.isFinite(videoState.targetSeekTime)
        ? videoState.targetSeekTime
        : Number.isFinite(video.currentTime)
          ? video.currentTime
          : videoState.lastKnownTime;

    activateVideo(video);

    if (Number.isFinite(videoState.targetSeekTime)) {
      const autoplayAfterSeek = videoState.shouldAutoplayAfterSeek !== false;
      commitSeek(video, videoState.targetSeekTime, autoplayAfterSeek);
      return;
    }

    if (reason !== "manual") {
      videoState.consecutivePlaybackStalls += 1;
    }

    if (
      videoState.consecutivePlaybackStalls >= PLAYBACK_STALL_RECOVERY_THRESHOLD ||
      videoState.mode === "seek_failed" ||
      reason === "manual"
    ) {
      if (maybeFallbackToOriginalSource(video)) {
        return;
      }

      if (forceReloadVideo(video, fallbackTime, true, "正在重新加载并恢复播放...")) {
        return;
      }
    }

    playVideo(video, "resume");
  };

  const schedulePlaybackRecovery = (video) => {
    const videoState = getState(video);
    if (Number.isFinite(videoState.targetSeekTime) || video.paused || video.ended) {
      return;
    }

    clearPlaybackWatchdog(video);
    videoState.playbackWatchdogId = window.setTimeout(() => {
      const latestState = getState(video);
      if (Number.isFinite(latestState.targetSeekTime) || video.paused || video.ended) {
        return;
      }

      const stalledFor = latestState.lastProgressTimestamp ? Date.now() - latestState.lastProgressTimestamp : 0;
      if (stalledFor >= PLAYBACK_STALL_TIMEOUT_MS) {
        recoverPlayback(video, "stall");
      }
    }, PLAYBACK_STALL_TIMEOUT_MS);
  };

  const restartVideo = (video) => {
    const videoState = getState(video);
    withSuppressedSeek(video, () => {
      if (video.currentTime !== 0) {
        video.currentTime = 0;
      }
    });
    videoState.lastKnownTime = 0;
    videoState.wasResourceReleased = false;

    playVideo(video, "restart");
  };

  const resolveSeek = (video, token) => {
    const videoState = getState(video);

    if (videoState.seekToken !== token || !Number.isFinite(videoState.targetSeekTime)) {
      return;
    }

    const now = Date.now();
    const elapsed = videoState.seekStartedAt ? now - videoState.seekStartedAt : 0;
    const stalledFor = videoState.lastProgressTimestamp ? now - videoState.lastProgressTimestamp : 0;
    const targetDelta = Math.abs(video.currentTime - videoState.targetSeekTime);
    const hasFutureData = video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    const isAdvancingNearTarget =
      videoState.seekTargetReached &&
      video.currentTime >= videoState.targetSeekTime + SEEK_PROGRESS_CONFIRM_EPSILON;

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      if (elapsed > SEEK_MAX_RECOVERY_MS) {
        failSeek(video, token);
        return;
      }

      videoState.mode = "loading";
      updateToggle(video);
      showStatus(video, "正在恢复到目标进度...");
      return;
    }

      if (targetDelta > SEEK_SETTLE_EPSILON) {
      if (elapsed > SEEK_MAX_RECOVERY_MS || stalledFor > PROGRESS_STALL_TIMEOUT_MS) {
        failSeek(video, token);
        return;
      }

      if (
        videoState.seekRetryCount < SEEK_MAX_REPOSITION_ATTEMPTS &&
        now - videoState.lastSeekAttemptAt >= SEEK_REPOSITION_INTERVAL_MS
      ) {
        videoState.seekRetryCount += 1;
        videoState.lastSeekAttemptAt = now;
        withSuppressedSeek(video, () => {
          video.currentTime = videoState.targetSeekTime;
        });
      }

      videoState.mode = "seeking";
      updateToggle(video);
      showStatus(video, "正在恢复到目标进度...");
      return;
    }

    if (!videoState.seekTargetReached) {
      videoState.seekTargetReached = true;
      videoState.seekResumeStartTime = now;
    }

    if (!hasFutureData) {
      if (elapsed > SEEK_MAX_RECOVERY_MS || stalledFor > PROGRESS_STALL_TIMEOUT_MS) {
        failSeek(video, token);
        return;
      }

      videoState.mode = "loading";
      updateToggle(video);
      showStatus(video, "正在恢复到目标进度...");
      return;
    }

    if (videoState.shouldAutoplayAfterSeek) {
      if (videoState.autoplayAttempted) {
        if (
          !video.paused &&
          (isAdvancingNearTarget ||
            (videoState.seekResumeStartTime &&
              now - videoState.seekResumeStartTime >= SEEK_STABLE_PLAYBACK_WINDOW_MS &&
              now - videoState.lastProgressTimestamp <= SEEK_WATCHDOG_INTERVAL_MS * 2))
        ) {
          completeSeekRecovery(video);
        }
        return;
      }

      videoState.autoplayAttempted = true;
      videoState.autoplayStartedAt = now;
      videoState.mode = "loading";
      updateToggle(video);
      showStatus(video, "正在尝试恢复播放...");
      startAutoplayWatchdog(video, token);
      void video.play().catch(() => {
        failSeek(video, token);
      });
      return;
    }

    completeSeekRecovery(video);
  };

  const commitSeek = (video, nextTime, shouldAutoplay = true) => {
    const videoState = getState(video);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const requestedTime = duration > 0 ? Math.min(Math.max(nextTime, 0), duration) : Math.max(nextTime, 0);
    let boundedTime = requestedTime;

    if (shouldRestrictSeekToBuffered(video)) {
      boundedTime = Math.min(requestedTime, getBufferedSeekLimit(video, duration));
    }

    activateVideo(video);
    resetSeekState(video);
    videoState.seekToken += 1;
    videoState.targetSeekTime = boundedTime;
    videoState.shouldAutoplayAfterSeek = shouldAutoplay;
    videoState.wasPlayingBeforeSeek = !video.paused && !video.ended;
    videoState.seekStartedAt = Date.now();
    videoState.seekRetryCount = 0;
    videoState.lastSeekAttemptAt = videoState.seekStartedAt;
    videoState.autoplayAttempted = false;
    videoState.autoplayStartedAt = 0;
    videoState.lastProgressTimestamp = videoState.seekStartedAt;
    videoState.lastReadyState = video.readyState;
    videoState.seekResumeConfirmedAt = 0;
    videoState.seekResumeStartTime = 0;
    videoState.seekTargetReached = false;
    videoState.lastObservedCurrentTime = video.currentTime;
    videoState.lastKnownDuration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
    videoState.wasResourceReleased = false;
    videoState.mode = "seeking";
    updateToggle(video);
    updateTimeline(video, boundedTime);

    if (requestedTime - boundedTime > SEEK_SETTLE_EPSILON) {
      showStatus(video, "该位置尚未缓冲，已跳到当前可播放的最远位置。");
    } else {
      clearStatus(video);
    }

    if (!video.paused) {
      videoState.isProgrammaticPause = true;
      video.pause();
      videoState.isProgrammaticPause = false;
    }

    withSuppressedSeek(video, () => {
      video.currentTime = boundedTime;
    });

    startSeekWatchdog(video, videoState.seekToken);
    resolveSeek(video, videoState.seekToken);
  };

  const getProgressTimeFromPointer = (progress, clientX, duration) => {
    const rect = progress.getBoundingClientRect();
    if (!rect.width) return 0;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return ratio * duration;
  };

  const bindProgressEvents = (video) => {
    const videoState = getState(video);
    const { progress } = videoState.controls;
    if (!progress) return;

    const updateDragPreview = (clientX) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const previewTime = getProgressTimeFromPointer(progress, clientX, duration);
      updateTimeline(video, previewTime);
      return previewTime;
    };

    progress.addEventListener("pointerdown", (event) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return;

      event.preventDefault();
      cancelPendingSeek(video);
      videoState.isDraggingProgress = true;
      progress.setPointerCapture(event.pointerId);
      updateDragPreview(event.clientX);
    });

    progress.addEventListener("pointermove", (event) => {
      if (!videoState.isDraggingProgress) return;
      updateDragPreview(event.clientX);
    });

    const finishDrag = (event) => {
      if (!videoState.isDraggingProgress) return;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const pointerId = event.pointerId;
      const seekTime = getProgressTimeFromPointer(progress, event.clientX, duration);

      videoState.isDraggingProgress = false;
      if (progress.hasPointerCapture(pointerId)) {
        progress.releasePointerCapture(pointerId);
      }

      commitSeek(video, seekTime, true);
    };

    progress.addEventListener("pointerup", finishDrag);
    progress.addEventListener("pointercancel", finishDrag);

    progress.addEventListener("keydown", (event) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return;

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
        return;
      }

      event.preventDefault();

      let nextTime = video.currentTime;
      if (event.key === "ArrowLeft") nextTime -= 5;
      if (event.key === "ArrowRight") nextTime += 5;
      if (event.key === "Home") nextTime = 0;
      if (event.key === "End") nextTime = duration;

      commitSeek(video, nextTime, true);
    });
  };

  videos.forEach((video) => {
    video.dataset.reportScriptBuild = PLAYER_BUILD;
    const videoState = getState(video);
    const { toggle } = videoState.controls;
    video.controls = false;
    video.preload = "metadata";
    videoState.isInactive = activeVideo !== video;

    if (toggle) {
      toggle.addEventListener("click", () => {
        activateVideo(video);

        if (video.ended || (videoState.mode === "idle" && video.currentTime === 0)) {
          restartVideo(video);
          return;
        }

        if (!video.paused) {
          videoState.mode = "paused";
          video.pause();
          updateToggle(video);
          return;
        }

        if (
          videoState.mode === "seek_failed" ||
          (video.currentTime > 0 && video.currentTime < (Number.isFinite(video.duration) ? video.duration : Infinity))
        ) {
          recoverPlayback(video, "manual");
          return;
        }

        restartVideo(video);
      });
    }

    bindProgressEvents(video);

    video.addEventListener("loadedmetadata", () => {
      clearMetadataWatchdog(video);
      if (videoState.isInactive && video !== activeVideo) {
        updateTimeline(video);
        updateToggle(video);
        return;
      }
      if (Number.isFinite(video.duration) && video.duration > 0) {
        resetMetadataFallbackState(video);
      }
      videoState.activeSourceSrc = video.currentSrc || videoState.activeSourceSrc || getConfiguredPlaybackSrc(video);
      markSeekProgress(video);
      videoState.lastKnownDuration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
      updateTimeline(video);
      updateToggle(video);
      restoreAfterSourceSwitch(video);
      if (Number.isFinite(videoState.targetSeekTime)) {
        resolveSeek(video, videoState.seekToken);
      }
    });

    ["loadeddata", "progress", "canplay", "canplaythrough", "seeked", "timeupdate"].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          clearMetadataWatchdog(video);
        }
        if (videoState.isInactive && video !== activeVideo) {
          updateTimeline(video);
          return;
        }
        if (videoState.isDraggingProgress) return;
        markSeekProgress(video);
        videoState.lastKnownTime = Number.isFinite(video.currentTime) ? video.currentTime : videoState.lastKnownTime;
        videoState.lastKnownDuration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
        resetPlaybackStallTracking(video);
        updateTimeline(video);
        if (Number.isFinite(videoState.targetSeekTime)) {
          resolveSeek(video, videoState.seekToken);
        }
      });
    });

    video.addEventListener("play", () => {
      if (videoState.isInactive && video !== activeVideo) return;
      markSeekProgress(video);
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        startMetadataWatchdog(video);
      }
      if (!Number.isFinite(videoState.targetSeekTime)) {
        videoState.mode = "loading";
      }
      updateToggle(video);
      schedulePlaybackRecovery(video);
    });

    video.addEventListener("playing", () => {
      if (videoState.isInactive && video !== activeVideo) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        startMetadataWatchdog(video);
      } else {
        clearMetadataWatchdog(video);
      }
      markSeekProgress(video);
      if (Number.isFinite(videoState.targetSeekTime)) {
        if (!videoState.seekResumeStartTime) {
          videoState.seekResumeStartTime = Date.now();
        }
        videoState.mode = "loading";
        updateToggle(video);
        showStatus(video, "正在恢复到目标进度...");
        resolveSeek(video, videoState.seekToken);
        return;
      }

      videoState.mode = "playing";
      videoState.lastKnownTime = Number.isFinite(video.currentTime) ? video.currentTime : videoState.lastKnownTime;
      videoState.lastKnownDuration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
      videoState.wasResourceReleased = false;
      videoState.activeSourceSrc = video.currentSrc || videoState.activeSourceSrc || getConfiguredPlaybackSrc(video);
      videoState.forceReloadAttemptCount = 0;
      videoState.pendingRecoveryTime = null;
      resetPlaybackStallTracking(video);
      updateToggle(video);
      clearStatus(video);
      updateTimeline(video);
    });

    video.addEventListener("pause", () => {
      if (videoState.isDeactivating || (videoState.isInactive && video !== activeVideo)) return;
      if (videoState.isProgrammaticPause || Number.isFinite(videoState.targetSeekTime)) return;

      videoState.mode = video.ended ? "idle" : "paused";
      videoState.lastKnownTime = Number.isFinite(video.currentTime) ? video.currentTime : videoState.lastKnownTime;
      updateToggle(video);
      clearStatus(video);
    });

    video.addEventListener("waiting", () => {
      if (videoState.isInactive && video !== activeVideo) return;
      if (Number.isFinite(videoState.targetSeekTime)) {
        resolveSeek(video, videoState.seekToken);
        return;
      }

      if (!video.paused) {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          startMetadataWatchdog(video);
        }
        videoState.mode = "loading";
        updateToggle(video);
        showStatus(video, "正在缓冲视频...");
        schedulePlaybackRecovery(video);
      }
    });

    ["stalled", "suspend"].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        if (videoState.isInactive && video !== activeVideo) return;
        if (Number.isFinite(videoState.targetSeekTime)) {
          resolveSeek(video, videoState.seekToken);
          return;
        }
        schedulePlaybackRecovery(video);
      });
    });

    video.addEventListener("ended", () => {
      clearMetadataWatchdog(video);
      resetSeekState(video);
      videoState.mode = "idle";
      resetMetadataFallbackState(video);
      updateToggle(video);
      clearStatus(video);
      updateTimeline(video);
      video.preload = "metadata";
      videoState.lastKnownTime = 0;
      videoState.lastKnownDuration = Number.isFinite(video.duration) ? video.duration : videoState.lastKnownDuration;
      videoState.wasResourceReleased = false;
      videoState.pendingRecoveryTime = null;
      videoState.forceReloadAttemptCount = 0;
      resetPlaybackStallTracking(video);
      if (activeVideo === video) {
        activeVideo = null;
        videoState.isInactive = true;
      }
    });

    video.addEventListener("error", () => {
      clearMetadataWatchdog(video);
      if (maybeFallbackToOriginalSource(video)) {
        return;
      }

      resetSeekState(video);
      videoState.pendingSourceSwitch = null;
      videoState.pendingRecoveryTime = null;
      resetMetadataFallbackState(video);
      videoState.mode = "idle";
      updateToggle(video);
      updateTimeline(video);
      showStatus(video, "视频加载失败，请点击“打开原文件”查看。", "error");
      if (activeVideo === video) {
        activeVideo = null;
      }
      videoState.isInactive = true;
    });

    updateTimeline(video);
    updateToggle(video);
    startMetadataWatchdog(video);
  });
})();
