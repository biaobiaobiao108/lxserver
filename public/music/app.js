// frontend/player/src/index.ts
var API_BASE = "/api/music";
var currentPage = 1;
window.currentPage = 1;
var currentSearch = { name: "", source: "kw" };
var currentPlaylist = [];
var currentIndex = -1;
var preSelectedNextIndex = null;
window.viewingPlaylist = [];
var currentPlayingScope = "network";
window.currentSearchScope = "network";
var currentPlayingSong = null;
window.batchCollectSongs = null;
var audio = document.getElementById("audio-player");
var currentPlaybackRate = 1;
window.goToPage = function(page) {
  currentPage = page;
  window.currentPage = page;
  if (typeof doSearch === "function")
    doSearch(page);
};
function initGlobalListSearch() {
  if (window.ListSearch) {
    window.ListSearch.init("global", {
      renderCallback: () => renderResults(window.viewingPlaylist),
      paginationCallback: (page, index) => {
        window.goToPage(page);
        setTimeout(() => window.ListSearch.scrollToMatch(index), 300);
      },
      getList: () => window.viewingPlaylist,
      itemsPerPage: settings.itemsPerPage === "all" ? 999999 : parseInt(settings.itemsPerPage)
    });
  }
}
document.addEventListener("DOMContentLoaded", () => {
  initGlobalListSearch();
});
var DEFAULT_SETTINGS = {
  itemsPerPage: 20,
  defaultEntry: "favorites",
  preferredQuality: "flac",
  enablePublicSources: true,
  enableProxyPlayback: false,
  enableProxyDownload: false,
  enableAutoProxy: true,
  enableCustomProxy: false,
  customProxyUrl: "",
  enableOnlyDownloadMode: true,
  downloadConcurrency: 3,
  hotSearchLimit: 20,
  lyricFontSize: 1.25,
  lyricFontFamily: "",
  switchPlaylistOnSearchPlay: true,
  switchPlaylistOnSongListPlay: true,
  autoResume: true,
  showSidebarSongInfo: false,
  enableCrossfade: true,
  keepScreenAwake: true,
  enableKeyboardShortcuts: true,
  showLyricTranslation: true,
  showLyricRoma: false,
  swapLyricTransRoma: false,
  autoCompactPlaybar: true,
  enableAutoSwitchSource: true,
  enableAutoSwitchApiSource: true,
  enableAutoSkipOnError: true,
  enableAutoDegradeQuality: true,
  playbackErrorPriority: "platform,quality,next",
  enablePreloader: true,
  enableSmtcLyric: true,
  showFooterVisualizer: true,
  footerVisualizerStyle: "bars",
  showDetailVisualizer: false,
  detailVisualizerStyle: "pulse",
  visualizerOpacity: 0.5,
  visualizerGlobalStyle: "blocks",
  enableServerCache: true,
  enableServerLyricCache: true,
  embedLyricToFile: true,
  serverCacheLocation: "root",
  serverCacheNamingPattern: "simple",
  enableRemaster: false,
  enableLyricCache: true,
  enableSongUrlCache: true,
  enableLyricGlow: true,
  enablePersistentToken: false,
  playerBackground: "blur",
  saveAccountSettingsToFile: true,
  autoUpdateNetworkList: false,
  networkListAutoCheckInterval: "6h",
  favoriteSidebarOrder: [],
  preferServerCache: true,
  remoteSyncUrl: "",
  remoteSyncCode: "",
  enableClientModeSync: false,
  lastRemoteSyncMode: "merge_remote_local",
  deduplicatePlaylistByQuality: true
};
function normalizeDownloadConcurrency(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed))
    return DEFAULT_SETTINGS.downloadConcurrency;
  return Math.min(5, Math.max(1, parsed));
}
function normalizeStoredSettings(nextSettings) {
  if (!nextSettings || typeof nextSettings !== "object")
    return nextSettings;
  delete nextSettings.remasterRetryManifest;
  if (nextSettings.downloadConcurrency !== undefined) {
    nextSettings.downloadConcurrency = normalizeDownloadConcurrency(nextSettings.downloadConcurrency);
  }
  nextSettings.serverCacheNamingPattern = nextSettings.serverCacheNamingPattern === "standard" ? "standard" : "simple";
  return nextSettings;
}
var settings = { ...DEFAULT_SETTINGS };
var currentRawLrc = "";
var currentRawTlrc = "";
var currentRawRlrc = "";
var currentRawKlrc = "";
var lastLyricSongId = null;
var currentRecoveryState = null;
try {
  const saved = localStorage.getItem("lx_settings");
  if (saved) {
    settings = normalizeStoredSettings({ ...settings, ...JSON.parse(saved) });
  }
} catch (e) {
  console.error("[Settings] 加载设置失败:", e);
}
window.settings = settings;
window.networkListUpdateMap = new Set;
var networkListAutoCheckTimer = null;
function escapeHtmlText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[ch]);
}
function parseNetworkListAutoCheckInterval(value) {
  const minIntervalMs = 30 * 1000;
  if (value === undefined || value === null)
    return 0;
  const raw = String(value).trim().toLowerCase();
  if (raw === "" || raw === "0" || raw === "off" || raw === "none" || raw === "disable")
    return 0;
  const matched = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!matched)
    return null;
  const count = parseFloat(matched[1]);
  const unit = matched[2] || "h";
  if (!Number.isFinite(count) || count < 0)
    return null;
  let intervalMs = null;
  switch (unit) {
    case "ms":
      intervalMs = count;
      break;
    case "s":
      intervalMs = count * 1000;
      break;
    case "m":
      intervalMs = count * 60 * 1000;
      break;
    case "h":
      intervalMs = count * 60 * 60 * 1000;
      break;
    case "d":
      intervalMs = count * 24 * 60 * 60 * 1000;
      break;
    default:
      return null;
  }
  return Math.max(intervalMs, minIntervalMs);
}
function setupNetworkListAutoCheck() {
  if (networkListAutoCheckTimer) {
    clearInterval(networkListAutoCheckTimer);
    networkListAutoCheckTimer = null;
  }
  if (!settings.autoUpdateNetworkList) {
    return;
  }
  const intervalMs = parseNetworkListAutoCheckInterval(settings.networkListAutoCheckInterval);
  if (intervalMs === null || intervalMs <= 0) {
    return;
  }
  networkListAutoCheckTimer = setInterval(() => {
    checkNetworkListUpdates().catch((err) => console.error("[AutoCheck] 网络歌单检测失败:", err));
  }, intervalMs);
  console.log("[AutoCheck] 已设置网络歌单自动检测间隔：", settings.networkListAutoCheckInterval, "(", intervalMs, "ms )");
}
async function checkNetworkListUpdates(manual = false) {
  if (!currentListData || !Array.isArray(currentListData.userList) || currentListData.userList.length === 0) {
    if (manual && window.showToast)
      showToast("info", "当前没有可检查的网络歌单", 3000);
    return;
  }
  const targetLists = currentListData.userList.filter((l) => l && l.sourceListId && l.source);
  if (targetLists.length === 0) {
    if (manual && window.showToast)
      showToast("info", "当前没有可检查的网络歌单", 3000);
    return;
  }
  const changedLists = [];
  const failedLists = [];
  for (const list of targetLists) {
    try {
      const url = `${API_BASE}/songList/detail?source=${encodeURIComponent(list.source)}&id=${encodeURIComponent(list.sourceListId)}&page=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data || !Array.isArray(data.list)) {
        throw new Error("远端歌单数据不完整");
      }
      const remoteList = data.list.map((item) => {
        const formatted = formatSongToLxMusicStandard(item);
        if (!formatted.source)
          formatted.source = list.source;
        return formatted;
      });
      const localList = Array.isArray(list.list) ? list.list : [];
      const sameLength = localList.length === remoteList.length;
      const sameIds = sameLength && localList.every((item, index) => item && remoteList[index] && String(item.id || "") === String(remoteList[index].id || "") && String(item.source || "") === String(remoteList[index].source || ""));
      if (!sameIds) {
        window.networkListUpdateMap.add(list.id);
        changedLists.push(list.name || list.id || list.sourceListId);
      } else {
        window.networkListUpdateMap.delete(list.id);
      }
    } catch (err) {
      console.error("[CheckNetworkListUpdates] 检查失败:", list.name || list.id || list.sourceListId, err);
      failedLists.push(list.name || list.id || list.sourceListId);
    }
  }
  if (typeof renderMyLists === "function") {
    renderMyLists(currentListData);
  }
  if (manual) {
    const changedListNames = changedLists.map(escapeHtmlText);
    const failedListNames = failedLists.map(escapeHtmlText);
    if (changedLists.length > 0) {
      showSuccess(`检测到 ${changedLists.length} 个歌单已更新：${changedListNames.join("、")}`);
    } else if (failedLists.length === 0) {
      showSuccess("所有网络歌单均为最新状态");
    }
    if (failedLists.length > 0) {
      showError(`部分歌单检测失败：${failedListNames.join("、")}`);
    }
  } else if (changedLists.length > 0 && window.showToast) {
    showToast("info", `检测到 ${changedLists.length} 个网络歌单有更新`, 5000);
  }
}
window.checkNetworkListUpdates = checkNetworkListUpdates;
setTimeout(() => {
  if (settings.serverCacheLocation && window.updateServerCacheConfig) {
    console.log("[ServerCache] Syncing config:", settings.serverCacheLocation, settings.serverCacheNamingPattern);
    window.updateServerCacheConfig(settings.serverCacheLocation, settings.serverCacheNamingPattern);
  }
}, 2000);
window.batchMode = false;
window.selectedItems = new Set;
window.selectedSongObjects = new Map;
var expandBtnTimeout = null;
var toggleLyricsBtnTimeout = null;
var authEnabled = false;
var authToken = sessionStorage.getItem("lx_player_auth");
var userToken = localStorage.getItem("lx_user_token");
function getUserAuthHeaders() {
  let username = localStorage.getItem("lx_sync_user") || "";
  if (username === "_open")
    username = "";
  const adminPass = localStorage.getItem("lx_admin_password");
  const headers = {};
  if (userToken) {
    headers["x-user-name"] = username;
    headers["x-user-token"] = userToken;
  } else {
    const pass = localStorage.getItem("lx_sync_pass");
    if (username && pass) {
      headers["x-user-name"] = username;
      headers["x-user-password"] = pass;
    } else if (username) {
      headers["x-user-name"] = username;
    }
  }
  if (adminPass) {
    headers["x-frontend-auth"] = adminPass;
  }
  return headers;
}
window.getUserAuthHeaders = getUserAuthHeaders;
function isUserLoggedIn() {
  const user = localStorage.getItem("lx_sync_user");
  const token = localStorage.getItem("lx_user_token");
  const pass = localStorage.getItem("lx_sync_pass");
  return !!user && user !== "_open" && !!(token || pass);
}
window.isUserLoggedIn = isUserLoggedIn;
function isPublicLibraryContext() {
  if (isUserLoggedIn())
    return false;
  return true;
}
window.isPublicLibraryContext = isPublicLibraryContext;
async function fetchPublicListData() {
  const enablePublicFavorites = !!window.lx_config?.["user.enablePublicFavorites"];
  const enablePublicNonAdminAccess = !!window.lx_config?.["user.enablePublicNonAdminAccess"];
  const isAdmin = !!localStorage.getItem("lx_admin_password");
  const isUserLoggedIn = typeof window.isUserLoggedIn === "function" ? window.isUserLoggedIn() : false;
  if (!enablePublicFavorites)
    return false;
  if (!enablePublicNonAdminAccess && !isAdmin && !isUserLoggedIn) {
    console.log("[PublicList] 未开启非管理员访问且未登录管理员/个人账号，禁止加载公开歌单");
    return false;
  }
  try {
    console.log("[PublicList] 正在获取 _open 公共歌单数据...");
    const headers = {};
    const adminPass = localStorage.getItem("lx_admin_password");
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    headers["x-user-name"] = "_open";
    const res = await fetch("/api/user/list?user=_open", {
      headers,
      cache: "no-store"
    });
    if (res.ok) {
      const listData = await res.json();
      if (listData) {
        listData.username = "_open";
        window.publicListData = listData;
        currentListData = listData;
        window.currentListData = listData;
        renderMyLists(listData);
        console.log("[PublicList] 公共歌单数据加载成功");
        if (typeof loadLibraryData === "function") {
          await loadLibraryData();
        }
        return true;
      }
    }
  } catch (err) {
    console.warn("[PublicList] 加载公共歌单失败:", err);
  }
  return false;
}
window.fetchPublicListData = fetchPublicListData;
async function reloadUserFavorites() {
  try {
    if (!isUserLoggedIn()) {
      const loaded = await fetchPublicListData();
      if (loaded)
        return;
      currentListData = null;
      window.currentListData = null;
      renderMyLists(null);
      return;
    }
    if (window.myPersonalListData) {
      currentListData = window.myPersonalListData;
      window.currentListData = window.myPersonalListData;
      renderMyLists(window.myPersonalListData);
    } else {
      currentListData = null;
      window.currentListData = null;
    }
    const headers = typeof getUserAuthHeaders === "function" ? getUserAuthHeaders() : {};
    delete headers["x-user-name"];
    const syncUser = localStorage.getItem("lx_sync_user");
    if (syncUser && syncUser !== "_open") {
      headers["x-user-name"] = syncUser;
    }
    const res = await fetch("/api/user/list", {
      headers,
      cache: "no-store"
    });
    if (res.ok) {
      const listData = await res.json();
      if (listData) {
        currentListData = listData;
        window.currentListData = listData;
        window.myPersonalListData = listData;
        renderMyLists(listData);
        await window.ListStore.set(listData).catch((e) => console.error("[IDBStore] 保存失败:", e));
        if (typeof loadLibraryData === "function") {
          await loadLibraryData();
        }
      }
    }
  } catch (e) {
    console.error("[ReloadFavorites] Error:", e);
  }
}
window.reloadUserFavorites = reloadUserFavorites;
window.isViewingPublicFavorites = false;
async function handleTogglePublicFavorites() {
  window.isViewingPublicFavorites = !window.isViewingPublicFavorites;
  if (window.isViewingPublicFavorites) {
    if (currentListData && currentListData.username !== "_open") {
      window.myPersonalListData = currentListData;
    }
    showInfo("已切换至【公开收藏】列表 (_open)");
    const loaded = await fetchPublicListData();
    if (!loaded) {
      showError("加载公开收藏失败");
      window.isViewingPublicFavorites = false;
      if (window.myPersonalListData) {
        currentListData = window.myPersonalListData;
        window.currentListData = window.myPersonalListData;
        renderMyLists(window.myPersonalListData);
      }
    } else {
      if (typeof loadLibraryData === "function") {
        await loadLibraryData();
      }
    }
  } else {
    showInfo("已切换至【个人收藏】列表");
    await reloadUserFavorites();
    if (typeof loadLibraryData === "function") {
      await loadLibraryData();
    }
  }
}
window.handleTogglePublicFavorites = handleTogglePublicFavorites;
var userTokenRefreshPromise = null;
async function ensureUserAuthToken(options = {}) {
  const force = options.force === true;
  const username = localStorage.getItem("lx_sync_user") || "";
  const password = localStorage.getItem("lx_sync_pass") || "";
  if (!username || !password) {
    if (force) {
      userToken = null;
      localStorage.removeItem("lx_user_token");
      if (typeof updateUserUI === "function")
        updateUserUI();
    }
    return false;
  }
  if (userToken && !force)
    return true;
  if (userTokenRefreshPromise)
    return userTokenRefreshPromise;
  userTokenRefreshPromise = (async () => {
    if (force) {
      userToken = null;
      localStorage.removeItem("lx_user_token");
    }
    try {
      const response = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok)
        return false;
      const result = await response.json();
      if (!result.success || !result.token)
        return false;
      userToken = result.token;
      localStorage.setItem("lx_user_token", userToken);
      if (typeof updateUserUI === "function")
        updateUserUI();
      return true;
    } catch (error) {
      console.warn("[Auth] Token 自动续签失败:", error);
      return false;
    } finally {
      userTokenRefreshPromise = null;
    }
  })();
  return userTokenRefreshPromise;
}
window.ensureUserAuthToken = ensureUserAuthToken;
function updateUserUI() {
  const loginBtn = document.getElementById("header-login-btn");
  const userDisplay = document.getElementById("header-user-display");
  const usernameEl = document.getElementById("header-username");
  if (!loginBtn || !userDisplay || !usernameEl)
    return;
  const username = localStorage.getItem("lx_sync_user");
  const token = localStorage.getItem("lx_user_token");
  if (token && username) {
    loginBtn.classList.add("hidden");
    loginBtn.classList.remove("flex");
    userDisplay.classList.add("flex");
    userDisplay.classList.remove("hidden");
    usernameEl.innerText = username;
  } else {
    loginBtn.classList.add("flex");
    loginBtn.classList.remove("hidden");
    userDisplay.classList.add("hidden");
    userDisplay.classList.remove("flex");
  }
}
window.updateUserUI = updateUserUI;
async function handleHeaderLogout(e) {
  if (e)
    e.stopPropagation();
  if (typeof handleSyncLogout === "function") {
    await handleSyncLogout(false);
  } else {
    const confirmed = typeof showSelect === "function" ? await showSelect("退出同步账号", "确定要退出当前账号并清除同步凭证？", { danger: true }) : confirm("确定要退出当前账号并清除同步凭证？");
    if (confirmed) {
      try {
        if (window.ListStore && typeof window.ListStore.remove === "function") {
          await window.ListStore.remove().catch(() => {});
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (err) {}
      const agreementAccepted = localStorage.getItem("lx_agreement_accepted");
      localStorage.clear();
      sessionStorage.clear();
      if (agreementAccepted)
        localStorage.setItem("lx_agreement_accepted", agreementAccepted);
      window.location.reload();
    }
  }
}
window.handleHeaderLogout = handleHeaderLogout;
(async () => {
  try {
    const response = await fetch("/api/music/config");
    const config = await response.json();
    window.lx_config = config;
    authEnabled = config["player.enableAuth"] === true;
    if (authEnabled) {
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.classList.remove("hidden");
        logoutBtn.classList.add("flex");
      }
    }
    if (typeof syncSettingsUI === "function")
      syncSettingsUI();
    else if (typeof updateAdminUI === "function")
      updateAdminUI();
    if (userToken) {
      try {
        const vRes = await fetch("/api/user/auth/verify", {
          headers: { "x-user-token": userToken }
        });
        const vData = await vRes.json();
        if (!vData.valid) {
          const refreshed = await ensureUserAuthToken({ force: true });
          if (refreshed) {
            console.log("[Auth] 用户 Token 已失效，已自动续签。");
          } else {
            console.log("[Auth] 用户 Token 已失效且无法自动续签，请重新登录。");
          }
        }
      } catch (e) {
        console.warn("[Auth] Token 验证失败:", e);
      }
    }
    if (config["user.enablePublicRestriction"]) {
      console.log("[Auth] 检测到公开限制已开启，尝试拉取公共配置...");
      if (typeof fetchSettingsFromServer === "function") {
        await fetchSettingsFromServer();
      }
    }
    if (config["user.enablePublicFavorites"] && !isUserLoggedIn()) {
      console.log("[Auth] 检测到已开启公开收藏且无账号登录，正在拉取公共歌单...");
      const loaded = await fetchPublicListData();
      if (!loaded) {
        renderMyLists(null);
      }
    }
    if (userToken && settings.enableClientModeSync && settings.remoteSyncUrl && settings.remoteSyncCode) {
      console.info("[Sync] Client mode enabled, auto-connecting to remote server...");
      setTimeout(() => {
        if (typeof handleRemoteOverwriteConnect === "function") {
          handleRemoteOverwriteConnect(true);
        }
      }, 500);
    }
    updateUserUI();
  } catch (error) {
    console.error("[Auth] 初始化检查失败:", error);
  }
})();
document.addEventListener("DOMContentLoaded", () => {
  const qualitySelect = document.getElementById("quality-select");
  if (qualitySelect && settings.preferredQuality) {
    qualitySelect.value = settings.preferredQuality;
  }
  const proxyPlayback = document.getElementById("toggle-proxy-playback");
  if (proxyPlayback)
    proxyPlayback.checked = settings.enableProxyPlayback;
  const proxyDownload = document.getElementById("toggle-proxy-download");
  if (proxyDownload)
    proxyDownload.checked = settings.enableProxyDownload;
  const autoProxy = document.getElementById("toggle-auto-proxy");
  if (autoProxy)
    autoProxy.checked = settings.enableAutoProxy;
  const customProxyToggle = document.getElementById("toggle-custom-proxy");
  if (customProxyToggle)
    customProxyToggle.checked = settings.enableCustomProxy;
  const customProxyInput = document.getElementById("custom-proxy-url-input");
  if (customProxyInput)
    customProxyInput.value = settings.customProxyUrl || "";
  const customProxyRow = document.getElementById("custom-proxy-url-row");
  if (customProxyRow)
    customProxyRow.classList.toggle("hidden", !settings.enableCustomProxy);
  const hotSearchLimitInput = document.getElementById("hot-search-limit-input");
  if (hotSearchLimitInput) {
    hotSearchLimitInput.value = settings.hotSearchLimit !== undefined && settings.hotSearchLimit !== null ? settings.hotSearchLimit : 20;
  }
  if (window.SongListManager) {
    window.SongListManager.init();
  }
  const lyricFontSizeSlider = document.getElementById("lyric-font-size-slider");
  const lyricFontSizeValue = document.getElementById("lyric-font-size-value");
  if (lyricFontSizeSlider && lyricFontSizeValue) {
    const size = settings.lyricFontSize || 1.25;
    lyricFontSizeSlider.value = size;
    lyricFontSizeValue.innerText = size;
    document.documentElement.style.setProperty("--lyric-font-size", `${size}rem`);
  }
  const lyricFontFamilySelect = document.getElementById("lyric-font-family-select");
  if (lyricFontFamilySelect) {
    const fontFamily = settings.lyricFontFamily || "";
    if (fontFamily) {
      let exists = Array.from(lyricFontFamilySelect.options).some((opt) => opt.value === fontFamily);
      if (!exists) {
        const option = document.createElement("option");
        option.value = fontFamily;
        option.textContent = fontFamily;
        lyricFontFamilySelect.add(option, null);
      }
      lyricFontFamilySelect.value = fontFamily;
      document.documentElement.style.setProperty("--lyric-font-family", fontFamily);
    }
  }
  const progressContainer = document.getElementById("progress-container");
  if (progressContainer) {
    progressContainer.addEventListener("mousedown", (e) => startDragging(e, "progress"));
    progressContainer.addEventListener("touchstart", (e) => startDragging(e, "progress"), { passive: false });
  }
  const volumeContainer = document.getElementById("volume-container");
  if (volumeContainer) {
    volumeContainer.addEventListener("mousedown", (e) => startDragging(e, "volume"));
    volumeContainer.addEventListener("touchstart", (e) => startDragging(e, "volume"), { passive: false });
  }
  window.addEventListener("mousemove", handleDragMove);
  window.addEventListener("touchmove", handleDragMove, { passive: false });
  window.addEventListener("mouseup", stopDragging);
  window.addEventListener("touchend", stopDragging);
  syncSettingsUI();
  updateUserUI();
});
var isDragging = null;
var dragPercentage = 0;
var lastSeekTime = 0;
var lastSeekPct = -1;
var SEEK_THROTTLE_MS = 100;
function startDragging(e, type) {
  if (e.type === "touchstart")
    e.preventDefault();
  isDragging = type;
  if (type === "progress")
    lastSeekPct = -1;
  handleDragMove(e);
}
function stopDragging() {
  if (isDragging === "progress" && Number.isFinite(dragPercentage)) {
    if (Math.abs(dragPercentage - lastSeekPct) > 0.001) {
      audio.currentTime = dragPercentage * audio.duration;
      if (typeof lyricPlayer !== "undefined" && lyricPlayer) {
        lyricPlayer.play(audio.currentTime * 1000);
      }
    }
  }
  isDragging = null;
  lastSeekPct = -1;
}
function handleDragMove(e) {
  if (!isDragging)
    return;
  if (e.type === "touchmove")
    e.preventDefault();
  const clientX = e.type.startsWith("touch") ? e.touches[0].clientX : e.clientX;
  if (isDragging === "progress") {
    const container = document.getElementById("progress-container");
    if (!container || !audio.duration || !Number.isFinite(audio.duration))
      return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    dragPercentage = pct;
    document.getElementById("progress-bar").style.width = `${pct * 100}%`;
    document.getElementById("time-current").innerText = formatTime(pct * audio.duration);
    const now = Date.now();
    if (now - lastSeekTime > SEEK_THROTTLE_MS) {
      if (Math.abs(pct - lastSeekPct) > 0.001) {
        audio.currentTime = pct * audio.duration;
        if (typeof lyricPlayer !== "undefined" && lyricPlayer) {
          lyricPlayer.play(audio.currentTime * 1000);
          scrollToActiveLine(true);
        }
        lastSeekTime = now;
        lastSeekPct = pct;
      }
    }
  } else if (isDragging === "volume") {
    const container = document.getElementById("volume-container");
    if (!container)
      return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    currentVolume = pct;
    audio.volume = pct;
    isMuted = false;
    updateVolumeUI();
    localStorage.setItem("lx_volume", currentVolume.toString());
  }
}
function changeProxyPlayback(enabled) {
  updateSetting("enableProxyPlayback", enabled);
}
function changeProxyDownload(enabled) {
  updateSetting("enableProxyDownload", enabled);
}
function changeAutoProxy(enabled) {
  updateSetting("enableAutoProxy", enabled);
}
function changeHotSearchLimit(value) {
  const limit = parseInt(value);
  if (!isNaN(limit) && limit >= 0 && limit <= 50) {
    updateSetting("hotSearchLimit", limit);
  } else {
    showError("请输入 0 到 50 之间的数字");
    const input = document.getElementById("hot-search-limit-input");
    if (input)
      input.value = settings.hotSearchLimit || 20;
  }
}
function changeLyricFontSize(value) {
  const size = parseFloat(value);
  if (!isNaN(size)) {
    updateSetting("lyricFontSize", size);
  }
}
function changeQualityPreference(quality) {
  updateSetting("preferredQuality", quality);
}
function switchTab(tabId) {
  if (tabId === "favorites") {
    handleFavoritesClick();
    return;
  }
  document.querySelectorAll('[id^="view-"]').forEach((el) => {
    el.classList.add("hidden");
    el.classList.remove("opacity-100");
    el.classList.add("opacity-0");
  });
  const activeView = document.getElementById(`view-${tabId}`);
  if (!activeView)
    return;
  activeView.classList.remove("hidden");
  setTimeout(() => {
    activeView.classList.remove("opacity-0");
    activeView.classList.add("opacity-100");
    if (typeof updateUserUI === "function")
      updateUserUI();
  }, 10);
  if (tabId === "settings") {
    if (typeof syncSettingsUI === "function")
      syncSettingsUI();
    else if (typeof updateAdminUI === "function")
      updateAdminUI();
  }
  document.querySelectorAll('[id^="tab-"]').forEach((el) => {
    el.classList.remove("active-tab", "text-emerald-600");
    el.classList.add("t-text-muted");
  });
  const activeTab = document.getElementById(`tab-${tabId}`);
  if (activeTab) {
    activeTab.classList.add("active-tab");
    activeTab.classList.remove("t-text-muted");
  }
  if (expandBtnTimeout)
    clearTimeout(expandBtnTimeout);
  if (toggleLyricsBtnTimeout)
    clearTimeout(toggleLyricsBtnTimeout);
  exitListSecondaryModes();
  if (window.innerWidth <= 1024 && tabId !== "favorites") {
    const sidebar = document.getElementById("main-sidebar");
    if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
      toggleSidebar();
    }
  }
  document.querySelectorAll("[data-sidebar-list-id]").forEach((el) => {
    el.classList.remove("active-sub-item");
    el.classList.add("t-text-muted");
  });
  if (tabId === "search") {
    initGlobalListSearch();
    currentSearchScope = "network";
    document.getElementById("search-source").classList.remove("hidden");
    document.getElementById("search-type").classList.remove("hidden");
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.placeholder = "搜索歌曲、歌手...";
      if (!searchInput.value.trim()) {
        showInitialSearchState();
      }
    }
    document.getElementById("page-title").innerText = "搜索音乐";
  }
  if (tabId === "songlist") {
    document.getElementById("page-title").innerText = "歌单";
  }
  if (tabId === "leaderboard") {
    document.getElementById("page-title").innerText = "排行榜";
    if (window.LeaderboardManager && !window.LeaderboardManager.initialized) {
      window.LeaderboardManager.init();
    }
  }
  if (tabId === "localmusic") {
    document.getElementById("page-title").innerText = "本地音乐";
  }
  if (tabId !== "favorites") {
    const favList = document.getElementById("favorites-children");
    const arrow = document.getElementById("favorites-arrow");
    if (favList && favList.style.height !== "0px") {
      favList.style.height = "0px";
      if (arrow)
        arrow.style.transform = "rotate(-90deg)";
    }
  }
  if (tabId === "settings") {
    document.getElementById("page-title").innerText = "设置";
    if (typeof loadCustomSources === "function") {
      loadCustomSources();
    }
  }
  if (tabId === "about") {
    document.getElementById("page-title").innerText = "关于";
    loadAboutContent();
  }
  if (window.batchMode && typeof toggleBatchMode === "function") {
    toggleBatchMode();
  }
}
function exitListSecondaryModes() {
  if (window.ListSearch && window.ListSearch.state.active) {
    window.ListSearch.resetState();
  }
  if (window.batchMode) {
    const batchToolbar = document.getElementById("batch-toolbar");
    const slBatchToolbar = document.getElementById("sl-batch-toolbar");
    if (batchToolbar && !batchToolbar.classList.contains("hidden") || slBatchToolbar && !slBatchToolbar.classList.contains("hidden")) {
      if (typeof toggleBatchMode === "function")
        toggleBatchMode();
    }
    const lbBatchToolbar = document.getElementById("lb-batch-toolbar");
    if (lbBatchToolbar && !lbBatchToolbar.classList.contains("hidden")) {
      if (typeof toggleLbBatchMode === "function")
        toggleLbBatchMode();
    }
  }
}
async function loadAboutContent() {
  const aboutContainer = document.getElementById("about-content");
  if (!aboutContainer)
    return;
  try {
    const response = await fetch("/music/about.md");
    if (!response.ok)
      throw new Error("Failed to load about.md");
    const text = await response.text();
    if (window.marked) {
      const version = window.CONFIG && window.CONFIG.version || "v1.0.0";
      const buildHash = window.CONFIG && window.CONFIG.buildHash || "unknown";
      let content = text.replace(/{{version}}/g, version);
      content = content.replace(/{{buildHash}}/g, buildHash);
      aboutContainer.innerHTML = window.marked.parse(content);
    } else {
      aboutContainer.innerText = text;
    }
    aboutContainer.classList.remove("animate-pulse");
  } catch (e) {
    console.error("Failed to load about content:", e);
    aboutContainer.innerHTML = '<p class="text-red-500">加载关于页面失败，请稍后重试。</p>';
  }
}
document.addEventListener("DOMContentLoaded", () => {
  if (window.CONFIG && window.CONFIG.version) {
    const versionEl = document.getElementById("app-version");
    if (versionEl) {
      versionEl.innerText = window.CONFIG.version + " Web";
    }
  }
  const cachedSearchSource = localStorage.getItem("search-source");
  if (cachedSearchSource) {
    const searchSourceEl = document.getElementById("search-source");
    if (searchSourceEl)
      searchSourceEl.value = cachedSearchSource;
  }
  const expandBtn = document.getElementById("btn-expand-panel");
  if (expandBtn) {
    expandBtn.addEventListener("mouseenter", () => {
      if (expandBtnTimeout)
        clearTimeout(expandBtnTimeout);
      expandBtn.classList.remove("faint");
    });
    expandBtn.addEventListener("mouseleave", () => {
      const footer = document.getElementById("player-footer");
      if (footer && footer.classList.contains("translate-y-[110%]")) {
        startExpandBtnTimer();
      }
    });
  }
  const toggleLyricsBtn = document.getElementById("btn-toggle-lyrics");
  if (toggleLyricsBtn) {
    toggleLyricsBtn.addEventListener("mouseenter", () => {
      if (toggleLyricsBtnTimeout)
        clearTimeout(toggleLyricsBtnTimeout);
      toggleLyricsBtn.classList.remove("faint");
    });
    toggleLyricsBtn.addEventListener("mouseleave", () => {
      const view = document.getElementById("view-player-detail");
      if (view && !view.classList.contains("translate-y-[100%]")) {
        startToggleLyricsBtnTimer();
      }
    });
  }
});
function toggleQueueDrawer() {
  const drawer = document.getElementById("queue-drawer");
  if (!drawer)
    return;
  const isHidden = drawer.classList.contains("translate-x-full");
  if (isHidden) {
    renderQueue();
    drawer.classList.remove("translate-x-full");
    setTimeout(() => {
      scrollToCurrentSongInQueue(false);
    }, 350);
    if (window.innerWidth <= 1024) {
      const sidebar = document.getElementById("main-sidebar");
      if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
        toggleSidebar();
      }
    }
  } else {
    drawer.classList.add("translate-x-full");
  }
}
window.toggleQueueDrawer = toggleQueueDrawer;
function scrollToCurrentSongInQueue(flash = true) {
  const listContainer = document.getElementById("queue-list");
  if (!listContainer)
    return;
  const activeItem = listContainer.querySelector(".border-emerald-500");
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
    if (flash) {
      activeItem.classList.add("ring-2", "ring-emerald-500", "ring-inset", "ring-opacity-50");
      setTimeout(() => {
        activeItem.classList.remove("ring-2", "ring-emerald-500", "ring-inset", "ring-opacity-50");
      }, 1000);
    }
  } else if (flash) {
    showInfo("当前播放歌曲不在队列中或尚未渲染");
  }
}
window.scrollToCurrentSongInQueue = scrollToCurrentSongInQueue;
function renderQueue() {
  const listContainer = document.getElementById("queue-list");
  const countEl = document.getElementById("queue-count");
  if (!listContainer)
    return;
  if (!currentPlaylist || currentPlaylist.length === 0) {
    listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-30 select-none">
                <i class="fas fa-music text-4xl mb-4"></i>
                <p class="text-xs font-bold uppercase tracking-widest">队列为空</p>
            </div>
        `;
    if (countEl)
      countEl.innerText = "0 SONGS";
    return;
  }
  if (countEl)
    countEl.innerText = `${currentPlaylist.length} SONGS`;
  listContainer.innerHTML = currentPlaylist.map((song, index) => {
    const isActive = index === currentIndex;
    return `
            <div class="group flex items-center gap-3 p-3 rounded-xl transition-all hover:t-bg-item-hover cursor-pointer relative ${isActive ? "t-bg-item-hover border-l-4 border-emerald-500 pl-2" : ""}"
                 onclick="playSongFromQueue(${index})">
                
                <div class="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
                    <img src="${getImgUrl(song)}" 
                         onerror="this.src='/music/assets/logo.svg'" 
                         loading="lazy" fetchpriority="low"
                         class="w-full h-full object-cover">
                    ${isActive ? '<div class="absolute inset-0 bg-emerald-500/20 flex items-center justify-center"><div class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div></div>' : ""}
                </div>
                
                <div class="flex-1 min-w-0">
                    ${createMarqueeHtml(song.name, "text-sm font-bold " + (isActive ? "text-emerald-500" : "t-text-main"))}
                    <div class="flex items-center gap-1 mt-0.5 overflow-hidden whitespace-nowrap">
                        ${getSourceTag(song.source)}
                        ${getQualityTags(song)}
                        ${createMarqueeHtml(song.singer, "text-[10px] t-text-muted flex-1")}
                    </div>
                </div>

                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="event.stopPropagation(); removeFromQueue(${index})" class="p-2 text-gray-400 hover:text-red-500 transition-colors">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                    <div class="p-2 text-gray-400 cursor-grab active:cursor-grabbing queue-drag-handle">
                        <i class="fas fa-grip-lines text-xs"></i>
                    </div>
                </div>
            </div>
        `;
  }).join("");
  if (typeof Sortable !== "undefined" && listContainer) {
    try {
      const oldSortable = Sortable.get(listContainer);
      if (oldSortable)
        oldSortable.destroy();
    } catch (e) {}
    Sortable.create(listContainer, {
      animation: 200,
      handle: ".queue-drag-handle",
      ghostClass: "sortable-ghost-solid",
      chosenClass: "sortable-chosen-item",
      dragClass: "sortable-drag-item",
      forceFallback: true,
      fallbackOnBody: true,
      delay: 100,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,
      onStart: () => {
        document.body.classList.add("select-none");
      },
      onEnd: (evt) => {
        document.body.classList.remove("select-none");
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;
        if (oldIndex === newIndex)
          return;
        const movedItem = currentPlaylist.splice(oldIndex, 1)[0];
        currentPlaylist.splice(newIndex, 0, movedItem);
        if (currentIndex === oldIndex) {
          currentIndex = newIndex;
        } else if (oldIndex < currentIndex && newIndex >= currentIndex) {
          currentIndex--;
        } else if (oldIndex > currentIndex && newIndex <= currentIndex) {
          currentIndex++;
        }
        renderQueue();
        savePlaybackState();
        showInfo("播放顺序已更新");
      }
    });
  }
  const tip = document.getElementById("queue-tip");
  if (tip) {
    if (currentPlaylist.length > 1)
      tip.classList.remove("hidden");
    else
      tip.classList.add("hidden");
  }
  applyMarqueeChecks();
}
function playSongFromQueue(index) {
  if (!currentPlaylist[index])
    return;
  playSong(currentPlaylist[index], index);
}
window.playSongFromQueue = playSongFromQueue;
function removeFromQueue(index) {
  if (!currentPlaylist || index < 0 || index >= currentPlaylist.length)
    return;
  const removedId = currentPlaylist[index].id;
  currentPlaylist.splice(index, 1);
  if (index === currentIndex) {
    if (currentPlaylist.length === 0) {
      currentIndex = -1;
      try {
        audio.pause();
      } catch (e) {}
    } else if (currentIndex >= currentPlaylist.length) {
      currentIndex = 0;
    }
  } else if (index < currentIndex) {
    currentIndex--;
  }
  renderQueue();
  savePlaybackState();
  showSuccess("已从队列移除");
}
window.removeFromQueue = removeFromQueue;
async function clearQueue() {
  if (!currentPlaylist || currentPlaylist.length === 0)
    return;
  if (await showSelect("清空队列", "确定要清空当前播放队列吗？", { danger: true })) {
    currentPlaylist = [];
    currentIndex = -1;
    try {
      audio.pause();
    } catch (e) {}
    renderQueue();
    savePlaybackState();
    showInfo("队列已清空");
  }
}
window.clearQueue = clearQueue;
function handleSearchKeyPress(e) {
  if (e.key === "Enter") {
    if (typeof hideSearchSuggestions === "function")
      hideSearchSuggestions();
    doSearch();
  }
}
function performSearch(query, source = null) {
  if (!query || query === "暂无播放" || query === "选择一首歌曲播放")
    return;
  let cleanedQuery = query.replace(/\s*[\(\uff08].*?[\)\uff09]\s*/g, " ").trim();
  cleanedQuery = cleanedQuery.replace(/\s+/g, " ");
  switchTab("search");
  const sourceEl = document.getElementById("search-source");
  const validSources = ["kw", "kg", "tx", "wy", "mg"];
  if (source && sourceEl && validSources.includes(source)) {
    sourceEl.value = source;
  }
  if (typeof currentSearchScope !== "undefined") {
    currentSearchScope = "network";
  }
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = cleanedQuery || query;
    doSearch();
  }
}
window.performSearch = performSearch;
var lastSearchResultList = null;
var lastSearchType = null;
function handleSearchTypeChange() {
  const typeSelect = document.getElementById("search-type");
  const sourceSelect = document.getElementById("search-source");
  if (!typeSelect || !sourceSelect)
    return;
  if (typeSelect.value === "singer" || typeSelect.value === "album") {
    if (sourceSelect.value !== "wy" && sourceSelect.value !== "tx") {
      sourceSelect.value = "wy";
    }
    Array.from(sourceSelect.options).forEach((opt) => {
      opt.disabled = opt.value !== "wy" && opt.value !== "tx";
    });
  } else {
    Array.from(sourceSelect.options).forEach((opt) => {
      opt.disabled = false;
    });
  }
  doSearch();
}
window.handleSearchTypeChange = handleSearchTypeChange;
var SOURCES = ["kw", "kg", "tx", "wy", "mg"];
async function doSearch(page = 1, append = false, prefetch = false) {
  const typeEl = document.getElementById("search-type");
  const type = typeEl ? typeEl.value : "song";
  if (typeof hideSearchSuggestions === "function")
    hideSearchSuggestions();
  const backBtn = document.getElementById("search-back-btn");
  if (backBtn)
    backBtn.classList.add("hidden");
  lastSearchResultList = null;
  lastSearchType = null;
  if (window.ListSearch && page === 1 && !append)
    window.ListSearch.resetState();
  const input = document.getElementById("search-input").value.trim();
  const resultsContainer = document.getElementById("search-results");
  const isLibrarySearch = currentSearchScope === "lib_artists" || currentSearchScope === "lib_albums";
  const isLocalSongSearch = type === "song" && (currentSearchScope === "local_list" || currentSearchScope === "local_all");
  if (isLibrarySearch || isLocalSongSearch) {
    if (!input) {
      if (currentSearchScope === "lib_artists")
        renderLibraryArtists(window.libraryData.artists);
      else if (currentSearchScope === "lib_albums")
        renderLibraryAlbums(window.libraryData.albums);
      else
        renderResults(viewingPlaylist);
      return;
    }
    let targets = [];
    if (currentSearchScope === "lib_artists")
      targets = window.libraryData.artists;
    else if (currentSearchScope === "lib_albums")
      targets = window.libraryData.albums;
    else if (currentSearchScope === "local_list") {
      const listId = window.currentViewingListId || "default";
      if (currentListData) {
        if (listId === "default")
          targets = currentListData.defaultList;
        else if (listId === "love")
          targets = currentListData.loveList;
        else {
          const uList = currentListData.userList.find((l) => l.id === listId);
          if (uList)
            targets = uList.list;
        }
      }
    } else {
      if (currentListData) {
        targets = [
          ...currentListData.defaultList || [],
          ...currentListData.loveList || [],
          ...(currentListData.userList || []).flatMap((l) => l.list)
        ];
      }
    }
    const lower = input.toLowerCase();
    const filtered = targets.filter((item) => item.name && item.name.toLowerCase().includes(lower) || item.singer && item.singer.toLowerCase().includes(lower) || item.artistName && item.artistName.toLowerCase().includes(lower) || item.id && String(item.id).toLowerCase().includes(lower));
    if (currentSearchScope === "lib_artists")
      renderLibraryArtists(filtered);
    else if (currentSearchScope === "lib_albums")
      renderLibraryAlbums(filtered);
    else
      renderResults(filtered);
    return;
  }
  const source = document.getElementById("search-source").value;
  const FETCH_PAGES_STEP = 1;
  localStorage.setItem("search-source", source);
  if (!input) {
    showInitialSearchState();
    return;
  }
  if (!append) {
    currentSearch = { name: input, source };
    currentPage = 1;
    window.currentNetworkPage = page;
    resultsContainer.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-spinner fa-spin text-4xl text-emerald-500"></i></div>';
  } else {
    window.currentNetworkPage = page;
  }
  try {
    const headers = {};
    if (typeof authToken !== "undefined" && authToken)
      headers["x-user-token"] = authToken;
    Object.assign(headers, getUserAuthHeaders());
    let list = [];
    if (source === "all") {
      const pageInfoEl = document.getElementById("page-info");
      if (pageInfoEl)
        pageInfoEl.innerText = `聚合搜索 (前20条/源)`;
      const promises = SOURCES.map((s) => fetch(`${API_BASE}/search?name=${encodeURIComponent(input)}&source=${s}&page=1&type=${type}`, { headers }).then((res) => res.json()).then((data) => data.map((item) => ({ ...item, source: s }))).catch((e) => {
        console.warn(`[聚合搜索] ${s} 源失败:`, e);
        return [];
      }));
      const results = await Promise.all(promises);
      list = results.flat();
    } else {
      const res = await fetch(`${API_BASE}/search?name=${encodeURIComponent(input)}&source=${source}&type=${type}&page=${page}&pages=${FETCH_PAGES_STEP}`, { headers });
      if (!res.ok) {
        throw new Error(`搜索请求失败: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.error("[Search] 后端返回非数组数据:", data);
        throw new Error(data.error || data.message || "搜索返回的数据格式错误");
      }
      list = data.map((item) => ({ ...item, source }));
    }
    if (append && (type === "song" || type === "singer" || type === "album")) {
      if (list && list.length > 0) {
        list.forEach((item, idx) => {
          if (!item.id || item.id === "undefined") {
            item.id = item.songmid || item.songId || item.hash || item.copyrightId || item.mid || item.mediaMid || `temp_${Date.now()}_${idx}_append`;
          }
        });
      }
      const existingIds = new Set((window.viewingPlaylist || []).map((item) => String(item.id)));
      const newItems = list.filter((item) => !existingIds.has(String(item.id)));
      if (newItems.length > 0) {
        const combinedList = [...window.viewingPlaylist || [], ...newItems];
        if (!prefetch)
          currentPage++;
        if (type === "singer")
          renderSingerResults(combinedList);
        else if (type === "album")
          renderAlbumResults(combinedList);
        else
          renderResults(combinedList);
      } else {
        showInfo("没有更多搜索结果了");
      }
    } else {
      if (type === "singer")
        renderSingerResults(list);
      else if (type === "album")
        renderAlbumResults(list);
      else
        renderResults(list);
    }
  } catch (e) {
    console.error("[Search] 搜索失败:", e);
    if (append) {
      try {
        showError(`搜索追加出错: ${e.message}`);
      } catch (err) {
        showError(`搜索追加出错: ${e.message}`);
      }
    } else {
      resultsContainer.innerHTML = `<div class="text-center text-red-500 p-8">搜索出错: ${e.message}</div>`;
    }
  }
}
function changePage(delta) {
  const source = document.getElementById("search-source").value;
  if (source === "all") {
    showInfo("聚合搜索模式暂不支持翻页");
    return;
  }
  const newPage = currentPage + delta;
  if (newPage < 1)
    return;
  doSearch(newPage);
}
var hotSearchCache = null;
var hotSearchCacheTime = 0;
var HOT_SEARCH_CACHE_DURATION = 5 * 60 * 1000;
async function fetchHotSearch(source = "mg") {
  if (hotSearchCache && hotSearchCache.source === source && Date.now() - hotSearchCacheTime < HOT_SEARCH_CACHE_DURATION) {
    return hotSearchCache;
  }
  try {
    const res = await fetch(`${API_BASE}/hotSearch?source=${source}`, { priority: "low" });
    if (!res.ok) {
      throw new Error(`获取热搜失败: ${res.status}`);
    }
    const data = await res.json();
    hotSearchCache = data;
    if (!hotSearchCache.source)
      hotSearchCache.source = source;
    hotSearchCacheTime = Date.now();
    return data;
  } catch (e) {
    console.error("[HotSearch] 获取热搜失败:", e);
    return null;
  }
}
function renderHotSearch(data) {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  if (header) {
    header.classList.add("hidden");
  }
  if (!container || !data || !data.list || data.list.length === 0 || settings.hotSearchLimit === 0) {
    container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full t-text-muted space-y-4">
                <i class="fas fa-music text-6xl opacity-20"></i>
                <p>输入关键词开始搜索音乐</p>
            </div>
        `;
    return;
  }
  const sourceTag = getSourceTag(data.source);
  const limit = settings.hotSearchLimit !== undefined && settings.hotSearchLimit !== null ? settings.hotSearchLimit : 20;
  const keywords = data.list.slice(0, limit);
  container.innerHTML = `
        <div class="hot-search-container px-4 py-8 md:p-8">
            <div class="flex items-center mb-6">
                <i class="fas fa-fire text-orange-500 text-2xl mr-3"></i>
                <h3 class="text-xl font-bold t-text-main">热门搜索</h3>
                <span class="ml-3">${sourceTag}</span>
            </div>
            <div class="hot-search-list grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                ${keywords.map((keyword, index) => `
                    <button onclick="handleHotSearchClick('${keyword.replace(/'/g, "\\'")}')" 
                            class="hot-search-item group flex items-center px-2.5 py-3 md:p-3 t-bg-panel hover:bg-emerald-50 border t-border-main hover:border-emerald-400 rounded-lg transition-all shadow-sm hover:shadow-md overflow-hidden h-14">
                        <span class="rank flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mr-3 ${index < 3 ? "bg-gradient-to-r from-orange-400 to-red-500 text-white" : "bg-gray-100 text-gray-500"}">
                            ${index + 1}
                        </span>
                        <span class="keyword flex-1 text-left text-sm font-medium t-text-main group-hover:text-emerald-600 truncate">
                            ${keyword}
                        </span>
                        <i class="fas fa-search text-xs text-gray-300 group-hover:text-emerald-500 transition-colors ml-2"></i>
                    </button>
                `).join("")}
            </div>
            <div class="mt-6 text-center">
                <button onclick="showInitialSearchState()" 
                        class="text-sm t-text-muted hover:text-emerald-500 transition-colors">
                    <i class="fas fa-sync-alt mr-1"></i>
                    刷新热搜
                </button>
            </div>
        </div>
    `;
  setTimeout(() => {
    const items = container.querySelectorAll(".hot-search-item .keyword");
    items.forEach((el) => {
      if (el.scrollWidth > el.clientWidth) {
        const text = el.textContent.trim();
        el.classList.remove("truncate");
        el.innerHTML = `
                    <div class="w-full overflow-hidden relative" style="mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%);">
                        <div class="inline-block whitespace-nowrap animate-marquee hover-scroll-paused" style="will-change: transform;">
                             <span>${text}</span>
                             <span class="mx-8"></span>
                             <span>${text}</span>
                             <span class="mx-8"></span>
                        </div>
                    </div>
                `;
      }
    });
  }, 0);
}
function handleHotSearchClick(keyword) {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = keyword;
    doSearch();
  }
}
function showInitialSearchState() {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  if (header) {
    header.classList.add("hidden");
  }
  container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full t-text-muted space-y-4">
            <i class="fas fa-spinner fa-spin text-4xl text-emerald-500"></i>
            <p>正在加载热门搜索...</p>
        </div>
    `;
  const sourceSelect = document.getElementById("search-source");
  const source = sourceSelect ? sourceSelect.value : "wy";
  fetchHotSearch(source).then((data) => {
    renderHotSearch(data);
  }).catch((err) => {
    console.error("[HotSearch] 显示热搜失败:", err);
    container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full t-text-muted space-y-4">
                <i class="fas fa-music text-6xl opacity-20"></i>
                <p>输入关键词开始搜索音乐</p>
            </div>
        `;
  });
}
function getQualityTags(item) {
  const tags = [];
  const rawTypes = item.types || item._types || item.qualitys || item._qualitys || item.meta && (item.meta.qualitys || item.meta._qualitys) || {};
  let has320 = false;
  let hasFlac = false;
  let hasHiRes = false;
  let hasAtmos = false;
  let hasMaster = false;
  if (Array.isArray(rawTypes)) {
    const isConcrete = (t) => !(t && t.isPlatformQuality);
    has320 = rawTypes.some((t) => t.type === "320k");
    hasFlac = rawTypes.some((t) => t.type === "flac");
    hasHiRes = rawTypes.some((t) => (t.type === "flac24bit" || t.type === "hires") && isConcrete(t));
    hasAtmos = rawTypes.some((t) => (t.type === "atmos" || t.type === "atmos_plus") && isConcrete(t));
    hasMaster = rawTypes.some((t) => t.type === "master" && isConcrete(t));
  } else {
    has320 = !!rawTypes["320k"];
    hasFlac = !!rawTypes["flac"];
    hasHiRes = !!(rawTypes["flac24bit"] && !rawTypes["flac24bit"].isPlatformQuality) || !!(rawTypes.hires && !rawTypes.hires.isPlatformQuality);
    hasAtmos = !!(rawTypes.atmos && !rawTypes.atmos.isPlatformQuality) || !!(rawTypes.atmos_plus && !rawTypes.atmos_plus.isPlatformQuality);
    hasMaster = !!(rawTypes.master && !rawTypes.master.isPlatformQuality);
  }
  const q = item.quality || item.type;
  if (q) {
    if (q === "master")
      hasMaster = true;
    else if (q === "atmos" || q === "atmos_plus")
      hasAtmos = true;
    else if (q === "flac24bit" || q === "hires")
      hasHiRes = true;
    else if (q === "flac")
      hasFlac = true;
    else if (q === "320k")
      has320 = true;
  }
  if (hasMaster)
    tags.push('<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-purple border border-purple-200 dark:border-purple-500/30 transition-colors">Master</span>');
  else if (hasAtmos)
    tags.push('<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-blue border border-cyan-200 dark:border-cyan-500/30 transition-colors">Atmos</span>');
  else if (hasHiRes)
    tags.push('<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-yellow border border-yellow-200 dark:border-yellow-500/30 transition-colors">Hi-Res</span>');
  else if (hasFlac)
    tags.push('<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-green border border-emerald-200 dark:border-emerald-500/30 transition-colors">无损</span>');
  else if (has320)
    tags.push('<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-blue border border-blue-200 dark:border-blue-500/30 transition-colors">高品质</span>');
  return tags.join("");
}
window.getQualityTags = getQualityTags;
function getSourceTag(source) {
  const colors = {
    kw: "t-badge-yellow border-yellow-200 dark:border-yellow-500/30",
    kg: "t-badge-blue border-blue-200 dark:border-blue-500/30",
    tx: "t-badge-green border-green-200 dark:border-emerald-500/30",
    wy: "t-badge-red border-red-200 dark:border-red-500/30",
    mg: "t-badge-pink border-pink-200 dark:border-pink-500/30"
  };
  const names = { kw: "酷我", kg: "酷狗", tx: "QQ", wy: "网易", mg: "咪咕" };
  const color = colors[source] || "t-bg-main t-text-muted t-border-main";
  const name = names[source] || source.toUpperCase();
  return `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] font-bold border ${color} mr-1">${name}</span>`;
}
window.getSourceTag = getSourceTag;
function renderSingerResults(list) {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  if (header)
    header.classList.add("hidden");
  const paginationBar = document.getElementById("search-pagination-bar");
  if (paginationBar)
    paginationBar.classList.add("hidden");
  window.viewingPlaylist = list;
  container.innerHTML = '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 md:gap-4 p-3 md:p-6"></div>';
  const grid = container.querySelector("div");
  list.forEach((singer, idx) => {
    const div = document.createElement("div");
    div.className = "group flex flex-col items-center p-2 md:p-4 rounded-2xl transition-all hover:t-bg-panel hover:shadow-md cursor-pointer border border-transparent hover:border-emerald-500/30";
    div.dataset.singerId = singer.id;
    div.dataset.singerSource = singer.source || "wy";
    div.onclick = () => enterArtist(singer.id, singer.source || "wy");
    const aliasHtml = singer.alias && singer.alias.length ? `<span class="text-[9px] md:text-[10px] t-text-muted text-center truncate w-full mt-0.5 md:mt-1">${singer.alias[0]}</span>` : "";
    div.innerHTML = `
            <div class="relative mb-2 md:mb-3">
                <div class="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full overflow-hidden shadow-sm">
                    <img src="${singer.picUrl || "/music/assets/logo.svg"}"
                         onerror="this.src='/music/assets/logo.svg'"
                         class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                </div>
                <button id="singer-fav-${singer.id}" class="absolute -top-1 -right-1 w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center transition-all shadow-md z-10 ${isArtistFavorited(singer.id, singer.source || "wy") ? "bg-rose-500 text-white opacity-100" : "bg-black/30 text-white opacity-0 group-hover:opacity-100"}"
                        title="${isArtistFavorited(singer.id, singer.source || "wy") ? "取消收藏" : "收藏歌手"}"
                        onclick="event.stopPropagation(); (async () => { const favd = await toggleArtistFavorite('${singer.id}', '${singer.source || "wy"}', '${singer.name.replace(/'/g, "\\'")}', '${(singer.picUrl || "").replace(/'/g, "\\'")}'); const btn = document.getElementById('singer-fav-${singer.id}'); if(btn){ btn.className = 'absolute -top-1 -right-1 w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center transition-all shadow-md z-10 ' + (favd ? 'bg-rose-500 text-white opacity-100' : 'bg-black/30 text-white opacity-0 group-hover:opacity-100'); btn.title = favd ? '取消收藏' : '收藏歌手'; } })()">
                    <i class="fas fa-heart text-[10px]"></i>
                </button>
            </div>
            <span class="text-[11px] md:text-sm font-bold t-text-main text-center truncate w-full" title="${singer.name}">${singer.name}</span>
            <div class="flex flex-col items-center mt-1">
                ${aliasHtml}
                <div class="mt-1">${getSourceTag ? getSourceTag(singer.source || "wy") : (singer.source || "wy").toUpperCase()}</div>
            </div>
            <span class="hidden md:inline-block text-[10px] px-2 py-0.5 mt-2 rounded bg-emerald-500 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                ${singer.albumSize || 0} 专辑
            </span>
        `;
    grid.appendChild(div);
  });
}
function renderAlbumResults(list) {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  if (header)
    header.classList.add("hidden");
  const paginationBar = document.getElementById("search-pagination-bar");
  if (paginationBar)
    paginationBar.classList.add("hidden");
  window.viewingPlaylist = list;
  container.innerHTML = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-6"></div>';
  const grid = container.querySelector("div");
  list.forEach((item) => {
    const div = document.createElement("div");
    div.className = "group flex flex-col p-3 rounded-2xl transition-all hover:t-bg-panel hover:shadow-lg cursor-pointer border border-transparent hover:border-emerald-500/20";
    div.onclick = () => enterAlbum(item.id, item.source || "wy");
    const publishDate = item.publishTime ? new Date(item.publishTime).toLocaleDateString() : "";
    div.innerHTML = `
            <div class="aspect-square rounded-xl overflow-hidden shadow-md mb-3 relative">
                <img src="${item.picUrl || "/music/assets/logo.svg"}"
                     onerror="this.src='/music/assets/logo.svg'"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <button id="album-fav-${item.id}" class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${isAlbumFavorited(item.id, item.source || "wy") ? "bg-rose-500 text-white opacity-100" : "bg-black/30 text-white opacity-0 group-hover:opacity-100"}"
                        title="${isAlbumFavorited(item.id, item.source || "wy") ? "取消收藏" : "收藏专辑"}"
                        onclick="event.stopPropagation(); (async () => { const favd = await toggleAlbumFavorite('${item.id}', '${item.source || "wy"}', '${item.name.replace(/'/g, "\\'")}', '${(item.picUrl || "").replace(/'/g, "\\'")}', '${(item.artistName || "").replace(/'/g, "\\'")}'); const btn = document.getElementById('album-fav-${item.id}'); if(btn){ btn.className = 'absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ' + (favd ? 'bg-rose-500 text-white opacity-100' : 'bg-black/30 text-white opacity-0 group-hover:opacity-100'); btn.title = favd ? '取消收藏' : '收藏专辑'; } })()">
                    <i class="fas fa-heart text-xs"></i>
                </button>
            </div>
            <span class="text-sm font-bold t-text-main line-clamp-2 h-10 leading-5 mb-1" title="${item.name}">${item.name}</span>
            <div class="flex items-center justify-between mt-1">
                <span class="text-[10px] t-text-muted truncate flex-1">${item.artistName || "未知歌手"}</span>
                <span class="text-[10px] t-text-muted ml-2">${publishDate}</span>
            </div>
        `;
    grid.appendChild(div);
  });
}
function searchBySinger(name) {
  const input = document.getElementById("search-input");
  const type = document.getElementById("search-type");
  if (input && type) {
    input.value = name;
    type.value = "song";
    handleSearchTypeChange();
  }
}
window.searchBySinger = searchBySinger;
var currentArtistId = null;
var currentArtistSource = "wy";
var currentArtistInfo = null;
window.currentArtistId = null;
window.currentArtistSource = "wy";
window.currentArtistOrder = "hot";
async function enterArtist(id, source = "wy", order = "hot", tab = "songs", isBack = false) {
  const typeEl = document.getElementById("search-type");
  if (!isBack && document.getElementById("artist-detail-header") === null) {
    lastSearchType = typeEl ? typeEl.value : "singer";
    lastSearchResultList = [...window.viewingPlaylist || []];
    currentArtistInfo = null;
    window.history.pushState({ page: "search-detail" }, "");
  }
  const previousArtistOrder = window.currentArtistOrder || "hot";
  const isDifferentArtist = String(currentArtistId || "") !== String(id) || currentArtistSource !== source;
  const isDifferentOrder = previousArtistOrder !== order;
  if (isDifferentArtist || tab === "songs" && isDifferentOrder) {
    window.currentArtistSongsCache = null;
    window.artistSongsPage = 1;
    if (window.ListSearch)
      window.ListSearch.resetState();
  }
  if (isDifferentArtist) {
    window.currentArtistAlbumsCache = null;
  }
  currentArtistId = id;
  currentArtistSource = source;
  window.currentArtistId = id;
  window.currentArtistSource = source;
  window.currentArtistOrder = order;
  window.currentArtistTab = tab;
  const resultsContainer = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  if (header)
    header.classList.add("hidden");
  if (!currentArtistInfo || String(currentArtistInfo.id) !== String(id) || currentArtistInfo.source !== source) {
    if (!document.getElementById("artist-detail-header")) {
      resultsContainer.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-spinner fa-spin text-4xl text-emerald-500"></i></div>';
    }
    try {
      const detailRes = await fetch(`${API_BASE}/artistDetail?id=${id}&source=${source}`);
      if (!detailRes.ok)
        throw new Error("Failed to fetch artist detail");
      currentArtistInfo = await detailRes.json();
    } catch (e) {
      showError(`获取歌手详情失败: ${e.message}`);
      goBackToSearch();
      return;
    }
  }
  renderArtistHeader(currentArtistInfo, tab, order);
  if (tab === "songs") {
    await loadArtistSongs(id, source, order);
  } else if (tab === "albums") {
    await loadArtistAlbums(id, source);
  }
  const backBtn = document.getElementById("search-back-btn");
  if (backBtn)
    backBtn.classList.remove("hidden");
}
var isArtistFolded = false;
function renderArtistHeader(info, activeTab, order) {
  const container = document.getElementById("search-results");
  const isMobile = window.innerWidth < 768;
  const headerPadding = isArtistFolded ? "p-3 md:p-4" : "p-6 md:p-8";
  const nameTransform = isArtistFolded ? isMobile ? "translate(40px, -30px) scale(0.65)" : "translate(30px, 0px) scale(0.65)" : "translate(0, 0) scale(1)";
  const tabsClass = isArtistFolded ? "mt-1 pt-2" : "mt-8 pt-6";
  let headerHtml = `
        <div id="artist-detail-header" class="relative ${headerPadding} is-folded t-bg-panel/50 border-b t-border-main transition-all duration-500 ease-in-out overflow-hidden group/header" style="${isArtistFolded ? "min-height: " + (isMobile ? "0px" : "90px") + ";" : ""}">
            <!-- Small Absolute Back Button -->
            <button onclick="goBackToSearch()" class="absolute top-2 left-2 md:top-4 md:left-4 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-emerald-500/80 hover:bg-emerald-500 text-white transition-all z-30 shadow-md active:scale-90" title="返回搜索">
                <i class="fas fa-arrow-left"></i>
            </button>
            <!-- Favorite Button (Artist) -->
            <button id="artist-header-fav-btn"
                onclick="(async () => { 
                    const favd = await toggleArtistFavorite('${info.id}', '${info.source}', '${info.name.replace(/'/g, "\\'")}', '${(info.avatar || "").replace(/'/g, "\\'")}'); 
                    const btn = document.getElementById('artist-header-fav-btn'); 
                    if(btn){ 
                        const base = 'absolute top-2 right-12 md:top-4 md:right-16 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full transition-all z-30 shadow-sm active:scale-90';
                        const favedCls = 'bg-rose-500 text-white';
                        const normalCls = 'bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 t-text-main';
                        btn.className = base + ' ' + (favd ? favedCls : normalCls);
                        btn.title = favd ? '取消收藏' : '收藏歌手';
                    } 
                })()"
                class="absolute top-2 right-12 md:top-4 md:right-16 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full ${isArtistFavorited(info.id, info.source) ? "bg-rose-500 text-white" : "bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 t-text-main"} transition-all z-30 shadow-sm active:scale-90"
                title="${isArtistFavorited(info.id, info.source) ? "取消收藏" : "收藏歌手"}">
                <i class="fas fa-heart"></i>
            </button>

            <!-- Fold Toggle Button -->
            <button id="artist-fold-btn" onclick="toggleArtistFold()" class="absolute top-2 right-2 md:top-4 md:right-4 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 t-text-main transition-all z-30 shadow-sm active:scale-90" title="折叠/展开">
                <i class="fas fa-chevron-up transition-transform duration-500 ${isArtistFolded ? "rotate-180" : ""}" id="artist-fold-icon"></i>
            </button>

            <div id="artist-main-layout" class="flex flex-col md:flex-row gap-6 md:gap-8 ${isArtistFolded && isMobile ? "items-start text-left" : "items-center md:items-start text-center md:text-left"} transition-all duration-500">
                <div id="artist-avatar-container" class="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden shadow-2xl ring-4 ring-emerald-500/20 flex-shrink-0 transition-all duration-500 origin-center" style="${isArtistFolded ? "transform: scale(0); opacity: 0; width: 0; height: 0; margin: 0;" : ""}">
                    <img src="${info.avatar || "/music/assets/logo.svg"}" 
                         onerror="this.src='/music/assets/logo.svg'"
                         class="w-full h-full object-cover">
                </div>
                <div class="flex-1 min-w-0">
                    <h2 id="artist-name-display" class="text-3xl md:text-4xl font-black t-text-main mb-2 transition-all duration-500 origin-left pointer-events-none" style="transform: ${nameTransform}; margin-bottom: ${isArtistFolded ? "0" : ""};">${info.name}</h2>
                    <div id="artist-collapsible-section" class="transition-all duration-500 ${isArtistFolded ? "opacity-0 max-h-0" : "opacity-100 max-h-[500px]"}">
                        <div id="artist-stats-bar" class="flex flex-wrap justify-center md:justify-start gap-3 mb-3 text-sm font-medium transition-all duration-500">
                            <span class="px-3 py-1 rounded-full t-bg-main t-text-muted border t-border-main">
                                <i class="fas fa-music mr-1.5 text-emerald-500"></i>${info.musicSize} 歌曲
                            </span>
                            <span class="px-3 py-1 rounded-full t-bg-main t-text-muted border t-border-main">
                                <i class="fas fa-compact-disc mr-1.5 text-blue-500"></i>${info.albumSize} 专辑
                            </span>
                        </div>
                        <div class="relative group">
                            <p id="artist-bio-text" class="text-sm t-text-muted leading-relaxed line-clamp-3 overflow-y-auto max-h-32 transition-all cursor-pointer bg-black/5 dark:bg-white/5 p-3 rounded-lg custom-scrollbar" 
                            onclick="this.classList.toggle('line-clamp-3')" title="点击展开/收回详情">
                                ${info.desc || "暂无简介"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="artist-tabs-bar" class="flex items-end justify-between ${tabsClass} border-t t-border-main transition-all duration-500 relative z-40" style="min-height: 48px;">
                <div class="flex gap-8">
                    <button onclick="enterArtist('${info.id}', '${info.source}', '${order}', 'songs')" 
                            class="pb-2 text-sm font-bold transition-all relative ${activeTab === "songs" ? "t-text-main" : "t-text-muted hover:t-text-main"}">
                        所有歌曲
                        ${activeTab === "songs" ? '<div class="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 rounded-full"></div>' : ""}
                    </button>
                    <button onclick="enterArtist('${info.id}', '${info.source}', '${order}', 'albums')" 
                            class="pb-2 text-sm font-bold transition-all relative ${activeTab === "albums" ? "t-text-main" : "t-text-muted hover:t-text-main"}">
                        所有专辑
                        ${activeTab === "albums" ? '<div class="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 rounded-full"></div>' : ""}
                    </button>
                </div>
                
                ${activeTab === "songs" ? `
                <div class="flex p-1 mb-1 t-bg-main rounded-lg border t-border-main shadow-sm relative z-50">
                    <button onclick="enterArtist('${info.id}', '${info.source}', 'hot', 'songs')" 
                            class="px-4 py-1.5 text-xs font-bold rounded-md transition-all ${order === "hot" ? "bg-emerald-500 text-white shadow-sm" : "t-text-muted hover:t-bg-track"}">
                        热门
                    </button>
                    <button onclick="enterArtist('${info.id}', '${info.source}', 'time', 'songs')" 
                            class="px-4 py-1.5 text-xs font-bold rounded-md transition-all ${order === "time" ? "bg-emerald-500 text-white shadow-sm" : "t-text-muted hover:t-bg-track"}">
                        最新
                    </button>
                </div>
                ` : ""}
            </div>
        </div>
        <div id="artist-detail-content" class="flex-1 overflow-y-auto p-2 md:p-4">
            <div class="flex items-center justify-center py-10">
                <i class="fas fa-spinner fa-spin text-2xl text-emerald-500"></i>
            </div>
        </div>
    `;
  container.innerHTML = headerHtml;
}
function toggleArtistFold() {
  const header = document.getElementById("artist-detail-header");
  const avatar = document.getElementById("artist-avatar-container");
  const collapsible = document.getElementById("artist-collapsible-section");
  const name = document.getElementById("artist-name-display");
  const tabsBar = document.getElementById("artist-tabs-bar");
  const foldIcon = document.getElementById("artist-fold-icon");
  const mainLayout = document.getElementById("artist-main-layout");
  if (!header)
    return;
  isArtistFolded = header.classList.toggle("is-folded");
  const isMobile = window.innerWidth < 768;
  if (isArtistFolded) {
    header.classList.remove("p-6", "md:p-8");
    header.classList.add("p-3", "md:p-4");
    header.style.minHeight = isMobile ? "0px" : "90px";
    if (isMobile) {
      mainLayout.classList.remove("items-center", "text-center");
      mainLayout.classList.add("items-start", "text-left");
    }
    avatar.style.transform = "scale(0)";
    avatar.style.opacity = "0";
    avatar.style.width = "0";
    avatar.style.height = "0";
    avatar.style.margin = "0";
    collapsible.style.maxHeight = "0";
    collapsible.style.opacity = "0";
    collapsible.style.marginTop = "0";
    tabsBar.classList.remove("mt-8", "pt-6");
    tabsBar.classList.add("mt-1", "pt-2");
    if (isMobile) {
      name.style.transform = "translate(40px, -30px) scale(0.65)";
    } else {
      name.style.transform = "translate(30px, 0px) scale(0.65)";
    }
    name.style.marginBottom = "0";
    foldIcon.style.transform = "rotate(180deg)";
  } else {
    header.classList.add("p-6", "md:p-8");
    header.classList.remove("p-3", "md:p-4");
    header.style.minHeight = "";
    if (isMobile) {
      mainLayout.classList.add("items-center", "text-center");
      mainLayout.classList.remove("items-start", "text-left");
    }
    avatar.style.transform = "scale(1)";
    avatar.style.opacity = "1";
    avatar.style.width = "";
    avatar.style.height = "";
    avatar.style.margin = "";
    collapsible.style.maxHeight = "500px";
    collapsible.style.opacity = "1";
    collapsible.style.marginTop = "";
    tabsBar.classList.add("mt-8", "pt-6");
    tabsBar.classList.remove("mt-1", "pt-2");
    name.style.transform = "translate(0, 0) scale(1)";
    name.style.marginBottom = "";
    foldIcon.style.transform = "rotate(0deg)";
  }
}
window.toggleArtistFold = toggleArtistFold;
async function loadArtistSongs(id, source, order, forceFetch = false) {
  if (!forceFetch && window.currentArtistSongsCache && window.currentArtistId === id && window.currentArtistOrder === order && window.currentArtistSource === source) {
    renderArtistSongsUI(window.currentArtistSongsCache);
    return;
  }
  renderArtistSongsLoading();
  try {
    const res = await fetch(`${API_BASE}/artistSongs?id=${id}&source=${source}&order=${order}`);
    if (!res.ok)
      throw new Error("Failed to fetch songs");
    const list = await res.json();
    const isCurrentRequest = String(window.currentArtistId) === String(id) && window.currentArtistSource === source && window.currentArtistOrder === order && window.currentArtistTab === "songs";
    if (!isCurrentRequest)
      return;
    list.forEach((item, idx) => {
      if (!item.id || item.id === "undefined") {
        item.id = item.songmid || item.songId || item.hash || item.copyrightId || item.mid || item.mediaMid || `art_${id}_${idx}`;
      }
    });
    window.currentArtistSongsCache = list;
    window.currentArtistId = id;
    window.currentArtistSource = source;
    window.currentArtistOrder = order;
    window.artistSongsPage = 1;
    renderArtistSongsUI(list, 1);
  } catch (e) {
    showError(`加载歌曲失败: ${e.message}`);
    goBackToSearch();
  }
}
function renderArtistSongsLoading() {
  const content = document.getElementById("artist-detail-content");
  if (!content)
    return;
  window.viewingPlaylist = [];
  content.innerHTML = `
        <div class="flex items-center justify-center py-12 t-text-muted">
            <i class="fas fa-spinner fa-spin text-2xl text-emerald-500 mr-3"></i>
            <span class="text-sm font-medium">正在加载歌曲...</span>
        </div>
    `;
}
function renderArtistSongsUI(list, page) {
  const content = document.getElementById("artist-detail-content");
  if (!content)
    return;
  window.viewingPlaylist = list;
  if (!list || list.length === 0) {
    content.innerHTML = '<div class="text-center py-10 t-text-muted">暂无歌曲</div>';
    return;
  }
  const totalItems = list.length;
  let itemsPerPage = settings && settings.itemsPerPage === "all" ? totalItems : parseInt(settings && settings.itemsPerPage || 20);
  if (!itemsPerPage || itemsPerPage <= 0)
    itemsPerPage = 20;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (page !== undefined)
    window.artistSongsPage = page;
  if (!window.artistSongsPage || window.artistSongsPage < 1)
    window.artistSongsPage = 1;
  if (window.artistSongsPage > totalPages)
    window.artistSongsPage = totalPages;
  const currentPage = window.artistSongsPage;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const fullIndexedList = window.ListSearch ? window.ListSearch.getDisplayList(list) : list.map((item, index) => ({ item, originalIndex: index }));
  const indexedDisplayList = fullIndexedList.slice(startIndex, endIndex);
  let html = `
        <!-- 表头 -->
        <div class="grid grid-cols-12 gap-2 md:gap-4 p-3 md:p-4 border-b t-border-main t-bg-main text-gray-500 text-sm font-medium sticky top-0 z-10 rounded-t-2xl overflow-hidden shadow-sm">
            <div class="col-span-3 sm:col-span-1 text-center flex items-center justify-center gap-1 sm:gap-2">
                <span>#</span>
                <div class="flex items-center gap-1">
                    <button onclick="toggleBatchMode()"
                        class="text-[10px] text-emerald-600 hover:text-emerald-700" title="批量操作">
                        <i class="fas fa-tasks"></i>
                    </button>
                    <button onclick="window.ListSearch.toggleBar()"
                        class="text-[10px] text-emerald-600 hover:text-emerald-700" title="内搜索 (/)">
                        <i class="fas fa-search"></i>
                    </button>
                </div>
            </div>
            <div class="col-span-7 sm:col-span-7 md:col-span-6 lg:col-span-4">歌曲标题</div>
            <div class="hidden sm:block sm:col-span-3 md:col-span-3 lg:col-span-3 text-right md:text-left">歌手</div>
            <div class="hidden lg:block lg:col-span-2">专辑</div>
            <div class="hidden md:block md:col-span-1 text-center md:text-left">时长</div>
            <div class="hidden sm:block sm:col-span-1 text-right">操作</div>
            <div class="col-span-2 sm:hidden text-right">操作</div>
        </div>
        
        <div class="space-y-1 mt-2">
            ${indexedDisplayList.map((obj) => {
    const { item, originalIndex: index } = obj;
    const isSelected = window.selectedItems.has(String(item.id));
    const isMatched = window.ListSearch && window.ListSearch.isMatched(index);
    const isCurrentMatch = window.ListSearch && window.ListSearch.isCurrentMatch(index);
    let rowClass = "grid grid-cols-12 gap-2 md:gap-4 p-3 rounded-xl hover:t-bg-panel transition-all group cursor-pointer border border-transparent ";
    if (isCurrentMatch)
      rowClass += "search-current ";
    else if (isMatched)
      rowClass += "search-match ";
    if (isSelected)
      rowClass += "row-selected ring-1 ring-emerald-500/30 ";
    return `
                <div class="${rowClass}" data-song-id="${item.id}" onclick="window.batchMode ? handleBatchSelect('${item.id}', !window.selectedItems.has('${item.id}')) : playFromView(${index})">
                    <!-- Index -->
                    <div class="col-span-1 sm:col-span-1 text-center flex items-center justify-center font-mono text-xs t-text-muted group-hover:t-text-main">
                        ${window.batchMode ? `
                            <input type="checkbox" 
                                   class="batch-checkbox w-4 h-4 text-emerald-600 rounded" 
                                   data-song-id="${item.id}"
                                   ${isSelected ? "checked" : ""}
                            onclick="event.stopPropagation(); handleBatchSelect('${String(item.id)}', this.checked);">
                        ` : `<span class="index-num group-hover:hidden">${index + 1}</span><i class="fas fa-play text-emerald-500 hidden group-hover:block text-[10px]"></i>`}
                    </div>

                    <!-- Title -->
                    <div class="col-span-9 sm:col-span-7 md:col-span-6 lg:col-span-4 flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 md:w-12 md:h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-sm relative">
                            <img src="${item.img || "/music/assets/logo.svg"}" 
                                 onerror="this.src='/music/assets/logo.svg'" 
                                 class="w-full h-full object-cover">
                            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <i class="fas fa-play text-white text-xs"></i>
                            </div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-bold t-text-main text-sm md:text-base leading-tight truncate group-hover:text-emerald-600 transition-colors">${item.name}</div>
                            <div class="flex items-center gap-1 mt-1">
                                ${getSourceTag ? getSourceTag(item.source) : ""}
                                ${getQualityTags ? getQualityTags(item) : ""}
                            </div>
                        </div>
                    </div>

                    <!-- Artist -->
                    <div class="hidden sm:flex sm:col-span-3 md:col-span-3 lg:col-span-3 text-sm t-text-muted items-center truncate">
                        ${item.singer}
                    </div>

                    <!-- Album -->
                    <div class="hidden lg:flex lg:col-span-2 text-sm t-text-muted items-center truncate">
                        ${item.albumName || "-"}
                    </div>

                    <!-- Duration -->
                    <div class="hidden md:flex md:col-span-1 items-center justify-center text-xs font-mono t-text-muted">
                        ${item.interval || "--:--"}
                    </div>

                    <!-- Actions -->
                    <div class="col-span-2 sm:col-span-1 flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors" title="播放" onclick="event.stopPropagation(); playFromView(${index})">
                            <i class="fas fa-play w-3.5 h-3.5"></i>
                        </button>
                        <button class="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors" title="下载" onclick="event.stopPropagation(); downloadSong(${JSON.stringify(item).replace(/"/g, "&quot;")})">
                            <i class="fas fa-download w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
  }).join("")}
        </div>

        <!-- 歌手详情内部分页控件 -->
        <div class=" mt-2 flex-shrink-0">
            <button onclick="artistSongsPrevPage()"
                class="text-gray-500 hover:text-emerald-600 disabled:opacity-30 transition-colors ${currentPage <= 1 ? "opacity-30 pointer-events-none" : ""}">
                <i class="fas fa-chevron-left"></i> 上一页
            </button>
            <span class="text-xs t-text-muted font-mono">显示 ${startIndex + 1}-${endIndex} 首，共 ${totalItems} 首</span>
            <button onclick="artistSongsNextPage()"
                class="text-gray-500 hover:text-emerald-600 disabled:opacity-30 transition-colors ${currentPage >= totalPages ? "opacity-30 pointer-events-none" : ""}">
                下一页 <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
  content.innerHTML = html;
  if (window.applyMarqueeChecks)
    applyMarqueeChecks();
}
window.renderArtistSongsUI = renderArtistSongsUI;
function artistSongsPrevPage() {
  const list = window.currentArtistSongsCache;
  if (!list)
    return;
  if (!window.artistSongsPage || window.artistSongsPage <= 1)
    return;
  renderArtistSongsUI(list, window.artistSongsPage - 1);
}
function artistSongsNextPage() {
  const list = window.currentArtistSongsCache;
  if (!list)
    return;
  const totalItems = list.length;
  let itemsPerPage = settings && settings.itemsPerPage === "all" ? totalItems : parseInt(settings && settings.itemsPerPage || 20);
  if (!itemsPerPage || itemsPerPage <= 0)
    itemsPerPage = 20;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if ((window.artistSongsPage || 1) >= totalPages)
    return;
  renderArtistSongsUI(list, (window.artistSongsPage || 1) + 1);
}
window.artistSongsPrevPage = artistSongsPrevPage;
window.artistSongsNextPage = artistSongsNextPage;
var ARTIST_ALBUM_PAGE_SIZE = 50;
var ARTIST_ALBUM_MAX_PAGES = 100;
function renderArtistAlbumsLoading(loaded = 0, total = 0) {
  const content = document.getElementById("artist-detail-content");
  if (!content)
    return;
  const progressText = loaded > 0 ? "正在加载全部专辑，已读取 " + loaded + (total > 0 ? "/" + total : "") + " 张..." : "正在加载全部专辑...";
  const wrapper = document.createElement("div");
  const icon = document.createElement("i");
  const label = document.createElement("span");
  wrapper.className = "flex items-center justify-center py-12 t-text-muted";
  icon.className = "fas fa-spinner fa-spin text-2xl text-emerald-500 mr-3";
  label.className = "text-sm font-medium";
  label.textContent = progressText;
  wrapper.append(icon, label);
  content.replaceChildren(wrapper);
}
async function fetchAllArtistAlbums(id, source, signal, onProgress) {
  const albums = [];
  const albumKeys = new Set;
  let total = 0;
  for (let page = 1;page <= ARTIST_ALBUM_MAX_PAGES; page++) {
    const query = new URLSearchParams({ id: String(id), source, page: String(page) });
    const res = await fetch(API_BASE + "/artistAlbums?" + query.toString(), { signal });
    if (!res.ok)
      throw new Error("Failed to fetch artist albums page " + page);
    const data = await res.json();
    const pageList = Array.isArray(data.list) ? data.list : [];
    const previousCount = albums.length;
    total = Math.max(total, Number(data.total) || 0);
    pageList.forEach((album, index) => {
      const albumId = album.id ?? album.mid;
      const key = albumId !== undefined && albumId !== null && albumId !== "" ? source + ":" + albumId : source + ":page:" + page + ":index:" + index;
      if (albumKeys.has(key))
        return;
      albumKeys.add(key);
      albums.push({ ...album, source: album.source || source });
    });
    if (typeof onProgress === "function")
      onProgress(albums.length, total);
    const reachedTotal = total > 0 && albums.length >= total;
    const pageExhausted = pageList.length < ARTIST_ALBUM_PAGE_SIZE;
    const noNewAlbums = albums.length === previousCount;
    if (pageList.length === 0 || reachedTotal || pageExhausted || noNewAlbums)
      break;
  }
  return { list: albums, total: total || albums.length };
}
async function loadArtistAlbums(id, source, forceFetch = false) {
  if (!forceFetch && window.currentArtistAlbumsCache && String(window.currentArtistId) === String(id) && window.currentArtistSource === source) {
    renderArtistAlbumsUI(window.currentArtistAlbumsCache);
    return;
  }
  renderArtistAlbumsLoading();
  try {
    const data = await fetchAllArtistAlbums(id, source, undefined, (loaded, total) => {
      const stillViewingArtist = String(window.currentArtistId) === String(id) && window.currentArtistSource === source;
      if (window.currentArtistTab === "albums" && stillViewingArtist) {
        renderArtistAlbumsLoading(loaded, total);
      }
    });
    const list = data.list;
    const stillViewingArtist = String(window.currentArtistId) === String(id) && window.currentArtistSource === source;
    if (!stillViewingArtist)
      return;
    window.currentArtistAlbumsCache = list;
    window.currentArtistAlbumsTotal = data.total;
    if (window.currentArtistTab === "albums") {
      renderArtistAlbumsUI(list);
    }
  } catch (e) {
    const stillViewingArtist = String(window.currentArtistId) === String(id) && window.currentArtistSource === source;
    if (stillViewingArtist) {
      showError(`加载专辑失败: ${e.message}`);
      goBackToSearch();
    } else {
      console.warn("[ArtistAlbums] 已离开歌手页，忽略专辑加载失败:", e);
    }
  }
}
function renderArtistAlbumsUI(list) {
  const content = document.getElementById("artist-detail-content");
  if (!content)
    return;
  if (!list || list.length === 0) {
    content.innerHTML = '<div class="text-center py-10 t-text-muted">暂无专辑</div>';
    return;
  }
  const artistName = currentArtistInfo?.name || "";
  const html = `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 p-2 md:p-4 animate-in fade-in duration-300">
            ${list.map((album, index) => {
    const albumId = album.id ?? album.mid;
    const albumSource = album.source || window.currentArtistSource || "wy";
    const albumName = album.name || "未知专辑";
    const favorited = isAlbumFavorited(albumId, albumSource);
    return `
                <div class="artist-album-card group flex flex-col p-3 rounded-2xl transition-all hover:t-bg-panel hover:shadow-lg cursor-pointer border border-transparent hover:border-emerald-500/20" data-album-index="${index}">
                    <div class="aspect-square rounded-xl overflow-hidden shadow-md mb-3 relative bg-gray-100 dark:bg-gray-800">
                        <img src="${escapeHtmlText(getImgUrl(album))}"
                             onerror="this.src='/music/assets/logo.svg'" 
                             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <div class="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <i class="fas fa-play"></i>
                             </div>
                        </div>
                        <div class="absolute top-1.5 right-1.5 flex gap-1.5">
                            <button type="button" class="artist-album-download-btn w-8 h-8 rounded-full bg-black/45 hover:bg-emerald-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all shadow-sm disabled:opacity-60 disabled:cursor-wait" data-album-index="${index}" title="下载本专辑全部歌曲">
                                <i class="fas fa-download text-xs"></i>
                            </button>
                            <button type="button" class="artist-album-favorite-btn w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${favorited ? "bg-rose-500 text-white opacity-100" : "bg-black/45 hover:bg-rose-500 text-white opacity-100 sm:opacity-0 group-hover:opacity-100"}" data-album-index="${index}" title="${favorited ? "取消收藏" : "收藏专辑"}">
                                <i class="fas fa-heart text-xs"></i>
                            </button>
                        </div>
                    </div>
                    <span class="text-sm font-bold t-text-main line-clamp-2 h-10 leading-5 mb-1 group-hover:text-emerald-600 transition-colors" title="${escapeHtmlText(albumName)}">${escapeHtmlText(albumName)}</span>
                    <div class="flex items-center justify-between mt-1">
                        <span class="text-[10px] t-text-muted">${escapeHtmlText(album.publishTime || "")}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">${album.total ?? album.count ?? album.size ?? album.songCount ?? 0} 首</span>
                    </div>
                </div>
            `;
  }).join("")}
        </div>
    `;
  content.innerHTML = html;
  content.querySelectorAll(".artist-album-card").forEach((card) => {
    card.addEventListener("click", () => {
      const album = list[Number(card.dataset.albumIndex)];
      if (album)
        enterAlbum(album.id ?? album.mid, album.source || window.currentArtistSource || "wy");
    });
  });
  content.querySelectorAll(".artist-album-download-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const album = list[Number(button.dataset.albumIndex)];
      if (album)
        await downloadArtistAlbumSongs(album, button);
    });
  });
  content.querySelectorAll(".artist-album-favorite-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const album = list[Number(button.dataset.albumIndex)];
      if (!album)
        return;
      const albumId = album.id ?? album.mid;
      const albumSource = album.source || window.currentArtistSource || "wy";
      const favorited = await toggleAlbumFavorite(albumId, albumSource, album.name || "未知专辑", getImgUrl(album), album.artistName || album.singer || artistName);
      button.className = "artist-album-favorite-btn w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm " + (favorited ? "bg-rose-500 text-white opacity-100" : "bg-black/45 hover:bg-rose-500 text-white opacity-100 sm:opacity-0 group-hover:opacity-100");
      button.title = favorited ? "取消收藏" : "收藏专辑";
    });
  });
}
window.renderArtistAlbumsUI = renderArtistAlbumsUI;
async function downloadArtistAlbumSongs(album, button) {
  if (typeof window.batchDownloadSongs !== "function") {
    showError("批量下载功能未就绪");
    return;
  }
  const albumId = album.id ?? album.mid;
  const albumSource = album.source || window.currentArtistSource || "wy";
  const albumName = album.name || "未知专辑";
  if (albumId === undefined || albumId === null || albumId === "") {
    showError(`专辑「${albumName}」缺少有效 ID，无法下载`);
    return;
  }
  const icon = button?.querySelector("i");
  if (button)
    button.disabled = true;
  if (icon)
    icon.className = "fas fa-spinner fa-spin text-xs";
  try {
    const query = new URLSearchParams({ id: String(albumId), source: albumSource });
    const res = await fetch(API_BASE + "/albumSongs?" + query.toString());
    if (!res.ok)
      throw new Error("HTTP " + res.status);
    const data = await res.json();
    const rawSongs = Array.isArray(data.list) ? data.list : Array.isArray(data) ? data : [];
    if (rawSongs.length === 0) {
      showError(`专辑「${albumName}」没有可下载的歌曲`);
      return;
    }
    const songs = rawSongs.map((song) => ({
      ...song,
      source: song.source || albumSource,
      albumName: song.albumName || albumName,
      meta: {
        ...song.meta || {},
        albumId: song.meta?.albumId || song.albumId || albumId,
        albumName: song.meta?.albumName || albumName
      }
    }));
    await window.batchDownloadSongs(songs, {
      clearSelection: false,
      selectionLabel: `专辑「${albumName}」共 ${songs.length} 首歌曲`
    });
  } catch (e) {
    console.error("[ArtistAlbums] 读取专辑歌曲失败:", albumName, e);
    showError(`读取专辑「${albumName}」失败: ${e.message}`);
  } finally {
    if (button)
      button.disabled = false;
    if (icon)
      icon.className = "fas fa-download text-xs";
  }
}
window.downloadArtistAlbumSongs = downloadArtistAlbumSongs;
async function enterAlbum(id, source = "wy") {
  const artistHeader = document.getElementById("artist-detail-header");
  if (artistHeader) {
    window.tempArtistContext = {
      id: window.currentArtistId,
      source: window.currentArtistSource,
      tab: window.currentArtistTab || "albums",
      order: window.currentArtistOrder || "hot"
    };
    artistHeader.remove();
  } else {
    window.tempArtistContext = null;
  }
  const typeEl = document.getElementById("search-type");
  if (!artistHeader) {
    lastSearchType = typeEl ? typeEl.value : "album";
    lastSearchResultList = [...window.viewingPlaylist || []];
  }
  window.history.pushState({ page: "search-detail" }, "");
  const resultsContainer = document.getElementById("search-results");
  resultsContainer.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-spinner fa-spin text-4xl text-emerald-500"></i></div>';
  try {
    const res = await fetch(`${API_BASE}/albumSongs?id=${id}&source=${source}`);
    if (!res.ok)
      throw new Error("Failed to fetch album songs");
    const data = await res.json();
    const songList = data.list || (Array.isArray(data) ? data : []);
    renderResults(songList);
    const pageInfoEl = document.getElementById("page-info");
    if (pageInfoEl)
      pageInfoEl.innerText = `专辑歌曲列表`;
    if (isAlbumFavorited(id, source)) {
      updateAlbumLibraryMeta(id, source, data);
    }
    const backBtn = document.getElementById("search-back-btn");
    if (backBtn)
      backBtn.classList.remove("hidden");
  } catch (e) {
    showError(`获取专辑歌曲失败: ${e.message}`);
    goBackToSearch();
  }
}
function goBackToSearch(fromPopState = false) {
  if (!fromPopState) {
    if (window.history.state && window.history.state.page === "search-detail") {
      window.history.back();
      return;
    }
  }
  if (window.tempArtistContext) {
    const ctx = window.tempArtistContext;
    window.tempArtistContext = null;
    enterArtist(ctx.id, ctx.source, ctx.order, ctx.tab, true);
    return;
  }
  if (!lastSearchResultList)
    return;
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  const detailHeader = document.getElementById("artist-detail-header");
  if (detailHeader)
    detailHeader.remove();
  if (header)
    header.classList.remove("hidden");
  if (currentSearchScope === "lib_artists") {
    renderLibraryArtists(lastSearchResultList);
  } else if (currentSearchScope === "lib_albums") {
    renderLibraryAlbums(lastSearchResultList);
  } else if (lastSearchType === "singer") {
    renderSingerResults(lastSearchResultList);
  } else if (lastSearchType === "album") {
    renderAlbumResults(lastSearchResultList);
  } else {
    renderResults(lastSearchResultList);
  }
  const backBtn = document.getElementById("search-back-btn");
  if (backBtn)
    backBtn.classList.add("hidden");
  const pageInfoEl = document.getElementById("page-info");
  if (pageInfoEl) {
    if (currentSearchScope === "lib_artists")
      pageInfoEl.innerText = `收藏歌手`;
    else if (currentSearchScope === "lib_albums")
      pageInfoEl.innerText = `收藏专辑`;
    else
      pageInfoEl.innerText = `搜索结果`;
  }
  lastSearchResultList = null;
  lastSearchType = null;
  currentArtistId = null;
}
window.goBackToSearch = goBackToSearch;
window.enterArtist = enterArtist;
function getImgUrl(item) {
  if (!item)
    return "/music/assets/logo.svg";
  const s = item;
  if (s.meta && s.meta.picUrl)
    return s.meta.picUrl;
  return s.img || s.pic || s.picUrl || s.picture || s.album && (s.album.picUrl || s.album.img || s.album.pic) || s.al && (s.al.picUrl || s.al.img) || s.meta && (s.meta.img || s.meta.pic) || "/music/assets/logo.svg";
}
function renderResults(list) {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  if (header)
    header.classList.remove("hidden");
  const paginationBar = document.getElementById("search-pagination-bar");
  if (paginationBar)
    paginationBar.classList.remove("hidden");
  window.artistSongsPage = 1;
  const headerTitle = document.getElementById("header-title");
  const headerAlbum = document.getElementById("header-album");
  const showAlbum = currentSearchScope === "network";
  if (header) {
    header.classList.remove("hidden");
  }
  if (headerTitle) {
    if (showAlbum) {
      headerTitle.classList.remove("lg:col-span-6");
      headerTitle.classList.add("lg:col-span-4");
    } else {
      headerTitle.classList.remove("lg:col-span-4");
      headerTitle.classList.add("lg:col-span-6");
    }
  }
  if (headerAlbum) {
    if (showAlbum) {
      headerAlbum.classList.add("hidden");
      headerAlbum.classList.add("lg:block");
    } else {
      headerAlbum.classList.add("hidden");
      headerAlbum.classList.remove("lg:block");
    }
  }
  container.innerHTML = "";
  if (list && list.length > 0) {
    list.forEach((item, idx) => {
      if (!item.id || item.id === "undefined") {
        item.id = item.songmid || item.songId || item.hash || item.copyrightId || item.mid || item.mediaMid || `temp_${Date.now()}_${idx}`;
      }
    });
  }
  window.viewingPlaylist = list;
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="text-center t-text-muted p-8">未找到相关结果</div>';
    updatePaginationInfo(0, 0, 0, 1, 1);
    return;
  }
  const indexedDisplayList = window.ListSearch.getDisplayList(list);
  const totalItems = indexedDisplayList.length;
  let itemsPerPage = settings.itemsPerPage === "all" ? totalItems : parseInt(settings.itemsPerPage);
  if (itemsPerPage <= 0)
    itemsPerPage = 20;
  const totalPages = Math.ceil(totalItems / (itemsPerPage || 1));
  if (currentPage > totalPages)
    currentPage = totalPages || 1;
  if (currentPage < 1)
    currentPage = 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const pageList = indexedDisplayList.slice(startIndex, endIndex);
  pageList.forEach((obj, pageIndex) => {
    const { item, originalIndex: actualIndexInOriginal } = obj;
    const row = document.createElement("div");
    row.id = `gl-row-${actualIndexInOriginal}`;
    row.dataset.songId = String(item.id);
    const isMatched = window.ListSearch.isMatched(actualIndexInOriginal);
    const isCurrentMatch = window.ListSearch.isCurrentMatch(actualIndexInOriginal);
    const isSelected = window.selectedItems.has(String(item.id));
    let rowClass = "grid grid-cols-12 gap-4 p-3 rounded-xl hover:t-bg-panel group transition-colors cursor-pointer ";
    if (isCurrentMatch)
      rowClass += "search-current ";
    else if (isMatched)
      rowClass += "search-match ";
    if (isSelected)
      rowClass += "row-selected ring-1 ring-emerald-500/30 ";
    row.className = rowClass;
    row.onclick = (e) => {
      if (window.batchMode) {
        const id = String(item.id);
        const isChecked = !window.selectedItems.has(id);
        window.handleBatchSelect(id, isChecked);
      } else {
        playFromView(actualIndexInOriginal);
      }
    };
    const imgUrl = getImgUrl(item);
    const titleLgSpan = showAlbum ? "lg:col-span-4" : "lg:col-span-6";
    row.innerHTML = `
            <!-- Index -->
            <div class="col-span-1 sm:col-span-1 text-center font-mono t-text-muted text-xs md:text-sm flex items-center justify-center">
                ${window.batchMode ? `
                    <input type="checkbox" 
                           class="batch-checkbox w-4 h-4 text-emerald-600 rounded" 
                           data-song-id="${item.id}"
                           ${isSelected ? "checked" : ""}
                    onclick="event.stopPropagation(); handleBatchSelect('${String(item.id)}', this.checked);">
                ` : `<span class="index-num">${actualIndexInOriginal + 1}</span>`}
            </div>

            <!-- Title (Image + Text) -->
            <div class="col-span-9 sm:col-span-7 md:col-span-6 ${titleLgSpan} flex items-center overflow-hidden pr-2">
                <div class="relative w-10 h-10 md:w-12 md:h-12 mr-3 md:mr-4 flex-shrink-0 group cursor-pointer">
                     <img data-src="${imgUrl}" src="/music/assets/logo.svg" 
                          loading="lazy" fetchpriority="low"
                          class="lazy-image w-full h-full rounded-lg object-cover shadow-sm group-hover:shadow-md transition-all group-hover:scale-105 duration-300 dynamic-logo is-placeholder" 
                          alt="${item.name}"
                          onerror="this.src='/music/assets/logo.svg'; this.classList.add('is-placeholder');">
                     <div class="absolute inset-0 bg-black/20 rounded-lg hidden group-hover:flex items-center justify-center transition-all">
                        <i class="fas fa-play text-white text-xs md:text-sm"></i>
                     </div>
                </div>
                <div class="min-w-0 flex-1 flex flex-col justify-center overflow-hidden">
                    <div class="font-bold t-text-main text-sm md:text-base leading-tight hover:text-emerald-600 transition-colors">
                         ${createMarqueeHtml(item.name)}
                    </div>
                    <div class="flex items-center gap-1 mt-0.5 md:mt-1 pr-2 overflow-hidden">
                         ${getSourceTag(item.source)}
                         ${getQualityTags(item)}
                         <div class="sm:hidden flex-1 min-w-0">
                            ${createMarqueeHtml(item.singer, "text-[10px] t-text-muted")}
                         </div>
                    </div>
                </div>
            </div>

            <!-- Artist (Hidden on Mobile) -->
            <div class="hidden sm:flex sm:col-span-3 md:col-span-3 lg:col-span-3 t-text-muted text-sm md:text-base items-center hover:text-emerald-600 transition-colors cursor-pointer overflow-hidden"
                 title="${item.singer}"
                 onclick="event.stopPropagation(); document.getElementById('search-input').value = '${item.singer.replace(/'/g, "\\'")}'; doSearch();">
                ${createMarqueeHtml(item.singer)}
            </div>

            <!-- Album (Hidden until LG) -->
            ${showAlbum ? `
            <div class="hidden lg:block lg:col-span-2 t-text-muted text-sm truncate flex items-center" title="${item.albumName || ""}">
                ${item.albumName || "-"}
            </div>
            ` : ""}

            <!-- Duration (Hidden until MD) -->
            <div class="hidden md:block md:col-span-1 t-text-muted text-sm font-mono text-center flex items-center justify-center">
                ${item.interval || "--:--"}
            </div>

            <!-- Actions -->
            <div class="col-span-2 sm:col-span-1 flex items-center justify-end gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="p-1 sm:p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors" 
                        title="播放" 
                        onclick="event.stopPropagation(); playFromView(${actualIndexInOriginal})">
                    <i class="fas fa-play w-3 h-3 sm:w-4 sm:h-4"></i>
                </button>
                <button class="p-1 sm:p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors" 
                        title="下载" 
                        onclick="event.stopPropagation(); downloadSong(${JSON.stringify(item).replace(/"/g, "&quot;")})">
                    <i class="fas fa-download w-3 h-3 sm:w-4 sm:h-4"></i>
                </button>
                ${currentSearchScope !== "network" ? `
                <button class="p-1 sm:p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors" 
                        title="删除" 
                        onclick="event.stopPropagation(); deleteSingleSong('${item.id}')">
                    <i class="fas fa-trash w-3 h-3 sm:w-4 sm:h-4"></i>
                </button>
                ` : ""}
            </div>
        `;
    container.appendChild(row);
  });
  updatePaginationInfo(startIndex + 1, endIndex, totalItems, currentPage, totalPages);
  lazyLoadImages(container);
  applyMarqueeChecks(container);
  if (currentSearchScope === "network" && currentPage === totalPages) {
    const FETCH_PAGES_STEP = 3;
    const nextNetPage = (window.currentNetworkPage || 1) + FETCH_PAGES_STEP;
    if (!window._prefetchingPending || window._prefetchingPending !== nextNetPage) {
      window._prefetchingPending = nextNetPage;
      console.log(`[Prefetch] 触及本地末页 (${totalPages})，自动拉取后续 ${FETCH_PAGES_STEP} 页... (Next URL Page: ${nextNetPage})`);
      setTimeout(() => {
        doSearch(nextNetPage, true, true).finally(() => {});
      }, 500);
    }
  }
}
function createMarqueeHtml(text, className = "") {
  const safeText = escapeHtmlText(text);
  return `<div class="truncate dynamic-marquee min-w-0 ${className}" data-text="${safeText}">${safeText}</div>`;
}
function applyMarqueeChecks(root = document) {
  setTimeout(() => {
    const scope = root || document;
    const elements = scope.querySelectorAll(".dynamic-marquee.truncate");
    elements.forEach((el) => {
      if (el.scrollWidth > el.clientWidth) {
        const text = el.getAttribute("data-text") || el.innerText;
        el.classList.remove("truncate");
        el.classList.add("overflow-hidden");
        const maskStyle = "mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%);";
        const wrapper = document.createElement("div");
        wrapper.className = "w-full relative";
        wrapper.setAttribute("style", maskStyle);
        const track = document.createElement("div");
        track.className = "inline-block whitespace-nowrap animate-marquee hover:pause-animation";
        const firstText = document.createElement("span");
        firstText.textContent = text;
        const firstGap = document.createElement("span");
        firstGap.className = "mx-8";
        const secondText = document.createElement("span");
        secondText.textContent = text;
        const secondGap = document.createElement("span");
        secondGap.className = "mx-8";
        track.append(firstText, firstGap, secondText, secondGap);
        wrapper.appendChild(track);
        el.replaceChildren(wrapper);
      }
    });
  }, 50);
}
window.addEventListener("resize", () => {
  clearTimeout(window._marqueeResizeTimer);
  window._marqueeResizeTimer = setTimeout(applyMarqueeChecks, 300);
});
var imageObserver;
function lazyLoadImages(root = document) {
  const scope = root || document;
  const loadImage = (img) => {
    const src = img.getAttribute("data-src");
    if (!src)
      return;
    if (img.src.includes("logo.svg")) {
      img.classList.add("is-placeholder");
    }
    img.src = src;
    img.onload = () => {
      img.classList.remove("is-placeholder", "opacity-0");
      img.removeAttribute("data-src");
    };
    img.onerror = () => {
      img.src = "/music/assets/logo.svg";
      img.classList.add("is-placeholder");
      img.removeAttribute("data-src");
    };
  };
  if ("IntersectionObserver" in window) {
    if (!imageObserver) {
      imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadImage(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: "100px 0px",
        threshold: 0.01
      });
    }
    const images = scope.querySelectorAll("img.lazy-image[data-src]");
    images.forEach((img) => {
      imageObserver.observe(img);
    });
  } else {
    const images = scope.querySelectorAll("img.lazy-image[data-src]");
    images.forEach(loadImage);
  }
}
window.lazyLoadImages = lazyLoadImages;
window.unobserveLazyImages = function(root = document) {
  if (!imageObserver)
    return;
  const scope = root || document;
  scope.querySelectorAll("img.lazy-image").forEach((img) => imageObserver.unobserve(img));
};
var currentLoadingSongId = null;
var loadingRequestCounter = 0;
var currentLoadingRequestId = 0;
var currentQuality = null;
var currentSourceType = "normal";
var hintTimeout = null;
function getSourceTypeText(sourceType) {
  const map = {
    server_cache: "服务器本地缓存",
    cache: "浏览器链接缓存",
    normal: "在线解析"
  };
  return map[sourceType] || "解析成功";
}
async function probeUrl(url) {
  if (!url)
    return false;
  if (url.startsWith("/") || url.includes(window.location.host))
    return true;
  try {
    const controller = new AbortController;
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (e) {
    console.warn(`[Probe] URL probe failed: ${url.substring(0, 40)}...`, e.message);
    return false;
  }
}
var prefetchManager = {
  cache: new Map,
  bufferer: new Audio,
  init() {
    this.bufferer.muted = true;
    this.bufferer.preload = "auto";
  },
  set(songId, data) {
    this.cache.set(songId, { ...data, timestamp: Date.now() });
    if (data.url) {
      console.log(`[Prefetch] Pre-loading data stream for ID: ${songId}`);
      this.bufferer.src = data.url;
      this.bufferer.load();
    }
    if (this.cache.size > 5) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  },
  get(songId) {
    const data = this.cache.get(songId);
    if (data && Date.now() - data.timestamp < 30 * 60 * 1000) {
      return data;
    }
    return null;
  },
  clear() {
    this.cache.clear();
    this.bufferer.src = "";
  }
};
prefetchManager.init();
async function resolveSongUrl(song, quality, isSilent = false, isRetry = false, disableFallback = false) {
  try {
    const result = await fetchSongUrl(song, quality, isRetry, isSilent);
    if (result.errorMsg)
      throw new Error(result.errorMsg);
    return result;
  } catch (error) {
    if (disableFallback) {
      throw error;
    }
    const isPlatformNotSupported = error.message && (error.message.includes("未找到支持") || error.message.includes("not supported"));
    const order = (settings.playbackErrorPriority || "platform,quality,next").split(",");
    const steps = [];
    for (const key of order) {
      if (key === "quality" && settings.enableAutoDegradeQuality !== false) {
        steps.push("degrade");
      } else if (key === "platform" && settings.enableAutoSwitchSource !== false) {
        steps.push("switch_platform");
      }
    }
    const fallbackRetryMode = isRetry === "local_retry" || isRetry === "download" ? isRetry : true;
    for (const step of steps) {
      if (step === "degrade") {
        const nextQuality = isPlatformNotSupported ? null : window.QualityManager.getNextLowerQuality(quality, song);
        if (nextQuality) {
          if (!isSilent) {
            const fromName = window.QualityManager.getQualityDisplayName(quality);
            const toName = window.QualityManager.getQualityDisplayName(nextQuality);
            showInfo(`从 ${fromName} 降级到 ${toName} 播放...`);
          }
          return await resolveSongUrl(song, nextQuality, isSilent, fallbackRetryMode, false);
        }
      } else if (step === "switch_platform") {
        if (!isSilent) {
          console.log(`[AutoSource] 原始源解析失败，准备尝试全网匹配: ${song.name}`);
        }
        const matchedSong = await findOtherSourceMatch(song, isSilent);
        if (matchedSong) {
          if (!isSilent) {
            showInfo(`找到备选源，尝试从 ${getSourceName(matchedSong.source)} 播放...`);
          }
          const bestNextQuality = window.QualityManager.getBestQuality(matchedSong, settings.preferredQuality || "flac");
          const matchedResult = await fetchSongUrl(matchedSong, bestNextQuality, fallbackRetryMode, isSilent);
          return {
            ...matchedResult,
            songInfo: matchedSong,
            switchedSource: true,
            originalSource: song.source
          };
        }
      }
    }
    throw error;
  }
}
async function resolveDownloadSongUrl(song, quality, isSilent = true) {
  const tried = new Set;
  let lastError = null;
  const tryResolveCandidate = async (candidateSong, preferredQuality) => {
    const requestedQuality = preferredQuality || settings.preferredQuality || "flac";
    let candidateQuality = window.QualityManager?.QUALITY_PRIORITY?.includes(requestedQuality) ? requestedQuality : window.QualityManager ? window.QualityManager.getBestQuality(candidateSong, requestedQuality) : requestedQuality;
    while (candidateQuality) {
      const candidateId = candidateSong.id || candidateSong.songmid || candidateSong.songId || candidateSong.hash || candidateSong.copyrightId || candidateSong.mid || candidateSong.mediaMid || `${candidateSong.name || ""}_${candidateSong.singer || ""}_${candidateSong.interval || ""}`;
      const key = `${candidateSong.source || ""}_${candidateId}_${candidateQuality}`;
      if (tried.has(key))
        break;
      tried.add(key);
      try {
        const result = await fetchSongUrl(candidateSong, candidateQuality, "download", isSilent);
        if (result.errorMsg)
          throw new Error(result.errorMsg);
        return result;
      } catch (err) {
        lastError = err;
        console.warn(`[DownloadResolve] 解析失败: ${candidateSong.name} via ${candidateSong.source} (${candidateQuality})`, err);
        if (!window.QualityManager || settings.enableAutoDegradeQuality === false)
          break;
        candidateQuality = window.QualityManager.getNextLowerQuality(candidateQuality, candidateSong);
      }
    }
    return null;
  };
  const originalResult = await tryResolveCandidate(song, quality);
  if (originalResult)
    return originalResult;
  if (settings.enableAutoSwitchSource === false) {
    throw lastError || new Error("解析失败");
  }
  const matches = await findOtherSourceMatches(song, isSilent, { ignoreSupportedFilter: true });
  for (const matchedSong of matches) {
    const matchedResult = await tryResolveCandidate(matchedSong, quality);
    if (matchedResult) {
      return {
        ...matchedResult,
        songInfo: matchedSong,
        switchedSource: true,
        originalSource: song.source
      };
    }
  }
  throw lastError || new Error("未找到可下载的备选源");
}
function normalizeSongMatchText(value) {
  return String(value || "").toLowerCase().replace(/[（(].*?[）)]/g, "").replace(/[\s·・,，.。!！?？:：;；'"‘’“”《》<>【】[\]()（）\-_/\\]/g, "");
}
function isSingerMatch(sourceSinger, targetSinger) {
  const sourceText = normalizeSongMatchText(sourceSinger);
  const targetText = normalizeSongMatchText(targetSinger);
  if (!targetText)
    return true;
  if (!sourceText)
    return false;
  if (sourceText.includes(targetText) || targetText.includes(sourceText))
    return true;
  const splitSinger = (value) => String(value || "").toLowerCase().split(/[、,，/&／|;；]+/).map(normalizeSongMatchText).filter(Boolean);
  const sourceParts = splitSinger(sourceSinger);
  const targetParts = splitSinger(targetSinger);
  return sourceParts.some((sourcePart) => targetParts.some((targetPart) => sourcePart.includes(targetPart) || targetPart.includes(sourcePart)));
}
function getSongMatchScore(item, song) {
  const targetName = normalizeSongMatchText(song.name);
  const itemName = normalizeSongMatchText(item.name);
  if (!targetName || !itemName)
    return -1;
  if (!itemName.includes(targetName) && !targetName.includes(itemName))
    return -1;
  if (!isSingerMatch(item.singer, song.singer))
    return -1;
  const targetDuration = timeToSeconds(song.interval);
  const itemDuration = timeToSeconds(item.interval);
  let durationScore = 0;
  if (targetDuration > 0 && itemDuration > 0) {
    const durationDiff = Math.abs(targetDuration - itemDuration);
    if (durationDiff > 8)
      return -1;
    durationScore = 8 - durationDiff;
  }
  let nameScore = 0;
  if (itemName === targetName)
    nameScore = 20;
  else if (itemName.includes(targetName) || targetName.includes(itemName))
    nameScore = 10;
  const sameAlbum = item.albumName && song.albumName && normalizeSongMatchText(item.albumName) === normalizeSongMatchText(song.albumName);
  return nameScore + durationScore + (sameAlbum ? 3 : 0);
}
function getSongDurationDiff(item, song) {
  const targetDuration = timeToSeconds(song.interval);
  const itemDuration = timeToSeconds(item.interval);
  if (targetDuration <= 0 || itemDuration <= 0)
    return null;
  return Math.abs(targetDuration - itemDuration);
}
async function findOtherSourceMatch(song, isSilent = false) {
  const matches = await findOtherSourceMatches(song, isSilent);
  return matches[0] || null;
}
async function findOtherSourceMatches(song, isSilent = false, options = {}) {
  if (!song.name || !song.singer)
    return [];
  try {
    const list = await fetchCustomSources();
    let supportedPlatforms = null;
    if (Array.isArray(list)) {
      supportedPlatforms = new Set;
      list.forEach((src) => {
        if (src.enabled && src.status === "success" && Array.isArray(src.supportedSources)) {
          src.supportedSources.forEach((platform) => {
            supportedPlatforms.add(platform);
          });
        }
      });
    }
    const baseOrder = ["wy", "tx", "kw", "kg", "mg"];
    const searchSourcesOrdered = baseOrder.filter((s) => s !== song.source);
    let searchSources = searchSourcesOrdered;
    if (supportedPlatforms && !options.ignoreSupportedFilter) {
      searchSources = searchSourcesOrdered.filter((s) => supportedPlatforms.has(s));
    }
    if (searchSources.length === 0) {
      console.log(`[AutoSource] 换源跳过：没有其他自定义源支持的平台。当前源: ${song.source}`);
      if (!isSilent)
        showError("未找到自定义源下支持的平台下的对应歌曲");
      return [];
    }
    const query = `${song.name} ${song.singer}`;
    const headers = { "Content-Type": "application/json" };
    Object.assign(headers, getUserAuthHeaders());
    if (!isSilent)
      showInfo("正在自动尝试换源匹配...");
    const searchPromises = searchSources.map((s) => fetch(`${API_BASE}/search?name=${encodeURIComponent(query)}&source=${s}&page=1`, { headers }).then((res) => res.json()).then((data) => Array.isArray(data) ? data.map((item) => ({ ...item, source: s })) : []).catch(() => []));
    const allResults = await Promise.all(searchPromises);
    const flatResults = allResults.flat();
    if (flatResults.length === 0)
      return [];
    const matches = [];
    for (const item of flatResults) {
      const score = getSongMatchScore(item, song);
      if (score < 0)
        continue;
      const durationDiff = getSongDurationDiff(item, song);
      console.log(`[AutoSource] 匹配成功: ${item.name} via ${item.source} (score: ${score}, 时长误差: ${durationDiff === null ? "未知" : `${durationDiff}s`})`);
      matches.push({ ...item, _matchScore: score });
    }
    if (matches.length === 0) {
      console.log(`[AutoSource] 未找到合适的匹配结果 (Total searched: ${flatResults.length})`);
    }
    return matches.sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0));
  } catch (e) {
    console.warn("[AutoSource] 匹配逻辑执行出错:", e);
    return [];
  }
}
function timeToSeconds(timeStr) {
  if (!timeStr || !timeStr.includes(":"))
    return 0;
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}
function getSourceName(source) {
  const names = { kw: "酷我", kg: "酷狗", tx: "QQ", wy: "网易", mg: "咪咕" };
  return names[source] || source.toUpperCase();
}
async function applyAutoProxy(url, song) {
  if (!url)
    return url;
  if (url.startsWith("/api/music/download") || url.startsWith("/") || url.includes(window.location.host)) {
    return url;
  }
  if (settings.enableProxyPlayback) {
    console.log(`[Proxy] Forced proxy enabled for: ${song.name}`);
    if (settings.enableCustomProxy && settings.customProxyUrl) {
      const proxyUrl = settings.customProxyUrl.replace("{url}", url);
      console.log(`[Proxy] Custom proxy applied (forced): ${song.name} -> ${proxyUrl}`);
      return proxyUrl;
    }
    const filename2 = `${song.singer} - ${song.name}.mp3`;
    return `/api/music/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename2)}&inline=1`;
  }
  const isHttpsEnv = window.location.protocol === "https:";
  const isHttpLink = url.startsWith("http://");
  if (settings.enableAutoProxy) {
    const probeUrl = isHttpsEnv && isHttpLink ? url.replace("http://", "https://") : url;
    console.log(`[Proxy] Auto-proxy evaluating (CORS/Safety probe): ${song.name}`);
    try {
      const controller = new AbortController;
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(probeUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        console.log(`[Proxy] Probe Success (Direct Play): ${song.name} via ${probeUrl}`);
        return probeUrl;
      }
    } catch (e) {
      console.warn(`[Proxy] Probe failed (CORS risk or unreachable), falling back to server proxy: ${song.name}`, e.message);
    }
    if (settings.enableCustomProxy && settings.customProxyUrl) {
      const proxyUrl = settings.customProxyUrl.replace("{url}", url);
      console.log(`[Proxy] Custom proxy fallback: ${song.name} -> ${proxyUrl}`);
      return proxyUrl;
    }
    console.log(`[Proxy] Server proxy fallback: ${song.name}`);
    const filename2 = `${song.singer} - ${song.name}.mp3`;
    return `/api/music/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename2)}&inline=1`;
  }
  return url;
}
async function fetchSongUrl(song, quality, isRetry = false, isSilent = false) {
  const cleanedSong = cleanSongData(song);
  const cacheKey = `lx_url_${cleanedSong.id}_${quality}`;
  if ((song.isLocal || song.url?.startsWith("/api/music/cache/file/")) && song.url && !isRetry) {
    console.log(`[Cache] Direct Local File Hit: ${song.name}`);
    let localUrl = await applyAutoProxy(song.url, song);
    return { url: localUrl, sourceType: "server_cache", quality: song.quality || quality };
  }
  const shouldBypassServerCache = isRetry === "local_retry" || isRetry === "download";
  const allowServerCache = settings.preferServerCache !== false && !shouldBypassServerCache;
  if (allowServerCache) {
    let cacheResult = await checkServerCache(cleanedSong, quality, !!isRetry);
    if (cacheResult.exists && !cacheResult.isCollision) {
      const actualQuality = cacheResult.quality || quality;
      console.log(`[Cache] Server Hit: ${cleanedSong.name} (${actualQuality})`);
      let serverCacheUrl = cacheResult.url;
      serverCacheUrl = await applyAutoProxy(serverCacheUrl, song);
      return { url: serverCacheUrl, sourceType: "server_cache", quality: actualQuality };
    }
  }
  const allowLinkCache = !isRetry && settings.enableSongUrlCache !== false;
  if (allowLinkCache) {
    let cachedUrl = localStorage.getItem(cacheKey);
    if (cachedUrl) {
      console.log(`[Cache] Link Hit: ${cleanedSong.name} (${quality})`);
      cachedUrl = await applyAutoProxy(cachedUrl, song);
      return { url: cachedUrl, sourceType: "cache", quality };
    }
  }
  const reqId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let progressEs = null;
  try {
    progressEs = new EventSource(`/api/music/progress?reqId=${reqId}`);
    progressEs.onmessage = (e) => {
      if (isSilent)
        return;
      try {
        const attempt = JSON.parse(e.data);
        const songNamePrefix = attempt.name || song.name || "";
        const msg = `[${songNamePrefix}] ${attempt.message || (attempt.status === "success" ? "解析成功" : "解析失败")}`;
        if (attempt.status === "success")
          showSuccess(msg);
        else
          showError(msg);
      } catch (_) {}
    };
  } catch (_) {}
  const headers = { "Content-Type": "application/json" };
  Object.assign(headers, getUserAuthHeaders());
  headers["x-req-id"] = reqId;
  await new Promise((r) => setTimeout(r, 50));
  try {
    const res = await fetch(`${API_BASE}/url`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        songInfo: song,
        quality,
        enableAutoSwitchApiSource: settings.enableAutoSwitchApiSource !== false
      })
    });
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      let result = {};
      try {
        result = await res.json();
        if (result.error)
          errorMsg = result.error;
      } catch (e) {}
      throw { message: errorMsg, attempts: result.attempts };
    }
    const result = await res.json();
    if (result.url) {
      const finalUrl = await applyAutoProxy(result.url, song);
      if (settings.enableSongUrlCache !== false) {
        try {
          localStorage.setItem(cacheKey, finalUrl);
          updateStorageStatsUI();
        } catch (e) {}
      }
      if (settings.enableServerCache && isRetry !== "download" && !finalUrl.includes("/api/music/cache/file/")) {
        triggerServerCache(song, result.url, quality);
      }
      console.log(`[Resolve] Online Success: ${song.name} via ${result.sourceName || "Unknown"}`);
      return {
        url: finalUrl,
        sourceType: "normal",
        quality: result.type || quality,
        sourceName: result.sourceName,
        requestedSource: result.requestedSource || song.source,
        downloadSource: result.downloadSource || song.source,
        songInfo: song,
        errorMsg: result.errorMsg
      };
    }
    throw new Error("服务器未返回播放链接");
  } finally {
    if (progressEs) {
      progressEs.close();
      progressEs = null;
    }
  }
}
function getNextIndex() {
  if (!currentPlaylist || currentPlaylist.length === 0)
    return -1;
  if (playMode === "random" && preSelectedNextIndex !== null) {
    if (preSelectedNextIndex >= 0 && preSelectedNextIndex < currentPlaylist.length) {
      return preSelectedNextIndex;
    }
    preSelectedNextIndex = null;
  }
  let nextIndex;
  switch (playMode) {
    case "single":
      nextIndex = currentIndex;
      break;
    case "random":
      if (currentPlaylist.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (nextIndex === currentIndex);
      }
      break;
    case "order":
      nextIndex = currentIndex + 1;
      if (nextIndex >= currentPlaylist.length)
        return -1;
      break;
    case "list":
    default:
      nextIndex = currentIndex + 1;
      if (nextIndex >= currentPlaylist.length)
        nextIndex = 0;
      break;
  }
  return nextIndex;
}
async function prefetchNextSong(startFromIndex = null, depth = 0) {
  if (settings.enablePreloader === false || depth > 5)
    return;
  let targetIndex = startFromIndex;
  if (targetIndex === null) {
    targetIndex = getNextIndex();
    if (playMode === "random" && preSelectedNextIndex === null) {
      preSelectedNextIndex = targetIndex;
    }
  }
  if (targetIndex === -1 || targetIndex === currentIndex)
    return;
  const nextSong = currentPlaylist[targetIndex];
  if (!nextSong)
    return;
  if (nextSong._unplayable) {
    const followingIndex = targetIndex + 1 >= currentPlaylist.length ? 0 : targetIndex + 1;
    return prefetchNextSong(followingIndex, depth + 1);
  }
  try {
    const targetQual = window.QualityManager.getBestQuality(nextSong, settings.preferredQuality || "flac");
    let result = prefetchManager.get(nextSong.id);
    if (result) {
      if (await probeUrl(result.url))
        return;
      prefetchManager.cache.delete(nextSong.id);
    }
    result = await resolveSongUrl(nextSong, targetQual, true);
    if (!await probeUrl(result.url)) {
      localStorage.removeItem(`lx_url_${cleanSongData(nextSong).id}_${targetQual}`);
      result = await resolveSongUrl(nextSong, targetQual, true, true);
    }
    prefetchManager.set(nextSong.id, result);
    const sourceDesc = getSourceTypeText(result.sourceType);
    console.log(`[Prefetch] Readied: ${nextSong.name} (${result.quality} / ${sourceDesc})`);
  } catch (e) {
    console.warn(`[Prefetch] Skip unplayable [${nextSong.name}]:`, e.message);
    nextSong._unplayable = true;
    const followingIndex = targetIndex + 1 >= currentPlaylist.length ? 0 : targetIndex + 1;
    if (followingIndex !== currentIndex) {
      return prefetchNextSong(followingIndex, depth + 1);
    }
  }
}
async function checkServerCache(song, quality, exactQuality = false) {
  try {
    const username = currentListData?.username || "";
    const params = new URLSearchParams({
      name: song.name,
      singer: song.singer,
      source: song.source,
      songmid: song.songmid || song.meta && (song.meta.songmid || song.meta.songId) || "",
      songId: song.songId || song.meta && song.meta.songId || song.id,
      quality: quality || ""
    });
    if (exactQuality)
      params.append("exactQuality", "1");
    const headers = {};
    Object.assign(headers, getUserAuthHeaders());
    const res = await fetch(`/api/music/cache/check?${params}`, { headers });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    console.error("[ServerCache] Check failed:", e);
  }
  return { exists: false };
}
async function handleAdminAuth(message) {
  const pass = await showInput("管理员身份验证", message, {
    placeholder: "请输入后台管理密码",
    inputType: "password"
  });
  if (pass) {
    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "x-frontend-auth": pass }
      });
      if (response.ok) {
        localStorage.setItem("lx_admin_password", pass);
        updateAdminUI();
        return true;
      } else {
        const result = await response.json();
        showError(result.error || "密码验证失败");
        return false;
      }
    } catch (err) {
      console.error("Admin verification error:", err);
      showError("服务器验证出错，请稍后重试");
      return false;
    }
  }
  return false;
}
window.handleAdminAuth = handleAdminAuth;
async function requireAdminForOpenWrite(action) {
  const isOpen = currentListData?.username === "_open" || window.isViewingPublicFavorites;
  if (!isOpen)
    return true;
  if (localStorage.getItem("lx_admin_password"))
    return true;
  const authorized = await handleAdminAuth(`该操作需要管理员权限：${action || "修改公开内容"}`);
  return authorized;
}
window.requireAdminForOpenWrite = requireAdminForOpenWrite;
async function handleAdminLogin() {
  const authorized = await handleAdminAuth("请输入管理员密码进行登录验证");
  if (authorized) {
    showSuccess("管理员已登录");
    updateAdminUI();
    syncSettingsUI();
    if (typeof renderCustomSources === "function")
      renderCustomSources();
    if (!isUserLoggedIn()) {
      const loaded = await fetchPublicListData();
      if (loaded) {
        await loadLibraryData();
      }
    }
    if (typeof window.LocalMusicManager?.fetchData === "function") {
      window.LocalMusicManager.fetchData(true);
    }
  }
}
window.handleAdminLogin = handleAdminLogin;
async function handleAdminLogout() {
  if (!await showSelect("管理员登出", "确定要退出管理员身份吗？"))
    return;
  localStorage.removeItem("lx_admin_password");
  updateAdminUI();
  syncSettingsUI();
  if (window.lx_config?.["user.enablePublicFavorites"] && (!userToken || !localStorage.getItem("lx_sync_user"))) {
    const enablePublicNonAdminAccess = !!window.lx_config?.["user.enablePublicNonAdminAccess"];
    if (!enablePublicNonAdminAccess) {
      currentListData = null;
      window.currentListData = null;
      if (typeof renderMyLists === "function") {
        renderMyLists(null);
      }
    } else {
      fetchPublicListData();
    }
  }
  if (typeof window.LocalMusicManager?.fetchData === "function") {
    window.LocalMusicManager.fetchData(true);
  }
  showSuccess("管理员已登出");
}
window.handleAdminLogout = handleAdminLogout;
function updateAdminUI() {
  const isAdmin = !!localStorage.getItem("lx_admin_password");
  const isPublic = !currentListData?.username || currentListData?.username === "default";
  const adminTag = document.getElementById("settings-admin-tag");
  const loginBtn = document.getElementById("btn-admin-login");
  const logoutBtn = document.getElementById("btn-admin-logout");
  const scopeTag = document.getElementById("settings-source-scope-tag");
  if (adminTag)
    adminTag.classList.toggle("hidden", !isAdmin);
  if (logoutBtn)
    logoutBtn.classList.toggle("hidden", !isAdmin);
  if (loginBtn) {
    loginBtn.classList.toggle("hidden", isAdmin);
  }
  const manageBtn = document.getElementById("btn-custom-source-manage");
  if (manageBtn) {
    const isPublicRestrictionEnabled = !!window.lx_config?.["user.enablePublicRestriction"];
    const isUser = !!userToken;
    const isRestricted = isPublicRestrictionEnabled && !isAdmin && !isUser;
    manageBtn.classList.toggle("hidden", isRestricted);
  }
  if (scopeTag) {
    scopeTag.classList.toggle("hidden", !isPublic);
  }
  const isLocalLoggedIn = !!userToken && !isPublic;
  const isRemoteConnected = window.SyncManager && window.SyncManager.mode === "remote" && window.SyncManager.client?.isConnected || window.currentRemoteOverwriteClient && window.currentRemoteOverwriteClient.isConnected;
  const loginInputIds = ["sync-local-user", "sync-local-pass"];
  loginInputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = isLocalLoggedIn;
      if (isLocalLoggedIn) {
        el.classList.add("opacity-40", "cursor-not-allowed", "grayscale");
        el.parentElement?.classList.add("pointer-events-none");
      } else {
        el.classList.remove("opacity-40", "cursor-not-allowed", "grayscale");
        el.parentElement?.classList.remove("pointer-events-none");
      }
    }
  });
  const localLoginBtn = document.querySelector("#sync-form-local button");
  if (localLoginBtn) {
    localLoginBtn.disabled = isLocalLoggedIn;
    if (isLocalLoggedIn)
      localLoginBtn.classList.add("opacity-30", "pointer-events-none", "grayscale");
    else
      localLoginBtn.classList.remove("opacity-30", "pointer-events-none", "grayscale");
  }
  const disableMainRemote = isRemoteConnected || isLocalLoggedIn;
  ["sync-remote-url", "sync-remote-code"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disableMainRemote;
      if (disableMainRemote) {
        el.classList.add("opacity-40", "cursor-not-allowed", "grayscale");
        el.parentElement?.classList.add("pointer-events-none");
      } else {
        el.classList.remove("opacity-40", "cursor-not-allowed", "grayscale");
        el.parentElement?.classList.remove("pointer-events-none");
      }
    }
  });
  const disableModalRemote = isRemoteConnected || settings.enableClientModeSync;
  const modalInputIds = ["remote-overwrite-url", "remote-overwrite-code", "setting-client-mode-sync"];
  modalInputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disableModalRemote;
      if (disableModalRemote) {
        el.classList.add("opacity-40", "cursor-not-allowed", "grayscale");
        if (id !== "setting-client-mode-sync")
          el.parentElement?.classList.add("pointer-events-none");
      } else {
        el.classList.remove("opacity-40", "cursor-not-allowed", "grayscale");
        if (id !== "setting-client-mode-sync")
          el.parentElement?.classList.remove("pointer-events-none");
      }
    }
  });
  const modeBtnIds = ["btn-mode-local", "btn-mode-remote"];
  modeBtnIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (isLocalLoggedIn || isRemoteConnected) {
        el.style.opacity = "0.5";
        el.style.pointerEvents = "none";
        el.classList.add("grayscale");
      } else {
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
        el.classList.remove("grayscale");
      }
    }
  });
  const mainActionButtons = [
    document.querySelector("#sync-remote-step1 button"),
    document.querySelector("#sync-remote-step2 button")
  ];
  mainActionButtons.forEach((btn) => {
    if (btn) {
      btn.disabled = disableMainRemote;
      if (disableMainRemote)
        btn.classList.add("opacity-30", "pointer-events-none", "grayscale");
      else
        btn.classList.remove("opacity-30", "pointer-events-none", "grayscale");
    }
  });
  const modalActionButtons = [
    document.querySelector("#remote-overwrite-step1 button"),
    document.querySelector('button[onclick^="handleRemoteOverwriteConnect"]')
  ];
  modalActionButtons.forEach((btn) => {
    if (btn) {
      btn.disabled = disableModalRemote;
      if (disableModalRemote)
        btn.classList.add("opacity-30", "pointer-events-none", "grayscale");
      else
        btn.classList.remove("opacity-30", "pointer-events-none", "grayscale");
    }
  });
}
async function triggerServerCache(song, url, quality) {
  try {
    console.log("[ServerCache] Triggering background download for:", song.name);
    const username = currentListData?.username || "";
    const headers = { "Content-Type": "application/json" };
    Object.assign(headers, getUserAuthHeaders());
    const adminPass = localStorage.getItem("lx_admin_password");
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    const coverUrl = typeof getImgUrl === "function" ? getImgUrl(song) : song.img || song.meta?.picUrl || "";
    const songInfoForCache = {
      ...song,
      img: song.img || coverUrl,
      meta: {
        ...song.meta || {},
        picUrl: song.meta?.picUrl || coverUrl
      }
    };
    await fetch("/api/music/cache/download", {
      method: "POST",
      headers,
      body: JSON.stringify({
        songInfo: songInfoForCache,
        url,
        quality,
        namingPattern: window.settings?.serverCacheNamingPattern || "simple",
        embedLyric: !!(window.settings?.embedLyricToFile ?? true)
      })
    });
  } catch (e) {
    console.error("[ServerCache] Trigger failed:", e);
  }
}
var lastNamingPattern = window.settings?.serverCacheNamingPattern || "simple";
async function updateServerCacheConfig(location, pattern) {
  const loc = location || window.settings?.serverCacheLocation || "root";
  const pat = pattern || window.settings?.serverCacheNamingPattern || "simple";
  const oldPattern = lastNamingPattern;
  const headers = { "Content-Type": "application/json" };
  Object.assign(headers, getUserAuthHeaders());
  const adminPass = localStorage.getItem("lx_admin_password");
  if (adminPass)
    headers["x-frontend-auth"] = adminPass;
  try {
    const response = await fetch("/api/music/cache/config", {
      method: "POST",
      headers,
      body: JSON.stringify({
        location: loc,
        namingPattern: pat
      })
    });
    if (!response.ok) {
      console.warn("[ServerCache] Config update failed:", response.status);
      if (typeof syncSettingsUI === "function") {
        if (location)
          syncSettingsUI("serverCacheLocation", settings.serverCacheLocation);
        if (pattern)
          syncSettingsUI("serverCacheNamingPattern", settings.serverCacheNamingPattern);
      }
    } else {
      console.log("[Cache] 服务器配置已同步:", loc, pat);
      if (pattern && oldPattern && pattern !== oldPattern) {
        const confirmed = await showSelect("歌曲命名格式变更", `检测到命名方式已更改为 "${pat}"。是否将服务器上已下载的本地歌曲重新命名为新的格式？<br><br><span class="text-xs opacity-70">注：这会同时移动对应的歌词文件，确保播放器能正常识别。</span>`, {
          confirmText: "现在重命名",
          cancelText: "保持现状",
          confirmColor: "bg-emerald-500"
        });
        if (confirmed) {
          showLoading("正在重命名服务器文件...");
          try {
            const renameRes = await fetch("/api/music/cache/rename", {
              method: "POST",
              headers
            });
            const renameData = await renameRes.json();
            hideLoading();
            if (renameData.success) {
              showToast(`重命名完成！成功: ${renameData.successCount}, 跳过: ${renameData.skipCount}, 失败: ${renameData.failCount}`, "success");
              if (typeof refreshCacheList === "function")
                refreshCacheList();
            } else {
              showToast("重命名操作失败: " + (renameData.message || "未知错误"), "error");
            }
          } catch (e) {
            hideLoading();
            showToast("重命名请求异常", "error");
            console.error(e);
          }
        }
      }
      lastNamingPattern = pat;
    }
  } catch (e) {
    console.error("[ServerCache] Config update failed:", e);
  }
}
window.updateServerCacheConfig = updateServerCacheConfig;
function playFromView(index) {
  if (!viewingPlaylist || !viewingPlaylist[index])
    return;
  updatePlaylist(viewingPlaylist, index, currentSearchScope);
}
window.playFromView = playFromView;
async function runRecoveryFlow(error) {
  if (!currentRecoveryState)
    return;
  const { steps, currentStepIndex } = currentRecoveryState;
  if (currentStepIndex >= steps.length) {
    setPlayerStatus("播放失败");
    showError(`播放失败: ${error.message || "未知错误"}`);
    updatePlayButton(false);
    return;
  }
  const currentStep = steps[currentStepIndex];
  console.log(`[Recovery] Executing recovery step: ${currentStep} (${currentStepIndex + 1}/${steps.length})`);
  if (currentStep === "degrade") {
    const nextQuality = window.QualityManager.getNextLowerQuality(currentRecoveryState.currentQuality, currentRecoveryState.currentSong);
    if (nextQuality && !currentRecoveryState.triedQualities.includes(nextQuality)) {
      currentRecoveryState.currentQuality = nextQuality;
      currentRecoveryState.triedQualities.push(nextQuality);
      const fromName = window.QualityManager.getQualityDisplayName(currentRecoveryState.triedQualities[currentRecoveryState.triedQualities.length - 2]);
      const toName = window.QualityManager.getQualityDisplayName(nextQuality);
      showInfo(`从 ${fromName} 降级到 ${toName} 播放...`);
      playSong(currentRecoveryState.currentSong, currentRecoveryState.currentIndex, nextQuality, false, true);
    } else {
      currentRecoveryState.currentStepIndex++;
      await runRecoveryFlow(error);
    }
  } else if (currentStep === "switch_platform") {
    if (currentRecoveryState.currentSong === currentRecoveryState.originalSong) {
      showInfo("正在自动尝试换源匹配...");
      const matchedSong = await findOtherSourceMatch(currentRecoveryState.originalSong);
      if (matchedSong) {
        currentRecoveryState.currentSong = matchedSong;
        currentRecoveryState.triedPlatforms.push(matchedSong.source);
        const bestNextQuality = window.QualityManager.getBestQuality(matchedSong, settings.preferredQuality || "flac");
        currentRecoveryState.currentQuality = bestNextQuality;
        currentRecoveryState.triedQualities = [bestNextQuality];
        showInfo(`找到备选源，尝试从 ${getSourceName(matchedSong.source)} 播放...`);
        playSong(matchedSong, currentRecoveryState.currentIndex, bestNextQuality, false, true);
      } else {
        currentRecoveryState.currentStepIndex++;
        await runRecoveryFlow(error);
      }
    } else {
      currentRecoveryState.currentStepIndex++;
      await runRecoveryFlow(error);
    }
  } else if (currentStep === "skip_next") {
    const isPlatformNotSupported = error && error.message && (error.message.includes("未找到支持") || error.message.includes("not supported"));
    setPlayerStatus("播放失败，即将跳过", null, true);
    if (window._autoSkipTimer)
      clearTimeout(window._autoSkipTimer);
    window._autoSkipTimer = setTimeout(() => playNext(), isPlatformNotSupported ? 2000 : 3000);
  }
}
async function playSong(song, index, forceQuality = null, noPlay = false, isRetry = false, shouldAddToDefault = null) {
  if (currentLoadingSongId === song.id && !isRetry) {
    console.log(`[Player] Already loading ${song.name}, ignoring request.`);
    return;
  }
  const thisRequestSongId = song.id;
  if (window._autoSkipTimer) {
    clearTimeout(window._autoSkipTimer);
    window._autoSkipTimer = null;
  }
  const thisRequestId = ++loadingRequestCounter;
  currentLoadingSongId = thisRequestSongId;
  currentLoadingRequestId = thisRequestId;
  if (!isRetry) {
    const order = (settings.playbackErrorPriority || "platform,quality,next").split(",");
    const steps = [];
    for (const key of order) {
      if (key === "quality" && settings.enableAutoDegradeQuality !== false) {
        steps.push("degrade");
      } else if (key === "platform" && settings.enableAutoSwitchSource !== false) {
        steps.push("switch_platform");
      } else if (key === "next" && settings.enableAutoSkipOnError !== false) {
        steps.push("skip_next");
      }
    }
    const startQuality = forceQuality || window.QualityManager.getBestQuality(song, settings.preferredQuality || "flac");
    currentRecoveryState = {
      originalSong: song,
      currentIndex: index,
      currentSong: song,
      originalQuality: startQuality,
      currentQuality: startQuality,
      triedQualities: [startQuality],
      triedPlatforms: [song.source],
      steps,
      currentStepIndex: 0,
      thisRequestId
    };
  } else {
    if (currentRecoveryState) {
      currentRecoveryState.thisRequestId = thisRequestId;
    }
  }
  currentIndex = index;
  preSelectedNextIndex = null;
  currentPlayingSong = song;
  window.currentPlayingSong = song;
  updatePlayerInfo(song, null);
  updateMediaSessionMetadata(song);
  fetchLyric(song);
  const queueDrawer = document.getElementById("queue-drawer");
  if (queueDrawer && !queueDrawer.classList.contains("translate-x-full")) {
    renderQueue();
  }
  isUserScrolling = false;
  if (scrollLockTimeout) {
    clearTimeout(scrollLockTimeout);
    scrollLockTimeout = null;
  }
  const indicator = document.getElementById("lyric-scroll-indicator");
  if (indicator) {
    indicator.classList.add("hidden");
    indicator.style.display = "none";
  }
  if (!isRetry) {
    showInfo(`正在加载: ${song.name}...`);
  } else if (isRetry === true) {
    showInfo(`链接过期或失效，正在为您重新在线解析: ${song.name}...`);
  }
  const hint = document.getElementById("toggle-hint");
  if (hint) {
    hint.style.opacity = "";
    hint.style.maxHeight = "";
    hint.style.marginTop = "";
    hint.classList.remove("opacity-0");
    if (hintTimeout)
      clearTimeout(hintTimeout);
    hintTimeout = setTimeout(() => {
      hint.style.opacity = "0";
      hint.style.maxHeight = "0px";
      hint.style.marginTop = "0px";
    }, 5000);
  }
  setPlayerStatus("正在准备播放", null, true);
  let targetQuality = forceQuality;
  let isPrefetchFound = false;
  let urlResult = null;
  if (!targetQuality && !isRetry) {
    urlResult = prefetchManager.get(song.id);
    if (urlResult) {
      urlResult.isPrefetch = true;
      isPrefetchFound = true;
      prefetchManager.bufferer.src = "";
    }
  }
  if (settings.enableCrossfade && !noPlay && audio && !audio.paused && !audio.ended && audio.src) {
    await fadeVolume(0, 300);
  }
  if (!noPlay) {
    try {
      audio.pause();
    } catch (e) {}
  }
  updatePlayButton(false);
  try {
    if (!urlResult) {
      if (!targetQuality) {
        targetQuality = window.QualityManager.getBestQuality(song, settings.preferredQuality || "flac");
      }
      setPlayerStatus("正在获取播放链接", null, true);
      urlResult = await resolveSongUrl(song, targetQuality, false, isRetry, !noPlay);
    }
    if (currentLoadingRequestId !== thisRequestId)
      return;
    const sourceText = getSourceTypeText(urlResult.sourceType);
    const sourceName = urlResult.sourceName || "";
    if (urlResult.isPrefetch) {
      let detail = "解析成功";
      if (urlResult.sourceType === "cache")
        detail = "命中缓存链接";
      else if (urlResult.sourceType === "server_cache")
        detail = "命中本地文件";
      else if (sourceName)
        detail = `${sourceName} 解析成功`;
      showSuccess(`[预读] ${song.name} ${detail}`);
    } else if (urlResult.sourceType !== "normal") {
      showSuccess(`[${song.name}] 命中${sourceText}`);
    }
    if (urlResult.errorMsg) {
      showError(urlResult.errorMsg);
    }
    let finalUrl = urlResult.url;
    currentQuality = urlResult.quality;
    currentSourceType = urlResult.sourceType;
    const playbackSong = urlResult.switchedSource && urlResult.songInfo ? urlResult.songInfo : song;
    if (playbackSong !== song) {
      currentPlayingSong = playbackSong;
      window.currentPlayingSong = playbackSong;
      if (currentRecoveryState)
        currentRecoveryState.currentSong = playbackSong;
      updateMediaSessionMetadata(playbackSong);
      fetchLyric(playbackSong, currentQuality);
    }
    updatePlayerInfo(playbackSong, currentQuality);
    if (settings.enableServerLyricCache !== false && currentRawLrc) {
      try {
        const _lyricHeaders = { "Content-Type": "application/json" };
        Object.assign(_lyricHeaders, getUserAuthHeaders());
        fetch(`${API_BASE}/cache/lyric`, {
          method: "POST",
          headers: _lyricHeaders,
          body: JSON.stringify({
            songInfo: { ...playbackSong, quality: currentQuality },
            lyricsObj: { lyric: currentRawLrc, tlyric: currentRawTlrc, rlyric: currentRawRlrc, lxlyric: currentRawKlrc }
          })
        }).catch((e) => console.warn("[Lyric] 音质确定后重写服务端缓存失败:", e));
      } catch (e) {}
    }
    if (currentSourceType !== "normal") {
      const retryHandler = () => {
        console.warn(`[Player] ${currentSourceType} link failed, retrying online...`);
        if (currentSourceType === "cache")
          localStorage.removeItem(`lx_url_${cleanSongData(playbackSong).id}_${currentQuality || targetQuality}`);
        playSong(playbackSong, index, targetQuality, noPlay, currentSourceType === "server_cache" ? "local_retry" : true);
      };
      audio.addEventListener("error", retryHandler, { once: true });
      const cleanup = () => audio.removeEventListener("error", retryHandler);
      audio.addEventListener("playing", cleanup, { once: true });
      audio.addEventListener("pause", cleanup, { once: true });
    }
    audio.src = finalUrl;
    if (noPlay) {
      setPlayerStatus("", false);
      updatePlayButton(false);
      if (window._resumeInfo && window._resumeInfo.time > 0) {
        audio.addEventListener("loadedmetadata", () => {
          audio.currentTime = window._resumeInfo.time;
          delete window._resumeInfo;
        }, { once: true });
      }
      return;
    }
    try {
      if (settings.enableCrossfade)
        audio.volume = 0;
      else
        audio.volume = typeof currentVolume !== "undefined" ? currentVolume : 1;
      await audio.play();
      if (settings.enableCrossfade)
        fadeVolume(typeof currentVolume !== "undefined" ? currentVolume : 1, 1000);
      setPlayerStatus("", true);
      updatePlayButton(true);
      savePlayHistory(playbackSong, currentQuality);
      const finalAdd = shouldAddToDefault !== null ? shouldAddToDefault : currentPlayingScope === "network" || currentPlayingScope === "songlist" || currentPlayingScope === "leaderboard";
      if (finalAdd) {
        addToDefaultList(playbackSong);
        const isSongListOrLeaderboard = currentPlayingScope === "songlist" || currentPlayingScope === "leaderboard";
        if (isSongListOrLeaderboard) {
          const shouldFallback = settings.switchPlaylistOnSongListPlay === false;
          if (shouldFallback && typeof currentListData !== "undefined" && currentListData.defaultList) {
            currentPlaylist = currentListData.defaultList;
            currentIndex = 0;
            currentPlayingScope = "local_list";
            window.currentViewingListId = "default";
          }
        } else {
          const shouldSearchFallback = settings.switchPlaylistOnSearchPlay === false;
          if (shouldSearchFallback && typeof currentListData !== "undefined" && currentListData.defaultList) {
            currentPlaylist = currentListData.defaultList;
            currentIndex = 0;
            currentPlayingScope = "local_list";
            window.currentViewingListId = "default";
          }
        }
      }
    } catch (playError) {
      if (currentLoadingRequestId !== thisRequestId)
        return;
      const isAbort = playError && (playError.name === "AbortError" || playError.code === 20);
      if (isAbort)
        return;
      console.error("[Player] Playback blocked:", playError);
      setPlayerStatus("请点击播放按钮");
    }
    prefetchNextSong();
  } catch (error) {
    if (currentLoadingRequestId !== thisRequestId)
      return;
    console.error("[Player] Error:", error);
    if (currentRecoveryState && currentRecoveryState.thisRequestId === thisRequestId && !noPlay) {
      await runRecoveryFlow(error);
    } else {
      setPlayerStatus("播放失败");
      showError(`播放失败: ${error.message || "未知错误"}`);
      updatePlayButton(false);
    }
  } finally {
    if (currentLoadingRequestId === thisRequestId) {
      currentLoadingRequestId = 0;
      currentLoadingSongId = null;
    }
  }
}
function setPlayerStatus(status, isPlaying = null, isLoading = false) {
  const statusEl = document.getElementById("player-status");
  if (!statusEl)
    return;
  if (isLoading && typeof status === "string") {
    statusEl.innerHTML = `<span class="animate-loading-dots">${status}<span>.</span><span>.</span><span>.</span></span>`;
    return;
  }
  if (typeof status === "string" && (status.includes("请点击") || status.includes("即将跳过"))) {
    if (status.includes("请点击") && audio && !audio.paused) {} else {
      statusEl.innerText = status;
      return;
    }
  }
  let statusText = "";
  if (isPlaying === null) {
    isPlaying = !audio.paused;
  }
  const playStatus = isPlaying ? "播放中" : "暂停中";
  const qualityName = currentQuality ? window.QualityManager.getQualityDisplayName(currentQuality) : "";
  if (qualityName) {
    statusText = `${playStatus} (${qualityName})`;
  } else {
    statusText = playStatus;
  }
  if (currentSourceType === "cache") {
    statusText += " 【缓存链接】";
  } else if (currentSourceType === "server_cache") {
    statusText += " 【服务器缓存】";
  }
  statusEl.innerText = statusText;
}
function savePlayHistory(song, quality) {
  try {
    const history = JSON.parse(localStorage.getItem("play_history") || "[]");
    history.unshift({
      ...song,
      quality,
      playedAt: Date.now()
    });
    localStorage.setItem("play_history", JSON.stringify(history.slice(0, 50)));
  } catch (e) {
    console.error("[Player] 保存播放历史失败:", e);
  }
}
async function addToDefaultList(song) {
  if (!currentListData || !currentListData.defaultList)
    return;
  try {
    const cleanedData = cleanSongData(song);
    const targetId = cleanedData.id;
    const list = currentListData.defaultList;
    const idx = list.findIndex((s) => s.id === targetId);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
    list.unshift(cleanedData);
    if (list.length > 200) {
      list.length = 200;
    }
    await pushDataChange();
    renderMyLists(currentListData);
  } catch (e) {
    console.error("[DefaultList] 添加失败:", e);
  }
}
function updatePlaylist(list, startIndex = 0, scope = "local_list", shouldAddToDefault = null) {
  if (!list || list.length === 0) {
    showError("播放列表为空");
    return;
  }
  if (settings.deduplicatePlaylistByQuality && window.QualityManager) {
    const targetSong = list[startIndex];
    const targetId = targetSong ? targetSong.songmid || targetSong.id : null;
    const deduplicated = [];
    const seenIds = new Map;
    list.forEach((song) => {
      const id = song.songmid || song.id;
      if (!id) {
        deduplicated.push(song);
        return;
      }
      const qualityAttr = song.quality || song.type || "128k";
      if (seenIds.has(id)) {
        const existingIdx = seenIds.get(id);
        const existingSong = deduplicated[existingIdx];
        const existingQuality = existingSong.quality || existingSong.type || "128k";
        const p1 = window.QualityManager.QUALITY_PRIORITY.indexOf(existingQuality);
        const p2 = window.QualityManager.QUALITY_PRIORITY.indexOf(qualityAttr);
        if (p2 !== -1 && (p1 === -1 || p2 < p1)) {
          deduplicated[existingIdx] = song;
        }
      } else {
        seenIds.set(id, deduplicated.length);
        deduplicated.push(song);
      }
    });
    if (targetId) {
      const newIndex = deduplicated.findIndex((s) => (s.songmid || s.id) === targetId);
      if (newIndex !== -1)
        startIndex = newIndex;
    }
    list = deduplicated;
  }
  currentPlaylist = [...list];
  currentPlayingScope = scope;
  playSong(currentPlaylist[startIndex], startIndex, null, false, false, shouldAddToDefault);
  console.log(`[Queue] 播放列表已更新 (${currentPlaylist.length} 首), 来源: ${scope}, 加入默认列表: ${shouldAddToDefault}`);
  if (!document.getElementById("queue-drawer").classList.contains("translate-x-full")) {
    renderQueue();
  }
}
window.updatePlaylist = updatePlaylist;
window.setImg = (id, src) => {
  const el = document.getElementById(id);
  if (el) {
    if (el.src.includes("logo.svg") && src && !src.includes("logo.svg")) {
      el.classList.add("is-placeholder");
      const handleLoad = () => {
        el.classList.remove("is-placeholder");
        el.removeEventListener("load", handleLoad);
        el.removeEventListener("error", handleLoad);
      };
      el.addEventListener("load", handleLoad);
      el.addEventListener("error", handleLoad);
    } else if (src && src.includes("logo.svg")) {
      el.classList.add("is-placeholder");
    } else {
      el.classList.remove("is-placeholder");
    }
    if (src)
      el.src = src;
    el.onerror = () => {
      el.src = "/music/assets/logo.svg";
      el.classList.add("is-placeholder");
    };
  }
};
function updatePlayerInfo(song, actualQuality) {
  const titleEl = document.getElementById("player-title");
  if (titleEl) {
    titleEl.innerText = song.name;
    titleEl.setAttribute("data-text", song.name);
    titleEl.classList.add("truncate");
    titleEl.classList.remove("overflow-hidden");
    titleEl.onclick = (e) => {
      e.stopPropagation();
      performSearch(song.name, song.source);
    };
    titleEl.classList.add("hover:text-emerald-500", "cursor-pointer", "transition-colors");
  }
  const sourceEl = document.getElementById("player-source");
  if (sourceEl) {
    if (song.source) {
      const resolvedQuality = actualQuality === undefined ? song === currentPlayingSong ? currentQuality : null : actualQuality;
      const qualityTags = resolvedQuality ? getQualityTags({ quality: resolvedQuality }) : "";
      sourceEl.innerHTML = getSourceTag(song.source) + qualityTags;
      sourceEl.classList.remove("hidden");
    } else {
      sourceEl.innerHTML = "";
      sourceEl.classList.add("hidden");
    }
  }
  const artistEl = document.getElementById("player-artist");
  if (artistEl) {
    artistEl.innerText = song.singer;
    artistEl.setAttribute("data-text", song.singer);
    artistEl.classList.add("truncate");
    artistEl.classList.remove("overflow-hidden");
    artistEl.onclick = async (e) => {
      e.stopPropagation();
      const singers = song.singer.split(/[、&,，]| \/ /).map((s) => s.trim()).filter((s) => s);
      if (singers.length > 1) {
        const selected = await showOptions("搜索歌手", "识别到多个歌手，请选择要搜索的对象：", singers);
        if (selected)
          performSearch(selected, song.source);
      } else {
        performSearch(song.singer, song.source);
      }
    };
    artistEl.classList.add("hover:text-emerald-500", "cursor-pointer", "transition-colors");
  }
  applyMarqueeChecks();
  const imgUrl = getImgUrl(song);
  setImg("player-cover", imgUrl);
  setImg("sidebar-cover", imgUrl);
  setImg("detail-cover", imgUrl);
  document.getElementById("sidebar-song-info").classList.remove("hidden");
  const sideSongName = document.getElementById("sidebar-song-name");
  if (sideSongName) {
    sideSongName.innerText = song.name;
    sideSongName.onclick = (e) => {
      e.stopPropagation();
      performSearch(song.name, song.source);
    };
    sideSongName.classList.add("hover:text-emerald-500", "cursor-pointer", "transition-colors");
  }
  const sideSinger = document.getElementById("sidebar-singer");
  if (sideSinger) {
    sideSinger.innerText = song.singer;
    sideSinger.onclick = (e) => {
      e.stopPropagation();
      performSearch(song.singer, song.source);
    };
    sideSinger.classList.add("hover:text-emerald-500", "cursor-pointer", "transition-colors");
  }
  const detailTitle = document.getElementById("detail-title");
  const detailContainer = document.getElementById("detail-title-container");
  if (detailTitle && detailContainer) {
    detailTitle.innerText = song.name;
    detailTitle.classList.remove("animate-marquee");
    detailTitle.onclick = (e) => {
      e.stopPropagation();
      if (window.innerWidth < 1025) {
        toggleDetailCover();
      } else {
        performSearch(song.name, song.source);
      }
    };
    detailTitle.classList.add("hover:text-emerald-500", "cursor-pointer", "transition-colors");
  }
  const detailArtist = document.getElementById("detail-artist");
  if (detailArtist) {
    detailArtist.innerText = song.singer;
    detailArtist.onclick = async (e) => {
      e.stopPropagation();
      if (window.innerWidth < 1025) {
        toggleDetailCover();
      } else {
        const singers = song.singer.split(/[、&,，]| \/ /).map((s) => s.trim()).filter((s) => s);
        if (singers.length > 1) {
          const selected = await showOptions("搜索歌手", "识别到多个歌手，请选择要搜索的对象：", singers);
          if (selected)
            performSearch(selected, song.source);
        } else {
          performSearch(song.singer, song.source);
        }
      }
    };
    detailArtist.classList.add("hover:text-emerald-500", "cursor-pointer", "transition-colors");
  }
  const btnLike = document.getElementById("player-like-btn");
  let isCollected = false;
  const activeListData = isUserLoggedIn() ? window.myPersonalListData || currentListData : currentListData;
  if (activeListData && song) {
    const cleanedSong = cleanSongData(song);
    if (cleanedSong) {
      const targetId = cleanedSong.id;
      if (activeListData.loveList && activeListData.loveList.some((s) => s.id === targetId))
        isCollected = true;
      if (!isCollected && activeListData.userList && activeListData.userList.some((ul) => ul.list.some((s) => s.id === targetId)))
        isCollected = true;
    }
  }
  btnLike.onclick = (e) => {
    e.stopPropagation();
    openPlaylistAddModal();
  };
  if (isCollected) {
    btnLike.classList.add("text-red-500");
    btnLike.classList.remove("text-gray-300");
  } else {
    btnLike.classList.remove("text-red-500");
    btnLike.classList.add("text-gray-300");
  }
}
async function togglePlay() {
  if (window.playBtnIsLongPress) {
    window.playBtnIsLongPress = false;
    return;
  }
  if (audio.paused) {
    try {
      if (settings.enableCrossfade) {
        audio.volume = 0;
      }
      await audio.play();
      updatePlayButton(true);
      if (settings.enableCrossfade) {
        fadeVolume(typeof currentVolume !== "undefined" ? currentVolume : 1, 600);
      }
    } catch (e) {
      console.error("[Player] Play blocked:", e);
    }
  } else {
    if (settings.enableCrossfade) {
      await fadeVolume(0, 600);
    }
    audio.pause();
    if (window._autoSkipTimer) {
      clearTimeout(window._autoSkipTimer);
      window._autoSkipTimer = null;
    }
    updatePlayButton(false);
  }
}
function updatePlayButton(isPlaying) {
  const btn = document.getElementById("btn-play");
  btn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play ml-1"></i>';
}
function playNext(depth = 0) {
  if (depth > 10) {
    console.warn("[Queue] Too many unplayable songs skipped, stopping.");
    return;
  }
  const nextIndex = getNextIndex();
  if (nextIndex !== -1 && currentPlaylist[nextIndex]) {
    const nextSong = currentPlaylist[nextIndex];
    if (nextSong._unplayable && nextIndex !== currentIndex) {
      console.log(`[Queue] Auto-skipping unplayable song [${nextIndex}]: ${nextSong.name}`);
      currentIndex = nextIndex;
      return playNext(depth + 1);
    }
    playSong(nextSong, nextIndex);
  } else {
    console.log("[Queue] No next song or reached end of order playlist");
  }
}
function playPrev() {
  if (currentPlaylist.length === 0)
    return;
  let prevIndex;
  switch (playMode) {
    case "single":
      prevIndex = currentIndex;
      break;
    case "random":
      if (currentPlaylist.length === 1) {
        prevIndex = 0;
      } else {
        do {
          prevIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (prevIndex === currentIndex);
      }
      break;
    case "order":
    case "list":
    default:
      prevIndex = currentIndex - 1;
      if (prevIndex < 0)
        prevIndex = currentPlaylist.length - 1;
      break;
  }
  playSong(currentPlaylist[prevIndex], prevIndex);
}
var volumeFadeInterval = null;
function fadeVolume(targetVolume, duration = 800) {
  if (volumeFadeInterval)
    clearInterval(volumeFadeInterval);
  const startVolume = audio.volume;
  const steps = 20;
  const increment = (targetVolume - startVolume) / steps;
  const stepTime = duration / steps;
  let currentStep = 0;
  return new Promise((resolve) => {
    volumeFadeInterval = setInterval(() => {
      currentStep++;
      let nextVolume = startVolume + increment * currentStep;
      if (nextVolume < 0)
        nextVolume = 0;
      if (nextVolume > 1)
        nextVolume = 1;
      audio.volume = nextVolume;
      if (currentStep >= steps) {
        clearInterval(volumeFadeInterval);
        audio.volume = targetVolume;
        resolve();
      }
    }, stepTime);
  });
}
audio.addEventListener("timeupdate", () => {
  if (isDragging === "progress")
    return;
  const current = audio.currentTime;
  const duration = audio.duration;
  if (settings.enableCrossfade && duration > 5 && duration - current < 1) {
    if (!window._isFadingOut) {
      window._isFadingOut = true;
      fadeVolume(0, 1000);
    }
  } else if (duration - current > 1.5) {
    window._isFadingOut = false;
  }
  document.getElementById("time-current").innerText = formatTime(current);
  document.getElementById("time-total").innerText = formatTime(duration);
  const pct = current / duration * 100;
  document.getElementById("progress-bar").style.width = `${pct}%`;
  const now = Date.now();
  if ("mediaSession" in navigator && (!window._lastMedPosUpdate || now - window._lastMedPosUpdate > 1000)) {
    updatePositionState();
    window._lastMedPosUpdate = now;
  }
  if (settings.autoResume && (!window._lastStateSave || now - window._lastStateSave > 5000)) {
    savePlaybackState();
    window._lastStateSave = now;
  }
});
var noSleepInstance = null;
function toggleNoSleep(enable) {
  if (typeof NoSleep === "undefined")
    return;
  if (!noSleepInstance) {
    noSleepInstance = new NoSleep;
  }
  if (enable && settings.keepScreenAwake) {
    if (!noSleepInstance.isEnabled) {
      noSleepInstance.enable().catch((e) => console.warn("[NoSleep] 启用失败:", e));
    }
  } else {
    if (noSleepInstance && noSleepInstance.isEnabled) {
      noSleepInstance.disable();
    }
  }
}
audio.addEventListener("play", () => {
  toggleNoSleep(true);
  audio.playbackRate = currentPlaybackRate;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "playing";
    updatePositionState();
  }
  setPlayerStatus("", true);
  updatePlayButton(true);
  if (lyricPlayer) {
    isUserScrolling = false;
    const indicator = document.getElementById("lyric-scroll-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.style.display = "none";
    }
  }
});
audio.addEventListener("playing", () => {
  setPlayerStatus("", true);
  if ("mediaSession" in navigator) {
    updatePositionState();
    setTimeout(updatePositionState, 500);
    setTimeout(updatePositionState, 1200);
  }
  if (lyricPlayer) {
    lyricPlayer.play(audio.currentTime * 1000);
    isUserScrolling = false;
    scrollToActiveLine(true);
  }
});
audio.addEventListener("pause", () => {
  toggleNoSleep(false);
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "paused";
  }
  setPlayerStatus("", false);
  updatePlayButton(false);
  if (lyricPlayer) {
    lyricPlayer.pause();
  }
  if (wordAnimationId)
    cancelAnimationFrame(wordAnimationId);
  if (settings.autoResume)
    savePlaybackState();
});
function savePlaybackState() {
  if (!currentPlayingSong)
    return;
  try {
    const state = {
      song: currentPlayingSong,
      index: currentIndex,
      time: audio.currentTime,
      scope: currentPlayingScope,
      listId: window.currentViewingListId,
      playlist: currentPlaylist ? currentPlaylist.slice(0, 300) : null,
      playMode,
      quality: currentQuality,
      timestamp: Date.now()
    };
    localStorage.setItem("lx_playback_state", JSON.stringify(state));
  } catch (e) {
    console.error("[Resume] 无法保存播放状态:", e);
  }
}
async function restorePlaybackState() {
  if (!settings.autoResume) {
    return;
  }
  try {
    const saved = localStorage.getItem("lx_playback_state");
    if (!saved) {
      return;
    }
    const state = JSON.parse(saved);
    if (!state || !state.song) {
      return;
    }
    console.log("[Resume] 正在恢复上次内容:", state.song.name, "队列长度:", state.playlist ? state.playlist.length : 0);
    if (state.playMode) {
      playMode = state.playMode;
      updatePlayModeUI();
    }
    if (state.playlist && state.playlist.length > 0) {
      currentPlaylist = state.playlist;
      currentPlayingScope = state.scope || "network";
    } else if (["local_list", "local_all", "songlist"].includes(state.scope)) {
      currentPlayingScope = state.scope;
      window.currentViewingListId = state.listId || "default";
    }
    currentIndex = state.index >= 0 ? state.index : 0;
    currentPlayingSong = state.song;
    window.currentPlayingSong = state.song;
    currentQuality = state.quality || null;
    updatePlayerInfo(state.song, currentQuality);
    updateMediaSessionMetadata(state.song);
    renderQueue();
    const resumeTime = state.time || 0;
    window._resumeInfo = {
      time: resumeTime,
      song: state.song
    };
    setTimeout(() => {
      if (state.scope === "network") {
        renderResults(currentPlaylist);
      } else if (state.scope === "local_list" || state.scope === "local_all") {
        window._pendingResumeListId = state.listId || "default";
      }
      playSong(state.song, currentIndex, null, true);
    }, 800);
  } catch (e) {
    console.error("[Resume] 恢复播放状态失败:", e);
  }
}
function updatePositionState() {
  if ("mediaSession" in navigator && navigator.mediaSession.setPositionState) {
    const duration = audio.duration;
    const currentTime = audio.currentTime;
    if (Number.isFinite(duration) && duration > 0) {
      try {
        const pos = Math.max(0, Math.min(currentTime, duration));
        if (audio.paused) {
          navigator.mediaSession.playbackState = "paused";
        } else {
          navigator.mediaSession.playbackState = "playing";
        }
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: audio.playbackRate || 1,
          position: pos
        });
      } catch (e) {
        console.warn("[MediaSession] Failed to update position state:", e);
      }
    }
  }
}
window.updatePositionState = updatePositionState;
audio.addEventListener("ended", () => {
  playNext();
});
audio.addEventListener("canplay", () => {
  if ("mediaSession" in navigator) {
    updatePositionState();
  }
});
audio.addEventListener("loadedmetadata", updatePositionState);
audio.addEventListener("ratechange", updatePositionState);
audio.addEventListener("seeked", () => {
  updatePositionState();
  setTimeout(updatePositionState, 200);
  if (lyricPlayer) {
    if (!audio.paused) {
      lyricPlayer.play(audio.currentTime * 1000);
    } else {
      lyricPlayer.pause();
      const time = audio.currentTime * 1000;
      const lineNum = lyricPlayer._findCurLineNum(time);
      if (lineNum !== undefined && lineNum >= 0) {
        syncLyricByLineNum(lineNum);
      }
    }
  }
});
audio.addEventListener("waiting", () => {
  setPlayerStatus("缓冲歌曲中", null, true);
  if (lyricPlayer) {
    lyricPlayer.pause();
  }
});
audio.addEventListener("stalled", () => {
  setPlayerStatus("缓冲歌曲中", null, true);
});
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => {
    togglePlay();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    togglePlay();
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    playPrev();
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    playNext();
  });
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime != null) {
      audio.currentTime = details.seekTime;
      updatePositionState();
    }
  });
}
function updateMediaSessionMetadata(song) {
  if (!("mediaSession" in navigator))
    return;
  const imgUrl = getImgUrl(song);
  const fullImgUrl = new URL(imgUrl, window.location.href).href;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.name,
      artist: song.singer,
      album: song.albumName || "",
      artwork: [
        { src: fullImgUrl, sizes: "96x96", type: "image/jpeg" },
        { src: fullImgUrl, sizes: "128x128", type: "image/jpeg" },
        { src: fullImgUrl, sizes: "192x192", type: "image/jpeg" },
        { src: fullImgUrl, sizes: "256x256", type: "image/jpeg" },
        { src: fullImgUrl, sizes: "384x384", type: "image/jpeg" },
        { src: fullImgUrl, sizes: "512x512", type: "image/jpeg" }
      ]
    });
  } catch (e) {
    console.warn("[MediaSession] Failed to update metadata:", e);
  }
}
function seek(e) {
  if (!audio.duration || !Number.isFinite(audio.duration))
    return;
  const container = document.getElementById("progress-container");
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  const time = pct * audio.duration;
  if (Number.isFinite(time)) {
    audio.currentTime = time;
  }
}
var currentVolume = 0.75;
var isMuted = false;
audio.volume = currentVolume;
updateVolumeUI();
function setVolume(e) {
  const container = document.getElementById("volume-container");
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  currentVolume = pct;
  audio.volume = currentVolume;
  isMuted = false;
  updateVolumeUI();
  try {
    localStorage.setItem("lx_volume", currentVolume.toString());
  } catch (e) {
    console.error("[Volume] 保存音量失败:", e);
  }
}
function toggleMute() {
  isMuted = !isMuted;
  audio.muted = isMuted;
  updateVolumeUI();
}
function updateVolumeUI() {
  const volumeBar = document.getElementById("volume-bar");
  const volumeIcon = document.getElementById("volume-icon");
  if (volumeBar) {
    const displayVolume = isMuted ? 0 : currentVolume;
    volumeBar.style.width = `${displayVolume * 100}%`;
  }
  if (volumeIcon) {
    if (isMuted || currentVolume === 0) {
      volumeIcon.className = "fas fa-volume-mute w-4";
    } else if (currentVolume < 0.5) {
      volumeIcon.className = "fas fa-volume-down w-4";
    } else {
      volumeIcon.className = "fas fa-volume-up w-4";
    }
  }
}
var playMode = "list";
function setPlayMode(mode) {
  playMode = mode;
  preSelectedNextIndex = null;
  updatePlayModeUI();
  try {
    localStorage.setItem("lx_play_mode", mode);
  } catch (e) {
    console.error("[PlayMode] 保存播放模式失败:", e);
  }
  const menu = document.getElementById("play-mode-menu");
  if (menu)
    menu.classList.remove("force-visible");
  showSuccess(`播放模式：${getPlayModeName(mode)}`);
}
document.addEventListener("click", (e) => {
  const pmMenu = document.getElementById("play-mode-menu");
  const pmBtn = document.getElementById("play-mode-btn");
  if (pmMenu && pmBtn && !pmMenu.contains(e.target) && !pmBtn.contains(e.target)) {
    pmMenu.classList.remove("force-visible");
  }
  const prMenu = document.getElementById("playback-rate-menu");
  const prBtn = document.getElementById("playback-rate-btn");
  if (prMenu && prBtn && !prMenu.contains(e.target) && !prBtn.contains(e.target)) {
    prMenu.classList.remove("force-visible");
  }
});
function updatePlayModeUI() {
  const btn = document.getElementById("play-mode-btn");
  const options = document.querySelectorAll(".play-mode-option");
  if (btn) {
    const icons = {
      list: "fa-redo",
      single: "fa-redo-alt",
      random: "fa-random",
      order: "fa-play"
    };
    const colors = {
      list: "text-emerald-500",
      single: "text-blue-500",
      random: "text-purple-500",
      order: "text-gray-500"
    };
    const icon = btn.querySelector("i");
    if (icon) {
      icon.className = `fas ${icons[playMode]}`;
      btn.className = `${colors[playMode]} hover:opacity-80 transition-colors`;
      btn.title = getPlayModeName(playMode);
    }
  }
  options.forEach((opt) => {
    if (opt.dataset.mode === playMode) {
      opt.classList.add("active-option", "font-bold");
    } else {
      opt.classList.remove("active-option", "font-bold");
    }
  });
}
function getPlayModeName(mode) {
  const names = {
    list: "列表循环",
    single: "单曲循环",
    random: "随机播放",
    order: "顺序播放"
  };
  return names[mode] || "未知";
}
function formatTime(s) {
  if (!s || isNaN(s))
    return "00:00";
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${min < 10 ? "0" + min : min}:${sec < 10 ? "0" + sec : sec}`;
}
function loadSettings() {
  try {
    const saved = localStorage.getItem("lx_settings");
    if (saved) {
      const loaded = JSON.parse(saved);
      settings = normalizeStoredSettings({ ...settings, ...loaded });
      console.log("[Settings] 加载设置成功:", settings);
    }
  } catch (e) {
    console.error("[Settings] 加载设置失败:", e);
  }
  syncSettingsUI();
  setupNetworkListAutoCheck();
}
var seekTimer = null;
var isLongPress = false;
function handleSeekKey(direction, action) {
  if (action === "down") {
    if (seekTimer)
      return;
    let delta = direction === "forward" ? 10 : -10;
    if (audio.duration && Number.isFinite(audio.duration)) {
      delta = audio.duration * (direction === "forward" ? 0.05 : -0.05);
    }
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
    seekTimer = setTimeout(() => {
      isLongPress = true;
      seekTimer = setInterval(() => {
        const step = direction === "forward" ? 2 : -2;
        audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + step));
      }, 100);
    }, 500);
  } else {
    if (seekTimer) {
      if (isLongPress)
        clearInterval(seekTimer);
      else
        clearTimeout(seekTimer);
      seekTimer = null;
      isLongPress = false;
    }
  }
}
function changeVolume(delta) {
  currentVolume = Math.max(0, Math.min(1, currentVolume + delta));
  audio.volume = currentVolume;
  isMuted = false;
  updateVolumeUI();
  try {
    localStorage.setItem("lx_volume", currentVolume.toString());
  } catch (e) {}
}
document.addEventListener("keydown", (e) => {
  if (!settings.enableKeyboardShortcuts)
    return;
  const target = e.target;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    return;
  }
  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowUp":
      e.preventDefault();
      changeVolume(0.05);
      break;
    case "ArrowDown":
      e.preventDefault();
      changeVolume(-0.05);
      break;
    case "ArrowLeft":
      e.preventDefault();
      handleSeekKey("backward", "down");
      break;
    case "ArrowRight":
      e.preventDefault();
      handleSeekKey("forward", "down");
      break;
    case "BracketLeft":
      playPrev();
      break;
    case "BracketRight":
      playNext();
      break;
    case "KeyL":
      toggleLyrics();
      break;
    case "Digit1":
      if (e.altKey)
        switchTab("search");
      break;
    case "Digit2":
      if (e.altKey)
        switchTab("songlist");
      break;
    case "Digit3":
      if (e.altKey)
        switchTab("leaderboard");
      break;
    case "Digit4":
      if (e.altKey)
        switchTab("favorites");
      break;
    case "Digit5":
      if (e.altKey)
        switchTab("settings");
      break;
    case "Digit6":
      if (e.altKey)
        switchTab("about");
      break;
    case "KeyF":
      updateSetting("showFooterVisualizer", !settings.showFooterVisualizer);
      break;
    case "KeyG":
      updateSetting("showDetailVisualizer", !settings.showDetailVisualizer);
      break;
    case "KeyH":
      if (typeof toggleCacheDrawer === "function")
        toggleCacheDrawer();
      break;
    case "KeyJ":
      if (typeof toggleDownloadDrawer === "function")
        toggleDownloadDrawer();
      break;
  }
});
document.addEventListener("keyup", (e) => {
  if (!settings.enableKeyboardShortcuts)
    return;
  if (e.code === "ArrowLeft")
    handleSeekKey("backward", "up");
  if (e.code === "ArrowRight")
    handleSeekKey("forward", "up");
});
function getRemasterStorageUsername() {
  const username = currentListData?.username || localStorage.getItem("lx_sync_user") || "_open";
  return !username || username === "default" ? "_open" : username;
}
async function toggleRemasterFeature(enabled) {
  const toggle = document.getElementById("setting-enable-remaster");
  try {
    await updateSetting("enableRemaster", !!enabled);
    if (toggle)
      toggle.checked = !!window.settings?.enableRemaster;
    window.LocalMusicManager?.syncRemasterVisibility();
  } catch (e) {
    if (toggle)
      toggle.checked = !!window.settings?.enableRemaster;
    showError(e.message || "更新洗版设置失败");
  }
}
window.getRemasterStorageUsername = getRemasterStorageUsername;
window.toggleRemasterFeature = toggleRemasterFeature;
async function updateSetting(key, value) {
  if (SETTINGS_UI_MAP[key]?.normalize) {
    value = SETTINGS_UI_MAP[key].normalize(value);
  }
  const restrictedKeys = ["enableServerCache", "enableServerLyricCache", "serverCacheLocation", "serverCacheNamingPattern", "downloadConcurrency", "enableOnlyDownloadMode", "enableRemaster", "preferredQuality", "enablePublicSources", "embedLyricToFile", "preferServerCache"];
  const isPublic = !isUserLoggedIn() || currentListData?.username === "_open" || currentListData?.username === "default" || window.isViewingPublicFavorites;
  const enablePublicRestriction = window.lx_config?.["user.enablePublicRestriction"];
  const enableLoginCacheRestriction = window.lx_config?.["user.enableLoginCacheRestriction"];
  const isAdmin = !!localStorage.getItem("lx_admin_password");
  const isRestricted = !isAdmin && (isPublic && enablePublicRestriction || !isPublic && enableLoginCacheRestriction);
  if (restrictedKeys.includes(key) && isRestricted) {
    showError("权限不足：公开受限模式下修改该设置项受限，请先验证管理员身份。");
    const authorized = await handleAdminAuth("该设置项受限，请输入管理员密码以修改");
    if (!authorized) {
      syncSettingsUI(key, settings[key]);
      return;
    }
  }
  if (key === "networkListAutoCheckInterval") {
    const intervalMs = parseNetworkListAutoCheckInterval(value);
    if (intervalMs === null) {
      showError("无效的自动检测间隔，请使用 30m / 6h / 1d 等格式");
      syncSettingsUI(key, settings[key]);
      return;
    }
  }
  settings[key] = value;
  window.settings = settings;
  try {
    localStorage.setItem("lx_settings", JSON.stringify(settings));
    console.log(`[Settings] ${key} 已更新为:`, value);
  } catch (e) {
    console.error("[Settings] 保存设置失败:", e);
  }
  syncSettingsUI(key, value);
  if (key === "networkListAutoCheckInterval" || key === "autoUpdateNetworkList") {
    setupNetworkListAutoCheck();
  }
  if (settings.saveAccountSettingsToFile) {
    pushSettingsToServer();
  }
  if (key.includes("Visualizer") || key.startsWith("visualizer")) {
    if (window.musicVisualizer) {
      if (typeof audio !== "undefined" && !audio.paused && (settings.showFooterVisualizer || settings.showDetailVisualizer)) {
        window.musicVisualizer.init();
      }
      window.musicVisualizer.applySettings();
    }
    if (key === "visualizerOpacity") {
      const el = document.getElementById("visualizer-opacity-value");
      if (el)
        el.innerText = value;
    }
  }
  if (key === "playerBackground") {
    applyPlayerBackground(value);
  }
  if (key === "enablePublicSources") {
    if (typeof updateSourceScopeUI === "function")
      updateSourceScopeUI();
    if (typeof renderCustomSources === "function")
      renderCustomSources();
  }
}
var SETTINGS_UI_MAP = {
  defaultEntry: { id: "setting-default-entry", type: "value" },
  switchPlaylistOnSearchPlay: { id: "setting-switch-playlist-search", type: "checkbox" },
  switchPlaylistOnSongListPlay: { id: "setting-switch-playlist-songlist", type: "checkbox" },
  autoResume: { id: "setting-auto-resume", type: "checkbox" },
  autoCompactPlaybar: { id: "setting-auto-compact-playbar", type: "checkbox" },
  enableAutoSwitchSource: { id: "setting-auto-switch-source", type: "checkbox" },
  enableAutoSwitchApiSource: { id: "setting-auto-switch-api-source", type: "checkbox" },
  enableAutoSkipOnError: { id: "setting-auto-skip-on-error", type: "checkbox" },
  enableAutoDegradeQuality: { id: "setting-auto-degrade-quality", type: "checkbox" },
  playbackErrorPriority: { id: "setting-playback-error-priority", type: "value" },
  enablePreloader: { id: "setting-enable-preloader", type: "checkbox" },
  deduplicatePlaylistByQuality: { id: "setting-deduplicate-playlist", type: "checkbox" },
  enableSmtcLyric: {
    id: "setting-enable-smtc-lyric",
    type: "checkbox",
    action: (v) => {
      if (!v && "mediaSession" in navigator && navigator.mediaSession.metadata && currentPlayingSong) {
        try {
          navigator.mediaSession.metadata.title = currentPlayingSong.name;
          navigator.mediaSession.metadata.artist = currentPlayingSong.singer;
        } catch (e) {}
      }
    }
  },
  downloadConcurrency: {
    id: "setting-download-concurrency",
    type: "value",
    normalize: normalizeDownloadConcurrency,
    action: (v) => {
      if (window.SystemDownloadManager) {
        window.SystemDownloadManager.updateMaxConcurrent(v);
      }
    }
  },
  enableRemaster: {
    id: "setting-enable-remaster",
    type: "checkbox",
    action: () => window.LocalMusicManager?.syncRemasterVisibility()
  },
  enableKeyboardShortcuts: { id: "setting-enable-shortcuts", type: "checkbox" },
  enableCrossfade: { id: "setting-enable-crossfade", type: "checkbox" },
  keepScreenAwake: {
    id: "setting-keep-screen-awake",
    type: "checkbox",
    action: (v) => toggleNoSleep(v && !audio.paused)
  },
  enablePersistentToken: {
    id: "setting-enable-persistent-token",
    type: "checkbox",
    action: (v) => {
      const container = document.getElementById("token-list-container");
      if (container) {
        if (v) {
          container.classList.remove("hidden", "opacity-50", "pointer-events-none");
        } else {
          container.classList.add("hidden", "opacity-50", "pointer-events-none");
        }
      }
    }
  },
  showSidebarSongInfo: {
    id: "setting-show-sidebar-info",
    type: "checkbox",
    action: (v) => {
      const sidebarInfo = document.querySelector(".sidebar-song-info-wrapper");
      if (sidebarInfo)
        v ? sidebarInfo.classList.add("md:block") : sidebarInfo.classList.remove("md:block");
    }
  },
  showLyricTranslation: {
    id: "setting-show-lyric-translation",
    type: "checkbox",
    action: () => lyricPlayer && currentRawLrc && applyLyricUpdate()
  },
  showLyricRoma: {
    id: "setting-show-lyric-roma",
    type: "checkbox",
    action: () => lyricPlayer && currentRawLrc && applyLyricUpdate()
  },
  swapLyricTransRoma: {
    id: "setting-swap-lyric-trans-roma",
    type: "checkbox",
    action: () => lyricPlayer && currentRawLrc && applyLyricUpdate()
  },
  enableLyricGlow: {
    id: "setting-enable-lyric-glow",
    type: "checkbox",
    action: (v) => {
      const dv = document.getElementById("view-player-detail");
      if (dv)
        v ? dv.classList.add("enable-lyric-glow") : dv.classList.remove("enable-lyric-glow");
      const lc = document.getElementById("lyric-content");
      if (lc)
        v ? lc.classList.add("enable-lyric-glow") : lc.classList.remove("enable-lyric-glow");
    }
  },
  playerBackground: {
    id: "setting-player-background",
    type: "value",
    action: (v) => applyPlayerBackground(v)
  },
  lyricFontSize: {
    id: "lyric-font-size-slider",
    type: "value",
    action: (v) => {
      const valEl = document.getElementById("lyric-font-size-value");
      if (valEl)
        valEl.innerText = v;
      document.documentElement.style.setProperty("--lyric-font-size", `${v}rem`);
    }
  },
  lyricFontFamily: {
    id: "lyric-font-family-select",
    type: "value",
    action: (v) => document.documentElement.style.setProperty("--lyric-font-family", v || "inherit")
  },
  showFooterVisualizer: { id: "setting-show-footer-visualizer", type: "checkbox" },
  footerVisualizerStyle: { id: "setting-footer-visualizer-style", type: "value" },
  showDetailVisualizer: { id: "setting-show-detail-visualizer", type: "checkbox" },
  detailVisualizerStyle: { id: "setting-detail-visualizer-style", type: "value" },
  visualizerGlobalStyle: { id: "setting-visualizer-global-style", type: "value" },
  visualizerOpacity: {
    id: "setting-visualizer-opacity",
    type: "value",
    action: (v) => {
      const valEl = document.getElementById("visualizer-opacity-value");
      if (valEl)
        valEl.innerText = v;
    }
  },
  autoUpdateNetworkList: { id: "setting-auto-update-list", type: "checkbox" },
  networkListAutoCheckInterval: { id: "setting-network-list-auto-check-interval", type: "value" },
  saveAccountSettingsToFile: { id: "setting-save-settings-to-file", type: "checkbox" },
  enableLyricCache: { id: "setting-enable-lyric-cache", type: "checkbox" },
  enableSongUrlCache: { id: "setting-enable-url-cache", type: "checkbox" },
  enableServerCache: { id: "setting-enable-server-cache", type: "checkbox" },
  enableServerLyricCache: { id: "setting-enable-server-lyric-cache", type: "checkbox" },
  embedLyricToFile: { id: "setting-embed-lyric-to-file", type: "checkbox" },
  preferServerCache: { id: "setting-prefer-server-cache", type: "checkbox" },
  enableOnlyDownloadMode: { id: "setting-only-download-mode", type: "checkbox" },
  serverCacheLocation: { id: "setting-server-cache-location", type: "value" },
  serverCacheNamingPattern: {
    id: "setting-server-cache-naming",
    type: "value",
    normalize: (value) => value === "standard" ? "standard" : "simple"
  },
  enableProxyPlayback: { id: "toggle-proxy-playback", type: "checkbox" },
  enableProxyDownload: { id: "toggle-proxy-download", type: "checkbox" },
  enableAutoProxy: { id: "toggle-auto-proxy", type: "checkbox" },
  enableCustomProxy: {
    id: "toggle-custom-proxy",
    type: "checkbox",
    action: (v) => {
      const row = document.getElementById("custom-proxy-url-row");
      if (row)
        row.classList.toggle("hidden", !v);
    }
  },
  customProxyUrl: { id: "custom-proxy-url-input", type: "value" },
  enablePublicSources: { id: "toggle-public-sources", type: "checkbox" },
  preferredQuality: {
    id: "quality-select",
    type: "value",
    action: (v, isSingle) => {
      if (isSingle && window.showSuccess && window.QualityManager) {
        window.showSuccess(`默认音质已设置为: ${window.QualityManager.getQualityDisplayName(v)}`);
      }
    }
  },
  hotSearchLimit: {
    id: "hot-search-limit-input",
    type: "value",
    action: () => document.getElementById("search-results-header")?.classList.contains("hidden") && showInitialSearchState()
  },
  itemsPerPage: { id: "items-per-page-select", type: "value" },
  enableClientModeSync: { id: "setting-client-mode-sync", type: "checkbox" }
};
function syncSettingsUI(key = null, value = null) {
  const isPublic = !isUserLoggedIn() || currentListData?.username === "_open" || currentListData?.username === "default" || window.isViewingPublicFavorites;
  const enablePublicRestriction = window.lx_config?.["user.enablePublicRestriction"];
  const enableLoginCacheRestriction = window.lx_config?.["user.enableLoginCacheRestriction"];
  const isAdmin = !!localStorage.getItem("lx_admin_password");
  const restrictedKeys = ["enableServerCache", "enableServerLyricCache", "serverCacheLocation", "serverCacheNamingPattern", "downloadConcurrency", "enableOnlyDownloadMode", "enableRemaster", "preferredQuality", "enablePublicSources", "embedLyricToFile", "preferServerCache"];
  const updateItem = (itemKey, itemValue, isSingle) => {
    const config = SETTINGS_UI_MAP[itemKey];
    if (!config)
      return;
    if (config.normalize)
      itemValue = config.normalize(itemValue);
    if (settings[itemKey] !== itemValue) {
      settings[itemKey] = itemValue;
      window.settings = settings;
    }
    const el = document.getElementById(config.id);
    if (el) {
      if (config.type === "checkbox")
        el.checked = !!itemValue;
      else
        el.value = itemValue;
      const isRestricted = !isAdmin && (isPublic && enablePublicRestriction || !isPublic && enableLoginCacheRestriction);
      if (restrictedKeys.includes(itemKey) && isRestricted) {
        el.disabled = true;
        const container = el.closest(".flex.items-center.justify-between") || el.closest(".setting-item") || el.parentElement;
        if (container)
          container.classList.add("opacity-40", "pointer-events-none");
      } else if (restrictedKeys.includes(itemKey)) {
        el.disabled = false;
        const container = el.closest(".flex.items-center.justify-between") || el.closest(".setting-item") || el.parentElement;
        if (container)
          container.classList.remove("opacity-40", "pointer-events-none");
      }
    }
    if (config.action)
      config.action(itemValue, isSingle);
  };
  if (typeof updateAdminUI === "function")
    updateAdminUI();
  if (key !== null && value !== null) {
    updateItem(key, value, true);
  } else {
    Object.keys(SETTINGS_UI_MAP).forEach((itemKey) => {
      const val = settings[itemKey];
      if (val !== undefined) {
        updateItem(itemKey, val, false);
      }
    });
  }
  updateStorageStatsUI();
  updateServerCacheSize();
}
function applyPlayerBackground(mode) {
  const detailBg = document.getElementById("view-player-detail");
  const bgCover = document.getElementById("detail-bg-cover");
  const bgOverlay = document.getElementById("player-detail-bg-overlay");
  if (!detailBg || !bgCover || !bgOverlay)
    return;
  console.log(`[PlayerBackground] Applying style: ${mode}`);
  bgCover.style.display = "block";
  bgOverlay.className = "absolute inset-0 t-bg-panel/30 backdrop-blur-3xl";
  bgOverlay.style.backgroundColor = "";
  bgOverlay.style.backdropFilter = "";
  detailBg.style.backgroundColor = "";
  if (mode === "solid") {
    bgCover.style.display = "none";
    bgOverlay.className = "absolute inset-0 t-bg-panel";
    bgOverlay.style.backdropFilter = "none";
  } else if (mode === "dark") {
    bgCover.style.display = "none";
    bgOverlay.className = "absolute inset-0";
    bgOverlay.style.backgroundColor = "#000000";
    bgOverlay.style.backdropFilter = "none";
  }
}
async function calcStorageUsage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const total = estimate.usage || 0;
      if (total > 0) {
        if (total < 1024)
          return total + " B";
        if (total < 1024 * 1024)
          return (total / 1024).toFixed(2) + " KB";
        return (total / (1024 * 1024)).toFixed(2) + " MB";
      }
    }
  } catch (e) {
    console.warn("[Storage] 无法使用 Storage Estimate API:", e);
  }
  let total = 0;
  for (let x in localStorage) {
    if (!localStorage.hasOwnProperty(x))
      continue;
    const val = localStorage.getItem(x);
    if (val)
      total += (x.length + val.length) * 2;
  }
  if (total < 1024)
    return total + " B";
  if (total < 1024 * 1024)
    return (total / 1024).toFixed(2) + " KB";
  return (total / (1024 * 1024)).toFixed(2) + " MB";
}
async function updateStorageStatsUI() {
  const el = document.getElementById("storage-usage-info");
  if (el) {
    el.innerText = await calcStorageUsage();
  }
}
async function resetAllSettings() {
  const ok = await showSelect("重置所有设置", "确定要重置吗？这不会删除您的歌单，但会恢复音质、列表显示、主题等设置到默认状态。 (Restore all settings to default?)", { danger: true });
  if (!ok)
    return;
  try {
    settings = { ...DEFAULT_SETTINGS };
    window.settings = settings;
    localStorage.setItem("lx_settings", JSON.stringify(settings));
    localStorage.removeItem("lx_playback_state");
    if (settings.saveAccountSettingsToFile) {
      await pushSettingsToServer();
    }
    showSuccess("设置已重置，正在重新加载页面...");
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (e) {
    showError("重置失败: " + e.message);
  }
}
async function clearCache(type) {
  if (!await showSelect("清除缓存", "确定要清除本地缓存吗？", { danger: true }))
    return;
  let clearServerLyric = false;
  if (type === "lyric") {
    clearServerLyric = await showSelect("清除缓存", "是否同时清除本地缓存文件夹内的歌词LRC文件？", { danger: true });
    if (clearServerLyric) {
      const isLogined = !!localStorage.getItem("lx_user_token");
      const isPublicUser = !window.currentListData || !window.currentListData.username || window.currentListData.username === "default";
      if (isPublicUser && window.lx_config && window.lx_config["user.enablePublicRestriction"] && !isLogined) {
        const isAdminSession = localStorage.getItem("lx_admin_password");
        const enableServerLyricCache = window.settings && window.settings.enableServerLyricCache === true;
        if (!enableServerLyricCache && !isAdminSession) {
          if (typeof window.handleAdminAuth === "function") {
            const authorized = await window.handleAdminAuth("清除服务器歌词缓存需要管理员身份");
            if (!authorized) {
              clearServerLyric = false;
            }
          } else {
            showError("清除服务器歌词缓存受限，需要管理员身份");
            clearServerLyric = false;
          }
        }
      }
    }
  }
  let count = 0;
  const keysToRemove = [];
  for (let i = 0;i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (type === "lyric" && key.startsWith("lx_lyric_")) {
      keysToRemove.push(key);
    } else if (type === "url" && key.startsWith("lx_url_")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => {
    localStorage.removeItem(k);
    count++;
  });
  updateStorageStatsUI();
  const mapFromName = { lyric: "歌词", url: "链接" };
  showSuccess(`已清除 ${count} 条${mapFromName[type] || ""}本地缓存`);
  if (clearServerLyric) {
    try {
      const username = window.currentListData && window.currentListData.username || localStorage.getItem("lx_sync_user") || "";
      const headers = {};
      Object.assign(headers, getUserAuthHeaders());
      const res = await fetch("/api/music/cache/lyric/clear", { method: "POST", headers });
      const data = await res.json();
      if (data.success) {
        showSuccess(`已同时清除 ${data.data.deletedCount} 个本地LRC文件`);
        const drawer = document.getElementById("cache-drawer");
        if (drawer && !drawer.classList.contains("translate-x-full")) {
          refreshCacheList();
        }
        updateServerCacheSize();
      } else {
        throw new Error(data.message || "清除失败");
      }
    } catch (e) {
      showError("清除本地LRC文件失败: " + e.message);
    }
  }
}
async function updateServerCacheSize() {
  const cacheEl = document.getElementById("server-cache-info");
  const musicEl = document.getElementById("server-music-info");
  if (!cacheEl && !musicEl)
    return;
  const formatSize = (size) => {
    if (size >= 1024 * 1024 * 1024)
      return (size / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    if (size >= 1024 * 1024)
      return (size / (1024 * 1024)).toFixed(2) + " MB";
    if (size >= 1024)
      return (size / 1024).toFixed(2) + " KB";
    return size + " B";
  };
  try {
    if (cacheEl)
      cacheEl.textContent = "计算中...";
    if (musicEl)
      musicEl.textContent = "计算中...";
    const headers = getUserAuthHeaders();
    const response = await fetch("/api/music/cache/stats", { headers });
    if (!response.ok)
      throw new Error("获取缓存统计失败");
    const data = await response.json();
    if (data.success && data.data) {
      const stats = data.data;
      if (musicEl && stats.music) {
        musicEl.textContent = `音乐: ${formatSize(stats.music.totalSize)} (${stats.music.fileCount} 首)`;
      }
      if (cacheEl && stats.cache) {
        cacheEl.textContent = `缓存: ${formatSize(stats.cache.totalSize)} (${stats.cache.fileCount} 首)`;
      }
    } else {
      throw new Error(data.message || "获取失败");
    }
  } catch (e) {
    console.warn("[Cache] 更新服务端统计失败:", e);
    if (cacheEl)
      cacheEl.textContent = "获取失败";
    if (musicEl)
      musicEl.textContent = "获取失败";
  }
}
var currentCacheList = [];
var selectedCacheFiles = new Set;
var cacheBatchMode = false;
function getCacheItemKey(item) {
  return `${item.folder}\x00${item.filename}`;
}
function getSelectedCacheItems() {
  return currentCacheList.filter((item) => selectedCacheFiles.has(getCacheItemKey(item)));
}
function toggleCacheDrawer() {
  const drawer = document.getElementById("cache-drawer");
  if (drawer) {
    const isHidden = drawer.classList.contains("translate-x-full");
    if (isHidden) {
      drawer.classList.remove("translate-x-full");
      document.body.style.overflow = "hidden";
      refreshCacheList();
    } else {
      drawer.classList.add("translate-x-full");
      document.body.style.overflow = "";
      exitCacheBatchMode();
    }
  }
}
async function refreshCacheList() {
  const container = document.getElementById("cache-list-container");
  container.innerHTML = window.SystemDownloadManager.getStatusHtml("fa-spinner", "正在重新扫描文件并刷新列表...", true);
  try {
    const username = window.currentListData && window.currentListData.username || localStorage.getItem("lx_sync_user") || "";
    const headers = getUserAuthHeaders();
    await fetch("/api/music/cache/sync", { method: "POST", headers });
    const res = await fetch("/api/music/cache/list", { headers });
    const data = await res.json();
    if (data.success) {
      currentCacheList = data.data;
      renderCacheList();
      updateCacheHeaderStats();
    } else {
      throw new Error(data.message || "加载列表失败");
    }
  } catch (e) {
    container.innerHTML = `<div class="p-10 text-center t-text-muted text-sm">${e.message}</div>`;
  }
}
function updateCacheHeaderStats() {
  const countEl = document.getElementById("cache-list-count");
  const sizeEl = document.getElementById("cache-total-size");
  if (countEl)
    countEl.textContent = `${currentCacheList.length} CACHED FILES`;
  const totalSize = currentCacheList.reduce((acc, curr) => acc + (curr.size || 0), 0);
  if (sizeEl)
    sizeEl.textContent = (totalSize / (1024 * 1024)).toFixed(2) + " MB";
  updateServerCacheSize();
}
function renderCacheList() {
  const container = document.getElementById("cache-list-container");
  if (currentCacheList.length === 0) {
    container.innerHTML = window.SystemDownloadManager.getStatusHtml("fa-cloud-download-alt", "暂无服务器缓存歌曲");
    return;
  }
  container.innerHTML = currentCacheList.map((item, idx) => {
    const isSelected = selectedCacheFiles.has(getCacheItemKey(item));
    const sourceTagHtml = window.getSourceTag ? window.getSourceTag(item.source) : `<span class="px-1 py-0 rounded text-[10px] font-bold border t-badge-red mr-1">${item.source.toUpperCase()}</span>`;
    let qTagHtml = "";
    const q = (item.quality || "").toLowerCase();
    const qName = window.QualityManager?.getQualityDisplayName(q) || q.toUpperCase();
    if (q === "master") {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-purple border border-purple-200 dark:border-purple-500/30 transition-colors">${qName}</span>`;
    } else if (q === "atmos" || q === "atmos_plus") {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-blue border border-cyan-200 dark:border-cyan-500/30 transition-colors">${qName}</span>`;
    } else if (q === "flac24bit" || q === "hires" || q === "hr") {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-yellow border border-yellow-200 dark:border-yellow-500/30 transition-colors">${qName}</span>`;
    } else if (q === "flac" || q === "sq" || q === "ape") {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-green border border-emerald-200 dark:border-emerald-500/30 transition-colors">${qName}</span>`;
    } else if (q === "320k" || q === "hq") {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-blue border border-blue-200 dark:border-blue-500/30 transition-colors">${qName}</span>`;
    } else if (q === "128k" || q === "mq" || q === "standard") {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-gray border t-border-main transition-colors">${qName}</span>`;
    } else {
      qTagHtml = `<span class="flex-shrink-0 px-1 py-0 rounded text-[10px] t-badge-red border border-red-200 dark:border-red-500/30 transition-colors">${qName}</span>`;
    }
    const username = window.currentListData && window.currentListData.username || localStorage.getItem("lx_sync_user") || "";
    const authToken = (window.getUserAuthHeaders ? window.getUserAuthHeaders()["x-user-token"] : null) || localStorage.getItem("lx_user_token") || "";
    const coverUrl = item.hasCover ? `/api/music/cache/cover?filename=${encodeURIComponent(item.filename)}&user=${encodeURIComponent(username)}${authToken ? `&token=${encodeURIComponent(authToken)}` : ""}` : "/music/assets/logo.svg";
    return `
            <div class="group flex items-center p-2.5 rounded-2xl hover:t-bg-panel-light transition-all duration-300 gap-3 border border-transparent 
                ${isSelected ? "t-bg-panel-light border-blue-500/30 ring-1 ring-blue-500/10" : ""}" 
                onclick="${cacheBatchMode ? `toggleCacheSelection(${idx})` : ""}">
                
                ${cacheBatchMode ? `
                <div class="flex-shrink-0 w-5 flex items-center justify-center">
                    <div class="w-4 h-4 rounded border-2 transition-all flex items-center justify-center
                        ${isSelected ? "bg-blue-500 border-blue-500 shadow-sm" : "border-gray-300 dark:border-gray-600"}">
                        ${isSelected ? '<i class="fas fa-check text-[8px] text-white"></i>' : ""}
                    </div>
                </div>
                ` : ""}

                <div class="relative w-12 h-12 flex-shrink-0 group-hover:scale-105 transition-transform duration-500">
                    <img class="w-full h-full object-cover rounded-xl shadow-md bg-gray-100" 
                         src="${coverUrl}" 
                         onerror="this.src='/music/assets/logo.svg'">
                    <div class="absolute inset-0 bg-black/5 rounded-xl"></div>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-black t-text-main truncate tracking-tight">${item.name}</span>
                    </div>
                    <div class="flex items-center flex-wrap gap-1 mt-0.5">
                        ${sourceTagHtml}
                        ${qTagHtml}
                        <span class="text-[10px] font-bold t-text-muted truncate opacity-60">${item.singer}</span>
                        ${item.album ? `<span class="text-[10px] t-text-muted opacity-40 ml-1 truncate">· ${item.album}</span>` : ""}
                    </div>
                    ${item.hasLyric === true ? `
                        <div class="mt-1">
                            <span class="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black shadow-sm inline-flex items-center" title="歌词已同步">LRC</span>
                        </div>
                    ` : `
                        <div class="mt-1">
                            <button onclick="event.stopPropagation(); retryCacheLyric(this, ${JSON.stringify(item).replace(/"/g, "&quot;")})" 
                                    class="text-[9px] bg-red-400 hover:bg-red-500 text-white px-1.5 py-0.5 rounded font-black shadow-sm inline-flex items-center gap-1 transition-colors" title="歌词缺失，点击尝试补全">
                                <span>LRC+</span>
                                <i class="fas fa-redo-alt text-[7px]"></i>
                            </button>
                        </div>
                    `}
                </div>

                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${!cacheBatchMode ? `
                        <button onclick="event.stopPropagation(); removeCacheItem(${idx})"
                                class="p-2 t-text-muted hover:text-red-500 transition-colors" title="删除">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
  }).join("");
}
function toggleCacheBatchMode() {
  cacheBatchMode = true;
  selectedCacheFiles.clear();
  document.getElementById("cache-batch-toolbar").classList.remove("hidden");
  document.getElementById("cache-manage-btn").classList.add("hidden");
  document.getElementById("cache-exit-batch-btn").classList.remove("hidden");
  renderCacheList();
  updateCacheBatchCount();
}
function exitCacheBatchMode() {
  cacheBatchMode = false;
  selectedCacheFiles.clear();
  document.getElementById("cache-batch-toolbar").classList.add("hidden");
  document.getElementById("cache-manage-btn").classList.remove("hidden");
  document.getElementById("cache-exit-batch-btn").classList.add("hidden");
  renderCacheList();
}
function toggleCacheSelection(index) {
  const item = currentCacheList[index];
  if (!item)
    return;
  const key = getCacheItemKey(item);
  if (selectedCacheFiles.has(key)) {
    selectedCacheFiles.delete(key);
  } else {
    selectedCacheFiles.add(key);
  }
  renderCacheList();
  updateCacheBatchCount();
}
function selectAllCache() {
  currentCacheList.forEach((item) => selectedCacheFiles.add(getCacheItemKey(item)));
  renderCacheList();
  updateCacheBatchCount();
}
function deselectAllCache() {
  selectedCacheFiles.clear();
  renderCacheList();
  updateCacheBatchCount();
}
function updateCacheBatchCount() {
  const el = document.getElementById("cache-selected-count");
  if (el)
    el.textContent = selectedCacheFiles.size;
}
async function removeCacheItem(index) {
  const item = currentCacheList[index];
  if (!item) {
    showError("文件信息已失效，请刷新后重试");
    return;
  }
  const isLogined = !!localStorage.getItem("lx_user_token");
  const isPublicUser = !window.currentListData || !window.currentListData.username || window.currentListData.username === "default";
  if (isPublicUser && window.lx_config && window.lx_config["user.enablePublicRestriction"] && !isLogined) {
    const isAdminSession = localStorage.getItem("lx_admin_password");
    const enableServerCache = window.settings && window.settings.enableServerCache === true;
    if (!enableServerCache && !isAdminSession) {
      if (typeof window.handleAdminAuth === "function") {
        const authorized = await window.handleAdminAuth("删除服务器缓存文件需要需要管理员身份");
        if (!authorized)
          return;
      } else {
        showError("删除服务器缓存文件受限，需要管理员身份");
        return;
      }
    }
  }
  if (!await showSelect("确定删除", "确认从服务器永久删除此缓存文件吗？", { danger: true }))
    return;
  try {
    const username = window.currentListData && window.currentListData.username || localStorage.getItem("lx_sync_user") || "";
    const headers = { "Content-Type": "application/json" };
    Object.assign(headers, getUserAuthHeaders());
    const res = await fetch("/api/music/cache/remove", {
      method: "POST",
      headers,
      body: JSON.stringify({ items: [{ filename: item.filename, folder: item.folder }] })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      showSuccess("已删除");
      refreshCacheList();
    } else {
      throw new Error(result.message || "删除失败");
    }
  } catch (e) {
    showError(e.message);
  }
}
async function batchDeleteCache() {
  const deleteItems = getSelectedCacheItems();
  if (deleteItems.length === 0) {
    showError("请先选择文件");
    return;
  }
  if ((!window.currentListData || !window.currentListData.username || window.currentListData.username === "default") && window.lx_config && window.lx_config["user.enablePublicRestriction"]) {
    const isAdminSession = localStorage.getItem("lx_admin_password");
    const enableServerCache = window.settings && window.settings.enableServerCache === true;
    if (!enableServerCache && !isAdminSession) {
      if (typeof window.handleAdminAuth === "function") {
        const authorized = await window.handleAdminAuth("批量删除服务器缓存需要需要管理员身份");
        if (!authorized)
          return;
      } else {
        showError("批量删除服务器缓存受限，需要管理员身份");
        return;
      }
    }
  }
  if (!await showSelect("批量删除", `确定要删除这 ${deleteItems.length} 个缓存文件吗？`, { danger: true }))
    return;
  try {
    const username = window.currentListData && window.currentListData.username || localStorage.getItem("lx_sync_user") || "";
    const headers = { "Content-Type": "application/json" };
    Object.assign(headers, getUserAuthHeaders());
    const res = await fetch("/api/music/cache/remove", {
      method: "POST",
      headers,
      body: JSON.stringify({
        items: deleteItems.map((item) => ({ filename: item.filename, folder: item.folder }))
      })
    });
    const result = await res.json();
    if (result.deletedCount > 0) {
      exitCacheBatchMode();
      await refreshCacheList();
    }
    if (!res.ok || !result.success)
      throw new Error(result.message || "删除失败");
    showSuccess(`成功删除 ${result.deletedCount} 个文件`);
  } catch (e) {
    showError(e.message);
  }
}
async function clearServerCache() {
  if ((!window.currentListData || !window.currentListData.username || window.currentListData.username === "default") && window.lx_config && window.lx_config["user.enablePublicRestriction"]) {
    const isAdminSession = localStorage.getItem("lx_admin_password");
    const enableServerCache = window.settings && window.settings.enableServerCache === true;
    if (!enableServerCache && !isAdminSession) {
      if (typeof window.handleAdminAuth === "function") {
        const authorized = await window.handleAdminAuth("完全清理服务器缓存需要需要管理员身份");
        if (!authorized)
          return;
      } else {
        showError("完全清理服务器缓存受限，需要管理员身份");
        return;
      }
    }
  }
  if (!await showSelect("完全清理", "确定要清除所有服务器缓存吗？", { danger: true }))
    return;
  try {
    const username = window.currentListData && window.currentListData.username || localStorage.getItem("lx_sync_user") || "";
    const headers = {};
    Object.assign(headers, getUserAuthHeaders());
    const res = await fetch("/api/music/cache/clear", { method: "POST", headers });
    if (res.ok) {
      const data = await res.json();
      showSuccess(`清理完成，释放 ${(data.data.freedSize / (1024 * 1024)).toFixed(2)} MB`);
      refreshCacheList();
      if (cacheBatchMode)
        exitCacheBatchMode();
    }
  } catch (e) {
    showError(e.message);
  }
}
window.switchTab = switchTab;
window.handleSearchKeyPress = handleSearchKeyPress;
window.doSearch = doSearch;
window.changePage = changePage;
window.toggleCacheDrawer = toggleCacheDrawer;
window.refreshCacheList = refreshCacheList;
window.toggleCacheBatchMode = toggleCacheBatchMode;
window.exitCacheBatchMode = exitCacheBatchMode;
window.selectAllCache = selectAllCache;
window.deselectAllCache = deselectAllCache;
window.batchDeleteCache = batchDeleteCache;
window.toggleCacheSelection = toggleCacheSelection;
window.removeCacheItem = removeCacheItem;
window.clearServerCache = clearServerCache;
window.handleHotSearchClick = handleHotSearchClick;
window.playSong = playSong;
window.resolveSongUrl = resolveSongUrl;
window.resolveDownloadSongUrl = resolveDownloadSongUrl;
window.togglePlay = togglePlay;
window.playNext = playNext;
window.changeProxyPlayback = changeProxyPlayback;
window.changeProxyDownload = changeProxyDownload;
window.changeAutoProxy = changeAutoProxy;
window.changeHotSearchLimit = changeHotSearchLimit;
window.resetAllSettings = resetAllSettings;
window.clearCache = clearCache;
window.updateServerCacheSize = updateServerCacheSize;
window.clearServerCache = clearServerCache;
window.playPrev = playPrev;
window.seek = seek;
window.changeLyricFontSize = changeLyricFontSize;
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.setPlayMode = setPlayMode;
var currentLyricLines = [];
var isLyricViewOpen = false;
var currentLyricIndex = -1;
var wordAnimationId = null;
var lyricPlayer = null;
var isUserScrolling = false;
var scrollLockTimeout = null;
var isProgrammaticScroll = false;
var SCROLL_LOCK_DURATION = 5000;
function toggleLyrics(fromPopState = false) {
  if (!fromPopState && isLyricViewOpen) {
    if (window.history.state && window.history.state.page === "player-detail") {
      window.history.back();
    }
  }
  if (!fromPopState && !isLyricViewOpen) {
    window.history.pushState({ page: "player-detail" }, "");
  }
  isLyricViewOpen = !isLyricViewOpen;
  const view = document.getElementById("view-player-detail");
  if (isLyricViewOpen) {
    view.classList.remove("hidden");
    view.offsetWidth;
    view.classList.remove("translate-y-[100%]", "opacity-0");
    startToggleLyricsBtnTimer();
    if (currentPlayingSong) {
      updateDetailInfo(currentPlayingSong);
      if (currentLyricLines.length === 0) {
        fetchLyric(currentPlayingSong);
      }
      if (lyricPlayer && !audio.paused) {
        lyricPlayer.play(audio.currentTime * 1000);
      }
      setTimeout(() => scrollToActiveLine(true), 100);
    }
    setTimeout(() => {
      if (window.musicVisualizer)
        window.musicVisualizer.applySettings();
    }, 300);
    if (settings.autoCompactPlaybar !== false && window.innerWidth < 1025) {
      window.setCompactPlaybar(true);
    }
  } else {
    view.classList.add("translate-y-[100%]", "opacity-0");
    setTimeout(() => {
      view.classList.add("hidden");
      if (window.musicVisualizer)
        window.musicVisualizer.applySettings();
    }, 600);
    if (settings.autoCompactPlaybar !== false && window.innerWidth < 1025) {
      window.setCompactPlaybar(false);
    }
  }
}
window.addEventListener("popstate", (e) => {
  if (isLyricViewOpen) {
    toggleLyrics(true);
    return;
  }
  const backBtn = document.getElementById("search-back-btn");
  if (backBtn && !backBtn.classList.contains("hidden")) {
    goBackToSearch(true);
  }
});
function updateDetailInfo(song) {
  document.getElementById("detail-title").innerText = song.name;
  document.getElementById("detail-artist").innerText = song.singer;
  const imgUrl = getImgUrl(song);
  setImg("detail-cover", imgUrl);
  setImg("detail-bg-cover", imgUrl);
}
async function fetchLyric(song, quality = null) {
  if (!song) {
    return;
  }
  let songmid = song.songmid || song.songId;
  let source = song.source;
  if (!songmid && song.meta) {
    songmid = song.meta.songmid || song.meta.songId;
  }
  if (!source && song.meta) {
    source = song.meta.source;
  }
  if (!songmid || !source) {
    console.warn("[Lyric] 歌曲缺少必要的字段 songmid/songId 或 source:", song);
    return;
  }
  const currentLyricKey = `${source}_${songmid} `;
  if (lastLyricSongId === currentLyricKey && currentLyricLines.length > 0) {
    console.log(`[Lyric] 歌词已就绪(${currentLyricKey})，同步播放状态`);
    if (lyricPlayer) {
      applyLyricUpdate();
    }
    return;
  }
  lastLyricSongId = currentLyricKey;
  document.getElementById("lyric-content").innerHTML = '<p class="t-text-muted text-lg animate-pulse">正在加载歌词...</p>';
  currentLyricLines = [];
  const cacheKey = `lx_lyric_${source}_${songmid} `;
  if (settings.enableLyricCache !== false) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        currentRawLrc = data.lrc || "";
        currentRawTlrc = data.tlyric || "";
        currentRawRlrc = data.rlyric || "";
        currentRawKlrc = data.klyric || data.lxlyric || "";
        console.log(`[Lyric] 使用浏览器本地缓存歌词: ${songmid} `);
        initLyricPlayer();
        applyLyricUpdate();
        return;
      }
    } catch (e) {
      console.warn("[Lyric] 读取浏览器本地缓存失败:", e);
      localStorage.removeItem(cacheKey);
    }
  }
  const username = currentListData?.username || "";
  const headers = {};
  Object.assign(headers, getUserAuthHeaders());
  if (settings.enableServerLyricCache !== false) {
    try {
      const serverCacheUrl = `${API_BASE}/cache/lyric?source=${source}&songmid=${songmid}&songId=${encodeURIComponent(song.id || "")}&name=${encodeURIComponent(song.name || "")}&singer=${encodeURIComponent(song.singer || "")}`;
      const scRes = await fetch(serverCacheUrl, { headers });
      if (scRes.ok) {
        const scData = await scRes.json();
        if (scData.success && scData.data) {
          currentRawLrc = scData.data.lyric || scData.data.lrc || "";
          currentRawTlrc = scData.data.tlyric || "";
          currentRawRlrc = scData.data.rlyric || "";
          currentRawKlrc = scData.data.klyric || scData.data.lxlyric || "";
          console.log(`[Lyric] 使用服务器端缓存歌词: ${source}_${songmid} `);
          if (settings.enableLyricCache !== false && currentRawLrc) {
            localStorage.setItem(cacheKey, JSON.stringify({
              lrc: currentRawLrc,
              tlyric: currentRawTlrc,
              rlyric: currentRawRlrc,
              klyric: currentRawKlrc
            }));
          }
          initLyricPlayer();
          applyLyricUpdate();
          return;
        }
      }
    } catch (e) {
      console.warn("[Lyric] 读取服务器端缓存失败:", e);
    }
  }
  try {
    const params = new URLSearchParams({
      source,
      songmid,
      name: song.name || song.songname || "",
      singer: song.singer || song.singername || "",
      hash: song.hash || "",
      interval: song.interval || song.duration || "",
      copyrightId: song.copyrightId || "",
      albumId: song.albumId || "",
      lrcUrl: song.lrcUrl || "",
      mrcUrl: song.mrcUrl || "",
      trcUrl: song.trcUrl || ""
    });
    const url = `${API_BASE}/lyric?${params.toString()}`;
    const res = await fetch(url, { headers, priority: "low" });
    if (!res.ok) {
      throw new Error(`Fetch lyric failed: ${res.status}`);
    }
    const data = await res.json();
    currentRawLrc = data.lyric || data.lrc || "";
    currentRawTlrc = data.tlyric || "";
    currentRawRlrc = data.rlyric || "";
    currentRawKlrc = data.klyric || data.lxlyric || "";
    const isFromLocal = !!data._fromLocalCache;
    console.log(`[Lyric] ${isFromLocal ? "使用服务器本地缓存歌词" : "获取到网络歌词"}:`, { source, songmid });
    if (currentRawLrc) {
      const cacheData = {
        lrc: currentRawLrc,
        tlyric: currentRawTlrc,
        rlyric: currentRawRlrc,
        klyric: currentRawKlrc
      };
      if (settings.enableLyricCache !== false) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
          updateStorageStatsUI();
        } catch (e) {
          console.warn("[Lyric] 写入本地缓存失败:", e);
        }
      }
      if (settings.enableServerLyricCache !== false && !isFromLocal) {
        try {
          fetch(`${API_BASE}/cache/lyric`, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              songInfo: { ...song, quality: typeof quality !== "undefined" ? quality : typeof currentQuality !== "undefined" ? currentQuality : null },
              lyricsObj: {
                lyric: currentRawLrc,
                tlyric: currentRawTlrc,
                rlyric: currentRawRlrc,
                lxlyric: currentRawKlrc
              }
            })
          }).catch((e) => console.warn("[Lyric] 上传服务端缓存失败:", e));
        } catch (e) {}
      }
    }
    if (!currentRawLrc) {
      renderLyric([]);
      return;
    }
    initLyricPlayer();
    applyLyricUpdate();
  } catch (e) {
    console.error(`[Lyric] Failed (${source}_${songmid}):`, e);
    renderLyric([], `暂无歌词 (${source}: ${songmid})`);
  }
}
function applyLyricUpdate() {
  if (!lyricPlayer || !currentRawLrc)
    return;
  const extendedLyrics = [];
  const showTrans = settings.showLyricTranslation !== false;
  const showRoma = settings.showLyricRoma === true;
  const isSwap = settings.swapLyricTransRoma === true;
  if (showTrans && currentRawTlrc && showRoma && currentRawRlrc) {
    if (isSwap) {
      extendedLyrics.push(currentRawRlrc);
      extendedLyrics.push(currentRawTlrc);
    } else {
      extendedLyrics.push(currentRawTlrc);
      extendedLyrics.push(currentRawRlrc);
    }
  } else if (showTrans && currentRawTlrc) {
    extendedLyrics.push(currentRawTlrc);
  } else if (showRoma && currentRawRlrc) {
    extendedLyrics.push(currentRawRlrc);
  }
  const mainLyric = currentRawKlrc || currentRawLrc;
  lyricPlayer.setLyric(mainLyric, extendedLyrics);
  if (!audio.paused) {
    lyricPlayer.play(audio.currentTime * 1000);
  } else {
    lyricPlayer.pause();
  }
}
function initLyricPlayer() {
  if (!window.LinePlayer) {
    console.error("[Lyric] LinePlayer not loaded");
    return;
  }
  if (!lyricPlayer) {
    lyricPlayer = new window.LinePlayer({
      offset: 0,
      rate: currentPlaybackRate || 1,
      onPlay: (lineNum, text, curTime) => {
        syncLyricByLineNum(lineNum);
      },
      onSetLyric: (lines, offset) => {
        currentLyricLines = lines;
        window.currentLyricLines = lines;
        renderLyric(lines);
      }
    });
  }
}
function getLyricOffset() {
  const containerBox = document.getElementById("lyric-container");
  if (!containerBox)
    return 0;
  const footer = document.getElementById("player-footer");
  const isFooterHidden = footer && footer.classList.contains("translate-y-[110%]");
  const ratio = isFooterHidden ? 0.25 : 0.25;
  return containerBox.clientHeight * ratio;
}
function scrollToActiveLine(force = false) {
  if (isUserScrolling && !force)
    return;
  const containerBox = document.getElementById("lyric-container");
  const lyricContent = document.getElementById("lyric-content");
  if (!containerBox || !lyricContent)
    return;
  const lines = lyricContent.children;
  if (lines.length === 0)
    return;
  let targetIndex = currentLyricIndex;
  if (targetIndex < 0 || targetIndex >= lines.length)
    targetIndex = 0;
  const currentLine = lines[targetIndex];
  if (!currentLine)
    return;
  const lineTop = currentLine.offsetTop;
  const offsetInContainer = getLyricOffset();
  const targetScroll = lineTop - offsetInContainer;
  isProgrammaticScroll = true;
  if (window.programmaticScrollTimer)
    clearTimeout(window.programmaticScrollTimer);
  containerBox.scrollTo({
    top: targetScroll,
    behavior: "smooth"
  });
  window.programmaticScrollTimer = setTimeout(() => {
    isProgrammaticScroll = false;
    window.programmaticScrollTimer = null;
  }, 1500);
}
function syncLyricByLineNum(lineNum) {
  const container = document.getElementById("lyric-content");
  if (!container)
    return;
  const lines = container.children;
  if (lineNum !== currentLyricIndex) {
    currentLyricIndex = lineNum;
    window.currentLyricIndex = lineNum;
    window.currentLyricLines = currentLyricLines;
    const prev = container.querySelector(".active");
    if (prev)
      prev.classList.remove("active");
    if (lineNum >= 0 && lineNum < lines.length) {
      lines[lineNum].classList.add("active");
    }
    if ("mediaSession" in navigator && navigator.mediaSession.metadata && settings.enableSmtcLyric) {
      try {
        const lyricText = lineNum >= 0 && currentLyricLines && currentLyricLines[lineNum] ? currentLyricLines[lineNum].text : "";
        const song = currentPlayingSong;
        const songTitle = song ? song.name : "";
        navigator.mediaSession.metadata.title = lyricText || songTitle;
        if (song) {
          navigator.mediaSession.metadata.artist = `${song.name} - ${song.singer}`;
        }
      } catch (e) {}
    }
  }
  if (wordAnimationId)
    cancelAnimationFrame(wordAnimationId);
  if (!audio.paused && lineNum >= 0 && lineNum < lines.length) {
    const lineData = currentLyricLines[lineNum];
    if (lineData && lineData.words && lineData.words.length > 0) {
      startWordProgressUpdate(lineNum, lines[lineNum], lineData);
    }
  }
  scrollToActiveLine();
}
function startWordProgressUpdate(lineIndex, lineEl, lineData) {
  const wordSpans = lineEl.querySelectorAll(".word-item");
  if (!wordSpans.length)
    return;
  const lineStartTime = lineData.time;
  let lineDuration = 5000;
  const lastWord = lineData.words[lineData.words.length - 1];
  if (lastWord) {
    lineDuration = lastWord.startTime + lastWord.duration;
  }
  if (lineDuration <= 0)
    lineDuration = 5000;
  let totalWordsDuration = 0;
  wordSpans.forEach((span) => {
    totalWordsDuration += parseInt(span.dataset.duration) || 0;
  });
  function update() {
    if (currentLyricIndex !== lineIndex || audio.paused) {
      return;
    }
    const curTimeMs = audio.currentTime * 1000;
    const relativeTime = curTimeMs - lineStartTime;
    let sungDuration = 0;
    wordSpans.forEach((span) => {
      const start = parseInt(span.dataset.start);
      const duration = parseInt(span.dataset.duration);
      if (relativeTime >= start + duration) {
        sungDuration += duration;
        span.style.setProperty("--word-progress", "100%");
        span.classList.add("passed");
        span.classList.remove("playing");
      } else if (relativeTime >= start) {
        sungDuration += relativeTime - start;
        const progress = Math.min(100, Math.max(0, (relativeTime - start) / duration * 100));
        span.style.setProperty("--word-progress", `${progress}%`);
        span.classList.add("playing");
        span.classList.remove("passed");
      } else {
        span.style.setProperty("--word-progress", "0%");
        span.classList.remove("passed", "playing");
      }
    });
    const lineProgress = totalWordsDuration > 0 ? sungDuration / totalWordsDuration * 100 : Math.min(100, Math.max(0, relativeTime / lineDuration * 100));
    lineEl.style.setProperty("--line-progress", `${lineProgress}%`);
    const extSpans = lineEl.querySelectorAll(".extended");
    extSpans.forEach((ext) => {
      const items = ext.querySelectorAll(".ext-item");
      const itemCount = items.length;
      if (itemCount > 0) {
        const perItemWeight = 100 / itemCount;
        items.forEach((item, idx) => {
          const itemStart = idx * perItemWeight;
          const itemEnd = (idx + 1) * perItemWeight;
          if (lineProgress >= itemEnd) {
            item.style.setProperty("--word-progress", "100%");
            item.classList.add("passed");
            item.classList.remove("playing");
          } else if (lineProgress >= itemStart) {
            const progress = (lineProgress - itemStart) / perItemWeight * 100;
            item.style.setProperty("--word-progress", `${progress}%`);
            item.classList.add("playing");
            item.classList.remove("passed");
          } else {
            item.style.setProperty("--word-progress", "0%");
            item.classList.remove("passed", "playing");
          }
        });
      }
    });
    wordAnimationId = requestAnimationFrame(update);
  }
  wordAnimationId = requestAnimationFrame(update);
}
var scrollThrottleTimer = null;
function handleLyricScroll() {
  if (isProgrammaticScroll) {
    return;
  }
  isUserScrolling = true;
  const indicator = document.getElementById("lyric-scroll-indicator");
  const container = document.getElementById("lyric-container");
  if (indicator && container) {
    const offset = getLyricOffset();
    indicator.style.top = `${container.offsetTop + offset}px`;
    indicator.classList.remove("hidden");
    indicator.style.display = "flex";
  }
  if (scrollLockTimeout) {
    clearTimeout(scrollLockTimeout);
  }
  if (scrollThrottleTimer) {
    return;
  }
  scrollThrottleTimer = requestAnimationFrame(() => {
    updateScrollIndicator();
    scrollThrottleTimer = null;
  });
  scrollLockTimeout = setTimeout(() => {
    isUserScrolling = false;
    scrollLockTimeout = null;
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.style.display = "none";
    }
    const lyricContent = document.getElementById("lyric-content");
    if (lyricContent) {
      const lines = lyricContent.children;
      for (let i = 0;i < lines.length; i++) {
        lines[i].classList.remove("scroll-target");
      }
    }
    if (lyricPlayer && !audio.paused) {
      lyricPlayer.play(audio.currentTime * 1000);
    }
    scrollToActiveLine(true);
  }, SCROLL_LOCK_DURATION);
}
function updateScrollIndicator() {
  const container = document.getElementById("lyric-container");
  const indicator = document.getElementById("lyric-scroll-indicator");
  const lyricContent = document.getElementById("lyric-content");
  if (!container || !indicator || !lyricContent || !isUserScrolling) {
    if (lyricContent) {
      const lines = lyricContent.children;
      for (let i = 0;i < lines.length; i++) {
        lines[i].classList.remove("scroll-target");
      }
    }
    return;
  }
  const indicatorRect = indicator.getBoundingClientRect();
  const referenceY = indicatorRect.top + indicatorRect.height / 2;
  const lines = lyricContent.children;
  let overlapIndex = -1;
  let closestIndex = -1;
  let minDist = Infinity;
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    const rect = line.getBoundingClientRect();
    if (referenceY >= rect.top && referenceY <= rect.bottom) {
      overlapIndex = i;
    }
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(center - referenceY);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }
  const targetIndex = overlapIndex !== -1 ? overlapIndex : closestIndex;
  let targetTime = 0;
  if (targetIndex !== -1 && lines[targetIndex]) {
    targetTime = parseFloat(lines[targetIndex].dataset.time) / 1000;
  }
  for (let i = 0;i < lines.length; i++) {
    if (i === targetIndex) {
      lines[i].classList.add("scroll-target");
    } else {
      lines[i].classList.remove("scroll-target");
    }
  }
  const timeDisplay = indicator.querySelector(".time-display");
  if (timeDisplay && targetTime > 0) {
    const minutes = Math.floor(targetTime / 60);
    const seconds = Math.floor(targetTime % 60);
    timeDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}
function renderLyric(lines, emptyMsg = "暂无歌词") {
  const container = document.getElementById("lyric-content");
  container.innerHTML = "";
  if (lines.length === 0) {
    container.innerHTML = `<p class="t-text-muted text-lg font-medium">${emptyMsg}</p>`;
    return;
  }
  if (settings.enableLyricGlow !== false) {
    container.classList.add("enable-lyric-glow");
  } else {
    container.classList.remove("enable-lyric-glow");
  }
  const frag = document.createDocumentFragment();
  lines.forEach((line, idx) => {
    const div = document.createElement("div");
    div.className = `lyric-line relative py-2 px-1 text-center md:text-left transition-all duration-300`;
    div.dataset.time = line.time;
    div.dataset.index = idx;
    div.onclick = () => {
      audio.currentTime = line.time / 1000;
      syncLyricByLineNum(idx);
      scrollToActiveLine(true);
      isUserScrolling = false;
      if (scrollLockTimeout) {
        clearTimeout(scrollLockTimeout);
        scrollLockTimeout = null;
      }
      const indicator = document.getElementById("lyric-scroll-indicator");
      if (indicator) {
        indicator.classList.add("hidden");
        indicator.style.display = "none";
      }
      const allLines = document.querySelectorAll(".lyric-line");
      allLines.forEach((l) => l.classList.remove("scroll-target"));
    };
    const contentDiv = document.createElement("div");
    contentDiv.className = "line-content";
    const span = document.createElement("span");
    span.className = "font-lrc text-gray-500 transition-all block w-fit mx-auto md:ml-0";
    if (line.words && line.words.length > 0) {
      div.classList.add("has-words");
      line.words.forEach((word) => {
        const wordSpan = document.createElement("span");
        wordSpan.className = "word-item";
        wordSpan.textContent = word.text;
        wordSpan.dataset.start = word.startTime;
        wordSpan.dataset.duration = word.duration;
        span.appendChild(wordSpan);
      });
    } else {
      span.textContent = line.text;
      span.classList.add("plain-lyric");
    }
    contentDiv.appendChild(span);
    if (line.extendedLyrics && line.extendedLyrics.length > 0) {
      line.extendedLyrics.forEach((extText) => {
        if (!extText)
          return;
        const extSpan = document.createElement("span");
        extSpan.className = "extended t-text-muted block w-fit mx-auto md:ml-0";
        const hasCJK = /[\u4e00-\u9fa5]|[\u3040-\u309f]|[\u30a0-\u30ff]/.test(extText);
        const segments = hasCJK ? extText.split("") : extText.split(/(\s+)/).filter((s) => s.length > 0);
        segments.forEach((seg) => {
          const s = document.createElement("span");
          s.className = "ext-item";
          s.textContent = seg;
          extSpan.appendChild(s);
        });
        contentDiv.appendChild(extSpan);
      });
    }
    div.appendChild(contentDiv);
    frag.appendChild(div);
  });
  container.appendChild(frag);
  isUserScrolling = false;
  if (lyricPlayer && !audio.paused) {
    lyricPlayer.play(audio.currentTime * 1000);
  }
  setTimeout(() => {
    scrollToActiveLine(true);
  }, 100);
}
var originalPlaySong = window.playSong;
var _originalUpdatePlayerInfo = updatePlayerInfo;
updatePlayerInfo = function(song, actualQuality) {
  _originalUpdatePlayerInfo(song, actualQuality);
  updateDetailInfo(song);
};
window.toggleLyrics = toggleLyrics;
console.log("App.js loaded successfully");
var favList = document.getElementById("favorites-children");
if (favList) {
  favList.style.height = "0px";
}
function refreshFavoritesChildrenHeight() {
  const list = document.getElementById("favorites-children");
  if (!list || list.style.height === "0px" || list.style.height === "")
    return;
  const currentHeight = list.getBoundingClientRect().height;
  list.style.height = "auto";
  const targetHeight = list.scrollHeight;
  list.style.height = currentHeight + "px";
  requestAnimationFrame(() => {
    list.style.height = targetHeight + "px";
  });
}
function toggleFavorites() {
  const list = document.getElementById("favorites-children");
  const arrow = document.getElementById("favorites-arrow");
  if (!list)
    return;
  if (list.style.height === "0px" || list.style.height === "") {
    list.style.height = "auto";
    const targetHeight = list.scrollHeight;
    list.style.height = "0px";
    requestAnimationFrame(() => {
      list.style.height = targetHeight + "px";
    });
    if (arrow)
      arrow.style.transform = "rotate(0deg)";
  } else {
    list.style.height = "0px";
    if (arrow)
      arrow.style.transform = "rotate(-90deg)";
  }
}
var favArrow = document.getElementById("favorites-arrow");
if (favArrow)
  favArrow.style.transform = "rotate(-90deg)";
window.libraryData = { artists: [], albums: [] };
window.libraryBatchSelected = new Set;
window.libraryBatchMode = false;
async function loadLibraryData() {
  try {
    const isPublic = window.isViewingPublicFavorites === true || !isUserLoggedIn();
    let headers = {};
    let artistsUrl = "/api/user/library/artists";
    let albumsUrl = "/api/user/library/albums";
    if (isPublic) {
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
      headers["x-user-name"] = "_open";
      artistsUrl += "?user=_open";
      albumsUrl += "?user=_open";
    } else {
      headers = getUserAuthHeaders();
    }
    const [ar, al] = await Promise.all([
      fetch(artistsUrl, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(albumsUrl, { headers }).then((r) => r.ok ? r.json() : [])
    ]);
    window.libraryData.artists = Array.isArray(ar) ? ar : [];
    window.libraryData.albums = Array.isArray(al) ? al : [];
    if (!isPublic && isUserLoggedIn()) {
      window.myPersonalLibraryData = {
        artists: [...window.libraryData.artists],
        albums: [...window.libraryData.albums]
      };
    }
    refreshLibrarySidebarCount();
    if (window.currentViewingListId === "__lib_artists__" && typeof renderLibraryArtists === "function") {
      renderLibraryArtists(window.libraryData.artists);
    } else if (window.currentViewingListId === "__lib_albums__" && typeof renderLibraryAlbums === "function") {
      renderLibraryAlbums(window.libraryData.albums);
    }
  } catch (e) {
    console.warn("[Library] 加载失败:", e);
  }
}
window.loadLibraryData = loadLibraryData;
function refreshLibrarySidebarCount() {
  const artCount = document.getElementById("lib-artist-count");
  const albCount = document.getElementById("lib-album-count");
  if (artCount)
    artCount.textContent = window.libraryData.artists.length;
  if (albCount)
    albCount.textContent = window.libraryData.albums.length;
}
async function saveLibraryArtists(customList = null) {
  try {
    const isPublic = !isUserLoggedIn() || !customList && window.isViewingPublicFavorites;
    const listToSave = customList || window.libraryData.artists;
    let headers = { "Content-Type": "application/json" };
    let url = "/api/user/library/artists";
    if (isPublic) {
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
      headers["x-user-name"] = "_open";
      url += "?user=_open";
    } else {
      headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    }
    await fetch(url, { method: "POST", headers, body: JSON.stringify(listToSave) });
    refreshLibrarySidebarCount();
  } catch (e) {
    console.error("[Library] 保存歌手失败:", e);
  }
}
async function saveLibraryAlbums(customList = null) {
  try {
    const isPublic = !isUserLoggedIn() || !customList && window.isViewingPublicFavorites;
    const listToSave = customList || window.libraryData.albums;
    let headers = { "Content-Type": "application/json" };
    let url = "/api/user/library/albums";
    if (isPublic) {
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
      headers["x-user-name"] = "_open";
      url += "?user=_open";
    } else {
      headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    }
    await fetch(url, { method: "POST", headers, body: JSON.stringify(listToSave) });
    refreshLibrarySidebarCount();
  } catch (e) {
    console.error("[Library] 保存专辑失败:", e);
  }
}
async function toggleArtistFavorite(id, source, name, picUrl) {
  if (isUserLoggedIn()) {
    const targetList = window.isViewingPublicFavorites && window.myPersonalLibraryData ? window.myPersonalLibraryData.artists : window.libraryData.artists;
    const idx = targetList.findIndex((a) => String(a.id) === String(id) && a.source === source);
    if (idx >= 0) {
      targetList.splice(idx, 1);
      await saveLibraryArtists(targetList);
      showInfo(`已取消收藏歌手「${name}」`);
      return false;
    } else {
      targetList.push({ id, source, name, picUrl: picUrl || "" });
      await saveLibraryArtists(targetList);
      showSuccess(`已收藏歌手「${name}」`);
      return true;
    }
  } else {
    if (!await requireAdminForOpenWrite("修改公开收藏歌手"))
      return false;
    const list = window.libraryData.artists;
    const idx = list.findIndex((a) => String(a.id) === String(id) && a.source === source);
    if (idx >= 0) {
      list.splice(idx, 1);
      await saveLibraryArtists(list);
      showInfo(`已取消公开收藏歌手「${name}」`);
      return false;
    } else {
      list.push({ id, source, name, picUrl: picUrl || "" });
      await saveLibraryArtists(list);
      showSuccess(`已收藏公开歌手「${name}」`);
      return true;
    }
  }
}
window.toggleArtistFavorite = toggleArtistFavorite;
function isArtistFavorited(id, source) {
  const list = isUserLoggedIn() && window.isViewingPublicFavorites && window.myPersonalLibraryData ? window.myPersonalLibraryData.artists : window.libraryData.artists;
  return list.some((a) => String(a.id) === String(id) && a.source === source);
}
window.isArtistFavorited = isArtistFavorited;
async function toggleAlbumFavorite(id, source, name, picUrl, artistName) {
  if (isUserLoggedIn()) {
    const targetList = window.isViewingPublicFavorites && window.myPersonalLibraryData ? window.myPersonalLibraryData.albums : window.libraryData.albums;
    const idx = targetList.findIndex((a) => String(a.id) === String(id) && a.source === source);
    if (idx >= 0) {
      targetList.splice(idx, 1);
      await saveLibraryAlbums(targetList);
      showInfo(`已取消收藏专辑「${name}」`);
      return false;
    } else {
      targetList.push({
        id,
        source,
        name,
        picUrl: picUrl || "",
        artistName: artistName || "",
        interval: "00:00",
        meta: { albumId: id, picUrl: picUrl || "", albumName: name }
      });
      await saveLibraryAlbums(targetList);
      showSuccess(`已收藏专辑「${name}」`);
      return true;
    }
  } else {
    if (!await requireAdminForOpenWrite("修改公开收藏专辑"))
      return false;
    const list = window.libraryData.albums;
    const idx = list.findIndex((a) => String(a.id) === String(id) && a.source === source);
    if (idx >= 0) {
      list.splice(idx, 1);
      await saveLibraryAlbums(list);
      showInfo(`已取消公开收藏专辑「${name}」`);
      return false;
    } else {
      list.push({
        id,
        source,
        name,
        picUrl: picUrl || "",
        artistName: artistName || "",
        interval: "00:00",
        meta: { albumId: id, picUrl: picUrl || "", albumName: name }
      });
      await saveLibraryAlbums(list);
      showSuccess(`已收藏公开专辑「${name}」`);
      return true;
    }
  }
}
window.toggleAlbumFavorite = toggleAlbumFavorite;
async function updateAlbumLibraryMeta(id, source, data) {
  if (!window.libraryData || !window.libraryData.albums)
    return;
  const album = window.libraryData.albums.find((a) => String(a.id) === String(id) && a.source === source);
  if (!album)
    return;
  const info = data.info || {};
  const songList = data.list || [];
  if (songList.length > 0) {
    album.list = songList;
    const first = songList[0];
    album.interval = first.interval || album.interval || "00:00";
    album.meta = album.meta || {};
    album.meta.albumId = id;
    album.meta.picUrl = album.picUrl || info.img || info.pic || first.meta?.picUrl;
    album.meta.albumName = album.name || info.name || first.meta?.albumName;
    if (first.meta) {
      album.meta.qualitys = first.meta.qualitys;
      album.meta._qualitys = first.meta._qualitys;
      album.meta.songId = first.meta.songId;
    }
  }
  try {
    await saveLibraryAlbums();
    console.log(`[Library] 已成功丰富专辑「${album.name}」的歌曲列表 (${songList.length} 首)`);
  } catch (e) {
    console.error("[Library] 自动更新专辑元数据失败:", e);
  }
}
window.updateAlbumLibraryMeta = updateAlbumLibraryMeta;
async function syncAllLibraryAlbums() {
  if (!window.libraryData || !window.libraryData.albums.length)
    return;
  const list = window.libraryData.albums;
  const btn = document.getElementById("sync-all-albums-btn");
  if (!btn)
    return;
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("opacity-50", "cursor-not-allowed");
  let successCount = 0;
  try {
    for (let i = 0;i < list.length; i++) {
      const album = list[i];
      btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> ${i + 1}/${list.length}`;
      try {
        const res = await fetch(`${API_BASE}/albumSongs?id=${album.id}&source=${album.source || "wy"}`);
        if (res.ok) {
          const data = await res.json();
          await updateAlbumLibraryMeta(album.id, album.source || "wy", data);
          successCount++;
        }
      } catch (err) {
        console.error(`[Library] 同步专辑「${album.name}」失败:`, err);
      }
      if (list.length > 3)
        await new Promise((r) => setTimeout(r, 200));
    }
    showSuccess(`同步完成！成功更新 ${successCount} 个专辑的数据。`);
    if (currentSearchScope === "lib_albums") {
      renderLibraryAlbums(window.libraryData.albums);
    }
  } catch (err) {
    showError("全量同步过程中发生异常");
  } finally {
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed");
    btn.innerHTML = originalContent;
  }
}
window.syncAllLibraryAlbums = syncAllLibraryAlbums;
function isAlbumFavorited(id, source) {
  const list = isUserLoggedIn() && window.isViewingPublicFavorites && window.myPersonalLibraryData ? window.myPersonalLibraryData.albums : window.libraryData.albums;
  return list.some((a) => String(a.id) === String(id) && a.source === source);
}
window.isAlbumFavorited = isAlbumFavorited;
function renderLibraryArtists(list) {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  const paginationBar = document.getElementById("search-pagination-bar");
  if (header)
    header.classList.add("hidden");
  if (paginationBar)
    paginationBar.classList.add("hidden");
  window.libraryBatchMode = false;
  window.libraryBatchSelected.clear();
  window.viewingPlaylist = list;
  if (!list || list.length === 0) {
    container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full t-text-muted space-y-4">
                <i class="fas fa-user-slash text-6xl opacity-20"></i>
                <p>还没有收藏任何歌手</p>
                <p class="text-xs">在搜索结果中点击 ♥ 收藏歌手</p>
            </div>`;
    return;
  }
  container.innerHTML = `
        <div class="p-3 md:p-4 border-b t-border-main t-bg-main flex items-center justify-between">
            <span class="text-sm font-bold t-text-main">收藏歌手 <span class="text-emerald-500">${list.length}</span> 位</span>
            <div class="flex items-center gap-2">
                <button onclick="enterLibraryArtistBatch()" class="text-xs px-3 py-1.5 border t-border-main rounded-lg t-text-muted hover:text-emerald-600 hover:border-emerald-400 transition-all flex items-center gap-1">
                    <i class="fas fa-tasks"></i> 批量管理
                </button>
            </div>
        </div>
        <div id="lib-artist-batch-bar" class="hidden bg-emerald-50 border-b border-emerald-200 p-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <span class="text-sm text-emerald-700">已选: <span id="lib-artist-sel-count" class="font-bold">0</span></span>
                <button onclick="libSelectAllArtists()" class="text-xs px-3 py-1 t-bg-panel border border-emerald-300 rounded hover:bg-emerald-50 text-emerald-700">全选</button>
                <button onclick="libDeselectAllArtists()" class="text-xs px-3 py-1 t-bg-panel border t-border-main rounded hover:t-bg-track t-text-muted">清空</button>
                <button onclick="exitLibraryArtistBatch()" class="text-xs px-3 py-1 t-bg-panel border border-red-300 rounded hover:bg-red-50 text-red-600">退出</button>
            </div>
            <button onclick="libDeleteSelectedArtists()" class="text-xs px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-1">
                <i class="fas fa-trash"></i> 删除所选
            </button>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 md:gap-4 p-3 md:p-6" id="lib-artist-grid"></div>`;
  const grid = container.querySelector("#lib-artist-grid");
  list.forEach((singer) => {
    const div = document.createElement("div");
    div.className = "group relative flex flex-col items-center p-2 md:p-4 rounded-2xl transition-all hover:t-bg-panel hover:shadow-md cursor-pointer border border-transparent hover:border-emerald-500/30";
    div.dataset.libArtistId = singer.id;
    div.dataset.libArtistSource = singer.source;
    div.onclick = (e) => {
      if (e.target.closest(".lib-batch-check") || e.target.closest(".lib-fav-btn"))
        return;
      if (window.libraryBatchMode === "artist") {
        toggleLibArtistBatchSelect(singer.id);
        return;
      }
      enterArtist(singer.id, singer.source || "wy");
    };
    div.innerHTML = `
            <div class="relative mb-2 md:mb-3">
                <div class="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full overflow-hidden shadow-sm">
                    <img src="${singer.picUrl || "/music/assets/logo.svg"}"
                         onerror="this.src='/music/assets/logo.svg'"
                         class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                </div>
                <div class="lib-batch-check absolute inset-0 bg-black/40 hidden items-center justify-center rounded-full">
                    <i class="fas fa-check-circle text-white text-2xl"></i>
                </div>
                <button class="lib-fav-btn absolute -top-1 -right-1 w-6 h-6 md:w-7 md:h-7 rounded-full bg-red-400/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
                        title="取消收藏"
                        onclick="event.stopPropagation(); removeLibraryArtist('${singer.id}', '${singer.source}')">
                    <i class="fas fa-times text-[10px]"></i>
                </button>
            </div>
            <span class="text-[11px] md:text-sm font-bold t-text-main text-center truncate w-full" title="${singer.name}">${singer.name}</span>
            <div class="mt-1">${getSourceTag ? getSourceTag(singer.source || "wy") : (singer.source || "wy").toUpperCase()}</div>`;
    grid.appendChild(div);
  });
}
window.renderLibraryArtists = renderLibraryArtists;
function renderLibraryAlbums(list) {
  const container = document.getElementById("search-results");
  const header = document.getElementById("search-results-header");
  const paginationBar = document.getElementById("search-pagination-bar");
  if (header)
    header.classList.add("hidden");
  if (paginationBar)
    paginationBar.classList.add("hidden");
  window.libraryBatchMode = false;
  window.libraryBatchSelected.clear();
  window.viewingPlaylist = list;
  if (!list || list.length === 0) {
    container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full t-text-muted space-y-4">
                <i class="fas fa-compact-disc text-6xl opacity-20"></i>
                <p>还没有收藏任何专辑</p>
                <p class="text-xs">在搜索结果中点击 ♥ 收藏专辑</p>
            </div>`;
    return;
  }
  container.innerHTML = `
        <div class="p-3 md:p-4 border-b t-border-main t-bg-main flex items-center justify-between">
            <span class="text-sm font-bold t-text-main">收藏专辑 <span class="text-emerald-500">${list.length}</span> 张</span>
            <div class="flex items-center gap-2">
                <button id="sync-all-albums-btn" onclick="syncAllLibraryAlbums()" class="text-xs px-3 py-1.5 border t-border-main rounded-lg t-text-muted hover:text-blue-500 hover:border-blue-400 transition-all flex items-center gap-1">
                    <i class="fas fa-sync-alt"></i> 同步所有
                </button>
                <button onclick="enterLibraryAlbumBatch()" class="text-xs px-3 py-1.5 border t-border-main rounded-lg t-text-muted hover:text-emerald-600 hover:border-emerald-400 transition-all flex items-center gap-1">
                    <i class="fas fa-tasks"></i> 批量管理
                </button>
            </div>
        </div>
        <div id="lib-album-batch-bar" class="hidden bg-emerald-50 border-b border-emerald-200 p-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <span class="text-sm text-emerald-700">已选: <span id="lib-album-sel-count" class="font-bold">0</span></span>
                <button onclick="libSelectAllAlbums()" class="text-xs px-3 py-1 t-bg-panel border border-emerald-300 rounded hover:bg-emerald-50 text-emerald-700">全选</button>
                <button onclick="libDeselectAllAlbums()" class="text-xs px-3 py-1 t-bg-panel border t-border-main rounded hover:t-bg-track t-text-muted">清空</button>
                <button onclick="exitLibraryAlbumBatch()" class="text-xs px-3 py-1 t-bg-panel border border-red-300 rounded hover:bg-red-50 text-red-600">退出</button>
            </div>
            <button onclick="libDeleteSelectedAlbums()" class="text-xs px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-1">
                <i class="fas fa-trash"></i> 删除所选
            </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-6" id="lib-album-grid"></div>`;
  const grid = container.querySelector("#lib-album-grid");
  list.forEach((item) => {
    const div = document.createElement("div");
    div.className = "group relative flex flex-col p-3 rounded-2xl transition-all hover:t-bg-panel hover:shadow-lg cursor-pointer border border-transparent hover:border-emerald-500/20";
    div.dataset.libAlbumId = item.id;
    div.dataset.libAlbumSource = item.source;
    div.onclick = (e) => {
      if (e.target.closest(".lib-batch-check") || e.target.closest(".lib-fav-btn") || e.target.closest(".lib-album-download-btn"))
        return;
      if (window.libraryBatchMode === "album") {
        toggleLibAlbumBatchSelect(item.id);
        return;
      }
      enterAlbum(item.id, item.source || "wy");
    };
    div.innerHTML = `
            <div class="aspect-square rounded-xl overflow-hidden shadow-md mb-3 relative">
                <img src="${item.picUrl || "/music/assets/logo.svg"}"
                     onerror="this.src='/music/assets/logo.svg'"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="lib-batch-check absolute inset-0 bg-black/40 hidden items-center justify-center rounded-xl">
                    <i class="fas fa-check-circle text-white text-3xl"></i>
                </div>
                <div class="absolute top-1.5 right-1.5 flex gap-1.5">
                    <button type="button" class="lib-album-download-btn w-8 h-8 rounded-full bg-black/45 hover:bg-emerald-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all shadow-sm disabled:opacity-60 disabled:cursor-wait" title="下载本专辑全部歌曲">
                        <i class="fas fa-download text-xs"></i>
                    </button>
                    <button type="button" class="lib-fav-btn w-8 h-8 rounded-full bg-red-400/80 hover:bg-red-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all shadow-sm" title="取消收藏"
                            onclick="event.stopPropagation(); removeLibraryAlbum('${item.id}', '${item.source}')">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </div>
            </div>
            <span class="text-sm font-bold t-text-main line-clamp-2 h-10 leading-5 mb-1" title="${item.name}">${item.name}</span>
            <div class="flex items-center justify-between mt-1">
                <span class="text-[10px] t-text-muted truncate flex-1">
                    ${item.artistName || "未知歌手"}
                    ${item.list && item.list.length ? `<span class="ml-1 text-emerald-500 font-bold">(${item.list.length} 首)</span>` : ""}
                </span>
                <span class="text-[10px] t-text-muted ml-2">${getSourceTag ? getSourceTag(item.source) : ""}</span>
            </div>`;
    const downloadButton = div.querySelector(".lib-album-download-btn");
    downloadButton?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await downloadArtistAlbumSongs(item, downloadButton);
    });
    grid.appendChild(div);
  });
}
window.renderLibraryAlbums = renderLibraryAlbums;
function handleArtistLibraryClick() {
  exitListSecondaryModes && exitListSecondaryModes();
  document.querySelectorAll('[id^="view-"]').forEach((el) => el.classList.add("hidden"));
  const activeView = document.getElementById("view-search");
  activeView.classList.remove("hidden");
  setTimeout(() => activeView.classList.remove("opacity-0"), 10);
  document.querySelectorAll('[id^="tab-"]').forEach((el) => {
    el.classList.remove("active-tab", "text-emerald-600");
    el.classList.add("t-text-muted");
  });
  const favTab = document.getElementById("tab-favorites");
  if (favTab) {
    favTab.classList.add("active-tab");
    favTab.classList.remove("t-text-muted");
  }
  document.querySelectorAll("[data-sidebar-list-id]").forEach((el) => {
    el.classList.remove("active-sub-item");
    el.classList.add("t-text-muted");
  });
  const subItem = document.querySelector('[data-sidebar-list-id="__lib_artists__"]');
  if (subItem) {
    subItem.classList.add("active-sub-item");
    subItem.classList.remove("t-text-muted");
  }
  document.getElementById("page-title").innerText = "收藏歌手";
  document.getElementById("search-input").value = "";
  document.getElementById("search-input").placeholder = "搜索收藏歌手...";
  document.getElementById("search-source").classList.add("hidden");
  document.getElementById("search-type").classList.add("hidden");
  currentSearchScope = "lib_artists";
  window.currentViewingListId = "__lib_artists__";
  renderLibraryArtists(window.libraryData.artists);
}
window.handleArtistLibraryClick = handleArtistLibraryClick;
function handleAlbumLibraryClick() {
  exitListSecondaryModes && exitListSecondaryModes();
  document.querySelectorAll('[id^="view-"]').forEach((el) => el.classList.add("hidden"));
  const activeView = document.getElementById("view-search");
  activeView.classList.remove("hidden");
  setTimeout(() => activeView.classList.remove("opacity-0"), 10);
  document.querySelectorAll('[id^="tab-"]').forEach((el) => {
    el.classList.remove("active-tab", "text-emerald-600");
    el.classList.add("t-text-muted");
  });
  const favTab = document.getElementById("tab-favorites");
  if (favTab) {
    favTab.classList.add("active-tab");
    favTab.classList.remove("t-text-muted");
  }
  document.querySelectorAll("[data-sidebar-list-id]").forEach((el) => {
    el.classList.remove("active-sub-item");
    el.classList.add("t-text-muted");
  });
  const subItem = document.querySelector('[data-sidebar-list-id="__lib_albums__"]');
  if (subItem) {
    subItem.classList.add("active-sub-item");
    subItem.classList.remove("t-text-muted");
  }
  document.getElementById("page-title").innerText = "收藏专辑";
  document.getElementById("search-input").value = "";
  document.getElementById("search-input").placeholder = "搜索收藏专辑...";
  document.getElementById("search-source").classList.add("hidden");
  document.getElementById("search-type").classList.add("hidden");
  currentSearchScope = "lib_albums";
  window.currentViewingListId = "__lib_albums__";
  renderLibraryAlbums(window.libraryData.albums);
}
window.handleAlbumLibraryClick = handleAlbumLibraryClick;
function enterLibraryArtistBatch() {
  window.libraryBatchMode = "artist";
  window.libraryBatchSelected.clear();
  const bar = document.getElementById("lib-artist-batch-bar");
  if (bar)
    bar.classList.remove("hidden");
  updateLibArtistBatchCount();
}
function exitLibraryArtistBatch() {
  window.libraryBatchMode = false;
  window.libraryBatchSelected.clear();
  const bar = document.getElementById("lib-artist-batch-bar");
  if (bar)
    bar.classList.add("hidden");
  document.querySelectorAll("#lib-artist-grid .lib-batch-check").forEach((el) => el.classList.remove("flex"));
  document.querySelectorAll("#lib-artist-grid .lib-batch-check").forEach((el) => el.classList.add("hidden"));
}
function toggleLibArtistBatchSelect(id) {
  if (window.libraryBatchSelected.has(String(id))) {
    window.libraryBatchSelected.delete(String(id));
  } else {
    window.libraryBatchSelected.add(String(id));
  }
  document.querySelectorAll("#lib-artist-grid [data-lib-artist-id]").forEach((card) => {
    const check = card.querySelector(".lib-batch-check");
    if (!check)
      return;
    if (window.libraryBatchSelected.has(card.dataset.libArtistId)) {
      check.classList.remove("hidden");
      check.classList.add("flex");
    } else {
      check.classList.add("hidden");
      check.classList.remove("flex");
    }
  });
  updateLibArtistBatchCount();
}
function libSelectAllArtists() {
  window.libraryData.artists.forEach((a) => window.libraryBatchSelected.add(String(a.id)));
  document.querySelectorAll("#lib-artist-grid .lib-batch-check").forEach((el) => {
    el.classList.remove("hidden");
    el.classList.add("flex");
  });
  updateLibArtistBatchCount();
}
function libDeselectAllArtists() {
  window.libraryBatchSelected.clear();
  document.querySelectorAll("#lib-artist-grid .lib-batch-check").forEach((el) => {
    el.classList.add("hidden");
    el.classList.remove("flex");
  });
  updateLibArtistBatchCount();
}
function updateLibArtistBatchCount() {
  const el = document.getElementById("lib-artist-sel-count");
  if (el)
    el.textContent = window.libraryBatchSelected.size;
}
async function libDeleteSelectedArtists() {
  if (window.libraryBatchSelected.size === 0) {
    showInfo("请先选择要删除的歌手");
    return;
  }
  if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
    if (!await requireAdminForOpenWrite("删除公开收藏歌手"))
      return;
  }
  const confirmed = await showSelect("删除收藏歌手", `确定删除选中的 ${window.libraryBatchSelected.size} 位歌手吗？`, { danger: true });
  if (!confirmed)
    return;
  window.libraryData.artists = window.libraryData.artists.filter((a) => !window.libraryBatchSelected.has(String(a.id)));
  await saveLibraryArtists();
  exitLibraryArtistBatch();
  renderLibraryArtists(window.libraryData.artists);
  showSuccess("已删除所选歌手");
}
async function removeLibraryArtist(id, source) {
  if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
    if (!await requireAdminForOpenWrite("删除公开收藏歌手"))
      return;
  }
  window.libraryData.artists = window.libraryData.artists.filter((a) => !(String(a.id) === String(id) && a.source === source));
  await saveLibraryArtists();
  renderLibraryArtists(window.libraryData.artists);
  showInfo("已取消收藏");
}
window.enterLibraryArtistBatch = enterLibraryArtistBatch;
window.exitLibraryArtistBatch = exitLibraryArtistBatch;
window.libSelectAllArtists = libSelectAllArtists;
window.libDeselectAllArtists = libDeselectAllArtists;
window.libDeleteSelectedArtists = libDeleteSelectedArtists;
window.removeLibraryArtist = removeLibraryArtist;
function enterLibraryAlbumBatch() {
  window.libraryBatchMode = "album";
  window.libraryBatchSelected.clear();
  const bar = document.getElementById("lib-album-batch-bar");
  if (bar)
    bar.classList.remove("hidden");
  updateLibAlbumBatchCount();
}
function exitLibraryAlbumBatch() {
  window.libraryBatchMode = false;
  window.libraryBatchSelected.clear();
  const bar = document.getElementById("lib-album-batch-bar");
  if (bar)
    bar.classList.add("hidden");
  document.querySelectorAll("#lib-album-grid .lib-batch-check").forEach((el) => {
    el.classList.add("hidden");
    el.classList.remove("flex");
  });
}
function toggleLibAlbumBatchSelect(id) {
  if (window.libraryBatchSelected.has(String(id))) {
    window.libraryBatchSelected.delete(String(id));
  } else {
    window.libraryBatchSelected.add(String(id));
  }
  document.querySelectorAll("#lib-album-grid [data-lib-album-id]").forEach((card) => {
    const check = card.querySelector(".lib-batch-check");
    if (!check)
      return;
    if (window.libraryBatchSelected.has(card.dataset.libAlbumId)) {
      check.classList.remove("hidden");
      check.classList.add("flex");
    } else {
      check.classList.add("hidden");
      check.classList.remove("flex");
    }
  });
  updateLibAlbumBatchCount();
}
function libSelectAllAlbums() {
  window.libraryData.albums.forEach((a) => window.libraryBatchSelected.add(String(a.id)));
  document.querySelectorAll("#lib-album-grid .lib-batch-check").forEach((el) => {
    el.classList.remove("hidden");
    el.classList.add("flex");
  });
  updateLibAlbumBatchCount();
}
function libDeselectAllAlbums() {
  window.libraryBatchSelected.clear();
  document.querySelectorAll("#lib-album-grid .lib-batch-check").forEach((el) => {
    el.classList.add("hidden");
    el.classList.remove("flex");
  });
  updateLibAlbumBatchCount();
}
function updateLibAlbumBatchCount() {
  const el = document.getElementById("lib-album-sel-count");
  if (el)
    el.textContent = window.libraryBatchSelected.size;
}
async function libDeleteSelectedAlbums() {
  if (window.libraryBatchSelected.size === 0) {
    showInfo("请先选择要删除的专辑");
    return;
  }
  if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
    if (!await requireAdminForOpenWrite("删除公开收藏专辑"))
      return;
  }
  const confirmed = await showSelect("删除收藏专辑", `确定删除选中的 ${window.libraryBatchSelected.size} 张专辑吗？`, { danger: true });
  if (!confirmed)
    return;
  window.libraryData.albums = window.libraryData.albums.filter((a) => !window.libraryBatchSelected.has(String(a.id)));
  await saveLibraryAlbums();
  exitLibraryAlbumBatch();
  renderLibraryAlbums(window.libraryData.albums);
  showSuccess("已删除所选专辑");
}
async function removeLibraryAlbum(id, source) {
  if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
    if (!await requireAdminForOpenWrite("删除公开收藏专辑"))
      return;
  }
  window.libraryData.albums = window.libraryData.albums.filter((a) => !(String(a.id) === String(id) && a.source === source));
  await saveLibraryAlbums();
  renderLibraryAlbums(window.libraryData.albums);
  showInfo("已取消收藏");
}
window.enterLibraryAlbumBatch = enterLibraryAlbumBatch;
window.exitLibraryAlbumBatch = exitLibraryAlbumBatch;
window.libSelectAllAlbums = libSelectAllAlbums;
window.libDeselectAllAlbums = libDeselectAllAlbums;
window.libDeleteSelectedAlbums = libDeleteSelectedAlbums;
window.removeLibraryAlbum = removeLibraryAlbum;
var syncManager = window.SyncManager;
var currentListData = null;
var syncModeResolve = null;
function switchSyncMode(mode) {
  const btnLocal = document.getElementById("btn-mode-local");
  const btnRemote = document.getElementById("btn-mode-remote");
  const formLocal = document.getElementById("sync-form-local");
  const formRemote = document.getElementById("sync-form-remote");
  if (mode === "local") {
    btnLocal.className = "px-4 py-2 rounded-lg text-sm font-medium bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500 transition-all";
    btnRemote.className = "px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 t-text-muted hover:bg-gray-200 transition-all";
    formLocal.classList.remove("hidden");
    formRemote.classList.add("hidden");
  } else {
    btnLocal.className = "px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 t-text-muted hover:bg-gray-200 transition-all";
    btnRemote.className = "px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 ring-2 ring-blue-500 transition-all";
    formLocal.classList.add("hidden");
    formRemote.classList.remove("hidden");
    handleRemoteBack();
  }
}
async function pushSettingsToServer(force = false) {
  if (!force && !settings.saveAccountSettingsToFile)
    return;
  if (localStorage.getItem("lx_sync_mode") !== "local" && !window.lx_config?.["user.enablePublicRestriction"] && !force)
    return;
  const user = localStorage.getItem("lx_sync_user");
  const isPublicMode = !user && window.lx_config?.["user.enablePublicRestriction"];
  if (!user && !isPublicMode && !force)
    return;
  try {
    const headers = { "Content-Type": "application/json" };
    if (isPublicMode) {
      headers["x-user-name"] = "default";
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
    } else {
      Object.assign(headers, getUserAuthHeaders());
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
    }
    const res = await fetch("/api/user/settings", {
      method: "POST",
      headers,
      body: JSON.stringify(settings)
    });
    if (res.ok) {
      console.log("[Settings] 已成功同步到服务器");
    }
    if (window.soundEffects && typeof window.soundEffects.pushToServer === "function") {
      window.soundEffects.pushToServer();
    }
  } catch (e) {
    console.error("[Settings] 同步到服务器失败:", e);
    if (force)
      throw e;
  }
}
async function fetchSettingsFromServer() {
  if (!settings.saveAccountSettingsToFile)
    return;
  const user = localStorage.getItem("lx_sync_user");
  const isPublicMode = !user && window.lx_config?.["user.enablePublicRestriction"];
  if (!user && !isPublicMode)
    return;
  try {
    console.log("[Settings] 正在从服务器尝试加载设置...");
    const headers = {};
    if (isPublicMode) {
      headers["x-user-name"] = "default";
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
    } else {
      Object.assign(headers, getUserAuthHeaders());
      const adminPass = localStorage.getItem("lx_admin_password");
      if (adminPass)
        headers["x-frontend-auth"] = adminPass;
    }
    const res = await fetch("/api/user/settings", {
      headers
    });
    if (res.ok) {
      const serverSettings = await res.json();
      console.log("[Settings] 从服务器加载设置成功:", serverSettings);
      settings = normalizeStoredSettings({ ...settings, ...serverSettings });
      localStorage.setItem("lx_settings", JSON.stringify(settings));
      syncSettingsUI();
      setupNetworkListAutoCheck();
      if (typeof showSuccess === "function") {
        showSuccess("已从服务器恢复设置");
      }
      if (window.soundEffects && typeof window.soundEffects.fetchFromServer === "function") {
        window.soundEffects.fetchFromServer();
      }
    } else {
      console.log("[Settings] 服务器无设置文件或加载失败");
    }
  } catch (e) {
    console.error("[Settings] 从服务器加载设置失败:", e);
  }
}
function updateSyncStatus(html, showLogout = true) {
  const statusEl = document.getElementById("sync-status");
  const settingsOption = document.getElementById("sync-settings-file-option");
  if (!statusEl)
    return;
  let fullHtml = html;
  const hasActiveLogin = currentListData || syncManager && syncManager.client && syncManager.client.isConnected;
  if (showLogout && hasActiveLogin) {
    fullHtml += ` <button onclick="handleSyncLogout()" class="ml-2 text-red-500 hover:text-red-600 text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border border-red-200 hover:bg-red-300/10 transition-all inline-flex items-center gap-1" title="退出登录"><i class="fas fa-sign-out-alt"></i><span class="hidden sm:inline">退出登录</span></button>`;
    if (localStorage.getItem("lx_sync_mode") === "local") {
      const username = localStorage.getItem("lx_sync_user") || "该用户";
      fullHtml += ` <button onclick="showRemoteOverwriteModal('${username}')" class="ml-2 text-emerald-500 hover:text-emerald-600 text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-300/10 transition-all inline-flex items-center gap-1" title="连接远程服务器"><i class="fas fa-satellite-dish"></i><span class="hidden sm:inline">连接远程服务器</span></button>`;
    }
  }
  statusEl.innerHTML = fullHtml;
  if (typeof updateAdminUI === "function")
    updateAdminUI();
}
async function handleSyncLogout(skipConfirm = false) {
  if (!skipConfirm) {
    const confirmed = typeof showSelect === "function" ? await showSelect("退出同步账号", "确定要退出当前账号并清除同步凭证？", { danger: true }) : confirm("确定要退出当前账号并清除同步凭证？");
    if (!confirmed)
      return;
  }
  try {
    if (userToken) {
      try {
        await fetch("/api/user/logout", {
          method: "POST",
          headers: { "x-user-token": userToken }
        });
      } catch (e) {
        console.warn("[Auth] Token 注销失败:", e);
      }
      userToken = null;
    }
    if (syncManager && syncManager.client && typeof syncManager.client.close === "function") {
      syncManager.client.close();
    }
    if (typeof audio !== "undefined" && audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
      } catch (e) {}
    }
    if (typeof lyricPlayer !== "undefined" && lyricPlayer && typeof lyricPlayer.stop === "function") {
      try {
        lyricPlayer.stop();
      } catch (e) {}
    }
    window.currentSong = null;
    if (typeof currentSong !== "undefined")
      currentSong = null;
    window.playlist = [];
    if (typeof playlist !== "undefined")
      playlist = [];
    if (typeof playHistory !== "undefined")
      playHistory = [];
    currentListData = null;
    window.currentListData = null;
    window.myPersonalListData = null;
    window.publicListData = null;
    window.isViewingPublicFavorites = false;
    if (window.ListStore && typeof window.ListStore.remove === "function") {
      await window.ListStore.remove().catch((e) => console.warn("[IDBStore] 清除失败:", e));
    }
    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) {
        console.warn("[Cache] 物理缓存删除失败:", e);
      }
    }
    const agreementAccepted = localStorage.getItem("lx_agreement_accepted");
    localStorage.clear();
    sessionStorage.clear();
    if (agreementAccepted) {
      localStorage.setItem("lx_agreement_accepted", agreementAccepted);
    }
    const localUser = document.getElementById("sync-local-user");
    const localPass = document.getElementById("sync-local-pass");
    const remoteUrl = document.getElementById("sync-remote-url");
    const remoteCode = document.getElementById("sync-remote-code");
    if (localUser)
      localUser.value = "";
    if (localPass)
      localPass.value = "";
    if (remoteUrl)
      remoteUrl.value = "";
    if (remoteCode)
      remoteCode.value = "";
    if (typeof showSuccess === "function") {
      showSuccess("已安全退出登录并清除所有缓存，正在刷新页面...");
    }
    setTimeout(() => {
      window.location.reload();
    }, 300);
  } catch (err) {
    console.error("[Logout] 清除缓存或退出过程出错:", err);
    window.location.reload();
  }
}
async function handleLocalLogin() {
  const user = document.getElementById("sync-local-user").value;
  const pass = document.getElementById("sync-local-pass").value;
  const statusEl = document.getElementById("sync-status");
  if (!user || !pass) {
    showError("请输入用户名和密码");
    return;
  }
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-emerald-500"></i> 正在登录...';
  try {
    syncManager.initLocal(user, pass);
    const success = await syncManager.client.login();
    if (success) {
      statusEl.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i> 登录成功，正在同步...';
      if (userToken) {
        console.log("[Auth] 检测到现有的 User Token，跳过登录接口直接尝试数据同步。");
      } else {
        try {
          const tokenRes = await fetch("/api/user/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user, password: pass })
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData.token) {
              userToken = tokenData.token;
              localStorage.setItem("lx_user_token", userToken);
              console.log("[Auth] 新用户 Token 已获取并保存");
            }
          }
        } catch (e) {
          console.warn("[Auth] Token 获取失败，回退到旧式认证方式:", e);
        }
      }
      const tokenSection = document.getElementById("token-management-section");
      if (tokenSection) {
        tokenSection.classList.remove("hidden");
        loadTokenConfig();
      }
      const listData = await syncManager.sync();
      currentListData = listData;
      if (currentListData)
        currentListData.username = user;
      window.myPersonalListData = currentListData;
      renderMyLists(listData);
      loadLibraryData();
      await window.ListStore.set(listData).catch((e) => console.error("[IDBStore] 保存失败:", e));
      updateSyncStatus(`<i class="fas fa-check-circle text-emerald-500"></i> 已同步 (用户: ${user})`);
      localStorage.setItem("lx_sync_mode", "local");
      localStorage.setItem("lx_sync_user", user);
      localStorage.setItem("lx_sync_pass", pass);
      if (typeof updateUserUI === "function")
        updateUserUI();
      if (settings.saveAccountSettingsToFile) {
        fetchSettingsFromServer();
      }
      if (settings.enableClientModeSync && settings.remoteSyncUrl && settings.remoteSyncCode) {
        console.info("[Sync] Client mode auto-triggering remote sync after local login...");
        setTimeout(() => {
          handleRemoteOverwriteConnect(true);
        }, 1000);
      }
    } else {
      statusEl.innerHTML = '<i class="fas fa-times-circle text-red-500"></i> 登录失败: 用户名或密码错误';
    }
  } catch (e) {
    statusEl.innerHTML = `<i class="fas fa-exclamation-circle text-red-500"></i> 错误: ${e.message}`;
  }
}
function showSyncModeModal() {
  const modal = document.getElementById("sync-auth-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.getElementById("sync-connect-form").classList.add("hidden");
  document.getElementById("sync-mode-selection").classList.remove("hidden");
}
window.showSyncModeModal = showSyncModeModal;
function closeSyncModal() {
  const modal = document.getElementById("sync-auth-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.getElementById("sync-connect-form").classList.remove("hidden");
  document.getElementById("sync-mode-selection").classList.add("hidden");
  if (syncModeResolve) {
    syncModeResolve("cancel");
    syncModeResolve = null;
  }
}
function selectSyncMode(mode) {
  const fullOverwrite = document.getElementById("sync-full-overwrite").checked;
  if (fullOverwrite && mode.startsWith("overwrite")) {
    mode += "_full";
  }
  const translatedMode = mode;
  if (syncModeResolve) {
    syncModeResolve(translatedMode);
    syncModeResolve = null;
  }
  closeSyncModal();
}
function cancelSyncMode() {
  if (syncModeResolve) {
    syncModeResolve("cancel");
    syncModeResolve = null;
  }
  closeSyncModal();
}
function handleRemoteStep1() {
  const url = document.getElementById("sync-remote-url").value.trim();
  if (!url) {
    showError("请输入链接地址");
    return;
  }
  if (!url.match(/^(ws|http)s?:\/\//)) {
    showError("链接格式错误，应以 http://, https://, ws:// 或 wss:// 开头");
    return;
  }
  document.getElementById("sync-remote-step1").classList.add("hidden");
  document.getElementById("sync-remote-step2").classList.remove("hidden");
}
function handleRemoteBack() {
  document.getElementById("sync-remote-step1").classList.remove("hidden");
  document.getElementById("sync-remote-step2").classList.add("hidden");
  document.getElementById("sync-remote-code").value = "";
}
function handleRemoteConnect() {
  const url = document.getElementById("sync-remote-url").value;
  const code = document.getElementById("sync-remote-code").value;
  const statusEl = document.getElementById("sync-status");
  if (!code) {
    showError("请输入连接码");
    return;
  }
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i> 正在连接远程服务器...';
  try {
    let authInfo = null;
    if (localStorage.getItem("lx_sync_url") === url && localStorage.getItem("lx_sync_code") === code) {
      try {
        const savedStr = localStorage.getItem("lx_ws_auth");
        if (savedStr)
          authInfo = JSON.parse(savedStr);
      } catch (e) {}
    }
    syncManager.initRemote(url, code, {
      getData: async () => {
        const cachedData = await window.ListStore.get().catch(() => null);
        if (cachedData) {
          console.log("[Cache] 从缓存加载列表数据");
          return cachedData;
        }
        return currentListData || { defaultList: [], loveList: [], userList: [] };
      },
      setData: async (data) => {
        console.log("[Sync] 远程数据已同步:", data);
        await window.ListStore.set(data).catch((e) => console.error("[IDBStore] 保存失败:", e));
        const oldUsername = currentListData ? currentListData.username : null;
        currentListData = data;
        if (oldUsername)
          currentListData.username = oldUsername;
        renderMyLists(data);
        updateSyncStatus('<i class="fas fa-check-circle text-blue-500"></i> 数据已同步');
      },
      getSyncMode: async () => {
        return new Promise((resolve) => {
          syncModeResolve = resolve;
          showSyncModeModal();
        });
      }
    }, authInfo);
    syncManager.client.onLogin = async (success, msg) => {
      if (success) {
        updateSyncStatus('<i class="fas fa-check-circle text-green-500"></i> 已连接 (等待同步...)');
        localStorage.setItem("lx_sync_mode", "remote");
        localStorage.setItem("lx_sync_url", url);
        localStorage.setItem("lx_sync_code", code);
        if (syncManager.client.authInfo) {
          localStorage.setItem("lx_ws_auth", JSON.stringify(syncManager.client.authInfo));
          console.log("[Cache] WS认证信息已保存");
        }
      } else {
        statusEl.innerHTML = `<i class="fas fa-times-circle text-red-500"></i> 连接失败: ${msg || "未知错误"}`;
      }
    };
    syncManager.client.connect();
  } catch (e) {
    statusEl.innerHTML = `<i class="fas fa-exclamation-circle text-red-500"></i> 错误: ${e.message}`;
  }
}
var currentRemoteOverwriteClient = null;
function switchRemoteModalStep(stepId) {
  const steps = ["remote-overwrite-step1", "remote-overwrite-mode-selection", "remote-overwrite-step2", "remote-overwrite-result"];
  steps.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (id === stepId)
        el.classList.remove("hidden");
      else
        el.classList.add("hidden");
    }
  });
}
function showRemoteOverwriteModal(username) {
  const modal = document.getElementById("modal-remote-overwrite");
  const content = document.getElementById("modal-remote-overwrite-content");
  if (!modal)
    return;
  if (currentRemoteOverwriteClient) {
    currentRemoteOverwriteClient.close();
    currentRemoteOverwriteClient = null;
  }
  switchRemoteModalStep("remote-overwrite-step1");
  document.getElementById("remote-overwrite-status").innerHTML = "";
  remoteSyncModeResolve = null;
  lastSelectedRemoteSyncMode = null;
  const urlInput = document.getElementById("remote-overwrite-url");
  const codeInput = document.getElementById("remote-overwrite-code");
  if (urlInput && settings.remoteSyncUrl)
    urlInput.value = settings.remoteSyncUrl;
  else if (urlInput) {
    const savedUrl = localStorage.getItem("lx_sync_url");
    if (savedUrl)
      urlInput.value = savedUrl;
  }
  if (codeInput && settings.remoteSyncCode)
    codeInput.value = settings.remoteSyncCode;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(() => {
    content.classList.remove("scale-95", "opacity-0");
  }, 10);
}
var remoteSyncModeResolve = null;
var lastSelectedRemoteSyncMode = null;
async function handleRemoteOverwriteConnect(silent = false) {
  let url = settings.remoteSyncUrl || "";
  let code = settings.remoteSyncCode || "";
  const urlInput = document.getElementById("remote-overwrite-url");
  const codeInput = document.getElementById("remote-overwrite-code");
  if (urlInput && urlInput.value.trim())
    url = urlInput.value.trim();
  if (codeInput && codeInput.value.trim())
    code = codeInput.value.trim();
  const statusEl = document.getElementById("remote-overwrite-status");
  if (!url || !code) {
    if (!silent && statusEl)
      statusEl.innerText = "请输入完整的连接信息";
    return;
  }
  if (!silent && statusEl) {
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-emerald-500"></i> 正在建立安全连接...';
  }
  if (currentRemoteOverwriteClient)
    currentRemoteOverwriteClient.close();
  currentRemoteOverwriteClient = new RemoteClient(url, code);
  const tempRemoteClient = currentRemoteOverwriteClient;
  tempRemoteClient.listHandlers = {
    getData: async () => {
      return currentListData || { defaultList: [], loveList: [], userList: [] };
    },
    setData: async (data) => {
      console.log("[RemoteOverwrite] 收到远程数据，准备覆盖本地...");
      try {
        const oldUsername = currentListData ? currentListData.username : localStorage.getItem("lx_sync_user");
        currentListData = data;
        if (oldUsername)
          currentListData.username = oldUsername;
        await window.ListStore.set(data).catch((e) => console.error("[IDBStore] 保存失败:", e));
        renderMyLists(data);
        if (syncManager && syncManager.mode === "local") {
          await syncManager.push(data);
          console.log("[RemoteOverwrite] 已推送到本地服务器");
        }
      } catch (err) {
        console.error("[RemoteOverwrite] 覆盖应用失败:", err);
      }
    },
    getSyncMode: async () => {
      console.log("[RemoteOverwrite] Server requested sync mode");
      if (settings.enableClientModeSync && settings.lastRemoteSyncMode) {
        console.log("[RemoteOverwrite] Client mode: auto-selecting mode:", settings.lastRemoteSyncMode);
        lastSelectedRemoteSyncMode = settings.lastRemoteSyncMode;
        return settings.lastRemoteSyncMode;
      }
      return new Promise((resolve) => {
        remoteSyncModeResolve = resolve;
        switchRemoteModalStep("remote-overwrite-mode-selection");
        if (silent) {
          const modal = document.getElementById("modal-remote-overwrite");
          if (modal && modal.classList.contains("hidden")) {
            showRemoteOverwriteModal();
          }
        }
      });
    }
  };
  tempRemoteClient.onLogin = (success, msg) => {
    if (success) {
      settings.remoteSyncUrl = url;
      settings.remoteSyncCode = code;
      localStorage.setItem("lx_settings", JSON.stringify(settings));
      if (settings.saveAccountSettingsToFile) {
        pushSettingsToServer();
      }
      if (!silent && statusEl) {
        statusEl.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i> 已连通，等待同步指令...';
      }
    } else {
      if (!silent && statusEl) {
        statusEl.classList.remove("t-text-muted");
        statusEl.classList.add("text-red-500");
        statusEl.innerText = "连接失败: " + (msg || "未知错误");
      } else if (silent) {
        console.warn("[Sync] Silent connect failed:", msg);
      }
    }
  };
  tempRemoteClient.onSync = (status) => {
    if (status === "finished") {
      if (!silent) {
        switchRemoteModalStep("remote-overwrite-result");
      } else {
        console.info("[Sync] Silent sync finished.");
        if (window.showInfo)
          showInfo("远程同步成功");
      }
      tempRemoteClient.close();
      currentRemoteOverwriteClient = null;
      const titleEl = document.getElementById("remote-overwrite-result-title");
      const textEl = document.getElementById("remote-overwrite-result-text");
      const username = localStorage.getItem("lx_sync_user") || "该用户";
      if (lastSelectedRemoteSyncMode === "overwrite_local_remote_full") {
        if (titleEl)
          titleEl.innerText = "推送同步成功！";
        if (textEl)
          textEl.innerText = "当前本地账户歌单已成功覆盖至远程服务器。";
      } else if (lastSelectedRemoteSyncMode === "merge_local_remote") {
        if (titleEl)
          titleEl.innerText = "合并同步成功！";
        if (textEl)
          textEl.innerText = "当前本地账户歌单已成功合并至远程服务器。";
      } else if (lastSelectedRemoteSyncMode === "overwrite_remote_local_full") {
        if (titleEl)
          titleEl.innerText = "拉取覆盖成功！";
        if (textEl)
          textEl.innerText = "远程服务器歌单已成功覆盖至当前本地账户。";
      } else if (lastSelectedRemoteSyncMode === "merge_remote_local") {
        if (titleEl)
          titleEl.innerText = "拉取合并成功！";
        if (textEl)
          textEl.innerText = "远程服务器歌单已成功合并至当前本地账户。";
      } else {
        if (titleEl)
          titleEl.innerText = "连接成功";
        if (textEl)
          textEl.innerText = "远程服务器已连接，当前数据内容与本地完全一致。";
      }
      updateSyncStatus(`<i class="fas fa-check-circle text-emerald-500"></i> 远程同步任务已完成 (${username})`);
    } else if (status === "started" || status === "syncing") {
      if (!silent) {
        switchRemoteModalStep("remote-overwrite-step2");
      }
    }
  };
  try {
    await tempRemoteClient.connect();
  } catch (err) {
    if (!silent && statusEl)
      statusEl.innerText = "初始化失败: " + err.message;
    else
      console.error("[Sync] Silent connect failed:", err);
  }
}
async function handleRemoveList(listId, event) {
  event.stopPropagation();
  if (!await showSelect("删除歌单", "确定要删除歌单吗？", { danger: true }))
    return;
  if (!await requireAdminForOpenWrite("删除公开歌单"))
    return;
  if (currentListData) {
    const index = currentListData.userList.findIndex((l) => l.id === listId);
    if (index >= 0) {
      currentListData.userList.splice(index, 1);
      try {
        await pushDataChange();
        renderMyLists(currentListData);
      } catch (e) {
        showError("删除同步失败");
      }
    }
  }
}
function getFavoriteSidebarOrder() {
  return Array.isArray(settings.favoriteSidebarOrder) ? settings.favoriteSidebarOrder : [];
}
function getOrderedFavoriteSidebarItems(items) {
  const order = getFavoriteSidebarOrder();
  if (!order.length)
    return items;
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const orderedItems = [];
  order.forEach((id) => {
    const item = itemMap.get(id);
    if (!item)
      return;
    orderedItems.push(item);
    itemMap.delete(id);
  });
  return [...orderedItems, ...itemMap.values()];
}
function persistFavoriteSidebarOrder(ids) {
  settings.favoriteSidebarOrder = ids;
  window.settings = settings;
  try {
    localStorage.setItem("lx_settings", JSON.stringify(settings));
  } catch (e) {
    console.error("[Settings] 保存收藏侧边栏排序失败:", e);
  }
  if (settings.saveAccountSettingsToFile) {
    pushSettingsToServer();
  }
}
async function persistUserListOrderFromSidebar(ids) {
  if (!currentListData || !Array.isArray(currentListData.userList))
    return;
  const currentUserIds = currentListData.userList.map((list) => list.id);
  const userOrder = ids.filter((id) => currentUserIds.includes(id));
  if (userOrder.length !== currentUserIds.length)
    return;
  if (userOrder.every((id, index) => id === currentUserIds[index]))
    return;
  const listMap = new Map(currentListData.userList.map((list) => [list.id, list]));
  currentListData.userList = userOrder.map((id) => listMap.get(id)).filter(Boolean);
  try {
    await pushDataChange();
  } catch (e) {
    console.error("[Playlist] 保存歌单排序失败:", e);
    showError("保存歌单排序失败，请稍后重试");
  }
}
function initFavoriteSidebarSortable(container) {
  if (typeof Sortable === "undefined" || !container)
    return;
  try {
    const oldSortable = Sortable.get(container);
    if (oldSortable)
      oldSortable.destroy();
  } catch (e) {
    console.warn("[Playlist] 重置侧边栏排序失败:", e);
  }
  Sortable.create(container, {
    animation: 150,
    handle: ".favorite-sidebar-drag-handle",
    ghostClass: "opacity-50",
    chosenClass: "bg-emerald-50",
    onEnd: () => {
      const ids = Array.from(container.querySelectorAll("[data-sidebar-sort-id]")).map((el) => el.getAttribute("data-sidebar-sort-id")).filter(Boolean);
      persistFavoriteSidebarOrder(ids);
      persistUserListOrderFromSidebar(ids);
    }
  });
}
function renderMyLists(data) {
  const container = document.getElementById("my-lists-container");
  container.innerHTML = "";
  if (!data) {
    container.innerHTML = '<div class="px-6 py-2 text-sm t-text-muted">请先在设置中登录</div>';
    refreshFavoritesChildrenHeight();
    return;
  }
  const createItem = (listObj, name, icon, count) => {
    const id = typeof listObj === "string" ? listObj : listObj.id;
    const displayName = String(name || "未命名歌单");
    const div = document.createElement("div");
    div.className = "px-6 py-2 text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group transition-colors overflow-hidden";
    div.setAttribute("data-sidebar-list-id", id);
    div.setAttribute("data-sidebar-sort-id", id);
    div.onclick = () => handleListClick(id);
    const nameHtml = displayName.length > 8 ? createMarqueeHtml(displayName, "flex-1") : `<span class="ml-2 flex-1 truncate">${escapeHtmlText(displayName)}</span>`;
    const showExternalOps = listObj && listObj.sourceListId && listObj.source;
    let opsHtml = "";
    if (showExternalOps) {
      const updateBadge = window.networkListUpdateMap && window.networkListUpdateMap.has(id) ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold mr-2" title="歌单有更新">!</span>` : "";
      opsHtml = `
                <i class="fas fa-sync-alt refresh-btn text-gray-400 hover:text-emerald-500 hidden group-hover:block flex-shrink-0 text-[10px] mr-2 transition-all active:rotate-180" 
                   title="更新歌单内容" 
                   onclick="event.stopPropagation(); handleRefreshList('${id}', event)"></i>
                <i class="fas fa-external-link-alt jump-btn text-gray-400 hover:text-emerald-500 hidden group-hover:block flex-shrink-0 text-[10px] mr-2 transition-all" 
                   title="打开原始歌单" 
                   onclick="event.stopPropagation(); handleJumpToOriginalList('${id}', event)"></i>
                ${updateBadge}
            `;
    }
    div.innerHTML = `
            <span class="favorite-sidebar-drag-handle cursor-grab t-text-muted/60 hover:text-emerald-500 mr-2 flex-shrink-0 touch-none" title="拖拽排序">
                <i class="fas fa-grip-vertical text-xs"></i>
            </span>
            ${opsHtml}
            <i class="fas ${icon} w-5 t-text-muted group-hover:text-emerald-500 transition-colors flex-shrink-0"></i>
            ${displayName.length > 8 ? `<div class="ml-2 flex-1 overflow-hidden">${nameHtml}</div>` : nameHtml}
            <span class="text-xs text-gray-300 group-hover:t-text-muted mr-2 flex-shrink-0">${count}</span>
            ${typeof listObj !== "string" ? `<button type="button" class="text-gray-300 hover:text-emerald-500 flex-shrink-0 mr-2 transition-colors" title="重命名歌单" aria-label="重命名歌单" onclick="handleRenameList('${id}', event)"><i class="fas fa-pen text-[10px]"></i></button>` : ""}
            ${id !== "default" && id !== "love" ? `<i class="fas fa-trash text-gray-300 hover:text-red-500 hidden group-hover:block flex-shrink-0" onclick="handleRemoveList('${id}', event)"></i>` : ""}
        `;
    return div;
  };
  const createLibItem = (id, name, icon, countId, clickFn) => {
    const div = document.createElement("div");
    div.className = "px-6 py-2 text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group transition-colors overflow-hidden";
    div.setAttribute("data-sidebar-list-id", id);
    div.setAttribute("data-sidebar-sort-id", id);
    div.onclick = clickFn;
    div.innerHTML = `
            <span class="favorite-sidebar-drag-handle cursor-grab t-text-muted/60 hover:text-emerald-500 mr-2 flex-shrink-0 touch-none" title="拖拽排序">
                <i class="fas fa-grip-vertical text-xs"></i>
            </span>
            <i class="fas ${icon} w-5 t-text-muted group-hover:text-emerald-500 transition-colors flex-shrink-0"></i>
            <span class="ml-2 flex-1 truncate">${name}</span>
            <span id="${countId}" class="text-xs text-gray-300 group-hover:t-text-muted mr-2 flex-shrink-0">0</span>
        `;
    return div;
  };
  const sidebarItems = [];
  const enablePublicFavorites = !!window.lx_config?.["user.enablePublicFavorites"];
  const isUserLoggedIn = typeof window.isUserLoggedIn === "function" ? window.isUserLoggedIn() : false;
  if (enablePublicFavorites && isUserLoggedIn) {
    const isPublicActive = window.isViewingPublicFavorites === true;
    const publicFavItem = document.createElement("div");
    publicFavItem.className = `px-6 py-2 text-sm cursor-pointer flex items-center group transition-colors overflow-hidden ${isPublicActive ? "text-emerald-500 font-bold bg-emerald-500/10" : "t-text-muted hover:t-bg-main"}`;
    publicFavItem.setAttribute("data-sidebar-list-id", "__public_favorites__");
    publicFavItem.setAttribute("data-sidebar-sort-id", "__public_favorites__");
    publicFavItem.onclick = () => handleTogglePublicFavorites();
    publicFavItem.innerHTML = `
            <span class="favorite-sidebar-drag-handle cursor-grab t-text-muted/60 hover:text-emerald-500 mr-2 flex-shrink-0 touch-none" title="拖拽排序">
                <i class="fas fa-grip-vertical text-xs"></i>
            </span>
            <i class="fas fa-globe w-5 ${isPublicActive ? "text-emerald-500" : "t-text-muted group-hover:text-emerald-500"} transition-colors flex-shrink-0"></i>
            <span class="ml-2 flex-1 truncate">公开收藏</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isPublicActive ? "bg-emerald-500 text-white font-bold" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}">${isPublicActive ? "已开启" : "切换"}</span>
        `;
    sidebarItems.push({ id: "__public_favorites__", type: "system", el: publicFavItem });
  }
  sidebarItems.push({ id: "__lib_artists__", type: "lib", el: createLibItem("__lib_artists__", "收藏歌手", "fa-user", "lib-artist-count", handleArtistLibraryClick) }, { id: "__lib_albums__", type: "lib", el: createLibItem("__lib_albums__", "收藏专辑", "fa-compact-disc", "lib-album-count", handleAlbumLibraryClick) });
  if (data.defaultList) {
    sidebarItems.push({ id: "default", type: "system", el: createItem("default", "默认列表", "fa-list", data.defaultList.length) });
  }
  if (data.loveList) {
    sidebarItems.push({ id: "love", type: "system", el: createItem("love", "我的收藏", "fa-heart", data.loveList.length) });
  }
  if (data.userList) {
    data.userList.forEach((l) => {
      const listLen = l.list ? l.list.length : 0;
      sidebarItems.push({ id: l.id, type: "user", el: createItem(l, l.name, "fa-music", listLen) });
    });
  }
  getOrderedFavoriteSidebarItems(sidebarItems).forEach((item) => container.appendChild(item.el));
  refreshLibrarySidebarCount();
  initFavoriteSidebarSortable(container);
  refreshFavoritesChildrenHeight();
  if (window._pendingResumeListId) {
    const listId = window._pendingResumeListId;
    delete window._pendingResumeListId;
    console.log("[Resume] 正在同步本地播放列表上下文:", listId);
    handleListClick(listId);
  }
}
function handleListClick(listId, skipAutoUpdate = false) {
  exitListSecondaryModes();
  if (!currentListData)
    return;
  if (!skipAutoUpdate) {
    window.selectedItems?.clear();
    window.selectedSongObjects?.clear();
    if (typeof updateBatchToolbar === "function")
      updateBatchToolbar();
  }
  if (window.innerWidth < 1025) {
    const sidebar = document.getElementById("main-sidebar");
    if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
      toggleSidebar();
    }
  }
  window.currentViewingListId = listId;
  currentSearchScope = "local_list";
  let list = [];
  let title = "";
  if (listId === "default") {
    list = currentListData.defaultList;
    title = "默认列表";
  } else if (listId === "love") {
    list = currentListData.loveList;
    title = "我的收藏";
  } else {
    const uList = currentListData.userList.find((l) => l.id === listId);
    if (uList) {
      list = uList.list;
      title = uList.name;
    }
  }
  document.querySelectorAll('[id^="view-"]').forEach((el) => el.classList.add("hidden"));
  const activeView = document.getElementById("view-search");
  activeView.classList.remove("hidden");
  initGlobalListSearch();
  setTimeout(() => {
    activeView.classList.remove("opacity-0");
    activeView.classList.add("opacity-100");
  }, 10);
  document.getElementById("page-title").innerText = title;
  document.getElementById("search-input").value = "";
  document.getElementById("search-input").placeholder = `在 ${title} 中搜索...`;
  currentSearchScope = "local_list";
  document.getElementById("search-source").classList.add("hidden");
  document.getElementById("search-type").classList.add("hidden");
  document.querySelectorAll('[id^="tab-"]').forEach((el) => {
    el.classList.remove("active-tab", "text-emerald-600");
    el.classList.add("t-text-muted");
  });
  const favTab = document.getElementById("tab-favorites");
  if (favTab) {
    favTab.classList.add("active-tab");
    favTab.classList.remove("t-text-muted");
  }
  document.querySelectorAll("[data-sidebar-list-id]").forEach((el) => {
    el.classList.remove("active-sub-item");
    el.classList.add("t-text-muted");
  });
  const subItem = document.querySelector(`[data-sidebar-list-id="${listId}"]`);
  if (subItem) {
    subItem.classList.add("active-sub-item");
    subItem.classList.remove("t-text-muted");
  }
  currentPage = 1;
  renderResults(list);
  const uList = currentListData.userList ? currentListData.userList.find((l) => l.id === listId) : null;
  if (!skipAutoUpdate && settings.autoUpdateNetworkList && uList && uList.sourceListId && uList.source) {
    console.log("[AutoUpdate] Triggering background refresh for list:", listId);
    handleRefreshList(listId, null, true);
  }
}
function handleFavoritesClick() {
  exitListSecondaryModes();
  document.querySelectorAll('[id^="tab-"]').forEach((el) => {
    el.classList.remove("active-tab", "text-emerald-600");
    el.classList.add("t-text-muted");
  });
  const favTab = document.getElementById("tab-favorites");
  if (favTab) {
    favTab.classList.add("active-tab");
    favTab.classList.remove("t-text-muted");
  }
  toggleFavorites();
}
async function handleCreateList() {
  const name = await showInput("新建歌单", "请输入新歌单的名称：", {
    placeholder: "歌单名称"
  });
  if (name && currentListData) {
    const activeListData = window.isViewingPublicFavorites && window.myPersonalListData ? window.myPersonalListData : currentListData;
    if (activeListData.username === "_open") {
      if (!await requireAdminForOpenWrite("公开列表中新建歌单"))
        return;
    }
    const newList = {
      id: "webplayer_" + Date.now(),
      name,
      source: "webplayer",
      list: []
    };
    activeListData.userList.push(newList);
    try {
      await pushDataChange(activeListData);
      renderMyLists(currentListData);
      if (typeof renderPlaylistAddGrid === "function") {
        renderPlaylistAddGrid();
      }
      showSuccess("歌单创建成功");
    } catch (e) {
      console.error("Create list failed:", e);
      showError("创建失败，请重试");
    }
  }
}
async function handleRenameList(listId, event) {
  if (event)
    event.stopPropagation();
  if (!currentListData?.userList)
    return;
  const list = currentListData.userList.find((item) => item.id === listId);
  if (!list) {
    showError("未找到要重命名的歌单");
    return;
  }
  const input = await showInput("重命名歌单", "请输入新的歌单名称：", {
    placeholder: "歌单名称",
    defaultValue: list.name || ""
  });
  if (input === null || input === undefined)
    return;
  const nextName = String(input).trim();
  if (!nextName) {
    showError("歌单名称不能为空");
    return;
  }
  if (nextName === list.name)
    return;
  if (!await requireAdminForOpenWrite("重命名公开歌单"))
    return;
  list.name = nextName;
  try {
    await pushDataChange();
    renderMyLists(currentListData);
    if (typeof renderPlaylistAddGrid === "function" && !document.getElementById("playlist-add-modal")?.classList.contains("hidden")) {
      renderPlaylistAddGrid();
    }
    if (window.currentSearchScope === "local_list" && window.currentViewingListId === listId) {
      handleListClick(listId, true);
    }
    showSuccess("歌单名称已更新");
  } catch (e) {
    console.error("Rename list failed:", e);
    showError("重命名失败，请重试");
  }
}
function formatSongToLxMusicStandard(item) {
  if (!item)
    return item;
  const s = JSON.parse(JSON.stringify(item));
  const picUrl = s.img || s.pic || s.picUrl || s.meta && (s.meta.picUrl || s.meta.img || s.meta.pic) || s.album && (s.album.picUrl || s.album.img) || s.al && s.al.picUrl || null;
  if (s.meta && s.meta.songId && s.id && (String(s.id).includes("_") || s.source === "mg")) {
    if (!s.meta.picUrl && picUrl)
      s.meta.picUrl = picUrl;
    return s;
  }
  const source = s.source || "";
  const songmid = s.songmid || s.id || "";
  const albumName = s.albumName || s.album && s.album.name || s.al && s.al.name || s.meta && s.meta.albumName || "";
  const albumId = s.albumId || s.album && s.album.id || s.al && s.al.id || s.meta && s.meta.albumId || null;
  let meta = {
    songId: String(songmid),
    songmid: String(songmid),
    albumName,
    picUrl,
    qualitys: s.qualitys || s.types || s.meta && (s.meta.qualitys || s.meta.types) || [],
    _qualitys: s._qualitys || s._types || s.meta && (s.meta._qualitys || s.meta._types) || {}
  };
  if (albumId)
    meta.albumId = String(albumId);
  const rootItem = {
    name: s.name || "",
    singer: s.singer || "",
    source,
    interval: s.interval || s.time || "",
    meta
  };
  switch (source) {
    case "tx":
      if (s.strMediaMid || s.meta && s.meta.strMediaMid)
        meta.strMediaMid = s.strMediaMid || s.meta.strMediaMid;
      if (s.albumMid || s.meta && s.meta.albumMid)
        meta.albumMid = s.albumMid || s.meta.albumMid;
      if (s.songId || s.meta && s.meta.songId)
        meta.songId = String(s.songId || s.meta.songId);
      rootItem.id = `tx_${songmid}`;
      break;
    case "wy":
      rootItem.id = `wy_${songmid}`;
      break;
    case "kg":
      let hash = s.hash || s.meta && s.meta.hash || "";
      if (!hash && String(songmid).includes("_")) {
        hash = String(songmid).split("_")[1];
      } else if (!hash && String(songmid).length === 32) {
        hash = songmid;
      }
      let kgSongId = s.songId || s.meta && s.meta.songId || (String(songmid).includes("_") ? String(songmid).split("_")[0] : songmid);
      if (kgSongId === hash)
        kgSongId = "";
      meta.songId = String(kgSongId || "");
      meta.hash = hash;
      if (kgSongId && hash) {
        rootItem.id = `${kgSongId}_${hash}`;
      } else if (hash) {
        rootItem.id = hash;
      } else {
        rootItem.id = `kg_${kgSongId}`;
      }
      break;
    case "mg":
      if (s.copyrightId || s.meta && s.meta.copyrightId)
        meta.copyrightId = s.copyrightId || s.meta.copyrightId;
      if (s.lrcUrl || s.meta && s.meta.lrcUrl)
        meta.lrcUrl = s.lrcUrl || s.meta.lrcUrl;
      rootItem.id = String(songmid);
      break;
    case "kw":
      rootItem.id = `kw_${songmid}`;
      break;
    default:
      rootItem.id = songmid;
      break;
  }
  return rootItem;
}
async function toggleLove() {
  const activeListData = isUserLoggedIn() ? window.myPersonalListData || currentListData : currentListData;
  if (!activeListData || currentIndex < 0)
    return;
  if (!isUserLoggedIn() && activeListData.username === "_open") {
    if (!await requireAdminForOpenWrite("收藏歌曲到公开列表"))
      return;
  }
  const song = currentPlaylist[currentIndex];
  const formattedSong = formatSongToLxMusicStandard(song);
  let targetId = formattedSong.id || song.id;
  const index = activeListData.loveList.findIndex((s) => s.id === targetId || s.id === song.id);
  if (index >= 0) {
    activeListData.loveList.splice(index, 1);
  } else {
    activeListData.loveList.push(formattedSong);
  }
  updatePlayerInfo(song);
  await pushDataChange(activeListData);
}
async function handleRefreshList(listId, event, silent = false) {
  if (event)
    event.stopPropagation();
  if (!currentListData)
    return;
  const list = currentListData.userList.find((l) => l.id === listId);
  if (!list || !list.sourceListId || !list.source) {
    if (!silent && window.showToast)
      window.showToast("info", "该歌单不支持在线刷新");
    return;
  }
  if (!silent) {
    const safeListName = escapeHtmlText(list.name || list.id || list.sourceListId || "");
    const confirmed = await showSelect("更新歌单", `是否更新当前歌单 "${safeListName}"？
(确认后将重新从服务器拉取歌单并覆盖当前内容)`, {
      confirmText: "确定更新",
      confirmColor: "bg-emerald-500"
    });
    if (!confirmed)
      return;
  }
  if (window.showToast)
    window.showToast("info", "正在同步最新歌单内容...");
  try {
    const url = `${API_BASE}/songList/detail?source=${encodeURIComponent(list.source)}&id=${encodeURIComponent(list.sourceListId)}&page=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.list)
      throw new Error("数据拉取失败");
    const newList = data.list.map((s) => {
      const item = formatSongToLxMusicStandard(s);
      if (!item.source)
        item.source = list.source;
      return item;
    });
    list.list = newList;
    if (data.info) {
      if (data.info.name)
        list.name = data.info.name;
      if (data.info.img || data.info.pic)
        list.Album = data.info.img || data.info.pic;
    }
    if (window.networkListUpdateMap) {
      window.networkListUpdateMap.delete(listId);
    }
    await pushDataChange();
    renderMyLists(currentListData);
    if (window.currentViewingListId === listId) {
      handleListClick(listId, true);
    }
    if (window.showToast)
      window.showToast("success", "歌单内容已同步至最新状态");
  } catch (e) {
    console.error("[Refresh] Failed:", e);
    if (window.showToast)
      window.showToast("error", "歌单同步失败: " + e.message);
  }
}
async function handleJumpToOriginalList(listId, event) {
  if (event)
    event.stopPropagation();
  if (!currentListData)
    return;
  const list = currentListData.userList.find((l) => l.id === listId);
  if (!list || !list.sourceListId || !list.source) {
    if (window.showToast)
      window.showToast("info", "该歌单不支持跳转到原始页");
    return;
  }
  switchTab("songlist");
  const sourceSelect = document.getElementById("songlist-source");
  if (sourceSelect) {
    sourceSelect.value = list.source;
  }
  if (window.SongListManager && window.SongListManager.openDetail) {
    window.SongListManager.openDetail(list.sourceListId, list.source);
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  loadSettings();
  const pubToggle = document.getElementById("toggle-public-sources");
  if (pubToggle) {
    pubToggle.checked = settings.enablePublicSources !== false;
  }
  const selectEl = document.getElementById("items-per-page-select");
  if (selectEl && settings.itemsPerPage) {
    selectEl.value = settings.itemsPerPage.toString();
  }
  try {
    const savedVolume = localStorage.getItem("lx_volume");
    if (savedVolume) {
      currentVolume = parseFloat(savedVolume);
      audio.volume = currentVolume;
      updateVolumeUI();
      console.log("[Volume] 已恢复音量设置:", currentVolume);
    }
  } catch (e) {
    console.error("[Volume] 恢复音量设置失败:", e);
  }
  try {
    const savedMode = localStorage.getItem("lx_play_mode");
    if (savedMode && ["list", "single", "random", "order"].includes(savedMode)) {
      playMode = savedMode;
      updatePlayModeUI();
      console.log("[PlayMode] 已恢复播放模式:", playMode);
    } else {
      updatePlayModeUI();
    }
  } catch (e) {
    console.error("[PlayMode] 恢复播放模式失败:", e);
  }
  try {
    const cachedList = await window.ListStore.get();
    if (cachedList && isUserLoggedIn()) {
      currentListData = cachedList;
      const savedUser = localStorage.getItem("lx_sync_user");
      if (savedUser && currentListData) {
        currentListData.username = savedUser;
      }
      window.myPersonalListData = currentListData;
      renderMyLists(currentListData);
      console.log("[Cache] 已恢复缓存的个人列表数据");
    }
  } catch (e) {
    console.error("[Cache] 恢复列表数据失败:", e);
  }
  const defaultTab = settings.defaultEntry || "favorites";
  switchTab(defaultTab);
  const syncMode = localStorage.getItem("lx_sync_mode");
  if (syncMode === "local") {
    const user = localStorage.getItem("lx_sync_user");
    const pass = localStorage.getItem("lx_sync_pass");
    if (user && pass) {
      document.getElementById("sync-local-user").value = user;
      document.getElementById("sync-local-pass").value = pass;
      console.log("[Cache] 自动登录本地账号:", user);
      handleLocalLogin();
    }
  } else if (syncMode === "remote") {
    const url = localStorage.getItem("lx_sync_url");
    const code = localStorage.getItem("lx_sync_code");
    const authStr = localStorage.getItem("lx_ws_auth");
    if (url && code) {
      document.getElementById("sync-remote-url").value = url;
      document.getElementById("sync-remote-code").value = code;
      if (authStr) {
        try {
          const authInfo = JSON.parse(authStr);
          console.log("[Cache] 使用缓存的认证信息自动重连...");
          syncManager.initRemote(url, code, {
            getData: async () => {
              const cachedData = await window.ListStore.get().catch(() => null);
              return cachedData || { defaultList: [], loveList: [], userList: [] };
            },
            setData: async (data) => {
              await window.ListStore.set(data).catch((e) => console.error("[IDBStore] 保存失败:", e));
              const oldUsername = currentListData ? currentListData.username : null;
              currentListData = data;
              if (oldUsername)
                currentListData.username = oldUsername;
              renderMyLists(data);
              document.getElementById("sync-status").innerHTML = '<i class="fas fa-check-circle text-blue-500"></i> 数据已同步';
            },
            getSyncMode: async () => {
              return new Promise((resolve) => {
                syncModeResolve = resolve;
                showSyncModeModal();
              });
            }
          });
          syncManager.client.authInfo = authInfo;
          syncManager.client.onLogin = (success) => {
            if (success) {
              console.log("[Cache] 自动重连成功");
              updateSyncStatus('<i class="fas fa-check-circle text-green-500"></i> 已自动重连');
            } else {
              console.log("[Cache] 自动重连失败,需要手动重新配对");
              localStorage.removeItem("lx_ws_auth");
            }
          };
          syncManager.client.connect();
        } catch (e) {
          console.error("[Cache] 自动重连失败:", e);
        }
      } else {
        console.log("[Cache] 无缓存认证信息,请手动连接");
      }
    }
  }
});
window.switchSyncMode = switchSyncMode;
window.handleLocalLogin = handleLocalLogin;
window.handleSyncLogout = handleSyncLogout;
window.resetAllSettings = resetAllSettings;
async function pushDataChange(customListData) {
  const listToSave = customListData || currentListData;
  if (!listToSave)
    return;
  await window.ListStore.set(listToSave).catch((e) => console.error("[IDBStore] 保存失败:", e));
  const isUserLoggedIn = !!userToken && localStorage.getItem("lx_sync_mode") === "local";
  const isPublicList = listToSave.username === "_open" || listToSave.username === "default";
  if (isPublicList && window.lx_config?.["user.enablePublicFavorites"]) {
    const isAdmin = !!localStorage.getItem("lx_admin_password");
    if (isAdmin) {
      try {
        const res = await fetch("/api/user/list?user=_open", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getUserAuthHeaders()
          },
          body: JSON.stringify(listToSave)
        });
        if (!res.ok) {
          const errorText = await res.text();
          console.error("[PublicList] 推送保存公共歌单失败:", errorText);
          showError("保存公共歌单失败: " + errorText);
          return;
        }
        console.log("[PublicList] 公共歌单成功保存至服务器");
      } catch (e) {
        console.error("[PublicList] 推送公共歌单网络异常:", e);
      }
    }
    return;
  }
  try {
    if (window.SyncManager && window.SyncManager.client) {
      await window.SyncManager.push(listToSave);
      console.log("Data Pushed to Remote");
    } else {
      const headers = getUserAuthHeaders();
      if (headers["x-user-name"] === "_open") {
        const syncUser = localStorage.getItem("lx_sync_user");
        if (syncUser)
          headers["x-user-name"] = syncUser;
        else
          delete headers["x-user-name"];
      }
      const res = await fetch("/api/user/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify(listToSave)
      });
      if (!res.ok)
        throw new Error(await res.text());
    }
  } catch (e) {
    console.error("Push Failed", e);
  }
}
async function refreshUserListData() {
  if (!window.SyncManager)
    return;
  try {
    const listData = await window.SyncManager.sync();
    window.currentListData = listData;
    if (listData && listData.username !== "_open") {
      window.myPersonalListData = listData;
    }
    if (typeof renderMyLists === "function") {
      renderMyLists(listData);
    }
    if (window.currentSearchScope === "local_list" && window.currentViewingListId) {
      console.log("[Sync] Auto-refreshing current list view:", window.currentViewingListId);
      handleListClick(window.currentViewingListId, true);
    }
    await window.ListStore.set(listData).catch((e) => console.error("[IDBStore] 保存失败:", e));
    console.log("[Sync] List Data Refreshed");
  } catch (e) {
    console.error("[Sync] Failed to refresh list data:", e);
  }
}
window.refreshUserListData = refreshUserListData;
window.handleRemoteConnect = handleRemoteConnect;
window.handleCreateList = handleCreateList;
window.handleRenameList = handleRenameList;
window.handleRefreshList = handleRefreshList;
window.handleRemoveList = handleRemoveList;
window.toggleFavorites = toggleFavorites;
window.handleFavoritesClick = handleFavoritesClick;
window.handleRemoteStep1 = handleRemoteStep1;
window.handleRemoteBack = handleRemoteBack;
var customSourceMode = "file";
function switchCustomSourceMode(mode) {
  customSourceMode = mode;
  document.getElementById("btn-source-file").className = mode === "file" ? "px-4 py-2 text-sm font-medium bg-emerald-100 text-emerald-700 rounded-lg" : "px-4 py-2 text-sm font-medium bg-gray-100 t-text-muted rounded-lg hover:bg-gray-200";
  document.getElementById("btn-source-url").className = mode === "url" ? "px-4 py-2 text-sm font-medium bg-emerald-100 text-emerald-700 rounded-lg" : "px-4 py-2 text-sm font-medium bg-gray-100 t-text-muted rounded-lg hover:bg-gray-200";
  document.getElementById("custom-source-file").classList.toggle("hidden", mode !== "file");
  document.getElementById("custom-source-url").classList.toggle("hidden", mode !== "url");
}
async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file)
    return;
  if (!file.name.endsWith(".js")) {
    showError("请选择 .js 文件");
    return;
  }
  try {
    const content = await file.text();
    showInfo("正在验证脚本...");
    const adminPass = localStorage.getItem("lx_admin_password");
    const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    let validationRes = await fetch("/api/custom-source/validate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        script: content,
        username: currentListData?.username || "default"
      })
    });
    if (validationRes.status === 403) {
      const errData = await validationRes.json();
      showError(errData.error || "权限限制：请先登录管理员。");
      const authorized = await handleAdminAuth("上传自定义源需要管理员权限");
      if (authorized)
        return handleFileUpload(input);
      input.value = "";
      return;
    }
    const validation = await validationRes.json();
    if (validation.disabledVM) {
      showError(validation.error || "已禁用VM。当前服务器已禁用 VM 模式。");
      input.value = "";
      return;
    }
    if (!validation.valid && !validation.requireUnsafe) {
      showError(`脚本无效: ${validation.error}`);
      input.value = "";
      return;
    }
    showInfo(`验证通过，正在上传 "${validation.metadata.name || file.name}"...`);
    let result = await uploadCustomSource(file.name, content, "file");
    if (result.disabledVM) {
      showError(result.message || "已禁用VM");
      input.value = "";
      return;
    }
    if (result.requireUnsafe) {
      const confirmed = await showSelect("安全风险确认", result.message || "该脚本需要原生 VM 模式运行，可能存在安全风险，是否继续？", { danger: true, confirmText: "允许并上传" });
      if (confirmed) {
        result = await uploadCustomSource(file.name, content, "file", true);
        if (result.disabledVM) {
          showError(result.message || "已禁用VM");
          input.value = "";
          return;
        }
      } else {
        showInfo("已取消上传");
        input.value = "";
        return;
      }
    }
    showSuccess(`已上传: ${validation.metadata.name || file.name} ${validation.metadata.version ? /^v/i.test(validation.metadata.version) ? validation.metadata.version : "v" + validation.metadata.version : ""}`);
    input.value = "";
    loadCustomSources();
  } catch (error) {
    console.error("[CustomSource] 上传失败:", error);
    showError(`上传失败: ${error.message}`);
  }
}
async function handleUrlImport() {
  const input = await showInput("导入远程音源", "请输入自定义源脚本的 URL 地址:", {
    placeholder: "https://example.com/script.js",
    confirmText: "开始导入"
  });
  if (input === null)
    return;
  const url = input.trim();
  if (!url) {
    showError("请输入链接地址");
    return;
  }
  try {
    showInfo("正在获取并验证远程脚本...");
    const username = currentListData?.username || "default";
    const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    const adminPass = localStorage.getItem("lx_admin_password");
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    const response = await fetch(`/api/custom-source/import`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        filename: url.split("/").pop().split("?")[0] || "",
        username
      })
    });
    if (response.status === 403) {
      const data = await response.json();
      showError(data.error || "权限限制：请先登录管理员。");
      const authorized = await handleAdminAuth("导入自定义源需要管理员权限");
      if (authorized)
        return handleUrlImport();
      return;
    }
    let result = await response.json();
    if (result.disabledVM) {
      showError(result.message || "已禁用VM");
      return;
    }
    if (!response.ok || result.success === false && !result.requireUnsafe) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    if (result.requireUnsafe) {
      const confirmed = await showSelect("安全风险确认", result.message || "该脚本需要原生 VM 模式运行，可能存在安全风险，是否继续？", { danger: true, confirmText: "允许并导入" });
      if (confirmed) {
        const retryHeaders = { "Content-Type": "application/json", ...getUserAuthHeaders() };
        if (adminPass)
          retryHeaders["x-frontend-auth"] = adminPass;
        const retryResp = await fetch(`/api/custom-source/import`, {
          method: "POST",
          headers: retryHeaders,
          body: JSON.stringify({
            url,
            filename,
            username,
            allowUnsafeVM: true
          })
        });
        if (retryResp.status === 403) {
          showError("管理员验证校验失败");
          return;
        }
        result = await retryResp.json();
        if (result.disabledVM) {
          showError(result.message || "已禁用VM");
          return;
        }
      } else {
        showInfo("已取消导入");
        return;
      }
    }
    showSuccess(`已导入: ${result.filename}`);
    loadCustomSources();
  } catch (error) {
    console.error("[CustomSource] 导入失败:", error);
    showError(`导入失败: ${error.message}`);
  }
}
async function uploadCustomSource(filename2, content, type, allowUnsafeVM = false) {
  const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
  const adminPass = localStorage.getItem("lx_admin_password");
  if (adminPass)
    headers["x-frontend-auth"] = adminPass;
  const response = await fetch("/api/custom-source/upload", {
    method: "POST",
    headers,
    body: JSON.stringify({
      filename: filename2,
      content,
      type,
      username: currentListData?.username || "default",
      allowUnsafeVM
    })
  });
  if (response.status === 403) {
    const result = await response.json();
    showError(result.error || "权限不足：请先登录管理员。");
    const authorized = await handleAdminAuth("上传自定义源需要管理员权限");
    if (authorized)
      return uploadCustomSource(filename2, content, type, allowUnsafeVM);
    return;
  }
  if (!response.ok) {
    const errorText = await response.text();
    let errMsg = errorText;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error)
        errMsg = errJson.error;
    } catch (e) {}
    throw new Error(errMsg || `HTTP ${response.status}`);
  }
  const result = await response.json();
  if (result.success === false && !result.requireUnsafe && !result.disabledVM) {
    throw new Error(result.error || "上传失败");
  }
  return result;
}
async function loadCustomSources() {
  await renderCustomSources();
}
async function fetchCustomSources() {
  try {
    const username = currentListData?.username || "default";
    const headers = getUserAuthHeaders();
    const adminPass = localStorage.getItem("lx_admin_password");
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    const res = await fetch(`/api/custom-source/list?username=${username}`, {
      headers
    });
    if (res.status === 403) {
      console.warn("[CustomSource] List access denied (403)");
      return null;
    }
    if (!res.ok)
      throw new Error("Failed to fetch sources");
    return await res.json();
  } catch (err) {
    console.error("Fetch sources failed:", err);
    return [];
  }
}
function updateSourceScopeUI() {
  const username = currentListData?.username || "default";
  const isPublic = username === "default";
  const showPublic = settings.enablePublicSources !== false;
  const settingsTag = document.getElementById("settings-source-scope-tag");
  const modalTag = document.getElementById("modal-source-scope-info");
  let tagHtml = "";
  if (isPublic) {
    tagHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-500 whitespace-nowrap inline-block">公开</span>`;
  } else {
    let userTag = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600 whitespace-nowrap inline-block">${username}</span>`;
    if (showPublic) {
      userTag += `<span class="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-500 whitespace-nowrap inline-block">公开</span>`;
    }
    tagHtml = userTag;
  }
  if (settingsTag)
    settingsTag.innerHTML = tagHtml;
  if (modalTag) {
    modalTag.innerHTML = isPublic ? `<div class="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 w-fit mb-2"><i class="fas fa-globe"></i> 上传到: 公开</div>` : `<div class="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100 w-fit mb-2"><i class="fas fa-user-circle"></i> 上传到: ${username}</div>`;
  }
}
function togglePublicSourcesSetting() {
  updateSetting("enablePublicSources", !settings.enablePublicSources);
}
async function renderCustomSources() {
  let list = await fetchCustomSources();
  const isAdmin = !!localStorage.getItem("lx_admin_password");
  const isUser = !!userToken;
  const isPublicRestrictionEnabled = !!window.lx_config?.["user.enablePublicRestriction"];
  const isPublicRestrictionActive = isPublicRestrictionEnabled && !isUser && !isAdmin;
  const shouldShowHidden = list === null || isPublicRestrictionActive;
  if (list && settings.enablePublicSources === false) {
    list = list.filter((item) => item.owner !== "open");
  }
  updateSourceScopeUI();
  const toolbar = document.getElementById("custom-source-toolbar");
  if (toolbar) {
    const canManageGlobal = isAdmin || isUser || !isPublicRestrictionEnabled;
    toolbar.classList.toggle("hidden", shouldShowHidden || !canManageGlobal);
  }
  const targetIds = ["custom-sources-list", "settings-custom-sources-list"];
  targetIds.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (!container)
      return;
    if (shouldShowHidden) {
      container.innerHTML = `
                <div class="flex flex-col items-center justify-center p-8 t-text-muted">
                    <div class="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                        <i class="fas fa-lock text-3xl text-emerald-500/50"></i>
                    </div>
                    <p class="text-base font-bold t-text-main mb-2">列表内容已隐藏</p>
                    <p class="text-xs text-center max-w-[240px] leading-relaxed">当前系统已开启公开访问限制，请登录管理员账号后再管理或查看自定义源列表。</p>
                    <button onclick="handleAdminLogin()" class="mt-6 px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all active:scale-95">前往登录</button>
                </div>
            `;
      return;
    }
    if (!list || list.length === 0) {
      container.innerHTML = `
                <div class="flex flex-col items-center justify-center p-6 t-text-muted">
                    <i class="fas fa-box-open text-3xl mb-3 opacity-30"></i>
                    <p class="text-sm">暂无自定义源</p>
                    ${containerId === "custom-sources-list" ? `<button onclick="document.getElementById('script-file').click()" class="mt-3 text-emerald-600 hover:text-emerald-700 text-sm font-medium">即刻上传</button>` : ""}
                </div>
            `;
      return;
    }
    container.innerHTML = "";
    list.forEach((source, index) => {
      const div = document.createElement("div");
      div.className = `t-bg-panel p-4 rounded-xl border t-border-main shadow-sm hover:shadow-md transition-all mb-3 relative group flex items-start source-item`;
      div.dataset.id = source.id;
      div.dataset.enabled = source.enabled;
      div.dataset.index = index;
      let supportedBadges = "";
      if (source.supportedSources && source.supportedSources.length > 0) {
        const sourceMap = {
          kg: { name: "酷狗", color: "t-badge-blue" },
          kw: { name: "酷我", color: "t-badge-yellow" },
          tx: { name: "QQ", color: "t-badge-green" },
          wy: { name: "网易", color: "t-badge-red" },
          mg: { name: "咪咕", color: "t-badge-pink" }
        };
        supportedBadges = `<div class="flex flex-wrap gap-1.5 mt-2">
                ${source.supportedSources.map((s) => {
          const info = sourceMap[s] || { name: s, color: "t-badge-gray" };
          return `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors border border-transparent ${info.color}">${info.name}</span>`;
        }).join("")}
            </div>`;
      } else {
        supportedBadges = `<div class="mt-2 text-[10px] t-text-muted italic">未知支持源</div>`;
      }
      const size = source.size && !isNaN(source.size) ? (source.size / 1024).toFixed(1) + " KB" : "未知大小";
      let date = "未知日期";
      try {
        if (source.uploadTime)
          date = new Date(source.uploadTime).toLocaleDateString();
      } catch (e) {}
      let statusBadge = "";
      let errorMsg = "";
      if (source.enabled) {
        if (source.status === "success") {
          statusBadge = `<span class="text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 px-1.5 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1 transition-colors"><i class="fas fa-check-circle"></i>正常</span>`;
        } else if (source.status === "failed") {
          statusBadge = `<span class="text-[10px] bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30 px-1.5 py-0.5 rounded-full border border-red-100 flex items-center gap-1 cursor-help transition-colors" title="${source.error || "加载失败"}"><i class="fas fa-times-circle"></i>失败</span>`;
          errorMsg = `<div class="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-start gap-1 p-1.5 bg-red-50 dark:bg-red-900/20 rounded transition-colors"><i class="fas fa-info-circle mt-0.5 flex-shrink-0"></i><span class="break-all">${source.error || "未知错误"}</span></div>`;
        } else {
          statusBadge = `<span class="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30 px-1.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1 transition-colors"><i class="fas fa-circle-notch fa-spin"></i>加载...</span>`;
        }
      }
      const ownerTag = source.owner && source.owner !== "open" ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-600">${source.owner}</span>` : `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-500">公开</span>`;
      const vmTag = source.allowUnsafeVM ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-500 border border-red-100 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30">VM</span>` : "";
      const isPublic = source.owner === "open";
      const canManageSource = isAdmin || !isPublic && isUser;
      div.innerHTML = `
            <div class="flex items-center self-stretch cursor-grab custom-source-handle t-text-muted hover:text-emerald-500 pr-4 -ml-2 transition-all active:scale-110 touch-none" title="拖拽排序">
                <i class="fas fa-grip-vertical text-lg"></i>
            </div>
            <div class="flex justify-between items-start flex-1 min-w-0">
                <div class="flex-1 pr-4 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <i class="fas fa-file-code text-emerald-500 flex-shrink-0"></i>
                         ${createMarqueeHtml(source.name, "font-bold t-text-main text-sm")}
                        ${ownerTag}
                        ${vmTag}
                    </div>
                    ${errorMsg}
                    <div class="flex flex-wrap items-center text-[10px] t-text-muted gap-x-3 gap-y-1 mt-1.5">
                        <span class="flex items-center"><i class="fas fa-user mr-1 opacity-70"></i>${source.author || "未知"}</span>
                        <span class="flex items-center"><i class="far fa-hdd mr-1 opacity-70"></i>${size}</span>
                        <span class="t-bg-main t-text-muted px-1.5 py-0.5 rounded-lg shrink-0 transition-colors font-mono pointer-events-none border t-border-main">${source.version ? /^v/i.test(source.version) ? source.version : "v" + source.version : "未知"}</span>
                        ${statusBadge}
                    </div>
                    ${supportedBadges}
                </div>
                
                <div class="flex flex-col items-end gap-2 shrink-0">
                    <button onclick="toggleSource('${source.id}', ${source.enabled})" 
                            class="px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap w-20 flex justify-center items-center ${source.enabled ? source.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/30" : "t-bg-track t-text-muted hover:t-bg-item-hover"}">
                        ${source.enabled ? "已启用" : "已禁用"}
                    </button>
                    
                    <div class="flex items-center gap-1">
                        ${source.enabled && source.status === "failed" && canManageSource ? `
                        <button onclick="reloadSource('${source.id}')" 
                                class="p-1.5 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                                title="尝试重新加载">
                            <i class="fas fa-sync-alt text-sm"></i>
                        </button>` : ""}
                        
                        ${canManageSource ? `
                        <button onclick="deleteSource('${source.id}')" 
                                class="p-1.5 t-text-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                                title="删除">
                            <i class="fas fa-trash-alt text-sm"></i>
                        </button>` : ""}
                    </div>
                </div>
            </div>
        `;
      container.appendChild(div);
    });
    const isSortableContainer = (containerId === "custom-sources-list" || containerId === "settings-custom-sources-list") && typeof Sortable !== "undefined";
    if (isSortableContainer) {
      try {
        const oldSortable = Sortable.get(container);
        if (oldSortable)
          oldSortable.destroy();
      } catch (e) {}
      Sortable.create(container, {
        animation: 200,
        handle: ".custom-source-handle",
        ghostClass: "sortable-ghost-solid",
        chosenClass: "sortable-chosen-item",
        dragClass: "sortable-drag-item",
        forceFallback: true,
        delay: 200,
        delayOnTouchOnly: true,
        onEnd: async function(evt) {
          if (window._reorderLock)
            return;
          window._reorderLock = true;
          setTimeout(() => {
            window._reorderLock = false;
          }, 500);
          const items = Array.from(container.querySelectorAll(".source-item"));
          const finalOrderIds = items.map((el) => el.dataset.id);
          const otherId = containerId === "custom-sources-list" ? "settings-custom-sources-list" : "custom-sources-list";
          const otherContainer = document.getElementById(otherId);
          if (otherContainer) {
            finalOrderIds.forEach((id) => {
              const el = otherContainer.querySelector(`.source-item[data-id="${id}"]`);
              if (el)
                otherContainer.appendChild(el);
            });
          }
          try {
            const username = currentListData?.username || "default";
            const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
            const adminPass = localStorage.getItem("lx_admin_password");
            if (adminPass)
              headers["x-frontend-auth"] = adminPass;
            const response = await fetch("/api/custom-source/reorder", {
              method: "POST",
              headers,
              body: JSON.stringify({ username, sourceIds: finalOrderIds })
            });
            if (response.status === 403) {
              showError("权限限制：保存排序需要管理员身份。");
              const authorized = await handleAdminAuth("保存排序需要管理员身份");
              if (authorized)
                renderCustomSources();
              else
                renderCustomSources();
              return;
            }
            if (!response.ok)
              throw new Error("Reorder failed");
            showInfo("排序已保存");
          } catch (error) {
            console.error("Reorder error:", error);
            showError("保存排序失败，已还原");
            renderCustomSources();
          }
        }
      });
    }
  });
  if (typeof applyMarqueeChecks === "function") {
    applyMarqueeChecks();
  }
}
async function reloadSource(sourceId) {
  try {
    const username = currentListData?.username || "default";
    const adminPass = localStorage.getItem("lx_admin_password");
    const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    const response = await fetch("/api/custom-source/toggle", {
      method: "POST",
      headers,
      body: JSON.stringify({ username, sourceId, enabled: true })
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`);
    showInfo("正在重新加载...");
    setTimeout(() => {
      renderCustomSources();
    }, 1000);
  } catch (error) {
    console.error("Reload failed:", error);
    showError(`重载请求失败: ${error.message}`);
  }
}
async function toggleSource(sourceId, currentEnabled, allowUnsafeVM = false) {
  try {
    const username = currentListData?.username || "default";
    const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    const adminPass = localStorage.getItem("lx_admin_password");
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    const response = await fetch("/api/custom-source/toggle", {
      method: "POST",
      headers,
      body: JSON.stringify({ username, sourceId, enabled: !currentEnabled, allowUnsafeVM })
    });
    if (response.status === 403) {
      const data = await response.json();
      showError(data.error || "权限限制：需要管理员身份。");
      const authorized = await handleAdminAuth("修改自定义源状态需要管理员权限");
      if (authorized)
        return await toggleSource(sourceId, currentEnabled, allowUnsafeVM);
      return;
    }
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.disabledVM) {
      showError(result.message || "已禁用VM");
      return;
    }
    if (result.requireUnsafe) {
      const confirmed = await showSelect("安全风险确认", result.message || "该脚本需要原生 VM 模式运行，可能存在安全风险，是否继续？", { danger: true, confirmText: "依然启用" });
      if (confirmed) {
        return await toggleSource(sourceId, currentEnabled, true);
      } else {
        return;
      }
    }
    await renderCustomSources();
    showSuccess(currentEnabled ? "已禁用" : "已启用");
  } catch (error) {
    console.error("[CustomSource] 切换状态失败:", error);
    showError(`操作失败: ${error.message}`);
  }
}
async function deleteSource(sourceId) {
  if (!await showSelect("删除自定义源", "确定要删除这个自定义源吗？", { danger: true }))
    return;
  try {
    const username = currentListData?.username || "default";
    const headers = { "Content-Type": "application/json", ...getUserAuthHeaders() };
    const adminPass = localStorage.getItem("lx_admin_password");
    if (adminPass)
      headers["x-frontend-auth"] = adminPass;
    const response = await fetch("/api/custom-source/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({ username, sourceId })
    });
    if (response.status === 403) {
      const data = await response.json();
      showError(data.error || "权限限制：需要管理员身份。");
      const authorized = await handleAdminAuth("删除自定义源需要管理员权限");
      if (authorized)
        return await deleteSource(sourceId);
      return;
    }
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`);
    showSuccess("已删除");
    await renderCustomSources();
  } catch (error) {
    console.error("[CustomSource] 删除失败:", error);
    showError(`删除失败: ${error.message}`);
  }
}
function openCustomSourceModal() {
  const modal = document.getElementById("custom-source-modal");
  const content = document.getElementById("custom-source-modal-content");
  if (modal)
    modal.classList.remove("hidden");
  renderCustomSources();
  setTimeout(() => {
    if (content) {
      content.classList.remove("scale-95", "opacity-0");
      content.classList.add("scale-100", "opacity-100");
    }
  }, 10);
}
function closeCustomSourceModal() {
  const modal = document.getElementById("custom-source-modal");
  const content = document.getElementById("custom-source-modal-content");
  if (content) {
    content.classList.remove("scale-100", "opacity-100");
    content.classList.add("scale-95", "opacity-0");
  }
  setTimeout(() => {
    if (modal)
      modal.classList.add("hidden");
  }, 300);
}
function renderPlaylistAddGrid() {
  const isBatch = !!window.batchCollectSongs;
  const songs = isBatch ? window.batchCollectSongs : [currentPlayingSong];
  const firstSong = songs[0];
  if (!firstSong)
    return;
  const listContainer = document.getElementById("playlist-add-list");
  if (!listContainer)
    return;
  let targetId = null;
  if (!isBatch) {
    const cleanedSong = cleanSongData(firstSong);
    targetId = cleanedSong.id;
  }
  listContainer.innerHTML = "";
  const createGridItem = (listId, listName, count, isIncluded) => {
    const btn = document.createElement("button");
    let className = "relative h-14 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1 shadow-sm overflow-hidden ";
    if (!isBatch && isIncluded) {
      className += "bg-emerald-500 text-white shadow-md scale-[1.02] ring-2 ring-emerald-200";
    } else {
      className += "bg-emerald-50 text-emerald-500 hover:bg-emerald-100 hover:shadow";
    }
    btn.className = className;
    btn.onclick = () => handleTogglePlaylist(listId, btn);
    btn.innerHTML = `
            <span class="truncate max-w-[80%]">${listName}</span>
            ${!isBatch && isIncluded ? '<i class="fas fa-check text-xs ml-1 opacity-80"></i>' : ""}
        `;
    return btn;
  };
  const activeListData = isUserLoggedIn() ? window.myPersonalListData || currentListData : currentListData;
  const loveList = activeListData.loveList || [];
  const isLoved = !isBatch && targetId && loveList.some((s) => s.id === targetId);
  listContainer.appendChild(createGridItem("love", "我的收藏", loveList.length, isLoved));
  if (activeListData.userList) {
    activeListData.userList.forEach((list) => {
      const isIncluded = !isBatch && targetId && list.list.some((s) => s.id === targetId);
      listContainer.appendChild(createGridItem(list.id, list.name, list.list.length, isIncluded));
    });
  }
  const createNewBtn = document.createElement("button");
  createNewBtn.className = "h-14 rounded-lg text-xs font-bold border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-emerald-500 hover:border-emerald-400 transition-all flex items-center justify-center gap-2 t-bg-main/20 hover:t-bg-main/50 shadow-sm";
  createNewBtn.innerHTML = `
        <i class="fas fa-plus"></i> 新建歌单
    `;
  createNewBtn.onclick = () => {
    handleCreateList();
  };
  listContainer.appendChild(createNewBtn);
}
async function openPlaylistAddModal(batchSongs = null) {
  if (!currentListData) {
    showError("请先登录后使用收藏功能");
    return;
  }
  const isUnboundLocalSong = (song) => {
    if (!song?.isLocal && !song?._localLibraryItem)
      return false;
    return !window.LocalMusicManager?.isPlaylistCollectable(song);
  };
  if (Array.isArray(batchSongs)) {
    const collectableSongs = batchSongs.filter((song) => !isUnboundLocalSong(song));
    const unavailableCount = batchSongs.length - collectableSongs.length;
    if (collectableSongs.length === 0) {
      showError("歌曲不在曲库中，无法收藏到歌单。请先使用“手动关联”绑定平台歌曲 ID。");
      window.batchCollectSongs = null;
      return;
    }
    if (unavailableCount > 0) {
      showInfo(`已跳过 ${unavailableCount} 首未绑定平台 ID 的歌曲；歌曲不在曲库中，无法收藏到歌单。`);
    }
    window.batchCollectSongs = collectableSongs;
  } else {
    window.batchCollectSongs = null;
    if (isUnboundLocalSong(currentPlayingSong)) {
      showError("歌曲不在曲库中，无法收藏到歌单。请先使用“手动关联”绑定平台歌曲 ID。");
      return;
    }
  }
  const isBatch = !!window.batchCollectSongs;
  const song = isBatch ? window.batchCollectSongs[0] : currentPlayingSong;
  if (!song) {
    showError(isBatch ? "无可收藏的歌曲" : "当前没有正在播放的歌曲");
    return;
  }
  const modal = document.getElementById("playlist-add-modal");
  const content = document.getElementById("playlist-add-modal-content");
  const nameLabel = document.getElementById("playlist-add-song-name");
  if (!modal)
    return;
  nameLabel.innerText = isBatch ? `已选择 ${window.batchCollectSongs.length} 首歌曲` : song.name;
  renderPlaylistAddGrid();
  modal.classList.remove("hidden");
  setTimeout(() => {
    content.classList.remove("scale-95", "opacity-0");
    content.classList.add("scale-100", "opacity-100");
  }, 10);
}
function closePlaylistAddModal() {
  const modal = document.getElementById("playlist-add-modal");
  const content = document.getElementById("playlist-add-modal-content");
  if (content) {
    content.classList.remove("scale-100", "opacity-100");
    content.classList.add("scale-95", "opacity-0");
  }
  setTimeout(() => {
    if (modal)
      modal.classList.add("hidden");
    if (currentPlayingSong) {
      updatePlayerInfo(currentPlayingSong);
    }
  }, 300);
}
var playlistAddModal = document.getElementById("playlist-add-modal");
if (playlistAddModal) {
  playlistAddModal.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      closePlaylistAddModal();
    }
  });
}
function cleanSongData(song) {
  if (!song)
    return null;
  const sourceMeta = song.meta || {};
  let songId = sourceMeta.songId || song.songId || song.songmid || song.id;
  if (song.source === "tx" && song.songmid) {
    songId = song.songmid;
  }
  let albumName = sourceMeta.albumName || song.albumName || song.album?.name || "";
  let picUrl = sourceMeta.picUrl || song.picUrl || song.img || song.album?.cover;
  const meta = {
    songId,
    albumName,
    picUrl,
    qualitys: sourceMeta.qualitys || song.qualitys || song.types,
    _qualitys: sourceMeta._qualitys || song._qualitys || song._types,
    albumId: sourceMeta.albumId || song.albumId
  };
  if (song.source === "kg") {
    meta.hash = sourceMeta.hash || song.hash;
  } else if (song.source === "tx") {
    meta.strMediaMid = sourceMeta.strMediaMid || song.strMediaMid || song.mediaMid;
    meta.id = sourceMeta.id || song.songId || song.id;
    meta.albumMid = sourceMeta.albumMid || song.albumMid;
  } else if (song.source === "mg") {
    meta.copyrightId = sourceMeta.copyrightId || song.copyrightId || songId;
    meta.lrcUrl = sourceMeta.lrcUrl || song.lrcUrl;
    meta.mrcUrl = sourceMeta.mrcUrl || song.mrcUrl;
    meta.trcUrl = sourceMeta.trcUrl || song.trcUrl;
  }
  const fullId = song.source && songId && !String(songId).startsWith(song.source + "_") ? `${song.source}_${songId}` : song.id || `${song.source || "temp"}_${songId}`;
  const cleanSong = {
    id: fullId,
    name: song.name,
    singer: song.singer,
    source: song.source,
    interval: song.interval,
    meta
  };
  if (song.isLocal)
    cleanSong.isLocal = song.isLocal;
  if (song.url)
    cleanSong.url = song.url;
  if (song.folder)
    cleanSong.folder = song.folder;
  if (song.filename)
    cleanSong.filename = song.filename;
  const removeUndefined = (obj) => {
    Object.keys(obj).forEach((key) => {
      if (obj[key] === undefined)
        delete obj[key];
      else if (typeof obj[key] === "object" && obj[key] !== null)
        removeUndefined(obj[key]);
    });
    return obj;
  };
  return removeUndefined(cleanSong);
}
async function handleTogglePlaylist(listId, btnElement) {
  if (!currentListData)
    return;
  const activeListData = isUserLoggedIn() ? window.myPersonalListData || currentListData : currentListData;
  if (!isUserLoggedIn() && activeListData.username === "_open") {
    if (!await requireAdminForOpenWrite("修改公开收藏"))
      return;
  }
  const isBatch = !!window.batchCollectSongs;
  const songs = isBatch ? window.batchCollectSongs : [currentPlayingSong];
  if (songs.length === 0 || !songs[0])
    return;
  if (isBatch) {
    btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
    btnElement.disabled = true;
    let targetListArray = null;
    if (listId === "love")
      targetListArray = activeListData.loveList;
    else
      targetListArray = activeListData.userList.find((l) => l.id === listId)?.list;
    if (!targetListArray) {
      showError("未找到目标歌单");
      return;
    }
    const addedSongs = [];
    songs.forEach((s) => {
      const cleaned = cleanSongData(s);
      if (!targetListArray.some((existing) => existing.id === cleaned.id)) {
        targetListArray.unshift(cleaned);
        addedSongs.push(cleaned);
      }
    });
    if (addedSongs.length === 0) {
      showInfo("所选歌曲已在歌单中");
      closePlaylistAddModal();
      return;
    }
    renderMyLists(currentListData);
    if (window.currentSearchScope === "local_list" && window.currentViewingListId) {
      handleListClick(window.currentViewingListId, true);
    }
    closePlaylistAddModal();
    try {
      const isRemoteSync = window.SyncManager && window.SyncManager.mode === "remote" && window.SyncManager.client && window.SyncManager.client.isConnected;
      if (isRemoteSync) {
        await pushDataChange(activeListData);
        showSuccess(`成功批量同步 ${addedSongs.length} 首歌曲`);
      } else {
        const headers = getUserAuthHeaders();
        if (headers["x-user-name"] === "_open") {
          const syncUser = localStorage.getItem("lx_sync_user");
          if (syncUser)
            headers["x-user-name"] = syncUser;
          else
            delete headers["x-user-name"];
        }
        const res = await fetch("/api/music/user/list/add", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            listId,
            musicInfos: addedSongs
          })
        });
        if (!res.ok)
          throw new Error(await res.text());
        showSuccess(`批量收藏 ${addedSongs.length} 首歌曲成功`);
      }
      if (typeof exitBatchMode === "function")
        exitBatchMode();
      else if (typeof deselectAll === "function")
        deselectAll();
    } catch (e) {
      console.error("[BatchCollect] Sync failed, reverting or refreshing:", e);
      showError("同步失败: " + e.message);
      refreshUserListData();
    } finally {
      window.batchCollectSongs = null;
    }
    return;
  }
  const song = songs[0];
  let targetListArray;
  if (listId === "love") {
    targetListArray = activeListData.loveList;
  } else {
    const uList = activeListData.userList.find((l) => l.id === listId);
    if (uList)
      targetListArray = uList.list;
  }
  if (!targetListArray)
    return;
  const cleanedSong = cleanSongData(song);
  const targetId = cleanedSong.id;
  const isCurrentlyIncluded = targetListArray.some((s) => s.id === targetId);
  const willAdd = !isCurrentlyIncluded;
  updateGridItemVisuals(btnElement, willAdd);
  try {
    if (willAdd) {
      targetListArray.unshift(cleanedSong);
    } else {
      const idx = targetListArray.findIndex((s) => s.id === targetId);
      if (idx >= 0)
        targetListArray.splice(idx, 1);
    }
    await pushDataChange(activeListData);
    renderMyLists(currentListData);
  } catch (e) {
    showError("同步失败: " + e.message);
    updateGridItemVisuals(btnElement, !willAdd);
  }
}
function updateGridItemVisuals(btn, isIncluded) {
  if (isIncluded) {
    btn.className = "relative h-14 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1 shadow-sm overflow-hidden bg-red-500 text-white shadow-md scale-[1.02] ring-2 ring-red-200";
    const textSpan = btn.querySelector("span");
    const text = textSpan ? textSpan.innerText : btn.innerText;
    btn.innerHTML = `
            <span class="truncate max-w-[80%]">${text}</span>
            <i class="fas fa-check text-xs ml-1 opacity-80"></i>
        `;
  } else {
    btn.className = "relative h-14 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1 shadow-sm overflow-hidden bg-red-50 text-red-500 hover:bg-red-100 hover:shadow";
    const textSpan = btn.querySelector("span");
    const text = textSpan ? textSpan.innerText : btn.innerText;
    btn.innerHTML = `<span class="truncate max-w-[80%]">${text}</span>`;
  }
}
var currentCommentType = "hot";
var currentCommentPage = 1;
var isCommentLoading = false;
var lastCommentSongId = null;
var commentCache = {
  hot: { pages: {}, total: 0, maxPage: 1 },
  new: { pages: {}, total: 0, maxPage: 1 }
};
function clearCommentCache() {
  commentCache.hot = { pages: {}, total: 0, maxPage: 1 };
  commentCache.new = { pages: {}, total: 0, maxPage: 1 };
  const hotCount = document.getElementById("hot-comment-count");
  const newCount = document.getElementById("new-comment-count");
  if (hotCount)
    hotCount.innerText = "";
  if (newCount)
    newCount.innerText = "";
}
function getActiveSongInfo() {
  if (typeof currentPlayingSong !== "undefined" && currentPlayingSong)
    return currentPlayingSong;
  return null;
}
function toggleCommentModal() {
  const modal = document.getElementById("comment-modal");
  const content = document.getElementById("comment-modal-content");
  if (!modal || !content)
    return;
  const isHidden = modal.classList.contains("hidden");
  if (isHidden) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    requestAnimationFrame(() => {
      content.classList.remove("translate-y-10", "opacity-0");
      content.classList.add("translate-y-0", "opacity-100");
    });
    const song = getActiveSongInfo();
    if (song) {
      const songId = song.songmid || song.hash || song.id;
      if (lastCommentSongId !== songId) {
        console.log("[Comment] Song changed, clearing cache and refreshing");
        lastCommentSongId = songId;
        clearCommentCache();
        refreshComments();
      } else {
        console.log("[Comment] Same song, using cache check");
        fetchComments();
      }
    } else {
      console.warn("[Comment] No song playing, showing empty state");
      document.getElementById("comment-list").innerHTML = '<div class="text-center py-10 t-text-muted font-bold">请先播放歌曲</div>';
      document.getElementById("comment-loader").classList.add("hidden");
    }
  } else {
    content.classList.remove("translate-y-0", "opacity-100");
    content.classList.add("translate-y-10", "opacity-0");
    setTimeout(() => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }, 300);
  }
}
async function switchCommentType(type) {
  if (currentCommentType === type)
    return;
  currentCommentType = type;
  const hotBtn = document.getElementById("tab-hot-comments");
  const newBtn = document.getElementById("tab-new-comments");
  if (type === "hot") {
    hotBtn.classList.add("text-emerald-600");
    hotBtn.classList.remove("t-text-muted");
    hotBtn.querySelector("div").classList.remove("scale-x-0");
    newBtn.classList.remove("text-emerald-600");
    newBtn.classList.add("t-text-muted");
    newBtn.querySelector("div").classList.add("scale-x-0");
  } else {
    newBtn.classList.add("text-emerald-600");
    newBtn.classList.remove("t-text-muted");
    newBtn.querySelector("div").classList.remove("scale-x-0");
    hotBtn.classList.remove("text-emerald-600");
    hotBtn.classList.add("t-text-muted");
    hotBtn.querySelector("div").classList.add("scale-x-0");
  }
  refreshComments(false);
}
async function refreshComments(force = true) {
  if (force) {
    clearCommentCache();
  }
  currentCommentPage = 1;
  await fetchComments();
}
async function fetchComments() {
  const song = getActiveSongInfo();
  if (!song || isCommentLoading) {
    console.log("[Comment] Fetch skipped:", { hasSong: !!song, isLoading: isCommentLoading });
    return;
  }
  const loader = document.getElementById("comment-loader");
  const list = document.getElementById("comment-list");
  const pageIndicator = document.getElementById("comment-page-indicator");
  const cache = commentCache[currentCommentType];
  const cachedPage = cache.pages[currentCommentPage];
  if (cachedPage) {
    console.log(`[Comment] Using cached ${currentCommentType} page ${currentCommentPage}`);
    if (list)
      list.innerHTML = "";
    renderComments(cachedPage);
    updateCommentCountLabels(cache.total);
    updatePaginationUI(cache.total, cache.maxPage);
    if (loader)
      loader.classList.add("hidden");
    isCommentLoading = false;
    return;
  }
  isCommentLoading = true;
  if (loader)
    loader.classList.remove("hidden");
  if (list)
    list.innerHTML = "";
  if (pageIndicator)
    pageIndicator.innerText = `PAGE -- / --`;
  document.getElementById("comment-title").innerText = `${song.name} - 评论`;
  document.getElementById("comment-source-info").innerText = `Source: ${song.source.toUpperCase()}`;
  console.log(`[Comment] Fetching ${currentCommentType} for ${song.name} (${song.source}), page ${currentCommentPage}`);
  try {
    const response = await fetch("/api/music/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        songInfo: song,
        type: currentCommentType,
        page: currentCommentPage,
        limit: 20
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Comment] API Error:", response.status, errorText);
      throw new Error(`API Error: ${response.status}`);
    }
    const data = await response.json();
    console.log("[Comment] Data received:", data);
    if (data.error)
      throw new Error(data.error);
    commentCache[currentCommentType].pages[currentCommentPage] = data.comments;
    commentCache[currentCommentType].total = data.total;
    commentCache[currentCommentType].maxPage = data.maxPage || Math.ceil((data.total || 0) / 20) || 1;
    renderComments(data.comments);
    updateCommentCountLabels(data.total);
    updatePaginationUI(data.total, data.maxPage);
  } catch (e) {
    console.error("Fetch comments failed:", e);
    if (list)
      list.innerHTML = `<div class="text-center py-10 text-red-400 font-bold">加载失败: ${e.message}</div>`;
  } finally {
    if (loader)
      loader.classList.add("hidden");
    isCommentLoading = false;
  }
}
function updatePaginationUI(total, maxPage) {
  const totalPages = maxPage || Math.ceil((total || 0) / 20) || 1;
  const pageIndicator = document.getElementById("comment-page-indicator");
  if (pageIndicator)
    pageIndicator.innerText = `PAGE ${currentCommentPage} / ${totalPages}`;
  const prevBtn = document.getElementById("btn-comment-prev");
  const nextBtn = document.getElementById("btn-comment-next");
  if (prevBtn)
    prevBtn.disabled = currentCommentPage <= 1;
  if (nextBtn)
    nextBtn.disabled = currentCommentPage >= totalPages;
  const oldInfo = document.getElementById("comment-pagination-info");
  if (oldInfo)
    oldInfo.innerText = `Page ${currentCommentPage}`;
}
function updateCommentCountLabels(total) {
  if (total === undefined)
    return;
  const countLabel = currentCommentType === "hot" ? "hot-comment-count" : "new-comment-count";
  const el = document.getElementById(countLabel);
  if (el)
    el.innerText = total > 1000 ? (total / 1000).toFixed(1) + "k" : total;
}
function renderComments(comments) {
  const list = document.getElementById("comment-list");
  if (!list)
    return;
  if (!comments || comments.length === 0) {
    if (currentCommentPage === 1) {
      list.innerHTML = '<div class="text-center py-20 text-gray-300 font-bold uppercase tracking-widest">暂无评论</div>';
    }
    return;
  }
  const html = comments.map((c) => createCommentItemHTML(c)).join("");
  if (currentCommentPage === 1) {
    list.innerHTML = html;
  } else {
    list.insertAdjacentHTML("beforeend", html);
  }
}
function createCommentItemHTML(comment, isReply = false) {
  const timeStr = comment.timeStr || (comment.time ? new Date(comment.time).toLocaleString() : "");
  const location = comment.location ? ` • ${comment.location}` : "";
  const defaultAvatar = "/music/assets/logo.svg";
  const avatar = comment.avatar || defaultAvatar;
  const isDefault = avatar.includes("logo.svg") || !comment.avatar;
  const avatarClass = `w-8 h-8 md:w-10 md:h-10 rounded-full shadow-sm hover:scale-110 transition-transform t-bg-main flex-shrink-0 object-cover ${isDefault ? "dynamic-logo is-placeholder p-1.5" : ""}`;
  let replyHtml = "";
  if (comment.reply && comment.reply.length > 0) {
    replyHtml = `
            <div class="mt-4 ml-2 pl-4 border-l-2 t-border-main space-y-4">
                ${comment.reply.map((r) => createCommentItemHTML(r, true)).join("")}
            </div>
        `;
  }
  return `
        <div class="group flex gap-3 md:gap-4 transition-all animate-fade-in-up">
            <img src="${avatar}" 
                 loading="lazy" fetchpriority="low"
                 class="${avatarClass}" 
                 onerror="if(!this.dataset.tried){this.dataset.tried=1;this.src='/music/assets/logo.svg';this.classList.add('dynamic-logo','is-placeholder','p-1.5','bg-emerald-50');this.style.filter='var(--logo-filter, none)';}">
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs md:text-sm font-black t-text-main truncate">${comment.userName}</span>
                    <div class="flex items-center gap-1.5 text-[10px] t-text-muted font-bold">
                        <i class="far fa-thumbs-up"></i>
                        <span>${comment.likedCount || 0}</span>
                    </div>
                </div>
                <p class="text-xs md:text-sm t-text-muted leading-relaxed break-words whitespace-pre-wrap">${comment.text}</p>
                ${comment.images && comment.images.length > 0 ? `
                    <div class="mt-2 flex flex-wrap gap-2">
                        ${comment.images.map((img) => `
                            <img src="${img}" 
                                 loading="lazy" fetchpriority="low"
                                 class="max-w-[200px] max-h-[300px] rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition-opacity" 
                                 onclick="window.open('${img}', '_blank')"
                                 onerror="this.style.display='none'">
                        `).join("")}
                    </div>
                ` : ""}
                <div class="mt-2 flex items-center gap-3 text-[10px] t-text-muted font-bold uppercase tracking-tight">
                    <span>${timeStr}${location}</span>
                </div>
                ${replyHtml}
            </div>
        </div>
    `;
}
async function toggleSongInList(listId, isAdd) {
  console.warn("toggleSongInList is deprecated");
}
window.openCustomSourceModal = openCustomSourceModal;
window.closeCustomSourceModal = closeCustomSourceModal;
window.switchCustomSourceMode = switchCustomSourceMode;
window.handleFileUpload = handleFileUpload;
window.handleUrlImport = handleUrlImport;
window.openPlaylistAddModal = openPlaylistAddModal;
window.closePlaylistAddModal = closePlaylistAddModal;
window.toggleSongInList = toggleSongInList;
window.toggleSource = toggleSource;
window.deleteSource = deleteSource;
window.reloadSource = reloadSource;
window.toggleCustomSource = toggleSource;
window.deleteCustomSource = deleteSource;
window.importFromUrl = handleUrlImport;
window.togglePublicSourcesSetting = togglePublicSourcesSetting;
window.switchTab = switchTab;
window.handleSearchKeyPress = handleSearchKeyPress;
window.doSearch = doSearch;
window.changePage = changePage;
window.handleHotSearchClick = handleHotSearchClick;
window.playSong = playSong;
window.togglePlay = togglePlay;
window.handleDownloadClick = handleDownloadClick;
window.playNext = playNext;
window.playPrev = playPrev;
window.seek = seek;
window.changeQualityPreference = changeQualityPreference;
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.setPlayMode = setPlayMode;
window.showSelect = showSelect;
window.toggleLyrics = toggleLyrics;
window.toggleFavorites = toggleFavorites;
window.handleFavoritesClick = handleFavoritesClick;
window.handleListClick = handleListClick;
window.handleCreateList = handleCreateList;
window.handleRefreshList = handleRefreshList;
window.handleJumpToOriginalList = handleJumpToOriginalList;
window.handleRemoveList = handleRemoveList;
window.toggleLove = toggleLove;
window.switchSyncMode = switchSyncMode;
window.handleLocalLogin = handleLocalLogin;
window.handleSyncLogout = handleSyncLogout;
window.resetAllSettings = resetAllSettings;
window.handleRemoteConnect = handleRemoteConnect;
window.handleRemoteStep1 = handleRemoteStep1;
window.handleRemoteBack = handleRemoteBack;
window.selectSyncMode = selectSyncMode;
window.cancelSyncMode = cancelSyncMode;
window.closeSyncModal = closeSyncModal;
window.toggleCommentModal = toggleCommentModal;
window.switchCommentType = switchCommentType;
window.refreshComments = refreshComments;
window.fetchComments = fetchComments;
window.checkServerCache = checkServerCache;
function showInput(title, message, options = {}) {
  const {
    placeholder = "请输入内容...",
    defaultValue = "",
    confirmText = "确定",
    cancelText = "取消",
    confirmColor = "bg-emerald-500",
    inputType = "text"
  } = options;
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
    modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-slide-up relative z-10 border t-border-main">
                <!-- Header -->
                <div class="px-5 py-4 border-b border-emerald-100/50 flex justify-between items-center bg-emerald-50/50">
                    <h3 class="text-sm font-bold t-text-main">${title}</h3>
                    <button id="modal-close-x" class="t-text-muted hover:text-emerald-500 transition-colors">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <!-- Body -->
                <div class="p-6">
                    <div class="flex items-start gap-4 mb-4">
                        <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                            <i class="fas fa-edit text-lg"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm t-text-muted leading-relaxed mb-4">${message}</p>
                            <input type="${inputType}" id="modal-input" 
                                class="w-full px-4 py-2.5 t-bg-main border t-border-main rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                                placeholder="${placeholder}" value="${defaultValue}">
                        </div>
                    </div>
                </div>
                <!-- Footer -->
                <div class="p-4 t-bg-main/50 border-t t-border-main/50 flex gap-3 flex-row-reverse">
                    <button id="confirm-ok" class="flex-1 py-2.5 text-sm font-bold text-white ${confirmColor} hover:opacity-90 rounded-xl shadow-lg transition-all active:scale-95">
                        ${confirmText}
                    </button>
                    <button id="confirm-cancel" class="flex-1 py-2.5 text-sm font-bold t-text-muted hover:t-text-main hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                        ${cancelText}
                    </button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);
    const input = modal.querySelector("#modal-input");
    input.focus();
    if (defaultValue)
      input.select();
    const close = (result) => {
      const content = modal.querySelector(".max-w-sm");
      if (content) {
        content.classList.add("scale-95", "opacity-0");
      }
      modal.classList.add("opacity-0");
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };
    modal.querySelector("#confirm-ok").onclick = () => close(input.value.trim() || null);
    modal.querySelector("#confirm-cancel").onclick = () => close(null);
    modal.querySelector("#modal-close-x").onclick = () => close(null);
    modal.querySelector("div:first-child").onclick = () => close(null);
    input.onkeydown = (e) => {
      if (e.key === "Enter")
        close(input.value.trim() || null);
      if (e.key === "Escape")
        close(null);
    };
  });
}
function showSelect(title, message, options = {}) {
  const {
    confirmText = "确定",
    cancelText = "取消",
    confirmColor = "bg-emerald-500",
    danger = false
  } = options;
  const btnColor = danger ? "bg-red-500 hover:bg-red-600 shadow-red-100" : `${confirmColor} hover:opacity-90 shadow-emerald-100`;
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
    modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-slide-up relative z-10 border t-border-main">
                <!-- Header -->
                <div class="px-5 py-4 border-b border-emerald-100/50 flex justify-between items-center bg-emerald-50/50">
                    <h3 class="text-sm font-bold t-text-main">${title}</h3>
                    <button id="modal-close-x" class="t-text-muted hover:text-emerald-500 transition-colors">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <!-- Body -->
                <div class="p-6">
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-full ${danger ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"} flex items-center justify-center shrink-0">
                            <i class="fas ${danger ? "fa-exclamation-triangle" : "fa-question-circle"} text-lg"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm t-text-muted leading-relaxed">${message}</p>
                        </div>
                    </div>
                </div>
                <!-- Footer -->
                <div class="p-4 t-bg-main/50 border-t t-border-main/50 flex gap-3 flex-row-reverse">
                    <button id="confirm-ok" class="flex-1 py-2.5 text-sm font-bold text-white ${btnColor} rounded-xl shadow-lg transition-all active:scale-95">
                        ${confirmText}
                    </button>
                    <button id="confirm-cancel" class="flex-1 py-2.5 text-sm font-bold t-text-muted hover:t-text-main hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                        ${cancelText}
                    </button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);
    const close = (result) => {
      const content = modal.querySelector(".max-w-sm");
      if (content) {
        content.classList.add("scale-95", "opacity-0");
      }
      modal.classList.add("opacity-0");
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };
    modal.querySelector("#confirm-ok").onclick = () => close(true);
    modal.querySelector("#confirm-cancel").onclick = () => close(false);
    modal.querySelector("#modal-close-x").onclick = () => close(false);
    modal.querySelector("div:first-child").onclick = () => close(false);
  });
}
function showOptions(title, message, options = []) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
    const optionsHtml = options.map((opt) => `
            <button class="w-full text-left px-4 py-3.5 t-text-main hover:bg-emerald-500 hover:text-white transition-all rounded-xl font-bold text-sm flex items-center justify-between group" data-value="${opt}">
                <span>${opt}</span>
                <i class="fas fa-chevron-right text-[10px] opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all"></i>
            </button>
        `).join("");
    modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-slide-up relative z-10 border t-border-main">
                <div class="px-5 py-4 border-b border-emerald-100/50 flex justify-between items-center bg-emerald-50/50">
                    <h3 class="text-sm font-bold t-text-main">${title}</h3>
                    <button id="opt-close-x" class="t-text-muted hover:text-emerald-500 transition-colors">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <div class="p-3">
                    <p class="px-3 py-2 text-xs t-text-muted mb-2 font-medium">${message}</p>
                    <div class="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-1">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
        `;
    const close = (result) => {
      const content = modal.querySelector(".max-w-sm");
      if (content) {
        content.classList.add("scale-95", "opacity-0");
      }
      modal.classList.add("opacity-0");
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };
    modal.querySelectorAll("button[data-value]").forEach((btn) => {
      btn.onclick = () => close(btn.getAttribute("data-value"));
    });
    modal.querySelector("#opt-close-x").onclick = () => close(null);
    modal.querySelector("div:first-child").onclick = () => close(null);
    document.body.appendChild(modal);
  });
}
window.showOptions = showOptions;
async function handleDownloadClick(event) {
  if (event)
    event.stopPropagation();
  if (!currentPlayingSong) {
    showInfo("当前没有正在播放的歌曲");
    return;
  }
  const isPublic = !isUserLoggedIn() || !window.currentListData?.username || window.currentListData?.username === "default" || window.currentListData?.username === "_open";
  const enablePublicRestriction = window.lx_config?.["user.enablePublicRestriction"];
  const isAdmin = !!localStorage.getItem("lx_admin_password");
  const isServerCacheAllowed = window.settings?.enableServerCache === true;
  if (isPublic && enablePublicRestriction && !isServerCacheAllowed && !isAdmin) {
    showError("权限限制：管理员已关闭缓存歌曲功能，下载歌曲需要验证管理员身份。");
    if (typeof window.handleAdminAuth === "function") {
      const authorized = await window.handleAdminAuth("管理员已关闭缓存歌曲文件功能，下载歌曲需要验证管理员身份");
      if (!authorized)
        return;
    } else {
      return;
    }
  }
  const song = currentPlayingSong;
  const prefQuality = window.settings?.preferredQuality || "flac";
  const checkResult = await window.checkServerCache?.(song, prefQuality);
  const cacheSuffix = checkResult?.exists && !checkResult?.isCollision ? " (已缓存)" : "";
  const isOnlyDownload = window.settings?.enableOnlyDownloadMode === true;
  const actionLabel = isOnlyDownload ? "下载到服务器" : "缓存到服务器";
  const options = ["浏览器下载", `${actionLabel}${cacheSuffix}`];
  const modeText = isOnlyDownload ? "仅下载模式" : "缓存模式";
  const selected = await showOptions("下载与缓存", `[${modeText}] 选择对 [${song.name}] 的操作：`, options);
  if (selected === "浏览器下载") {
    if (typeof downloadSong === "function") {
      downloadSong(song, null, false, "浏览器下载");
    } else {
      showError("下载功能未就绪");
    }
  } else if (selected && (selected.startsWith("缓存到服务器") || selected.startsWith("下载到服务器"))) {
    const isCached = checkResult?.exists && !checkResult?.isCollision;
    if (!isOnlyDownload && isCached) {
      showInfo("该歌曲已在服务器缓存");
      return;
    }
    if (typeof downloadSong === "function") {
      downloadSong(song, null, false, actionLabel);
    } else {
      showError("服务器缓存逻辑未就绪");
    }
  }
}
function showToast(type, message, duration = 3000) {
  const config = {
    success: { bg: "bg-emerald-500", icon: "fa-check-circle" },
    info: { bg: "bg-blue-500", icon: "fa-info-circle" },
    error: { bg: "bg-red-500", icon: "fa-exclamation-circle" }
  };
  const conf = config[type] || config.info;
  const toast = document.createElement("div");
  toast.className = `toast-item fixed right-4 ${conf.bg} text-white px-4 py-3 rounded-lg shadow-lg z-[1000] animate-slide-in flex items-center gap-3 w-80 md:w-96 max-w-[90vw] cursor-pointer transition-all duration-300`;
  const contentHtml = createMarqueeHtml(message, "flex-1 font-medium");
  toast.innerHTML = `
        <i class="fas ${conf.icon} text-xl shrink-0"></i>
        ${contentHtml}
    `;
  const bottomBase = 96;
  const gap = 12;
  toast.style.visibility = "hidden";
  document.body.appendChild(toast);
  applyMarqueeChecks();
  const toastHeight = toast.offsetHeight || 60;
  const shiftAmt = toastHeight + gap;
  document.querySelectorAll(".toast-item").forEach((el) => {
    if (el === toast)
      return;
    const oldB = parseFloat(el.style.bottom || bottomBase);
    const newB = oldB + shiftAmt;
    el.style.bottom = `${newB}px`;
    el.dataset.offset = newB;
  });
  toast.style.bottom = `${bottomBase}px`;
  toast.dataset.offset = bottomBase;
  toast.style.visibility = "visible";
  let hideTimer = null;
  const startTimer = () => {
    if (hideTimer)
      clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-4");
      setTimeout(() => {
        const h = toast.offsetHeight + gap;
        toast.remove();
        document.querySelectorAll(".toast-item").forEach((el) => {
          const elB = parseFloat(el.style.bottom || 0);
          if (elB > parseFloat(toast.dataset.offset)) {
            const newB = elB - h;
            el.style.bottom = `${newB}px`;
            el.dataset.offset = newB;
          }
        });
      }, 300);
    }, duration);
  };
  startTimer();
  toast.addEventListener("click", () => {
    toast.classList.add("scale-[1.02]", "brightness-110");
    setTimeout(() => toast.classList.remove("scale-[1.02]", "brightness-110"), 150);
    startTimer();
    console.log("[Toast] Timer reset by click");
  });
  toast.addEventListener("mouseenter", () => {
    if (hideTimer)
      clearTimeout(hideTimer);
  });
  toast.addEventListener("mouseleave", () => {
    startTimer();
  });
}
function showSuccess(message) {
  showToast("success", message, 2000);
}
function showInfo(message) {
  showToast("info", message, 2000);
}
function showError(message) {
  showToast("error", message, 2000);
}
function showLoading(message = "正在处理...") {
  if (document.getElementById("global-loading-overlay"))
    return;
  const overlay = document.createElement("div");
  overlay.id = "global-loading-overlay";
  overlay.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
  overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"></div>
        <div class="t-bg-panel rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 relative z-[210] border t-border-main animate-slide-up">
            <div class="relative">
                <div class="w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin"></div>
                <i class="fas fa-music text-emerald-500 absolute inset-0 flex items-center justify-center text-xs"></i>
            </div>
            <p class="text-sm font-bold t-text-main animate-pulse">${message}</p>
        </div>
    `;
  document.body.appendChild(overlay);
}
function hideLoading() {
  const overlay = document.getElementById("global-loading-overlay");
  if (overlay) {
    overlay.classList.add("opacity-0");
    const content = overlay.querySelector(".t-bg-panel");
    if (content)
      content.classList.add("scale-95");
    setTimeout(() => overlay.remove(), 300);
  }
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;
function dismissAllToasts() {
  const toasts = document.querySelectorAll(".toast-item");
  toasts.forEach((toast) => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  });
}
window.dismissAllToasts = dismissAllToasts;
function closeSleepTimerModal() {
  const modal = document.getElementById("sleep-timer-modal");
  const content = document.getElementById("sleep-timer-modal-content");
  if (!modal || !content)
    return;
  content.classList.add("scale-95", "opacity-0");
  content.classList.remove("scale-100", "opacity-100");
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }, 300);
}
document.addEventListener("mousedown", (e) => {
  const modal = document.getElementById("sleep-timer-modal");
  const content = document.getElementById("sleep-timer-modal-content");
  if (modal && !modal.classList.contains("hidden") && e.target === modal) {
    closeSleepTimerModal();
  }
});
window.addEventListener("resize", () => {
  const indicator = document.getElementById("lyric-scroll-indicator");
  if (indicator) {
    indicator.dataset.positioned = "";
  }
});
document.addEventListener("DOMContentLoaded", () => {
  console.log("[Init] 页面加载完成");
  loadCustomSources();
  const lyricContainer = document.getElementById("lyric-container");
  if (lyricContainer) {
    const setUserInteracting = () => {
      isProgrammaticScroll = false;
      if (window.programmaticScrollTimer) {
        clearTimeout(window.programmaticScrollTimer);
        window.programmaticScrollTimer = null;
      }
    };
    lyricContainer.addEventListener("mousedown", setUserInteracting, { passive: true });
    lyricContainer.addEventListener("touchstart", setUserInteracting, { passive: true });
    lyricContainer.addEventListener("touchmove", setUserInteracting, { passive: true });
    lyricContainer.addEventListener("wheel", setUserInteracting, { passive: true });
    lyricContainer.addEventListener("keydown", setUserInteracting, { passive: true });
    lyricContainer.addEventListener("scroll", handleLyricScroll, { passive: true });
  }
  const qualitySelect = document.getElementById("quality-select");
  if (qualitySelect && settings.preferredQuality) {
    qualitySelect.value = settings.preferredQuality;
  }
  setTimeout(() => {
    console.log("[Init] 启动后台初始化任务...");
    loadSettings();
    restorePlaybackState();
    if (typeof showInitialSearchState === "function") {
      showInitialSearchState();
    }
    const searchSourceSelect = document.getElementById("search-source");
    if (searchSourceSelect) {
      searchSourceSelect.addEventListener("change", () => {
        const searchInput = document.getElementById("search-input");
        if (!searchInput || !searchInput.value.trim()) {
          showInitialSearchState();
        }
      });
    }
    const savedMode = localStorage.getItem("lx_sync_mode");
    if (savedMode === "local") {
      const u = localStorage.getItem("lx_sync_user");
      const p = localStorage.getItem("lx_sync_pass");
      if (u && p) {
        if (userToken) {
          console.log("[AutoLogin] 检测到有效 Token，跳过自动登录流程并直接恢复会话。");
          return;
        }
        console.log("[AutoLogin] 检测到本地账户且无有效 Token，正在自动登录...");
        const uInput = document.getElementById("sync-local-user");
        const pInput = document.getElementById("sync-local-pass");
        if (uInput)
          uInput.value = u;
        if (pInput)
          pInput.value = p;
        handleLocalLogin();
      }
    } else if (savedMode === "remote") {
      const url = localStorage.getItem("lx_sync_url");
      const code = localStorage.getItem("lx_sync_code");
      if (url && code) {
        console.log("[AutoLogin] 检测到远程同步设置，正在自动连接...");
        const remoteUrlInput = document.getElementById("sync-remote-url");
        const remoteStep1 = document.getElementById("sync-remote-step1");
        const remoteStep2 = document.getElementById("sync-remote-step2");
        const remoteCodeInput = document.getElementById("sync-remote-code");
        if (remoteUrlInput)
          remoteUrlInput.value = url;
        if (remoteStep1)
          remoteStep1.classList.add("hidden");
        if (remoteStep2)
          remoteStep2.classList.remove("hidden");
        if (remoteCodeInput)
          remoteCodeInput.value = code;
        handleRemoteConnect();
      }
    }
  }, 100);
  window.setCompactPlaybar = function(compact, showToastMsg = false) {
    const infoEl = document.getElementById("player-song-info");
    const collapseBtn = document.getElementById("btn-collapse-panel");
    if (!infoEl)
      return;
    if (compact) {
      infoEl.style.display = "none";
      if (collapseBtn)
        collapseBtn.style.display = "none";
      if (showToastMsg)
        showToast("info", "已开启精简播放控制栏", 1500);
    } else {
      infoEl.style.display = "";
      if (collapseBtn)
        collapseBtn.style.display = "";
      if (showToastMsg)
        showToast("info", "已恢复完整播放栏控制", 1500);
    }
    if (window.musicVisualizer && window.musicVisualizer.applySettings) {
      setTimeout(() => window.musicVisualizer.applySettings(), 50);
    }
  };
  const btnPlay = document.getElementById("btn-play");
  if (btnPlay) {
    let pressTimer;
    const infoEl = document.getElementById("player-song-info");
    const startPress = (e) => {
      if (e.type === "mousedown" && e.button !== 0)
        return;
      window.playBtnIsLongPress = false;
      pressTimer = setTimeout(() => {
        window.playBtnIsLongPress = true;
        if (navigator.vibrate)
          navigator.vibrate(50);
        if (infoEl) {
          const isHidden = infoEl.style.display === "none";
          window.setCompactPlaybar(!isHidden, true);
        }
      }, 600);
    };
    const cancelPress = () => {
      if (pressTimer)
        clearTimeout(pressTimer);
    };
    btnPlay.addEventListener("mousedown", startPress);
    btnPlay.addEventListener("touchstart", startPress, { passive: true });
    btnPlay.addEventListener("mouseup", cancelPress);
    btnPlay.addEventListener("touchend", cancelPress);
    btnPlay.addEventListener("mouseleave", cancelPress);
    btnPlay.addEventListener("touchcancel", cancelPress);
  }
});
window.getCurrentActiveListId = function() {
  if (currentSearchScope === "local_list")
    return window.currentViewingListId;
  if (currentSearchScope === "local_all")
    return "love";
  return null;
};
function toggleSidebar() {
  const sidebar = document.getElementById("main-sidebar");
  const backdrop = document.getElementById("mobile-sidebar-backdrop");
  if (sidebar.classList.contains("-translate-x-full")) {
    sidebar.classList.remove("-translate-x-full");
    sidebar.classList.add("translate-x-0");
    backdrop.classList.remove("hidden");
  } else {
    sidebar.classList.remove("translate-x-0");
    sidebar.classList.add("-translate-x-full");
    backdrop.classList.add("hidden");
  }
}
window.addEventListener("resize", () => {
  const sidebar = document.getElementById("main-sidebar");
  const backdrop = document.getElementById("mobile-sidebar-backdrop");
  if (sidebar && window.innerWidth >= 1025) {
    sidebar.classList.remove("-translate-x-full", "translate-x-0");
    if (backdrop)
      backdrop.classList.add("hidden");
  } else if (sidebar) {
    if (!sidebar.classList.contains("translate-x-0")) {
      sidebar.classList.add("-translate-x-full");
    }
  }
});
function toggleDetailCover() {
  const cover = document.getElementById("mobile-player-cover-container");
  const container = document.getElementById("player-detail-container");
  const lyricsWrapper = document.getElementById("lyrics-wrapper");
  const lyricContent = document.getElementById("lyric-content");
  const detailTitle = document.getElementById("detail-title");
  const titleParent = lyricsWrapper ? lyricsWrapper.querySelector("div:first-child") : null;
  if (!cover || !container)
    return;
  const isHidden = cover.classList.contains("opacity-0");
  if (!isHidden) {
    cover.style.display = "none";
    cover.classList.add("opacity-0", "scale-90", "border-0");
    container.classList.remove("pt-8", "mt-4", "md:pt-0", "md:pt-24");
    container.classList.add("pt-4", "md:pt-10");
    if (lyricsWrapper) {
      lyricsWrapper.classList.remove("md:w-auto", "md:max-w-[50%]", "md:w-[500px]", "lg:w-[600px]", "flex-shrink-0");
      lyricsWrapper.classList.add("md:w-2/3", "mx-auto", "lyrics-centered");
      lyricsWrapper.style.maxHeight = "85vh";
    }
    if (lyricContent) {
      lyricContent.classList.remove("md:items-start", "md:text-left", "md:pl-6");
      lyricContent.classList.add("items-center", "text-center");
    }
    if (titleParent) {
      titleParent.classList.remove("md:text-left", "md:pl-6");
      titleParent.classList.add("text-center");
    }
    if (detailTitle) {
      detailTitle.classList.remove("md:mx-0");
      detailTitle.classList.add("mx-auto");
    }
    container.classList.add("has-centered-lyrics");
  } else {
    cover.style.display = "block";
    cover.classList.remove("opacity-0", "scale-90", "border-0");
    container.classList.remove("has-centered-lyrics");
    container.classList.add("gap-4", "md:gap-20");
    container.classList.remove("pt-8", "md:pt-32", "md:pt-10");
    if (window.innerWidth < 1025) {
      container.classList.add("pt-8", "mt-4");
    }
    if (lyricsWrapper) {
      lyricsWrapper.classList.remove("md:w-auto", "md:max-w-[50%]", "md:w-2/3", "mx-auto", "lyrics-centered");
      lyricsWrapper.classList.add("md:w-[500px]", "lg:w-[600px]", "flex-shrink-0");
      lyricsWrapper.style.maxHeight = "";
    }
    if (lyricContent) {
      lyricContent.classList.add("items-center", "md:items-start", "text-center", "md:text-left", "md:pl-6");
    }
    if (titleParent) {
      titleParent.classList.add("text-center", "md:text-left", "md:pl-6");
    }
    if (detailTitle) {
      detailTitle.classList.add("md:mx-0");
    }
  }
}
function startExpandBtnTimer() {
  const expandBtn = document.getElementById("btn-expand-panel");
  if (!expandBtn)
    return;
  if (expandBtnTimeout)
    clearTimeout(expandBtnTimeout);
  expandBtn.classList.remove("faint");
  expandBtnTimeout = setTimeout(() => {
    const footer = document.getElementById("player-footer");
    if (footer && footer.classList.contains("translate-y-[110%]")) {
      expandBtn.classList.add("faint");
    }
  }, 3000);
}
function startToggleLyricsBtnTimer() {
  const toggleBtn = document.getElementById("btn-toggle-lyrics");
  if (!toggleBtn)
    return;
  if (toggleLyricsBtnTimeout)
    clearTimeout(toggleLyricsBtnTimeout);
  toggleBtn.classList.remove("faint");
  toggleLyricsBtnTimeout = setTimeout(() => {
    const view = document.getElementById("view-player-detail");
    if (view && !view.classList.contains("translate-y-[100%]")) {
      toggleBtn.classList.add("faint");
    }
  }, 3000);
}
function togglePlayerPanel() {
  const footer = document.getElementById("player-footer");
  const expandBtn = document.getElementById("btn-expand-panel");
  const container = document.getElementById("player-detail-container");
  if (!footer || !expandBtn)
    return;
  const isHidden = footer.classList.contains("translate-y-[110%]");
  const views = ["view-search", "view-settings", "view-favorites", "view-about", "main-sidebar", "view-songlist", "songlist-detail-view"];
  const playerDetail = document.getElementById("view-player-detail");
  const lyricsWrapper = document.getElementById("lyrics-wrapper");
  if (isHidden) {
    footer.classList.remove("translate-y-[110%]");
    footer.style.opacity = "1";
    footer.style.pointerEvents = "auto";
    expandBtn.classList.remove("translate-y-0", "scale-100", "opacity-100");
    expandBtn.classList.add("translate-y-20", "scale-75", "opacity-0");
    if (expandBtnTimeout)
      clearTimeout(expandBtnTimeout);
    expandBtn.classList.remove("faint");
    views.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove("pb-32", "pb-44", "md:pb-32");
        el.classList.add("pb-44", "md:pb-32");
      }
    });
    if (playerDetail) {
      playerDetail.classList.add("pb-24");
      playerDetail.classList.remove("pb-0");
    }
    if (container) {
      container.classList.remove("translate-y-12", "opacity-80", "scale-95");
      container.classList.remove("md:pt-24", "md:pt-12");
      container.classList.add("md:pt-0");
    }
  } else {
    footer.classList.add("translate-y-[110%]");
    footer.style.opacity = "0";
    footer.style.pointerEvents = "none";
    if (window.musicVisualizer && window.musicVisualizer.clear) {
      window.musicVisualizer.clear("footer");
    }
    setTimeout(() => {
      expandBtn.classList.remove("translate-y-20", "scale-75", "opacity-0");
      expandBtn.classList.add("translate-y-0", "scale-100", "opacity-100");
    }, 300);
    startExpandBtnTimer();
    views.forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.classList.remove("pb-32", "pb-44", "md:pb-32");
    });
    if (playerDetail) {
      playerDetail.classList.remove("pb-24");
      playerDetail.classList.add("pb-0");
    }
    if (container) {
      container.classList.remove("md:pt-0");
      container.classList.add("md:pt-24");
      container.classList.add("translate-y-12", "opacity-80", "scale-95");
      setTimeout(() => {
        container.classList.remove("translate-y-12", "opacity-80", "scale-95");
      }, 600);
    }
  }
  if (window.musicVisualizer) {
    window.musicVisualizer.applySettings();
  }
  setTimeout(() => {
    scrollToActiveLine(true);
  }, 300);
}
window.togglePlayerPanel = togglePlayerPanel;
window.updateSetting = updateSetting;
function initAudioEngine() {
  if (window.soundEffects && !window._audioEngineInited) {
    window.soundEffects.init();
    window._audioEngineInited = true;
    console.log("[AudioEngine] Sound effects initialized via AudioEngine");
    if (window.musicVisualizer && window.musicVisualizer.init) {
      window.musicVisualizer.init();
    }
    if (window.iOSBackgroundAudio) {
      window.iOSBackgroundAudio.ensureAnchorPlaying();
    }
  }
}
var originalTogglePlay = window.togglePlay;
window.togglePlay = function() {
  initAudioEngine();
  if (originalTogglePlay)
    originalTogglePlay();
};
document.addEventListener("click", initAudioEngine, { once: true });
var searchTipsDebounceTimer = null;
var currentSelectedTipIndex = -1;
var currentTipAbortController = null;
function initSearchTips() {
  const searchInput = document.getElementById("search-input");
  const suggestionsContainer = document.getElementById("search-suggestions");
  if (!searchInput || !suggestionsContainer)
    return;
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTipsDebounceTimer);
    if (!query) {
      hideSearchSuggestions();
      return;
    }
    searchTipsDebounceTimer = setTimeout(() => {
      fetchSearchTips(query);
    }, 300);
  });
  searchInput.addEventListener("focus", () => {
    const query = searchInput.value.trim();
    if (query) {
      suggestionsContainer.classList.remove("hidden");
    }
  });
  searchInput.addEventListener("keydown", (e) => {
    const list = document.getElementById("search-suggestions-list");
    const items = list ? list.querySelectorAll(".search-tip-item") : [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0)
        return;
      currentSelectedTipIndex = (currentSelectedTipIndex + 1) % items.length;
      updateTipSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0)
        return;
      currentSelectedTipIndex = (currentSelectedTipIndex - 1 + items.length) % items.length;
      updateTipSelection(items);
    } else if (e.key === "Enter") {
      if (currentSelectedTipIndex >= 0 && items[currentSelectedTipIndex]) {
        e.preventDefault();
        const text = items[currentSelectedTipIndex].textContent.trim();
        searchInput.value = text;
        hideSearchSuggestions();
        doSearch();
      }
    } else if (e.key === "Escape") {
      hideSearchSuggestions();
    }
  });
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      hideSearchSuggestions();
    }
  });
}
function updateTipSelection(items) {
  items.forEach((item, index) => {
    if (index === currentSelectedTipIndex) {
      item.classList.add("t-bg-muted");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("t-bg-muted");
    }
  });
}
async function fetchSearchTips(query) {
  if (currentTipAbortController)
    currentTipAbortController.abort();
  currentTipAbortController = new AbortController;
  const signal = currentTipAbortController.signal;
  const source = document.getElementById("search-source") ? document.getElementById("search-source").value : "kw";
  try {
    const resp = await fetch(`/api/music/tipSearch?name=${encodeURIComponent(query)}&source=${source}`, { signal });
    if (!resp.ok)
      return;
    const tips = await resp.json();
    renderSearchTips(tips);
  } catch (err) {
    if (err.name === "AbortError")
      return;
    console.error("[TipSearch] Fetch error:", err);
  } finally {
    if (currentTipAbortController && currentTipAbortController.signal === signal) {
      currentTipAbortController = null;
    }
  }
}
function renderSearchTips(tips) {
  const container = document.getElementById("search-suggestions");
  const list = document.getElementById("search-suggestions-list");
  const input = document.getElementById("search-input");
  if (!container || !list || !input)
    return;
  if (document.activeElement !== input) {
    container.classList.add("hidden");
    return;
  }
  list.innerHTML = "";
  currentSelectedTipIndex = -1;
  if (!tips || tips.length === 0) {
    container.classList.add("hidden");
    return;
  }
  tips.forEach((tip, index) => {
    const div = document.createElement("div");
    div.className = "search-tip-item px-4 py-2.5 hover:t-bg-muted cursor-pointer transition-colors text-sm flex items-center gap-3";
    div.innerHTML = `<i class="fas fa-search t-text-muted text-xs"></i><span class="truncate">${tip}</span>`;
    div.onclick = (e) => {
      e.stopPropagation();
      input.value = tip;
      hideSearchSuggestions();
      doSearch();
    };
    list.appendChild(div);
  });
  container.classList.remove("hidden");
}
function hideSearchSuggestions() {
  const container = document.getElementById("search-suggestions");
  if (container)
    container.classList.add("hidden");
  currentSelectedTipIndex = -1;
  if (searchTipsDebounceTimer) {
    clearTimeout(searchTipsDebounceTimer);
    searchTipsDebounceTimer = null;
  }
  if (currentTipAbortController) {
    currentTipAbortController.abort();
    currentTipAbortController = null;
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearchTips);
} else {
  initSearchTips();
}
async function loadTokenConfig() {
  const section = document.getElementById("token-management-section");
  if (!section)
    return;
  try {
    const res = await fetch("/api/user/token/config", {
      headers: getUserAuthHeaders()
    });
    if (!res.ok)
      throw new Error("Failed to load token config");
    const { config } = await res.json();
    const toggle = document.getElementById("setting-enable-persistent-token");
    const container = document.getElementById("token-list-container");
    if (toggle)
      toggle.checked = config.enabled;
    if (config.enabled) {
      container.classList.remove("hidden", "opacity-50", "pointer-events-none");
    } else {
      container.classList.add("hidden");
    }
    settings.enablePersistentToken = config.enabled;
    renderTokenList(config.tokens || []);
  } catch (e) {
    console.error("[Token] Failed to load config:", e);
  }
}
function renderTokenList(tokens) {
  const list = document.getElementById("token-items");
  if (!list)
    return;
  if (tokens.length === 0) {
    list.innerHTML = '<div class="text-[10px] t-text-muted text-center py-6 border-2 border-dashed t-border-main rounded-xl italic opacity-60">暂无生成的 API Token</div>';
    return;
  }
  list.innerHTML = tokens.map((t) => {
    const masked = `${t.token.slice(0, 6)}...${t.token.slice(-4)}`;
    const isExpired = t.expiresAt && t.expiresAt < Date.now();
    const isDisabled = !!t.disabled;
    return `
        <div class="t-bg-item rounded-3xl p-4 md:p-6 border t-border-main hover:t-border-primary transition-all duration-300 group ${isExpired || isDisabled ? "opacity-60" : ""}">
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold t-text-main mb-1.5 truncate flex flex-wrap items-center gap-2">
                        <span>${t.name}</span>
                        <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-mono border border-emerald-500/20">${masked}</span>
                        ${isExpired ? '<span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[9px] font-bold border border-red-500/20 whitespace-nowrap">已过期</span>' : ""}
                        ${isDisabled ? '<span class="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-[9px] font-bold border border-orange-500/20 whitespace-nowrap">已禁用</span>' : ""}
                    </div>
                    <div class="text-[11px] t-text-muted mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-y-1 sm:gap-x-4 items-start sm:items-center opacity-80">
                        <span class="inline-flex items-center gap-1.5"><i class="far fa-calendar-plus opacity-50 text-[10px]"></i> ${new Date(t.createdAt).toLocaleString()}</span>
                        <span class="inline-flex items-center gap-1.5"><i class="far fa-clock opacity-50 text-[10px]"></i> ${t.expiresAt ? new Date(t.expiresAt).toLocaleString() : "永久有效"}</span>
                    </div>
                    ${t.lastUsed ? `<div class="text-[10px] text-emerald-500/90 mt-2 flex items-center gap-1.5 font-medium"><i class="fas fa-history text-[9px]"></i> 最后调用: ${new Date(t.lastUsed).toLocaleString()}</div>` : ""}
                </div>
                
                <div class="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-0 t-border-main border-dashed">
                    <!-- 状态切换 (使用统一的 Tailwind 样式) -->
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] t-text-muted opacity-70 hidden sm:inline">${isDisabled ? "停用中" : "生效中"}</span>
                        <label class="relative inline-flex items-center cursor-pointer scale-[0.85]">
                            <input type="checkbox" ${!isDisabled ? "checked" : ""} onchange="handleToggleTokenStatus('${masked}', !this.checked)" class="sr-only peer">
                            <div class="w-11 h-6 bg-gray-200/50 peer-focus:outline-none rounded-full peer dark:bg-gray-700/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>
                    
                    <div class="flex items-center gap-1">
                        <button onclick="openTokenLogsModal('${masked}', '${t.name}')" 
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:t-bg-primary hover:text-white transition-all group/btn" title="查看日志">
                            <i class="fas fa-list-ul text-[13px] md:text-[14px]"></i>
                        </button>
                        <button onclick="openEditTokenModal('${masked}', '${t.name}', ${t.expiresAt})" 
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:t-bg-primary hover:text-white transition-all group/btn" title="编辑信息">
                            <i class="fas fa-pencil-alt text-[13px] md:text-[14px]"></i>
                        </button>
                        <button onclick="copyTokenToClipboard('${t.token}')" 
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:bg-blue-500 hover:text-white transition-all group/btn" title="复制 Token">
                            <i class="far fa-copy text-[13px] md:text-[14px]"></i>
                        </button>
                        <button onclick="handleRemoveToken('${t.token}')" 
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:bg-red-500 hover:text-white transition-all group/btn" title="删除 Token">
                            <i class="far fa-trash-alt text-[13px] md:text-[14px]"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
  }).join("");
}
async function toggleTokenAuthSetting(enabled, silent = false) {
  try {
    const res = await fetch("/api/user/token/config", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getUserAuthHeaders() },
      body: JSON.stringify({ enabled })
    });
    if (res.ok) {
      if (!silent)
        showSuccess(`持久化 Token 已${enabled ? "启用" : "禁用"}`);
      await updateSetting("enablePersistentToken", enabled);
      await loadTokenConfig();
    } else {
      throw new Error;
    }
  } catch (e) {
    if (!silent)
      showError("更新 Token 配置失败");
    const toggle = document.getElementById("setting-enable-persistent-token");
    if (toggle)
      toggle.checked = !enabled;
  }
}
function openAddTokenModal() {
  const modal = document.getElementById("modal-add-token");
  const content = document.getElementById("modal-add-token-content");
  modal.classList.remove("hidden");
  setTimeout(() => {
    content.classList.remove("scale-95", "opacity-0");
    content.classList.add("scale-100", "opacity-100");
  }, 10);
  document.getElementById("token-modal-title").innerText = "生成持久化 Token";
  document.getElementById("edit-token-masked").value = "";
  document.getElementById("token-modal-submit-btn").innerText = "生成并保存";
  document.getElementById("token-modal-submit-btn").onclick = handleAddToken;
  document.getElementById("add-token-form").classList.remove("hidden");
  document.getElementById("add-token-result").classList.add("hidden");
  document.getElementById("new-token-name").value = "";
  document.getElementById("new-token-offset-value").value = "";
  document.getElementById("new-token-exact-date").value = "";
  switchTokenExpireMode("offset");
}
function switchTokenExpireMode(mode) {
  const btnOffset = document.getElementById("btn-expire-offset");
  const btnDate = document.getElementById("btn-expire-date");
  const areaOffset = document.getElementById("expire-offset-area");
  const areaDate = document.getElementById("expire-date-area");
  if (mode === "offset") {
    btnOffset.classList.add("t-bg-main", "bg-white", "dark:bg-white/10", "shadow-sm");
    btnOffset.classList.remove("t-text-muted");
    btnDate.classList.remove("t-bg-main", "bg-white", "dark:bg-white/10", "shadow-sm");
    btnDate.classList.add("t-text-muted");
    areaOffset.classList.remove("hidden");
    areaDate.classList.add("hidden");
  } else {
    btnDate.classList.add("t-bg-main", "bg-white", "dark:bg-white/10", "shadow-sm");
    btnDate.classList.remove("t-text-muted");
    btnOffset.classList.remove("t-bg-main", "bg-white", "dark:bg-white/10", "shadow-sm");
    btnOffset.classList.add("t-text-muted");
    areaOffset.classList.add("hidden");
    areaDate.classList.remove("hidden");
  }
  document.getElementById("modal-add-token").dataset.expireMode = mode;
}
function calculateSelectedExpiresAt() {
  const mode = document.getElementById("modal-add-token").dataset.expireMode;
  if (mode === "date") {
    const val = document.getElementById("new-token-exact-date").value;
    return val ? new Date(val).getTime() : null;
  } else {
    const val = parseFloat(document.getElementById("new-token-offset-value").value);
    const unit = document.getElementById("new-token-offset-unit").value;
    if (!val || val <= 0)
      return null;
    const offsetMs = unit === "h" ? val * 60 * 60 * 1000 : val * 24 * 60 * 60 * 1000;
    return Date.now() + offsetMs;
  }
}
function closeAddTokenModal() {
  const modal = document.getElementById("modal-add-token");
  const content = document.getElementById("modal-add-token-content");
  content.classList.add("scale-95", "opacity-0");
  content.classList.remove("scale-100", "opacity-100");
  setTimeout(() => modal.classList.add("hidden"), 300);
}
async function handleAddToken() {
  const name = document.getElementById("new-token-name").value.trim();
  const expiresAt = calculateSelectedExpiresAt();
  if (!name) {
    showError("请填写 Token 名称");
    return;
  }
  try {
    const res = await fetch("/api/user/token/add", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getUserAuthHeaders() },
      body: JSON.stringify({ name, expiresAt })
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById("add-token-form").classList.add("hidden");
      const resultArea = document.getElementById("add-token-result");
      resultArea.classList.remove("hidden");
      document.getElementById("generated-token-value").value = result.token;
      loadTokenConfig();
    } else {
      showError(result.message || "生成失败");
    }
  } catch (e) {
    showError("生成器异常");
  }
}
async function handleRemoveToken(token) {
  if (!await showSelect("确定删除", `确定要永久删除此 Token 吗？
所有使用此凭证的外部工具将立即无法连接。`, { danger: true }))
    return;
  try {
    const res = await fetch("/api/user/token/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getUserAuthHeaders() },
      body: JSON.stringify({ token })
    });
    if (res.ok) {
      showSuccess("Token 已移除");
      loadTokenConfig();
    }
  } catch (e) {
    showError("删除失败");
  }
}
var currentViewingTokenMasked = "";
async function handleRefreshTokenLogs() {
  if (!currentViewingTokenMasked)
    return;
  const list = document.getElementById("token-logs-list");
  const refreshBtn = document.getElementById("btn-refresh-token-logs");
  if (refreshBtn) {
    const icon = refreshBtn.querySelector("i");
    if (icon)
      icon.classList.add("animate-spin");
  }
  try {
    const res = await fetch(`/api/user/token/logs?tokenMasked=${encodeURIComponent(currentViewingTokenMasked)}`, {
      headers: getUserAuthHeaders()
    });
    if (!res.ok)
      throw new Error("Failed to fetch logs");
    const { logs } = await res.json();
    if (!logs || logs.length === 0) {
      list.innerHTML = '<div class="py-12 text-center t-text-muted italic opacity-50">暂无该 Token 的调用日志</div>';
    } else {
      list.innerHTML = logs.map((line) => {
        const auditMatch = line.match(/used by (.*?) from (.*?) to access (.*?)$/);
        const timeMatch = line.match(/\[([\d-T:\.]+)\]/);
        const timeStr = timeMatch ? timeMatch[1].split("T")[1]?.split(".")[0] || "未知" : "未知";
        if (auditMatch) {
          const [, user, ip, url] = auditMatch;
          return `
                    <div class="p-3.5 rounded-2xl t-bg-track border t-border-main flex flex-col gap-2 transition-all hover:t-border-primary border-transparent">
                        <div class="flex items-center justify-between border-b t-border-main border-dashed pb-2 mb-1 opacity-80">
                            <div class="flex items-center gap-1.5">
                                <i class="fas fa-fingerprint text-[10px] text-emerald-500"></i>
                                <span class="text-[10px] font-bold t-text-main">用户 ${user}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 font-mono text-[9px]">${timeStr}</span>
                        </div>
                        <div class="space-y-1.5">
                            <div class="flex items-center gap-2 text-[11px] t-text-main">
                                <i class="fas fa-network-wired w-4 opacity-40 text-center"></i>
                                <span class="opacity-50">来源 IP:</span> <span class="font-mono text-emerald-500/80 tracking-tighter">${ip}</span>
                            </div>
                            <div class="flex items-start gap-2 text-[11px] t-text-main">
                                <i class="fas fa-link w-4 opacity-40 text-center mt-0.5"></i>
                                <div class="flex-1">
                                    <span class="opacity-50">请求路径:</span> 
                                    <span class="font-medium break-all text-blue-500/80 ml-1 italic font-mono">${url}</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
        }
        if (line.includes("token auth")) {
          const isEnabled = line.includes("enabled");
          return `
                    <div class="p-3 rounded-2xl bg-blue-500/5 border border-blue-500/15 flex items-center justify-between">
                         <div class="flex items-center gap-3">
                             <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                                 <i class="fas ${isEnabled ? "fa-toggle-on" : "fa-toggle-off"} text-xs"></i>
                             </div>
                             <div class="text-[11px] t-text-main font-extrabold">全局：${isEnabled ? "启用" : "停用"} API 验证鉴权</div>
                         </div>
                         <span class="text-[9px] t-text-muted opacity-60">${timeStr}</span>
                    </div>`;
        }
        return `<div class="p-3 t-bg-track rounded-xl t-text-muted text-[10px] opacity-70 italic border t-border-main border-dashed">${line}</div>`;
      }).join("");
    }
  } catch (e) {
    console.error("[TokenLog] Error:", e);
    list.innerHTML = `<div class="py-12 text-center text-red-500 italic opacity-50">拉取日志失败: ${e.message}</div>`;
  } finally {
    if (refreshBtn) {
      setTimeout(() => {
        const icon = refreshBtn.querySelector("i");
        if (icon)
          icon.classList.remove("animate-spin");
      }, 500);
    }
  }
}
async function openTokenLogsModal(tokenMasked, name) {
  currentViewingTokenMasked = tokenMasked;
  const modal = document.getElementById("modal-token-logs");
  const content = document.getElementById("modal-token-logs-content");
  const list = document.getElementById("token-logs-list");
  const nameEl = document.getElementById("log-token-name");
  nameEl.innerText = `Token: ${name} (${tokenMasked})`;
  list.innerHTML = '<div class="py-12 text-center t-text-muted italic opacity-50 animate-pulse">正在从日志服务器拉取记录...</div>';
  modal.classList.remove("hidden");
  setTimeout(() => {
    content.classList.remove("scale-95", "opacity-0");
    content.classList.add("scale-100", "opacity-100");
  }, 10);
  handleRefreshTokenLogs();
}
function closeTokenLogsModal() {
  const modal = document.getElementById("modal-token-logs");
  const content = document.getElementById("modal-token-logs-content");
  if (content) {
    content.classList.add("scale-95", "opacity-0", "duration-300");
    content.classList.remove("scale-100", "opacity-100");
  }
  setTimeout(() => {
    if (modal)
      modal.classList.add("hidden");
  }, 300);
}
function copyTokenToClipboard(token) {
  if (!token)
    return;
  navigator.clipboard.writeText(token).then(() => showSuccess("Token 已复制到剪贴板"));
}
function copyGeneratedToken() {
  const val = document.getElementById("generated-token-value").value;
  if (val) {
    navigator.clipboard.writeText(val).then(() => showSuccess("Token 已成功保存至剪贴板"));
  }
}
window.toggleTokenAuthSetting = toggleTokenAuthSetting;
window.openAddTokenModal = openAddTokenModal;
window.closeAddTokenModal = closeAddTokenModal;
window.handleAddToken = handleAddToken;
window.handleRemoveToken = handleRemoveToken;
window.openTokenLogsModal = openTokenLogsModal;
window.closeTokenLogsModal = closeTokenLogsModal;
window.handleRefreshTokenLogs = handleRefreshTokenLogs;
window.copyTokenToClipboard = copyTokenToClipboard;
window.copyGeneratedToken = copyGeneratedToken;
window.loadTokenConfig = loadTokenConfig;
window.CustomSelectManager = {
  initAll() {
    document.querySelectorAll("select:not(.cs-hidden)").forEach((select) => {
      this.init(select);
    });
  },
  init(select) {
    if (select.classList.contains("cs-hidden"))
      return;
    const wrapper = document.createElement("div");
    wrapper.className = "cs-wrapper";
    const layoutClasses = Array.from(select.classList).filter((c) => c.startsWith("flex-") || c.startsWith("md:flex-") || c.startsWith("w-") || c.startsWith("md:w-") || c.startsWith("shrink-") || c.startsWith("md:shrink-"));
    if (layoutClasses.length)
      wrapper.classList.add(...layoutClasses);
    if (select.id)
      wrapper.id = "cs-w-" + select.id;
    const trigger = document.createElement("div");
    trigger.className = "cs-trigger";
    if (select.classList.contains("px-4")) {
      trigger.style.paddingLeft = "1rem";
      trigger.style.paddingRight = "1rem";
    }
    if (select.classList.contains("py-3")) {
      trigger.style.paddingTop = "0.75rem";
      trigger.style.paddingBottom = "0.75rem";
    }
    if (select.classList.contains("py-2")) {
      trigger.style.paddingTop = "0.5rem";
      trigger.style.paddingBottom = "0.5rem";
    }
    if (select.classList.contains("rounded-xl"))
      trigger.style.borderRadius = "0.75rem";
    if (select.classList.contains("text-sm"))
      trigger.style.fontSize = "0.875rem";
    if (select.classList.contains("font-medium"))
      trigger.style.fontWeight = "500";
    const text = document.createElement("span");
    text.className = "cs-trigger-text truncate mr-2";
    const icon = document.createElement("i");
    icon.className = "fas fa-chevron-down cs-trigger-icon";
    trigger.appendChild(text);
    trigger.appendChild(icon);
    wrapper.appendChild(trigger);
    select.classList.add("cs-hidden");
    select.style.display = "none";
    select.parentNode.insertBefore(wrapper, select);
    trigger.onclick = (e) => {
      e.stopPropagation();
      const isActive = wrapper.classList.contains("active");
      if (isActive) {
        this.closeAll();
      } else {
        this.closeAll();
        this.open(select, wrapper, trigger);
      }
    };
    this.syncUI(select, wrapper);
    try {
      const originalSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      Object.defineProperty(select, "value", {
        set: function(val) {
          originalSetter.call(this, val);
          window.CustomSelectManager.syncUI(this);
        },
        get: function() {
          return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").get.call(this);
        },
        configurable: true
      });
    } catch (e) {
      console.warn("[CustomSelect] Value hijack failed:", e);
    }
  },
  open(select, wrapper, trigger) {
    wrapper.classList.add("active");
    const dropdown = document.createElement("div");
    dropdown.className = "cs-dropdown custom-scrollbar portal-active";
    dropdown.id = "cs-dropdown-" + (select.id || Math.random().toString(36).substr(2, 9));
    const optionsList = document.createElement("ul");
    optionsList.className = "cs-options";
    Array.from(select.options).forEach((opt) => {
      const li = document.createElement("li");
      li.className = "cs-option" + (opt.selected ? " selected" : "");
      li.innerHTML = `<span>${opt.text}</span><i class="fas fa-check"></i>`;
      li.onclick = (e) => {
        e.stopPropagation();
        select.value = opt.value;
        select.dispatchEvent(new Event("change"));
        this.syncUI(select, wrapper);
        this.closeAll();
      };
      optionsList.appendChild(li);
    });
    dropdown.appendChild(optionsList);
    document.body.appendChild(dropdown);
    this.reposition(trigger, dropdown);
    window.addEventListener("scroll", this.handleScrollOrResize, true);
    window.addEventListener("resize", this.handleScrollOrResize);
    requestAnimationFrame(() => {
      dropdown.classList.add("visible");
    });
  },
  reposition(trigger, dropdown) {
    const rect = trigger.getBoundingClientRect();
    dropdown.style.width = rect.width + "px";
    dropdown.style.left = rect.left + "px";
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = dropdown.offsetHeight || 260;
    if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
      dropdown.style.top = rect.top + window.scrollY - dropdownHeight - 6 + "px";
      dropdown.classList.add("open-up");
    } else {
      dropdown.style.top = rect.bottom + window.scrollY + 4 + "px";
      dropdown.classList.remove("open-up");
    }
  },
  handleScrollOrResize(e) {
    if (e && e.target && e.target.closest && e.target.closest(".cs-dropdown")) {
      return;
    }
    window.CustomSelectManager.closeAll();
  },
  syncUI(select, wrapper) {
    if (!wrapper)
      wrapper = select.previousSibling;
    if (!wrapper || !wrapper.classList.contains("cs-wrapper"))
      return;
    const textEl = wrapper.querySelector(".cs-trigger-text");
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt) {
      textEl.innerText = selectedOpt.text;
      this.updateHighlight(select, wrapper);
    }
  },
  updateHighlight(select, wrapper) {
    const val = select.value;
    let isDefault = false;
    if (select.id && typeof SETTINGS_UI_MAP !== "undefined" && typeof DEFAULT_SETTINGS !== "undefined") {
      const key = Object.keys(SETTINGS_UI_MAP).find((k) => SETTINGS_UI_MAP[k].id === select.id);
      if (key && DEFAULT_SETTINGS[key] !== undefined) {
        isDefault = String(val) === String(DEFAULT_SETTINGS[key]);
      }
    }
    if (!select.id || isDefault || ["all", "none", "root", "mtime", "desc", "wy", "20", "song"].includes(val)) {
      wrapper.classList.remove("highlight");
    } else {
      wrapper.classList.add("highlight");
    }
  },
  closeAll() {
    document.querySelectorAll(".cs-wrapper.active").forEach((w) => w.classList.remove("active"));
    document.querySelectorAll(".cs-dropdown.portal-active").forEach((d) => {
      d.remove();
    });
    window.removeEventListener("scroll", this.handleScrollOrResize, true);
    window.removeEventListener("resize", this.handleScrollOrResize);
  }
};
document.addEventListener("click", (e) => {
  if (!e.target.closest(".cs-wrapper") && !e.target.closest(".cs-dropdown")) {
    window.CustomSelectManager.closeAll();
  }
});
document.addEventListener("DOMContentLoaded", () => {
  window.CustomSelectManager.initAll();
});
