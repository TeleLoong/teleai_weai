(function () {
  const MAP_CONTAINER_ID = "contact-baidu-map";
  const MAP_FALLBACK_ID = "contact-baidu-map-fallback";
  const BAIDU_MAP_SCRIPT_ID = "baidu-map-jsapi-gl";
  const BAIDU_MAP_CALLBACK_NAME = "__teleaiBaiduMapReady";
  const SHANGHAI_FALLBACK_POINT = { lng: 121.4737, lat: 31.2304 };

  let baiduMapScriptPromise;

  function logWarning(message, error) {
    console.warn("[contact-baidu-map]", message, error || "");
  }

  function hasConfiguredAk(ak) {
    const normalizedAk = (ak || "").trim();

    if (!normalizedAk) {
      return false;
    }

    return !/^(?:REPLACE_WITH_|YOUR_|<.+>)/.test(normalizedAk);
  }

  function getAddressCity(address) {
    const match = (address || "").match(/(.+?(?:市|地区|自治州|盟))/);
    return match ? match[1] : "";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return entities[char] || char;
    });
  }

  function detectAkFailure() {
    const pageText = document.body ? document.body.textContent || "" : "";

    return /AK|ak|referer|Referer|白名单|权限|校验|验证失败/.test(pageText);
  }

  function loadBaiduMapScript(ak) {
    if (window.BMapGL) {
      return Promise.resolve(window.BMapGL);
    }

    if (baiduMapScriptPromise) {
      return baiduMapScriptPromise;
    }

    baiduMapScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(BAIDU_MAP_SCRIPT_ID);

      if (existingScript) {
        const existingCallback = window[BAIDU_MAP_CALLBACK_NAME];
        window[BAIDU_MAP_CALLBACK_NAME] = function () {
          if (typeof existingCallback === "function") {
            existingCallback();
          }

          if (window.BMapGL) {
            resolve(window.BMapGL);
            return;
          }

          reject(new Error("BMapGL is unavailable after the callback ran"));
        };
        return;
      }

      const script = document.createElement("script");
      script.id = BAIDU_MAP_SCRIPT_ID;
      window[BAIDU_MAP_CALLBACK_NAME] = function () {
        if (window.BMapGL) {
          resolve(window.BMapGL);
          return;
        }

        reject(new Error("BMapGL is unavailable after the callback ran"));
      };

      script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(
        ak
      )}&callback=${encodeURIComponent(BAIDU_MAP_CALLBACK_NAME)}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error("Failed to load Baidu Maps script"));
      document.head.appendChild(script);
    })
      .catch((error) => {
        baiduMapScriptPromise = null;
        if (window[BAIDU_MAP_CALLBACK_NAME]) {
          delete window[BAIDU_MAP_CALLBACK_NAME];
        }
        throw error;
      })
      .then((BMapGL) => {
        if (window[BAIDU_MAP_CALLBACK_NAME]) {
          delete window[BAIDU_MAP_CALLBACK_NAME];
        }

        return BMapGL;
      });

    return baiduMapScriptPromise;
  }

  function revealInteractiveMap(mapContainer, fallback) {
    mapContainer.classList.remove("is-hidden");
    if (fallback) {
      fallback.classList.add("is-hidden");
    }
  }

  function initContactMap() {
    const mapContainer = document.getElementById(MAP_CONTAINER_ID);

    if (!mapContainer) {
      return;
    }

    const fallback = document.getElementById(MAP_FALLBACK_ID);
    const ak = (mapContainer.dataset.mapAk || "").trim();
    const address = (mapContainer.dataset.mapAddress || "").trim();
    const title = (mapContainer.dataset.mapTitle || "").trim();
    const zoom = Number.parseInt(mapContainer.dataset.mapZoom || "", 10) || 18;

    if (!hasConfiguredAk(ak)) {
      logWarning("Skipped interactive map initialization because the Baidu AK is missing or still set to a placeholder value.");
      return;
    }

    if (!address) {
      logWarning("Skipped interactive map initialization because the address is missing.");
      return;
    }

    loadBaiduMapScript(ak)
      .then((BMapGL) => {
        const map = new BMapGL.Map(mapContainer, {
          enableMapClick: false,
        });
        const initialPoint = new BMapGL.Point(SHANGHAI_FALLBACK_POINT.lng, SHANGHAI_FALLBACK_POINT.lat);

        map.centerAndZoom(initialPoint, zoom);
        map.enableDragging();
        map.enableScrollWheelZoom();
        map.enableContinuousZoom();
        map.addControl(new BMapGL.NavigationControl());
        map.addControl(new BMapGL.ScaleControl());

        const geocoder = new BMapGL.Geocoder();
        const city = getAddressCity(address);

        geocoder.getPoint(
          address,
          (point) => {
            if (!point) {
              logWarning(`Address geocoding failed or returned no result: ${address}`);
              return;
            }

            map.clearOverlays();
            map.centerAndZoom(point, zoom);
            const marker = new BMapGL.Marker(point);
            map.addOverlay(marker);

            if (title) {
              const infoWindow = new BMapGL.InfoWindow(
                `<strong>${escapeHtml(title)}</strong><div style="margin-top:0.35rem;">${escapeHtml(address)}</div>`
              );
              map.openInfoWindow(infoWindow, point);
              marker.addEventListener("click", () => {
                map.openInfoWindow(infoWindow, point);
              });
            }

            revealInteractiveMap(mapContainer, fallback);
          },
          city
        );
      })
      .catch((error) => {
        if (detectAkFailure()) {
          logWarning("Interactive Baidu map initialization failed because the AK verification or Referer whitelist check did not pass.", error);
          return;
        }

        if (error && /BMapGL/.test(error.message || "")) {
          logWarning("Interactive Baidu map initialization failed because BMapGL was not ready after the callback completed.", error);
          return;
        }

        if (error && /Failed to load Baidu Maps script/.test(error.message || "")) {
          logWarning("Interactive Baidu map initialization failed because the Baidu Maps script could not be loaded.", error);
          return;
        }

        logWarning("Interactive Baidu map initialization failed for an unexpected reason.", error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initContactMap, { once: true });
  } else {
    initContactMap();
  }
})();
