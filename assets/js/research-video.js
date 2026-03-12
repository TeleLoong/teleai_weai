(() => {
  const videos = Array.from(document.querySelectorAll("video[data-research-video]"));

  if (!videos.length) return;

  const SEEK_EPSILON = 0.35;
  const READY_TIMEOUT_MS = 6000;
  const state = new WeakMap();

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
      const player = video.closest("[data-research-player]");
      const controls = player ? player.querySelector("[data-research-player-controls]") : null;
      const progress = controls ? controls.querySelector("[data-research-progress]") : null;

      videoState = {
        mode: "idle",
        isDragging: false,
        shouldResumeAfterSeek: false,
        isWaitingToPlay: false,
        readyTimeoutId: null,
        pendingSeekTime: null,
        controls: {
          toggle: controls ? controls.querySelector("[data-research-player-toggle]") : null,
          progress,
          buffered: controls ? controls.querySelector("[data-research-buffered]") : null,
          played: controls ? controls.querySelector("[data-research-played]") : null,
          thumb: controls ? controls.querySelector("[data-research-thumb]") : null,
          currentTime: controls ? controls.querySelector("[data-research-current-time]") : null,
          duration: controls ? controls.querySelector("[data-research-duration]") : null,
        },
        status: player ? player.querySelector("[data-research-video-status]") : null,
      };

      state.set(video, videoState);
    }

    return videoState;
  };

  const clearReadyTimeout = (video) => {
    const videoState = getState(video);
    if (!videoState.readyTimeoutId) return;
    window.clearTimeout(videoState.readyTimeoutId);
    videoState.readyTimeoutId = null;
  };

  const showStatus = (video, text, tone = "info") => {
    const { status } = getState(video);
    if (!status) return;

    status.textContent = text;
    status.classList.add("is-visible");
    status.classList.toggle("is-error", tone === "error");
  };

  const clearStatus = (video) => {
    const { status } = getState(video);
    if (!status) return;

    status.textContent = "";
    status.classList.remove("is-visible", "is-error");
  };

  const updateToggle = (video) => {
    const videoState = getState(video);
    const button = videoState.controls.toggle;
    if (!button) return;

    let label = "播放";
    if (videoState.mode === "loading") {
      label = "加载中";
    } else if (!video.paused && !video.ended) {
      label = "暂停";
    } else if (video.ended) {
      label = "重播";
    }

    button.textContent = label;
    button.disabled = videoState.mode === "loading";
    button.setAttribute("aria-label", `${label}视频`);
  };

  const getBufferedEnd = (video) => {
    if (!video.buffered || video.buffered.length === 0) {
      return Number.isFinite(video.currentTime) ? Math.max(video.currentTime, 0) : 0;
    }

    let bufferedEnd = 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      bufferedEnd = Math.max(bufferedEnd, video.buffered.end(index));
    }

    return bufferedEnd;
  };

  const updateTimeline = (video, previewTime = null) => {
    const videoState = getState(video);
    const { progress, buffered, played, thumb, currentTime, duration } = videoState.controls;

    const totalDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const activeTime = Number.isFinite(previewTime) ? previewTime : video.currentTime;
    const safeTime = Number.isFinite(activeTime) ? activeTime : 0;
    const playedRatio = totalDuration > 0 ? Math.min(Math.max(safeTime / totalDuration, 0), 1) : 0;
    const bufferedRatio =
      totalDuration > 0 ? Math.min(Math.max(getBufferedEnd(video) / totalDuration, 0), 1) : 0;

    if (currentTime) currentTime.textContent = formatTime(safeTime);
    if (duration) duration.textContent = formatTime(totalDuration);
    if (played) played.style.width = `${playedRatio * 100}%`;
    if (thumb) thumb.style.left = `${playedRatio * 100}%`;
    if (buffered) buffered.style.width = `${bufferedRatio * 100}%`;

    if (progress) {
      progress.setAttribute("aria-valuemax", String(Math.round(totalDuration)));
      progress.setAttribute("aria-valuenow", String(Math.round(safeTime)));
      progress.setAttribute("aria-valuetext", `${formatTime(safeTime)} / ${formatTime(totalDuration)}`);
      progress.setAttribute("aria-disabled", totalDuration > 0 ? "false" : "true");
    }
  };

  const playWhenReady = (video) => {
    const videoState = getState(video);

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    clearReadyTimeout(video);
    videoState.isWaitingToPlay = false;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        videoState.mode = "paused";
        updateToggle(video);
        showStatus(video, "视频暂时无法播放，请稍后再试。", "error");
      });
    }
  };

  const ensureReadyAndPlay = (video) => {
    const videoState = getState(video);
    clearReadyTimeout(video);
    videoState.mode = "loading";
    videoState.isWaitingToPlay = true;
    updateToggle(video);
    showStatus(video, "正在加载视频...");

    if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      video.load();
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playWhenReady(video);
      return;
    }

    videoState.readyTimeoutId = window.setTimeout(() => {
      videoState.isWaitingToPlay = false;
      videoState.mode = "paused";
      updateToggle(video);
      showStatus(video, "视频加载较慢，请稍后重试。", "error");
    }, READY_TIMEOUT_MS);
  };

  const commitSeek = (video, requestedTime) => {
    const videoState = getState(video);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) return;

    const boundedRequestedTime = Math.min(Math.max(requestedTime, 0), duration);
    const bufferedLimit = Math.min(Math.max(getBufferedEnd(video), 0), duration);
    const seekTime = Math.min(boundedRequestedTime, bufferedLimit);

    try {
      video.currentTime = seekTime;
    } catch (_) {
      showStatus(video, "当前进度暂时不可用，请稍后再试。", "error");
      return;
    }

    updateTimeline(video, seekTime);

    if (boundedRequestedTime - seekTime > SEEK_EPSILON) {
      showStatus(video, "该位置尚未缓冲，已跳到当前可播放的最远位置。");
    } else {
      clearStatus(video);
    }

    if (videoState.shouldResumeAfterSeek) {
      ensureReadyAndPlay(video);
    }
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

    const updatePreview = (clientX) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return 0;
      const previewTime = getProgressTimeFromPointer(progress, clientX, duration);
      updateTimeline(video, previewTime);
      return previewTime;
    };

    progress.addEventListener("pointerdown", (event) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return;

      event.preventDefault();
      videoState.isDragging = true;
      videoState.shouldResumeAfterSeek = !video.paused && !video.ended;
      progress.setPointerCapture(event.pointerId);
      updatePreview(event.clientX);
    });

    progress.addEventListener("pointermove", (event) => {
      if (!videoState.isDragging) return;
      updatePreview(event.clientX);
    });

    const finishDrag = (event) => {
      if (!videoState.isDragging) return;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const seekTime = getProgressTimeFromPointer(progress, event.clientX, duration);

      videoState.isDragging = false;
      if (progress.hasPointerCapture(event.pointerId)) {
        progress.releasePointerCapture(event.pointerId);
      }

      commitSeek(video, seekTime);
    };

    progress.addEventListener("pointerup", finishDrag);
    progress.addEventListener("pointercancel", finishDrag);

    progress.addEventListener("keydown", (event) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) return;

      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();

      let nextTime = video.currentTime;
      if (event.key === "ArrowLeft") nextTime -= 5;
      if (event.key === "ArrowRight") nextTime += 5;
      if (event.key === "Home") nextTime = 0;
      if (event.key === "End") nextTime = duration;

      videoState.shouldResumeAfterSeek = !video.paused && !video.ended;
      commitSeek(video, nextTime);
    });
  };

  videos.forEach((video) => {
    const videoState = getState(video);
    const { toggle } = videoState.controls;

    video.controls = false;
    video.preload = "metadata";

    if (toggle) {
      toggle.addEventListener("click", () => {
        if (!video.paused && !video.ended) {
          video.pause();
          return;
        }

        if (video.ended) {
          video.currentTime = 0;
        }

        ensureReadyAndPlay(video);
      });
    }

    bindProgressEvents(video);

    video.addEventListener("loadedmetadata", () => {
      clearReadyTimeout(video);
      updateTimeline(video);
      updateToggle(video);
      if (videoState.isWaitingToPlay) {
        showStatus(video, "正在准备播放...");
      }
    });

    ["loadeddata", "canplay", "canplaythrough"].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        updateTimeline(video);
        if (videoState.isWaitingToPlay) {
          playWhenReady(video);
        }
      });
    });

    ["timeupdate", "progress", "seeked"].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        if (videoState.isDragging) return;
        updateTimeline(video);
      });
    });

    video.addEventListener("play", () => {
      videoState.mode = "loading";
      updateToggle(video);
    });

    video.addEventListener("playing", () => {
      clearReadyTimeout(video);
      videoState.mode = "playing";
      videoState.isWaitingToPlay = false;
      updateToggle(video);
      clearStatus(video);
      updateTimeline(video);
    });

    video.addEventListener("pause", () => {
      if (video.ended) return;
      clearReadyTimeout(video);
      videoState.isWaitingToPlay = false;
      videoState.mode = "paused";
      updateToggle(video);
    });

    video.addEventListener("waiting", () => {
      if (videoState.isDragging) return;
      videoState.mode = "loading";
      updateToggle(video);
      showStatus(video, "正在缓冲视频...");
    });

    video.addEventListener("ended", () => {
      clearReadyTimeout(video);
      videoState.isWaitingToPlay = false;
      videoState.mode = "idle";
      updateToggle(video);
      clearStatus(video);
      updateTimeline(video);
    });

    video.addEventListener("error", () => {
      clearReadyTimeout(video);
      videoState.isWaitingToPlay = false;
      videoState.mode = "paused";
      updateToggle(video);
      showStatus(video, "视频加载失败，请刷新页面后重试。", "error");
    });

    updateTimeline(video);
    updateToggle(video);
  });
})();
