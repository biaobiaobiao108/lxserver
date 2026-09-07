import { initAccessibleOverlays } from './accessible_overlays';
import {
    ensureLeaderboardLoaded,
    ensureLocalMusicLoaded,
    ensureMarkedLoaded,
    ensureLyricCardLoaded,
    ensureSoundEffectsLoaded,
    ensureVisualizerLoaded,
    openLyricCard,
    toggleSoundEffects,
} from './player_runtime';
import {
    escapeHtmlText,
    renderSafeMarkdown,
    safeImageUrl,
    safeInlineJson,
    safeInlineString,
} from './player_security';
import {
    DEFAULT_SETTINGS,
    normalizeDownloadConcurrency,
    normalizeStoredSettings,
} from './player_settings';
import { loadTokenConfig } from './token_management';
import { initCustomSelectManager } from './custom_select';
import { initSearchTips } from './search_tips';
import { showInput, showOptions, showSelect } from './player_dialogs';
import { initPlayerNotifications } from './player_notifications';
import { loadPlayerFeature } from './player_feature_loader';
import { setPlayerDrawerOpen } from './features/player_drawer';
import { initQueueFeature } from './features/queue';
import { initPlaylistModalFeature } from './features/playlist_modal';
import { initLibraryFeature } from './features/library';
import { initAuthFeature } from './features/auth';
import { initSyncSettingsFeature } from './features/sync_settings';
import { initSongUrlFeature } from './features/song_url';
import { initLyricFeature } from './features/lyrics';
import { initSearchFeature } from './features/search';
import { initPlaybackFeature, type PlaybackState } from './features/playback';
import { initSyncFeature, type SyncState } from './features/sync';

/*
 * Copyright 2026 xcq0607 (https://github.com/xcq0607)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const API_BASE = '/api/music';
const credentialStorage = window.sessionStorage;

function getCredential(key: string): string | null {
    const current = credentialStorage.getItem(key);
    if (current !== null) return current;
    const legacy = window.localStorage.getItem(key);
    if (legacy === null) return null;
    credentialStorage.setItem(key, legacy);
    window.localStorage.removeItem(key);
    return legacy;
}
let currentPage = 1;
window.currentPage = 1;
let currentPlaylist = [];
let currentIndex = -1;
let preSelectedNextIndex = null; // 预先选定的下一首索引 (用于确保随机模式下的预读一致性)
window.viewingPlaylist = []; // Currently displayed list in UI
let currentPlayingScope = 'network'; // Scope for active playback
window.currentSearchScope = 'network'; // 'network', 'local_list', 'local_all' - Scope for UI view
let currentPlayingSong = null; // Track currently playing song independently of view
window.batchCollectSongs = null; // Store songs for batch collection modal
const audio = document.getElementById('audio-player');
let currentPlaybackRate = 1.0;

function setCurrentSearchScope(scope: string) {
    window.currentSearchScope = scope;
}

function isCurrentlyViewingLocalList(targetListId?: string): boolean {
    const searchView = document.getElementById('view-search');
    if (!searchView || searchView.classList.contains('hidden')) return false;

    const slDetail = document.getElementById('songlist-detail-view');
    if (slDetail && !slDetail.classList.contains('hidden') && !slDetail.classList.contains('translate-x-full')) return false;

    if (window.currentSearchScope !== 'local_list') return false;
    if (targetListId && window.currentViewingListId !== targetListId) return false;
    return true;
}
(window as any).isCurrentlyViewingLocalList = isCurrentlyViewingLocalList;

window.openLyricCard = openLyricCard;
window.toggleSoundEffects = toggleSoundEffects;

initAccessibleOverlays();

const {
    showToast,
    showSuccess,
    showInfo,
    showError,
    showLoading,
    hideLoading,
    dismissAllToasts,
} = initPlayerNotifications(() => ({ createMarqueeHtml, applyMarqueeChecks }));

// Sleep timer is intentionally loaded on first use. The legacy HTML still
// calls these names, so keep stable window proxies while moving the actual
// implementation out of the initial bundle.
function loadSleepTimerFeature() {
    return loadPlayerFeature(
        'sleep-timer',
        () => import('./sleep_timer'),
        '正在加载睡眠定时功能...'
    );
}

function callSleepTimerFeature(name: string, args: any[]) {
    return loadSleepTimerFeature().then((feature) => {
        const handler = (feature as any)[name];
        return typeof handler === 'function' ? handler(...args) : undefined;
    });
}

Object.assign(window, {
    openSleepTimerModal: (...args: any[]) => callSleepTimerFeature('openSleepTimerModal', args),
    closeSleepTimerModal: (...args: any[]) => callSleepTimerFeature('closeSleepTimerModal', args),
    setSleepTimer: (...args: any[]) => callSleepTimerFeature('setSleepTimer', args),
    cancelSleepTimer: (...args: any[]) => callSleepTimerFeature('cancelSleepTimer', args),
    showCustomTimerInput: (...args: any[]) => callSleepTimerFeature('showCustomTimerInput', args),
    applyCustomTimer: (...args: any[]) => callSleepTimerFeature('applyCustomTimer', args),
});

const queueFeature = initQueueFeature({
    getPlaylist: () => currentPlaylist,
    setPlaylist: (playlist) => { currentPlaylist = playlist; },
    getCurrentIndex: () => currentIndex,
    setCurrentIndex: (index) => { currentIndex = index; },
    getAudio: () => audio as HTMLMediaElement | null,
    playSong: (song, index) => playSong(song, index),
    savePlaybackState: () => savePlaybackState(),
    closeMobileSidebar: () => toggleSidebar(),
    applyMarqueeChecks: () => applyMarqueeChecks(),
    createMarqueeHtml: (text, className) => createMarqueeHtml(text, className),
    escapeHtmlText,
    getImgUrl: (song) => getImgUrl(song),
    getSourceTag: (source) => getSourceTag(source),
    getQualityTags: (song) => getQualityTags(song),
    showInfo,
    showSuccess,
    showSelect,
});
const { renderQueue } = queueFeature;

function loadCommentsFeature() {
    return loadPlayerFeature(
        'comments',
        () => import('./features/comments').then(({ initCommentsFeature }) => initCommentsFeature({
            getActiveSong: () => currentPlayingSong,
            escapeHtmlText,
        })),
        '正在加载评论功能...'
    );
}

function callCommentsFeature(name: string, args: any[] = []) {
    return loadCommentsFeature().then((feature) => {
        const handler = (feature as any)[name];
        return typeof handler === 'function' ? handler(...args) : undefined;
    });
}

function toggleCommentModal(...args: any[]) { return callCommentsFeature('toggleCommentModal', args); }
function switchCommentType(...args: any[]) { return callCommentsFeature('switchCommentType', args); }
function refreshComments(...args: any[]) { return callCommentsFeature('refreshComments', args); }
function fetchComments(...args: any[]) { return callCommentsFeature('fetchComments', args); }
function toggleSongInList(...args: any[]) { return callCommentsFeature('toggleSongInList', args); }

function loadCustomSourcesFeature() {
    return loadPlayerFeature(
        'custom-sources',
        () => import('./features/custom_sources').then(({ initCustomSourcesFeature }) => initCustomSourcesFeature({
            getCredential,
            getUserAuthHeaders,
            getCurrentListData: () => currentListData,
            getSettings: () => settings,
            isUserLoggedIn,
            handleAdminAuth,
            updateSetting,
            createMarqueeHtml: (text, className) => createMarqueeHtml(text, className),
            applyMarqueeChecks: () => applyMarqueeChecks(),
            escapeHtmlText,
            showInput,
            showSelect,
            showSuccess,
            showInfo,
            showError,
        })),
        '正在加载自定义音源管理...'
    );
}

function callCustomSourcesFeature(name: string, args: any[] = []) {
    return loadCustomSourcesFeature().then((feature) => {
        const handler = (feature as any)[name];
        return typeof handler === 'function' ? handler(...args) : undefined;
    });
}

function loadCustomSources(...args: any[]) { return callCustomSourcesFeature('loadCustomSources', args); }
function fetchCustomSources(...args: any[]) { return callCustomSourcesFeature('fetchCustomSources', args); }
function renderCustomSources(...args: any[]) { return callCustomSourcesFeature('renderCustomSources', args); }
function handleFileUpload(...args: any[]) { return callCustomSourcesFeature('handleFileUpload', args); }
function handleUrlImport(...args: any[]) { return callCustomSourcesFeature('handleUrlImport', args); }
function openCustomSourceModal(...args: any[]) { return callCustomSourcesFeature('openCustomSourceModal', args); }
function closeCustomSourceModal(...args: any[]) { return callCustomSourcesFeature('closeCustomSourceModal', args); }
function switchCustomSourceMode(...args: any[]) { return callCustomSourcesFeature('switchCustomSourceMode', args); }
function toggleSource(...args: any[]) { return callCustomSourcesFeature('toggleSource', args); }
function deleteSource(...args: any[]) { return callCustomSourcesFeature('deleteSource', args); }
function reloadSource(...args: any[]) { return callCustomSourcesFeature('reloadSource', args); }
function togglePublicSourcesSetting(...args: any[]) { return callCustomSourcesFeature('togglePublicSourcesSetting', args); }

const playlistModalFeature = initPlaylistModalFeature({
    getCurrentPlayingSong: () => currentPlayingSong,
    getCurrentListData: () => currentListData,
    isUserLoggedIn,
    requireAdminForOpenWrite: (action) => requireAdminForOpenWrite(action),
    renderMyLists: (data) => renderMyLists(data),
    isCurrentlyViewingLocalList: (listId) => isCurrentlyViewingLocalList(listId),
    handleListClick: (listId, skipAutoUpdate) => handleListClick(listId, skipAutoUpdate),
    pushDataChange: (data) => pushDataChange(data),
    refreshUserListData: () => refreshUserListData(),
    exitBatchMode: () => (window as any).exitBatchMode?.(),
    deselectAll: () => (window as any).deselectAll?.(),
    getUserAuthHeaders,
    showError,
    showInfo,
    showSuccess,
    handleCreateList: () => handleCreateList(),
    updatePlayerInfo: (song, quality) => updatePlayerInfo(song, quality),
});
const {
    renderPlaylistAddGrid,
    openPlaylistAddModal,
    closePlaylistAddModal,
    cleanSongData,
    handleTogglePlaylist,
} = playlistModalFeature;

function loadCacheFeature() {
    return loadPlayerFeature(
        'cache',
        () => import('./features/cache').then(({ initCacheFeature }) => initCacheFeature({
            getCredential,
            getUserAuthHeaders,
            getSettings: () => settings,
            setSettings: (nextSettings) => {
                settings = nextSettings;
                window.settings = nextSettings;
            },
            persistSettings: () => persistSettings(),
            pushSettingsToServer: () => pushSettingsToServer(),
            setPlayerDrawerOpen,
            showSelect,
            showSuccess,
            showInfo,
            showError,
            escapeHtmlText,
            defaultSettings: DEFAULT_SETTINGS,
        })),
        '正在加载缓存管理...'
    );
}

function callCacheFeature(name: string, args: any[] = []) {
    return loadCacheFeature().then((feature) => {
        const handler = (feature as any)[name];
        return typeof handler === 'function' ? handler(...args) : undefined;
    });
}

function updateStorageStatsUI(...args: any[]) { return callCacheFeature('updateStorageStatsUI', args); }
function resetAllSettings(...args: any[]) { return callCacheFeature('resetAllSettings', args); }
function clearCache(...args: any[]) { return callCacheFeature('clearCache', args); }
function updateServerCacheSize(...args: any[]) { return callCacheFeature('updateServerCacheSize', args); }
function toggleCacheDrawer(...args: any[]) { return callCacheFeature('toggleCacheDrawer', args); }
function refreshCacheList(...args: any[]) { return callCacheFeature('refreshCacheList', args); }
function retryCacheLyric(...args: any[]) { return callCacheFeature('retryCacheLyric', args); }
function downloadAllCacheLyrics(...args: any[]) { return callCacheFeature('downloadAllCacheLyrics', args); }
function toggleCacheBatchMode(...args: any[]) { return callCacheFeature('toggleCacheBatchMode', args); }
function exitCacheBatchMode(...args: any[]) { return callCacheFeature('exitCacheBatchMode', args); }
function toggleCacheSelection(...args: any[]) { return callCacheFeature('toggleCacheSelection', args); }
function selectAllCache(...args: any[]) { return callCacheFeature('selectAllCache', args); }
function deselectAllCache(...args: any[]) { return callCacheFeature('deselectAllCache', args); }
function updateCacheBatchCount(...args: any[]) { return callCacheFeature('updateCacheBatchCount', args); }
function removeCacheItem(...args: any[]) { return callCacheFeature('removeCacheItem', args); }
function batchDeleteCache(...args: any[]) { return callCacheFeature('batchDeleteCache', args); }
function clearServerCache(...args: any[]) { return callCacheFeature('clearServerCache', args); }

const libraryFeature = initLibraryFeature({
    getCredential,
    getUserAuthHeaders,
    isUserLoggedIn,
    requireAdminForOpenWrite: (action) => requireAdminForOpenWrite(action),
    showInfo,
    showSuccess,
    showError,
    showSelect,
    makeKeyboardActivatable: (element, label, activate) => makeKeyboardActivatable(element, label, activate),
    enterArtist: (id, source) => enterArtist(id, source),
    enterAlbum: (id, source) => enterAlbum(id, source),
    downloadArtistAlbumSongs: (album, button) => downloadArtistAlbumSongs(album, button),
    exitListSecondaryModes: () => exitListSecondaryModes(),
    setCurrentSearchScope,
    getSourceTag: (source) => getSourceTag(source),
});
const {
    loadLibraryData,
    saveLibraryArtists,
    saveLibraryAlbums,
    toggleArtistFavorite,
    isArtistFavorited,
    toggleAlbumFavorite,
    updateAlbumLibraryMeta,
    syncAllLibraryAlbums,
    isAlbumFavorited,
    renderLibraryArtists,
    renderLibraryAlbums,
    handleArtistLibraryClick,
    handleAlbumLibraryClick,
    enterLibraryArtistBatch,
    exitLibraryArtistBatch,
    toggleLibArtistBatchSelect,
    libSelectAllArtists,
    libDeselectAllArtists,
    libDeleteSelectedArtists,
    removeLibraryArtist,
    enterLibraryAlbumBatch,
    exitLibraryAlbumBatch,
    toggleLibAlbumBatchSelect,
    libSelectAllAlbums,
    libDeselectAllAlbums,
    libDeleteSelectedAlbums,
    removeLibraryAlbum,
} = libraryFeature;

const searchFeature = initSearchFeature({
    getSettings: () => settings,
    getCurrentPage: () => currentPage,
    setCurrentPage: (page) => {
        currentPage = page;
        window.currentPage = page;
    },
    getCurrentListData: () => currentListData,
    getAuthToken: () => authToken,
    getUserAuthHeaders: () => getUserAuthHeaders(),
    switchTab: (tabId) => switchTab(tabId),
    setCurrentSearchScope,
    loadLibraryData: (...args) => loadLibraryData(...args),
    isArtistFavorited: (...args) => isArtistFavorited(...args),
    isAlbumFavorited: (...args) => isAlbumFavorited(...args),
    updateAlbumLibraryMeta: (...args) => updateAlbumLibraryMeta(...args),
    renderLibraryArtists: (...args) => renderLibraryArtists(...args),
    renderLibraryAlbums: (...args) => renderLibraryAlbums(...args),
    playFromView: (index) => playFromView(index),
    showInfo,
    showError,
});
const {
    handleSearchKeyPress,
    updateHeaderAppearanceIcon,
    toggleHeaderAppearance,
    toggleHeaderSourceDropdown,
    selectHeaderSource,
    performSearch,
    handleSearchTypeChange,
    applySearchTypeSourceRestrictions,
    doSearch,
    changePage,
    fetchHotSearch,
    renderHotSearch,
    handleHotSearchClick,
    showInitialSearchState,
    getQualityTags,
    getSourceTag,
    makeKeyboardActivatable,
    renderSingerResults,
    renderAlbumResults,
    formatPlayCount,
    searchBySinger,
    beginArtistRequest,
    invalidateArtistRequest,
    isArtistRequestCurrent,
    enterArtist,
    renderArtistHeader,
    toggleArtistFold,
    loadArtistSongs,
    renderArtistSongsLoading,
    renderArtistSongsUI,
    artistSongsPrevPage,
    artistSongsNextPage,
    renderArtistAlbumsLoading,
    fetchAllArtistAlbums,
    loadArtistAlbums,
    renderArtistAlbumsUI,
    downloadArtistAlbumSongs,
    enterAlbum,
    goBackToSearch,
    getImgUrl,
    renderResults,
    createMarqueeHtml,
    applyMarqueeChecks,
    lazyLoadImages,
} = searchFeature;

// Initialize Unified Search for Global (Favorites/Search)
window.goToPage = function (page) {
    currentPage = page;
    window.currentPage = page;
    if (typeof doSearch === 'function') doSearch(page);
};

function initGlobalListSearch() {
    if (window.ListSearch) {
        window.ListSearch.init('global', {
            renderCallback: () => renderResults(window.viewingPlaylist),
            paginationCallback: (page, index) => {
                window.goToPage(page);
                setTimeout(() => window.ListSearch.scrollToMatch(index), 300);
            },
            getList: () => window.viewingPlaylist,
            itemsPerPage: settings.itemsPerPage === 'all' ? 999999 : parseInt(settings.itemsPerPage)
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initGlobalListSearch();
});

// Settings & Batch Selection
let settings = { ...DEFAULT_SETTINGS };

function restoreRemoteSyncCode(legacyValue) {
    const stored = getCredential('lx_sync_code');
    if (stored !== null) {
        settings.remoteSyncCode = stored;
    } else if (typeof legacyValue === 'string' && legacyValue) {
        settings.remoteSyncCode = legacyValue;
        credentialStorage.setItem('lx_sync_code', legacyValue);
    } else {
        settings.remoteSyncCode = '';
    }
}

function persistSettings() {
    const persisted = { ...settings };
    delete persisted.remoteSyncCode;
    localStorage.setItem('lx_settings', JSON.stringify(persisted));
}

// 歌词原始数据，用于设置切换时重新渲染
let currentRawLrc = '';
let currentRawTlrc = '';
let currentRawRlrc = '';
let currentRawKlrc = ''; // 逐词歌词 (klyric/lxlyric)
let lastLyricSongId = null; // 追踪上次加载歌词的歌曲ID

let currentRecoveryState = null; // 播放失败自动恢复状态管理

// 从 localStorage 加载设置
try {
    const saved = localStorage.getItem('lx_settings');
    let legacyRemoteSyncCode = '';
    if (saved) {
        const parsed = JSON.parse(saved);
        legacyRemoteSyncCode = parsed?.remoteSyncCode || '';
        settings = normalizeStoredSettings({ ...settings, ...parsed });
    }
    restoreRemoteSyncCode(legacyRemoteSyncCode);
} catch (e) {
    console.error('[Settings] 加载设置失败:', e);
}
window.settings = settings; // 显式挂载到 window
window.networkListUpdateMap = new Set();
let networkListAutoCheckTimer = null;

function parseNetworkListAutoCheckInterval(value) {
    const minIntervalMs = 30 * 1000;
    if (value === undefined || value === null) return 0;
    const raw = String(value).trim().toLowerCase();
    if (raw === '' || raw === '0' || raw === 'off' || raw === 'none' || raw === 'disable') return 0;
    const matched = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
    if (!matched) return null;
    const count = parseFloat(matched[1]);
    const unit = matched[2] || 'h';
    if (!Number.isFinite(count) || count < 0) return null;
    let intervalMs = null;
    switch (unit) {
        case 'ms': intervalMs = count; break;
        case 's': intervalMs = count * 1000; break;
        case 'm': intervalMs = count * 60 * 1000; break;
        case 'h': intervalMs = count * 60 * 60 * 1000; break;
        case 'd': intervalMs = count * 24 * 60 * 60 * 1000; break;
        default: return null;
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
        checkNetworkListUpdates().catch(err => console.error('[AutoCheck] 网络歌单检测失败:', err));
    }, intervalMs);
    console.log('[AutoCheck] 已设置网络歌单自动检测间隔：', settings.networkListAutoCheckInterval, '(', intervalMs, 'ms )');
}

async function checkNetworkListUpdates(manual = false) {
    if (!currentListData || !Array.isArray(currentListData.userList) || currentListData.userList.length === 0) {
        if (manual && window.showToast) showToast('info', '当前没有可检查的网络歌单', 3000);
        return;
    }

    const targetLists = currentListData.userList.filter(l => l && l.sourceListId && l.source);
    if (targetLists.length === 0) {
        if (manual && window.showToast) showToast('info', '当前没有可检查的网络歌单', 3000);
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
                throw new Error('远端歌单数据不完整');
            }

            const remoteList = data.list.map(item => {
                const formatted = formatSongToLxMusicStandard(item);
                if (!formatted.source) formatted.source = list.source;
                return formatted;
            });

            const localList = Array.isArray(list.list) ? list.list : [];
            const sameLength = localList.length === remoteList.length;
            const sameIds = sameLength && localList.every((item, index) => item && remoteList[index] && String(item.id || '') === String(remoteList[index].id || '') && String(item.source || '') === String(remoteList[index].source || ''));
            if (!sameIds) {
                window.networkListUpdateMap.add(list.id);
                changedLists.push(list.name || list.id || list.sourceListId);
            } else {
                window.networkListUpdateMap.delete(list.id);
            }
        } catch (err) {
            console.error('[CheckNetworkListUpdates] 检查失败:', list.name || list.id || list.sourceListId, err);
            failedLists.push(list.name || list.id || list.sourceListId);
        }
    }

    if (typeof renderMyLists === 'function') {
        renderMyLists(currentListData);
    }

    if (manual) {
        const changedListNames = changedLists.map(escapeHtmlText);
        const failedListNames = failedLists.map(escapeHtmlText);
        if (changedLists.length > 0) {
            showSuccess(`检测到 ${changedLists.length} 个歌单已更新：${changedListNames.join('、')}`);
        } else if (failedLists.length === 0) {
            showSuccess('所有网络歌单均为最新状态');
        }
        if (failedLists.length > 0) {
            showError(`部分歌单检测失败：${failedListNames.join('、')}`);
        }
    } else if (changedLists.length > 0 && window.showToast) {
        showToast('info', `检测到 ${changedLists.length} 个网络歌单有更新`, 5000);
    }
}

window.checkNetworkListUpdates = checkNetworkListUpdates;



// Initial Sync for Server Cache Config
setTimeout(() => {
    if (settings.serverCacheLocation && window.updateServerCacheConfig) {
        console.log('[ServerCache] Syncing config:', settings.serverCacheLocation, settings.serverCacheNamingPattern);
        window.updateServerCacheConfig(settings.serverCacheLocation, settings.serverCacheNamingPattern);
    }
}, 2000);

window.batchMode = false;
window.selectedItems = new Set();
window.selectedSongObjects = new Map();
let expandBtnTimeout = null; // 展开按钮淡化计时器
let toggleLyricsBtnTimeout = null; // 歌词按钮淡化计时器

// ===== 认证相关状态 (Player Cookie Session + User Token) =====
let authEnabled = false;
// authToken 保留用于播放器登录 (player.password) 颁发的 session
let authToken = sessionStorage.getItem('lx_player_auth');
// 用户 Token：将明文密码传输改为 Token 验证
let userToken = getCredential('lx_user_token');
const authFeature = initAuthFeature({
    credentialStorage,
    getCredential,
    getUserToken: () => userToken,
    setUserToken: (token) => { userToken = token; },
    showSelect,
    handleSyncLogout: (skipConfirm) => handleSyncLogout(skipConfirm),
});
const {
    getUserAuthHeaders,
    isUserLoggedIn,
    isPublicLibraryContext,
    ensureUserAuthToken,
    updateUserUI,
    handleHeaderLogout,
} = authFeature;
const syncSettingsFeature = initSyncSettingsFeature({
    getSettings: () => settings,
    setSettings: (nextSettings) => {
        settings = nextSettings;
        window.settings = nextSettings;
    },
    getCredential,
    getUserAuthHeaders,
    persistSettings: () => persistSettings(),
    restoreRemoteSyncCode: (value) => restoreRemoteSyncCode(value),
    syncSettingsUI: () => syncSettingsUI(),
    setupNetworkListAutoCheck: () => setupNetworkListAutoCheck(),
    pushSoundEffects: () => {
        if (window.soundEffects && typeof window.soundEffects.pushToServer === 'function') {
            window.soundEffects.pushToServer();
        }
    },
    fetchSoundEffects: () => {
        if (window.soundEffects && typeof window.soundEffects.fetchFromServer === 'function') {
            window.soundEffects.fetchFromServer();
        }
    },
    showSuccess,
    showError,
});
const {
    pushSettingsToServer,
    manualSaveSettings,
    fetchSettingsFromServer,
} = syncSettingsFeature;
const songUrlFeature = initSongUrlFeature({
    getSettings: () => settings,
    getPlaylist: () => currentPlaylist,
    getCurrentIndex: () => currentIndex,
    getPlayMode: () => playMode,
    getPreSelectedNextIndex: () => preSelectedNextIndex,
    setPreSelectedNextIndex: (index) => { preSelectedNextIndex = index; },
    getUserAuthHeaders,
    fetchCustomSources,
    cleanSongData,
    checkServerCache: (...args) => checkServerCache(...args),
    triggerServerCache: (...args) => triggerServerCache(...args),
    updateStorageStatsUI,
    showInfo,
    showSuccess,
    showError,
});
const {
    getSourceTypeText,
    getSourceName,
    resolveSongUrl,
    resolveDownloadSongUrl,
    findOtherSourceMatch,
    findOtherSourceMatches,
    applyAutoProxy,
    fetchSongUrl,
    getNextIndex,
    prefetchNextSong,
    prefetchManager,
} = songUrlFeature;

async function fetchPublicListData() {
    const enablePublicFavorites = !!window.lx_config?.['user.enablePublicFavorites'];
    const enablePublicNonAdminAccess = !!window.lx_config?.['user.enablePublicNonAdminAccess'];
    const isAdmin = !!getCredential('lx_admin_password');
    const isUserLoggedIn = typeof window.isUserLoggedIn === 'function' ? window.isUserLoggedIn() : false;

    if (!enablePublicFavorites) return false;

    // 如果开启了公开收藏，但没开启非管理员访问，且既没登录个人账号也没登录管理员，则不可访问公开收藏
    if (!enablePublicNonAdminAccess && !isAdmin && !isUserLoggedIn) {
        console.log('[PublicList] 未开启非管理员访问且未登录管理员/个人账号，禁止加载公开歌单');
        return false;
    }

    try {
        console.log('[PublicList] 正在获取 _open 公共歌单数据...');
        const headers = {};
        const adminPass = getCredential('lx_admin_password');
        if (adminPass) headers['x-frontend-auth'] = adminPass;
        headers['x-user-name'] = '_open';
        const res = await fetch('/api/user/list?user=_open', {
            headers,
            cache: 'no-store'
        });
        if (res.ok) {
            const listData = await res.json();
            if (listData) {
                listData.username = '_open';
                // 将公共列表保存为 window.publicListData，切换展示用
                window.publicListData = listData;
                currentListData = listData;
                window.currentListData = listData;
                renderMyLists(listData);
                console.log('[PublicList] 公共歌单数据加载成功');
                if (typeof loadLibraryData === 'function') {
                    await loadLibraryData();
                }
                return true;
            }
        }
    } catch (err) {
        console.warn('[PublicList] 加载公共歌单失败:', err);
    }
    return false;
}
window.fetchPublicListData = fetchPublicListData;

async function reloadUserFavorites() {
    try {
        if (!isUserLoggedIn()) {
            // 未登录个人账号时，加载 _open 公开歌单
            const loaded = await fetchPublicListData();
            if (loaded) return;
            currentListData = null;
            window.currentListData = null;
            renderMyLists(null);
            return;
        }

        // 1. 先恢复已缓存的个人数据（避免切换时白屏）
        if (window.myPersonalListData) {
            currentListData = window.myPersonalListData;
            window.currentListData = window.myPersonalListData;
            renderMyLists(window.myPersonalListData);
        } else {
            currentListData = null;
            window.currentListData = null;
        }

        // 2. 再从服务器拉最新数据
        const headers = typeof getUserAuthHeaders === 'function' ? getUserAuthHeaders() : {};
        delete headers['x-user-name'];
        const syncUser = localStorage.getItem('lx_sync_user');
        if (syncUser && syncUser !== '_open') {
            headers['x-user-name'] = syncUser;
        }
        const res = await fetch('/api/user/list', {
            headers,
            cache: 'no-store'
        });
        if (res.ok) {
            const listData = await res.json();
            if (listData) {
                currentListData = listData;
                window.currentListData = listData;
                window.myPersonalListData = listData;
                renderMyLists(listData);
                await window.ListStore.set(listData).catch(e => console.error('[IDBStore] 保存失败:', e));
                if (typeof loadLibraryData === 'function') {
                    await loadLibraryData();
                }
            }
        }
    } catch (e) {
        console.error('[ReloadFavorites] Error:', e);
    }
}
window.reloadUserFavorites = reloadUserFavorites;

window.isViewingPublicFavorites = false;

async function handleTogglePublicFavorites() {
    window.isViewingPublicFavorites = !window.isViewingPublicFavorites;
    if (window.isViewingPublicFavorites) {
        // 切换到公开列表之前，先保存当前个人数据
        if (currentListData && currentListData.username !== '_open') {
            window.myPersonalListData = currentListData;
        }
        showInfo('已切换至【公开收藏】列表 (_open)');
        const loaded = await fetchPublicListData();
        if (!loaded) {
            showError('加载公开收藏失败');
            window.isViewingPublicFavorites = false;
            // 恢复个人列表
            if (window.myPersonalListData) {
                currentListData = window.myPersonalListData;
                window.currentListData = window.myPersonalListData;
                renderMyLists(window.myPersonalListData);
            }
        } else {
            if (typeof loadLibraryData === 'function') {
                await loadLibraryData();
            }
        }
    } else {
        showInfo('已切换至【个人收藏】列表');
        await reloadUserFavorites();
        if (typeof loadLibraryData === 'function') {
            await loadLibraryData();
        }
    }
}
window.handleTogglePublicFavorites = handleTogglePublicFavorites;

// 页面加载时：检查是否开启认证，若开启则显示登出按钮
(async () => {
    try {
        const response = await fetch('/api/music/config');
        const config = await response.json();
        window.lx_config = config; // 获取公共配置供权限模块使用
        authEnabled = config['player.enableAuth'] === true;

        // 若开启认证，显示登出按钮
        if (authEnabled) {
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.classList.remove('hidden');
                logoutBtn.classList.add('flex');
            }
        }

        // 获取到公共配置后，立即刷新一次 UI 状态 (管理员按钮/设置项禁用等)
        if (typeof syncSettingsUI === 'function') syncSettingsUI();
        else if (typeof updateAdminUI === 'function') updateAdminUI();

        // [新增] 有 Token 时验证其有效性
        if (userToken) {
            try {
                const vRes = await fetch('/api/user/auth/verify', {
                    headers: { 'x-user-token': userToken }
                });
                const vData = await vRes.json();
                if (!vData.valid) {
                    const refreshed = await ensureUserAuthToken({ force: true });
                    if (refreshed) {
                        console.log('[Auth] 用户 Token 已失效，已自动续签。');
                    } else {
                        console.log('[Auth] 用户 Token 已失效且无法自动续签，请重新登录。');
                    }
                }
            } catch (e) {
                console.warn('[Auth] Token 验证失败:', e);
            }
        }

        // [新增] 公开受限用户自动尝试从服务器拉取配置 (_open)
        if (config['user.enablePublicRestriction']) {
            console.log('[Auth] 检测到公开限制已开启，尝试拉取公共配置...');
            if (typeof fetchSettingsFromServer === 'function') {
                await fetchSettingsFromServer();
            }
        }

        // [新增] 检查公开收藏功能：若无账号登录且开启了公开收藏，尝试拉取公共歌单
        if (config['user.enablePublicFavorites'] && !isUserLoggedIn()) {
            console.log('[Auth] 检测到已开启公开收藏且无账号登录，正在拉取公共歌单...');
            const loaded = await fetchPublicListData();
            if (!loaded) {
                renderMyLists(null);
            }
        }

        // [新增] 客户端模式自动连接远程同步 (仅在已登录到本地账户时触发，防止 _open 访客同步)
        if (userToken && settings.enableClientModeSync && settings.remoteSyncUrl && settings.remoteSyncCode) {
            console.info('[Sync] Client mode enabled, auto-connecting to remote server...');
            // 降低延迟，只要认证完成后即可触发
            setTimeout(() => {
                if (typeof handleRemoteOverwriteConnect === 'function') {
                    handleRemoteOverwriteConnect(true);
                }
            }, 500);
        }

        // [新增] 更新 UI 上的用户名状态
        updateUserUI();

    } catch (error) {
        console.error('[Auth] 初始化检查失败:', error);
    }
})();

// 登出：调用服务端清除 Session，清除本地全量缓存，跳转到登录页
async function handleLogout() {
    try {
        await fetch('/api/music/auth/logout', { method: 'POST' });
    } catch (e) {
        console.error('[Auth] 登出请求失败:', e);
    }

    try {
        if (typeof audio !== 'undefined' && audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.src = '';
        }
        if (window.ListStore && typeof window.ListStore.remove === 'function') {
            await window.ListStore.remove().catch(() => {});
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    } catch (e) {}

    const agreementAccepted = localStorage.getItem('lx_agreement_accepted');
    localStorage.clear();
    sessionStorage.clear();
    if (agreementAccepted) localStorage.setItem('lx_agreement_accepted', agreementAccepted);

    const playerPath = (window.CONFIG && window.CONFIG['player.path']) || (window.lx_config && window.lx_config['player.path']) || '/music';
    const normalizedPlayerPath = (playerPath === '/' || playerPath === '') ? '' : playerPath.replace(/\/+$/, '');
    window.location.replace(`${normalizedPlayerPath}/login`);
}
// ===== 认证代码结束 =====

// 音质选择器初始化
document.addEventListener('DOMContentLoaded', () => {
    // 音质选择器初始化
    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect && settings.preferredQuality) {
        qualitySelect.value = settings.preferredQuality;
    }

    // Initialize Proxy Settings UI
    const proxyPlayback = document.getElementById('toggle-proxy-playback');
    if (proxyPlayback) proxyPlayback.checked = settings.enableProxyPlayback;

    const proxyDownload = document.getElementById('toggle-proxy-download');
    if (proxyDownload) proxyDownload.checked = settings.enableProxyDownload;

    const autoProxy = document.getElementById('toggle-auto-proxy');
    if (autoProxy) autoProxy.checked = settings.enableAutoProxy;

    // Initialize Custom Proxy UI
    const customProxyToggle = document.getElementById('toggle-custom-proxy');
    if (customProxyToggle) customProxyToggle.checked = settings.enableCustomProxy;
    const customProxyInput = document.getElementById('custom-proxy-url-input');
    if (customProxyInput) customProxyInput.value = settings.customProxyUrl || '';
    const customProxyRow = document.getElementById('custom-proxy-url-row');
    if (customProxyRow) customProxyRow.classList.toggle('hidden', !settings.enableCustomProxy);

    const hotSearchLimitInput = document.getElementById('hot-search-limit-input');
    if (hotSearchLimitInput) {
        hotSearchLimitInput.value = (settings.hotSearchLimit !== undefined && settings.hotSearchLimit !== null) ? settings.hotSearchLimit : 20;
    }

    // Initialize SongList Manager
    if (window.SongListManager) {
        window.SongListManager.init();
    }

    // Initialize Lyric Font Size UI
    const lyricFontSizeSlider = document.getElementById('lyric-font-size-slider');
    const lyricFontSizeValue = document.getElementById('lyric-font-size-value');
    if (lyricFontSizeSlider && lyricFontSizeValue) {
        const size = settings.lyricFontSize || 1.25;
        lyricFontSizeSlider.value = size;
        lyricFontSizeValue.innerText = size;
        document.documentElement.style.setProperty('--lyric-font-size', `${size}rem`);
    }

    // Initialize Lyric Font Family UI
    const lyricFontFamilySelect = document.getElementById('lyric-font-family-select');
    if (lyricFontFamilySelect) {
        const fontFamily = settings.lyricFontFamily || '';
        // Check if value exists in default options, if not create it (unless empty)
        if (fontFamily) {
            let exists = Array.from(lyricFontFamilySelect.options).some(opt => opt.value === fontFamily);
            if (!exists) {
                const option = document.createElement('option');
                option.value = fontFamily;
                option.textContent = fontFamily; // Fallback display name
                lyricFontFamilySelect.add(option, null);
            }
            lyricFontFamilySelect.value = fontFamily;
            document.documentElement.style.setProperty('--lyric-font-family', fontFamily);
        }
    }

    // Initialize Progress & Volume Dragging
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
        progressContainer.addEventListener('mousedown', (e) => startDragging(e, 'progress'));
        progressContainer.addEventListener('touchstart', (e) => startDragging(e, 'progress'), { passive: false });
    }

    const volumeContainer = document.getElementById('volume-container');
    if (volumeContainer) {
        volumeContainer.addEventListener('mousedown', (e) => startDragging(e, 'volume'));
        volumeContainer.addEventListener('touchstart', (e) => startDragging(e, 'volume'), { passive: false });
    }

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);

    // 同步所有设置 UI
    syncSettingsUI();
    updateUserUI();
});

// Dragging Logic
let isDragging = null; // 'progress' or 'volume'
let dragPercentage = 0; // Temp value for progress smoothing
let lastSeekTime = 0; // Throttling for live seeking
let lastSeekPct = -1; // 上次执行 seek 时的进度百分比，用于避免原地抖动
const SEEK_THROTTLE_MS = 100; // How often to update audio position while dragging (ms)

function startDragging(e, type) {
    if (e.type === 'touchstart') e.preventDefault(); // Prevent scrolling while seeking
    isDragging = type;
    if (type === 'progress') lastSeekPct = -1; // 重置
    handleDragMove(e);
}

function stopDragging() {
    if (isDragging === 'progress' && Number.isFinite(dragPercentage)) {
        // 只有当最终位置与上次 seek 的位置差异较大时，才执行最后一次 seek
        if (Math.abs(dragPercentage - lastSeekPct) > 0.001) {
            audio.currentTime = dragPercentage * audio.duration;
            if (typeof lyricPlayer !== 'undefined' && lyricPlayer) {
                lyricPlayer.play(audio.currentTime * 1000);
            }
        }
    }
    isDragging = null;
    lastSeekPct = -1;
}

function handleDragMove(e) {
    if (!isDragging) return;

    if (e.type === 'touchmove') e.preventDefault(); // Prevent scrolling

    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;

    if (isDragging === 'progress') {
        const container = document.getElementById('progress-container');
        if (!container || !audio.duration || !Number.isFinite(audio.duration)) return;
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));

        dragPercentage = pct;

        // 1. Update UI immediately (Always smooth)
        document.getElementById('progress-bar').style.width = `${pct * 100}%`;
        document.getElementById('time-current').innerText = formatTime(pct * audio.duration);
        document.getElementById('progress-container')?.setAttribute('aria-valuenow', String(Math.round(pct * 100)));

        // 2. Throttled update of audio position (Live Seeking)
        const now = Date.now();
        if (now - lastSeekTime > SEEK_THROTTLE_MS) {
            // 只有当进度百分比发生较明显变化（大于 0.1%）时才执行 seek
            // 这可以防止鼠标微小抖动导致的“原地复读”感，并允许停下时正常播放（预览）
            if (Math.abs(pct - lastSeekPct) > 0.001) {
                audio.currentTime = pct * audio.duration;

                // 同步更新歌词进度
                if (typeof lyricPlayer !== 'undefined' && lyricPlayer) {
                    lyricPlayer.play(audio.currentTime * 1000);
                    // 强制歌词对齐但不等待平滑滚动，保持灵敏度
                    scrollToActiveLine(true);
                }

                lastSeekTime = now;
                lastSeekPct = pct;
            }
        }
    } else if (isDragging === 'volume') {
        const container = document.getElementById('volume-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        currentVolume = pct;
        audio.volume = pct;
        isMuted = false;
        updateVolumeUI();
        // Debounce saving if needed, but simple localstorage here
        localStorage.setItem('lx_volume', currentVolume.toString());
    }
}

// 切换代理设置
function changeProxyPlayback(enabled) {
    updateSetting('enableProxyPlayback', enabled);
}

function changeProxyDownload(enabled) {
    updateSetting('enableProxyDownload', enabled);
}

function changeAutoProxy(enabled) {
    updateSetting('enableAutoProxy', enabled);
}

function changeHotSearchLimit(value) {
    const limit = parseInt(value);
    // [Fix] Allow 0, Check Range 0-50
    if (!isNaN(limit) && limit >= 0 && limit <= 50) {
        updateSetting('hotSearchLimit', limit);
    } else {
        showError('请输入 0 到 50 之间的数字');
        // Reset input
        const input = document.getElementById('hot-search-limit-input');
        if (input) input.value = settings.hotSearchLimit || 20;
    }
}

function changeLyricFontSize(value) {
    const size = parseFloat(value);
    if (!isNaN(size)) {
        updateSetting('lyricFontSize', size);
    }
}

// 读取本地字体
/**
 * 通用加载本地字体逻辑
 * @param {string} targetSelectId - 目标下拉框的 ID，默认为设置页的 'lyric-font-family-select'
 * @param {HTMLElement} btnEl - 触发按钮的引用，用于显示加载动画
 */
async function loadLocalFonts(targetSelectId = 'lyric-font-family-select', btnEl = null) {
    if (!('queryLocalFonts' in window)) {
        showError('抱歉，您的浏览器不支持读取本地字体功能 (Local Font Access API)。\n建议使用 Chrome / Edge 浏览器，并确保在 HTTPS 环境下使用。');
        return;
    }

    const btn = btnEl || document.querySelector('button[onclick="loadLocalFonts()"]');
    const originalText = btn ? btn.innerHTML : '';

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>读取中...';
        }

        const fonts = await window.queryLocalFonts();
        const fontSelect = document.getElementById(targetSelectId);
        if (!fontSelect) return;

        // Use a set to store unique families
        const fontFamilies = new Set();
        fonts.forEach(font => fontFamilies.add(font.family));

        // Sort alphabetically
        const sortedFamilies = Array.from(fontFamilies).sort();

        if (sortedFamilies.length === 0) {
            showError('未能获取到字体列表');
            return;
        }

        // Remove existing local fonts group if exists
        const oldGroup = fontSelect.querySelector('optgroup[data-source="local"]');
        if (oldGroup) {
            oldGroup.remove();
        }

        // Create a single group for local fonts
        const group = document.createElement('optgroup');
        group.dataset.source = 'local';
        group.label = `本地已安装字体 (${sortedFamilies.length})`;

        sortedFamilies.forEach(family => {
            const option = document.createElement('option');
            // 如果是歌词卡片，保持带引号格式；如果是设置页，保持原样（lyric-card.js 会处理字体族名称）
            option.value = targetSelectId === 'lc-font-select' ? `"${family}", sans-serif` : family;
            option.textContent = family;
            group.appendChild(option);
        });
        fontSelect.appendChild(group);

        showSuccess(`成功获取 ${sortedFamilies.length} 个本地字体！`);

    } catch (err) {
        console.error('[Font] Error loading fonts:', err);
        showError('获取字体失败: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

function changeLyricFontFamily(value) {
    updateSetting('lyricFontFamily', value.trim());
}

// 切换音质偏好
function changeQualityPreference(quality) {
    updateSetting('preferredQuality', quality);
}


// Tab Switching
function switchTab(tabId) {
    // Favorites is a sidebar group toggle, not a main content view.
    if (tabId === 'favorites') {
        handleFavoritesClick();
        return;
    }

    document.querySelectorAll('[id^="view-"]').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('opacity-100');
        el.classList.add('opacity-0');
    });

    const activeView = document.getElementById(`view-${tabId}`);
    if (!activeView) return;

    activeView.classList.remove('hidden');
    // small delay to allow display block to apply before opacity transition
    setTimeout(() => {
        activeView.classList.remove('opacity-0');
        activeView.classList.add('opacity-100');
        // [新增] 切换 Tab 时顺便检查并更新一次用户状态
        if (typeof updateUserUI === 'function') updateUserUI();
    }, 10);

    // [新增] 切换到设置页面时刷新一次管理员状态和设置项 UI
    if (tabId === 'settings') {
        if (typeof syncSettingsUI === 'function') syncSettingsUI();
        else if (typeof updateAdminUI === 'function') updateAdminUI();
    }

    // Reset Sidebar Highlight
    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.remove('active-tab', 'text-emerald-600');
        el.classList.add('t-text-muted');
    });
    // Reset Sidebar Sub-items Highlight (e.g. Favorite lists)
    document.querySelectorAll('[data-sidebar-list-id]').forEach(el => {
        el.classList.remove('active-sub-item');
        el.classList.add('t-text-muted');
    });
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) {
        activeTab.classList.add('active-tab');
        activeTab.classList.remove('t-text-muted');
    }

    // If leaving search/local-list view, update search scope away from local_list
    if (tabId !== 'search' && window.currentSearchScope === 'local_list') {
        setCurrentSearchScope(tabId);
    }

    // Clear any pending timeouts
    if (expandBtnTimeout) clearTimeout(expandBtnTimeout);
    if (toggleLyricsBtnTimeout) clearTimeout(toggleLyricsBtnTimeout);

    // Auto-exit secondary modes (search/batch) when switching tabs
    exitListSecondaryModes();

    // Mobile: Close sidebar when switching tabs except for favorites (which should show sub-lists)
    if (window.innerWidth <= 1024 && tabId !== 'favorites') {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            toggleSidebar();
        }
    }

    // Always clear sub-item highlight when switching top-level tabs
    document.querySelectorAll('[data-sidebar-list-id]').forEach(el => {
        el.classList.remove('active-sub-item');
        el.classList.add('t-text-muted');
    });

    // Reset Search Scope if switching to search/settings explicitly
    if (tabId === 'search') {
        initGlobalListSearch(); // [New] 强制重置 ListSearch 为 'global' 模式
        setCurrentSearchScope('network');
        document.getElementById('search-source').classList.remove('hidden');
        document.getElementById('search-type').classList.remove('hidden');
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.placeholder = "搜索歌曲、歌手...";
            // 如果搜索框内容为空，则展示初始热搜状态，避免由于重用搜索界面展示本地列表导致的残留
            if (!searchInput.value.trim()) {
                showInitialSearchState();
            }
        }
        document.getElementById('page-title').innerText = "搜索音乐";
    }

    if (tabId === 'songlist') {
        document.getElementById('page-title').innerText = "歌单";
    }

    if (tabId === 'leaderboard') {
        document.getElementById('page-title').innerText = "排行榜";
        if (window.LeaderboardManager && !window.LeaderboardManager.initialized) {
            window.LeaderboardManager.init();
        } else if (!window.LeaderboardManager) {
            ensureLeaderboardLoaded().then(() => {
                if (window.LeaderboardManager && !window.LeaderboardManager.initialized) {
                    window.LeaderboardManager.init();
                }
            }).catch(() => showError('排行榜模块加载失败，请稍后重试'));
        }
    }

    if (tabId === 'localmusic') {
        document.getElementById('page-title').innerText = "本地音乐";
        if (window.LocalMusicManager) {
            window.LocalMusicManager.init();
        } else {
            ensureLocalMusicLoaded().then(() => window.LocalMusicManager?.init()).catch(() => {
                showError('本地音乐模块加载失败，请稍后重试');
            });
        }
    }

    // Collapse Favorites if leaving
    if (tabId !== 'favorites') {
        const favList = document.getElementById('favorites-children');
        const arrow = document.getElementById('favorites-arrow');
        if (favList && favList.style.height !== '0px') {
            favList.style.height = '0px';
            if (arrow) arrow.style.transform = 'rotate(-90deg)';
        }
    }

    // Title update (handled above for search, others here)
    if (tabId === 'settings') {
        document.getElementById('page-title').innerText = '设置';
        // 确保设置界面的自定义源列表是最新的
        if (typeof loadCustomSources === 'function') {
            loadCustomSources();
        }
    }

    if (tabId === 'about') {
        document.getElementById('page-title').innerText = '关于';
        loadAboutContent();
    }

    // Auto-exit batch mode when switching tabs (Redundant but safe)
    if (window.batchMode && typeof toggleBatchMode === 'function') {
        toggleBatchMode();
    }
}

/**
 * 退出列表的二级模式（搜索框和批量模式）
 */
function exitListSecondaryModes() {
    if (window.ListSearch && window.ListSearch.state.active) {
        window.ListSearch.resetState();
    }
    if (window.batchMode) {
        // 搜索/歌单界面退出
        const batchToolbar = document.getElementById('batch-toolbar');
        const slBatchToolbar = document.getElementById('sl-batch-toolbar');
        if ((batchToolbar && !batchToolbar.classList.contains('hidden')) || (slBatchToolbar && !slBatchToolbar.classList.contains('hidden'))) {
            if (typeof toggleBatchMode === 'function') toggleBatchMode();
        }

        // 排行榜界面退出
        const lbBatchToolbar = document.getElementById('lb-batch-toolbar');
        if (lbBatchToolbar && !lbBatchToolbar.classList.contains('hidden')) {
            if (typeof toggleLbBatchMode === 'function') toggleLbBatchMode();
        }
    }
}

// Load About Content
async function loadAboutContent() {
    const aboutContainer = document.getElementById('about-content');
    if (!aboutContainer) return;

    try {
        const response = await fetch('/music/about.md');
        if (!response.ok) throw new Error('Failed to load about.md');
        const text = await response.text();

        // Render Markdown. The parser is only needed when the About tab is opened.
        await ensureMarkedLoaded().catch(() => undefined);
        if (window.marked) {
            // Replace the build hash placeholder; application version is intentionally not shown in the UI.
            const buildHash = (window.CONFIG && window.CONFIG.buildHash) || 'unknown';
            const content = text.replace(/{{buildHash}}/g, buildHash);
            renderSafeMarkdown(aboutContainer, content);
        } else aboutContainer.innerText = text;
        aboutContainer.classList.remove('animate-pulse');
    } catch (e) {
        console.error('Failed to load about content:', e);
        aboutContainer.innerHTML = '<p class="text-red-500">加载关于页面失败，请稍后重试。</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 恢复搜索来源缓存
    const cachedSearchSource = localStorage.getItem('search-source');
    if (cachedSearchSource) {
        const searchSourceEl = document.getElementById('search-source');
        if (searchSourceEl) searchSourceEl.value = cachedSearchSource;
    }

    // 为展开按钮添加悬放恢复逻辑
    const expandBtn = document.getElementById('btn-expand-panel');
    if (expandBtn) {
        expandBtn.addEventListener('mouseenter', () => {
            if (expandBtnTimeout) clearTimeout(expandBtnTimeout);
            expandBtn.classList.remove('faint');
        });
        expandBtn.addEventListener('mouseleave', () => {
            const footer = document.getElementById('player-footer');
            if (footer && footer.classList.contains('translate-y-[110%]')) {
                startExpandBtnTimer();
            }
        });
    }

    // 为歌词按钮添加悬停恢复逻辑
    const toggleLyricsBtn = document.getElementById('btn-toggle-lyrics');
    if (toggleLyricsBtn) {
        toggleLyricsBtn.addEventListener('mouseenter', () => {
            if (toggleLyricsBtnTimeout) clearTimeout(toggleLyricsBtnTimeout);
            toggleLyricsBtn.classList.remove('faint');
        });
        toggleLyricsBtn.addEventListener('mouseleave', () => {
            const view = document.getElementById('view-player-detail');
            if (view && !view.classList.contains('translate-y-[100%]')) {
                startToggleLyricsBtnTimer();
            }
        });
    }
});

// ==================== 播放队列 (Queue) 逻辑 ====================
// --- Native Drag & Drop Handlers (Removed, replaced by SortableJS) ---
// ===============================================

// Search logic moved to features/search.ts
// Playback Logic
let currentLoadingSongId = null; // Track currently loading song
let loadingRequestCounter = 0;   // To identify unique play requests
let currentLoadingRequestId = 0; // Track latest request ID

let currentQuality = null; // 当前播放音质 (从 settings.preferredQuality 动态获取)
let currentSourceType = 'normal'; // 当前链接来源类型: 'normal' | 'cache' | 'server_cache'

const playbackState: PlaybackState = {
    get currentLoadingSongId() { return currentLoadingSongId; },
    set currentLoadingSongId(value) { currentLoadingSongId = value; },
    get loadingRequestCounter() { return loadingRequestCounter; },
    set loadingRequestCounter(value) { loadingRequestCounter = value; },
    get currentLoadingRequestId() { return currentLoadingRequestId; },
    set currentLoadingRequestId(value) { currentLoadingRequestId = value; },
    get currentQuality() { return currentQuality; },
    set currentQuality(value) { currentQuality = value; },
    get currentSourceType() { return currentSourceType; },
    set currentSourceType(value) { currentSourceType = value; },
    get currentRecoveryState() { return currentRecoveryState; },
    set currentRecoveryState(value) { currentRecoveryState = value; },
    get currentPlaylist() { return currentPlaylist; },
    set currentPlaylist(value) { currentPlaylist = value; },
    get currentIndex() { return currentIndex; },
    set currentIndex(value) { currentIndex = value; },
    get preSelectedNextIndex() { return preSelectedNextIndex; },
    set preSelectedNextIndex(value) { preSelectedNextIndex = value; },
    get currentPlayingScope() { return currentPlayingScope; },
    set currentPlayingScope(value) { currentPlayingScope = value; },
    get currentPlayingSong() { return currentPlayingSong; },
    set currentPlayingSong(value) { currentPlayingSong = value; },
    get playMode() { return playMode; },
    set playMode(value) { playMode = value; },
    get currentRawLrc() { return currentRawLrc; },
    set currentRawLrc(value) { currentRawLrc = value; },
    get currentRawTlrc() { return currentRawTlrc; },
    set currentRawTlrc(value) { currentRawTlrc = value; },
    get currentRawRlrc() { return currentRawRlrc; },
    set currentRawRlrc(value) { currentRawRlrc = value; },
    get currentRawKlrc() { return currentRawKlrc; },
    set currentRawKlrc(value) { currentRawKlrc = value; },
    get isUserScrolling() { return isUserScrolling; },
    set isUserScrolling(value) { isUserScrolling = value; },
    get scrollLockTimeout() { return scrollLockTimeout; },
    set scrollLockTimeout(value) { scrollLockTimeout = value; },
    get lyricPlayer() { return lyricPlayer; },
    set lyricPlayer(value) { lyricPlayer = value; },
    get currentVolume() { return currentVolume; },
    set currentVolume(value) { currentVolume = value; },
};
const playbackFeature = initPlaybackFeature({
    audio: audio as HTMLAudioElement,
    state: playbackState,
    getSettings: () => settings,
    getViewingPlaylist: () => window.viewingPlaylist,
    getCurrentSearchScope: () => window.currentSearchScope,
    getCurrentListData: () => currentListData,
    getUserAuthHeaders,
    resolveSongUrl,
    getSourceTypeText,
    getSourceName,
    findOtherSourceMatch,
    getNextIndex,
    prefetchNextSong,
    prefetchManager,
    fetchLyric: (...args) => fetchLyric(...args),
    updateMediaSessionMetadata: (...args) => updateMediaSessionMetadata(...args),
    updateLyricDetailInfo: (...args) => updateLyricDetailInfo(...args),
    renderQueue,
    cleanSongData,
    getImgUrl,
    getQualityTags,
    getSourceTag,
    applyMarqueeChecks,
    performSearch,
    showOptions,
    openPlaylistAddModal,
    isUserLoggedIn,
    toggleDetailCover: (...args) => toggleDetailCover(...args),
    showInfo,
    showSuccess,
    showError,
    pushDataChange: (...args) => pushDataChange(...args),
    renderMyLists: (...args) => renderMyLists(...args),
});
const {
    playFromView,
    runRecoveryFlow,
    playSong,
    setPlayerStatus,
    savePlayHistory,
    addToDefaultList,
    updatePlaylist,
    setImg,
    updatePlayerInfo,
    togglePlay,
    updatePlayButton,
    playNext,
    playPrev,
    fadeVolume,
} = playbackFeature;

// 获取来源类型的中文描述
// --- Server Cache Helpers ---
async function checkServerCache(song, quality, exactQuality = false) {
    try {
        const username = currentListData?.username || '';
        const params = new URLSearchParams({
            name: song.name,
            singer: song.singer,
            source: song.source,
            songmid: song.songmid || (song.meta && (song.meta.songmid || song.meta.songId)) || '',
            songId: song.songId || (song.meta && song.meta.songId) || song.id,
            quality: quality || ''
        });
        if (exactQuality) params.append('exactQuality', '1');
        const headers = {};
        Object.assign(headers, getUserAuthHeaders());

        const res = await fetch(`/api/music/cache/check?${params}`, { headers });
        if (res.ok) {
            const data = await res.json();
            return data; // 返回完整数据对象，包含 exists, isCollision, url 等
        }
    } catch (e) { console.error('[ServerCache] Check failed:', e); }
    return { exists: false };
}

/**
 * 管理员权限验证通用处理逻辑
 * 如果检测到 403 错误，弹出密码输入框并保存密码后重试
 */
async function handleAdminAuth(message) {
    const pass = await showInput('管理员身份验证', message, {
        placeholder: '请输入后台管理密码',
        inputType: 'password'
    });
    if (pass) {
        try {
            const response = await fetch('/api/admin/verify', {
                method: 'POST',
                headers: { 'x-frontend-auth': pass }
            });

            if (response.ok) {
                credentialStorage.setItem('lx_admin_password', pass);
                updateAdminUI(); // 更新 UI 状态
                return true;
            } else {
                const result = await response.json();
                showError(result.error || '密码验证失败');
                return false;
            }
        } catch (err) {
            console.error('Admin verification error:', err);
            showError('服务器验证出错，请稍后重试');
            return false;
        }
    }
    return false;
}
window.handleAdminAuth = handleAdminAuth;

/**
 * 如果当前正在操作 _open 公开用户数据，且未登录管理员，则弹出登录设置并返回 false。
 * 已登录管理员返回 true，允许继续操作。
 */
async function requireAdminForOpenWrite(action) {
    const isOpen = currentListData?.username === '_open' || window.isViewingPublicFavorites;
    if (!isOpen) return true; // 不是 _open 数据，无需验证
    if (getCredential('lx_admin_password')) return true; // 已登录管理员
    // 弹出管理员登录弹窗
    const authorized = await handleAdminAuth(`该操作需要管理员权限：${action || '修改公开内容'}`);
    return authorized;
}
window.requireAdminForOpenWrite = requireAdminForOpenWrite;

// 管理员登录处理
async function handleAdminLogin() {
    const authorized = await handleAdminAuth('请输入管理员密码进行登录验证');
    if (authorized) {
        showSuccess('管理员已登录');
        updateAdminUI();
        syncSettingsUI();
        if (typeof renderCustomSources === 'function') renderCustomSources();

        // 未登录用户账号时：管理员应载入 _open 公开列表并对其操作
        if (!isUserLoggedIn()) {
            const loaded = await fetchPublicListData();
            if (loaded) {
                await loadLibraryData();
            }
        }
        if (typeof window.LocalMusicManager?.fetchData === 'function') {
            window.LocalMusicManager.fetchData(true);
        }
        // 已登录用户账号时：不改变当前展示列表，管理员密码仅用于操作授权
    }
}
window.handleAdminLogin = handleAdminLogin;

// 管理员退出登录处理
async function handleAdminLogout() {
    if (!(await showSelect('管理员登出', '确定要退出管理员身份吗？'))) return;
    credentialStorage.removeItem('lx_admin_password');
    updateAdminUI();
    syncSettingsUI();

    // [核心新增] 如果当前使用的是 _open 公共列表，登出管理员后锁定列表显示
    if (window.lx_config?.['user.enablePublicFavorites'] && (!userToken || !localStorage.getItem('lx_sync_user'))) {
        const enablePublicNonAdminAccess = !!window.lx_config?.['user.enablePublicNonAdminAccess'];
        if (!enablePublicNonAdminAccess) {
            currentListData = null;
            window.currentListData = null;
            if (typeof renderMyLists === 'function') {
                renderMyLists(null);
            }
        } else {
            fetchPublicListData();
        }
    }
    if (typeof window.LocalMusicManager?.fetchData === 'function') {
        window.LocalMusicManager.fetchData(true);
    }

    showSuccess('管理员已登出');
}
window.handleAdminLogout = handleAdminLogout;

// 更新管理员相关 UI 元素
function updateAdminUI() {
    const isAdmin = !!getCredential('lx_admin_password');
    const isPublic = !currentListData?.username || currentListData?.username === 'default';

    // 自定义源部分的标签和按钮
    const adminTag = document.getElementById('settings-admin-tag');
    const loginBtn = document.getElementById('btn-admin-login');
    const logoutBtn = document.getElementById('btn-admin-logout');
    const scopeTag = document.getElementById('settings-source-scope-tag');

    if (adminTag) adminTag.classList.toggle('hidden', !isAdmin);
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !isAdmin);
    if (loginBtn) {
        // 只要未登录管理员，就显示「管理员登录」按钮
        loginBtn.classList.toggle('hidden', isAdmin);
    }
    const manageBtn = document.getElementById('btn-custom-source-manage');
    if (manageBtn) {
        const isPublicRestrictionEnabled = !!window.lx_config?.['user.enablePublicRestriction'];
        const isUser = !!userToken;
        // 如果开启了公开限制，且既不是管理员也不是登录用户，则隐藏管理入口（或之后显示锁定界面）
        // 这里根据用户要求，只要登录了就不隐藏
        const isRestricted = isPublicRestrictionEnabled && !isAdmin && !isUser;
        manageBtn.classList.toggle('hidden', isRestricted);
    }
    if (scopeTag) {
        scopeTag.classList.toggle('hidden', !isPublic);
    }

    // [新增] 处于登录/同步状态时，将相关输入框和连接按钮变灰防止重复操作
    const isLocalLoggedIn = !!userToken && !isPublic;
    const isRemoteConnected = (window.SyncManager && window.SyncManager.mode === 'remote' && window.SyncManager.client?.isConnected) ||
        (window.currentRemoteOverwriteClient && window.currentRemoteOverwriteClient.isConnected);

    // 情况 A: 本地登录框 - 只要本地已登录，就禁用本地输入框和登录按钮 (必须要先退出登录才能换号)
    const loginInputIds = ['sync-local-user', 'sync-local-pass'];
    loginInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isLocalLoggedIn;
            if (isLocalLoggedIn) {
                el.classList.add('opacity-40', 'cursor-not-allowed', 'grayscale');
                el.parentElement?.classList.add('pointer-events-none');
            } else {
                el.classList.remove('opacity-40', 'cursor-not-allowed', 'grayscale');
                el.parentElement?.classList.remove('pointer-events-none');
            }
        }
    });

    const localLoginBtn = document.querySelector('#sync-form-local button');
    if (localLoginBtn) {
        localLoginBtn.disabled = isLocalLoggedIn;
        if (isLocalLoggedIn) localLoginBtn.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
        else localLoginBtn.classList.remove('opacity-30', 'pointer-events-none', 'grayscale');
    }

    const disableMainRemote = isRemoteConnected || isLocalLoggedIn;
    ['sync-remote-url', 'sync-remote-code'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = disableMainRemote;
            if (disableMainRemote) {
                el.classList.add('opacity-40', 'cursor-not-allowed', 'grayscale');
                el.parentElement?.classList.add('pointer-events-none');
            } else {
                el.classList.remove('opacity-40', 'cursor-not-allowed', 'grayscale');
                el.parentElement?.classList.remove('pointer-events-none');
            }
        }
    });

    // 2. 弹窗内的远程同步输入框及客户端模式勾选框：仅在远程已连或开启了客户端模式时才禁用
    // (勾选客户端模式后锁定输入，防止在自动同步流程中改动配置)
    const disableModalRemote = isRemoteConnected || settings.enableClientModeSync;
    const modalInputIds = ['remote-overwrite-url', 'remote-overwrite-code', 'setting-client-mode-sync'];
    modalInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = disableModalRemote;
            if (disableModalRemote) {
                el.classList.add('opacity-40', 'cursor-not-allowed', 'grayscale');
                // 注意：勾选框的父级不要加 pointer-events-none，否则无法取消
                if (id !== 'setting-client-mode-sync') el.parentElement?.classList.add('pointer-events-none');
            } else {
                el.classList.remove('opacity-40', 'cursor-not-allowed', 'grayscale');
                if (id !== 'setting-client-mode-sync') el.parentElement?.classList.remove('pointer-events-none');
            }
        }
    });


    const modeBtnIds = ['btn-mode-local', 'btn-mode-remote'];
    modeBtnIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (isLocalLoggedIn || isRemoteConnected) {
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none';
                el.classList.add('grayscale');
            } else {
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
                el.classList.remove('grayscale');
            }
        }
    });

    // 3. 处理操作按钮的禁用状态 (分为主界面按钮和弹窗按钮)
    const mainActionButtons = [
        document.querySelector('#sync-remote-step1 button'),
        document.querySelector('#sync-remote-step2 button')
    ];
    mainActionButtons.forEach(btn => {
        if (btn) {
            btn.disabled = disableMainRemote;
            if (disableMainRemote) btn.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
            else btn.classList.remove('opacity-30', 'pointer-events-none', 'grayscale');
        }
    });

    const modalActionButtons = [
        document.querySelector('#remote-overwrite-step1 button'),
        document.querySelector('button[onclick^="handleRemoteOverwriteConnect"]')
    ];
    modalActionButtons.forEach(btn => {
        if (btn) {
            btn.disabled = disableModalRemote;
            if (disableModalRemote) btn.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
            else btn.classList.remove('opacity-30', 'pointer-events-none', 'grayscale');
        }
    });
}

async function triggerServerCache(song, url, quality) {
    try {
        console.log('[ServerCache] Triggering background download for:', song.name);
        const username = currentListData?.username || '';
        const headers = { 'Content-Type': 'application/json' };
        Object.assign(headers, getUserAuthHeaders());

        // 添加管理员验证 Header (如果已登录)
        const adminPass = getCredential('lx_admin_password');
        if (adminPass) headers['x-frontend-auth'] = adminPass;

        const coverUrl = typeof getImgUrl === 'function' ? getImgUrl(song) : (song.img || song.meta?.picUrl || '');
        const songInfoForCache = {
            ...song,
            img: song.img || coverUrl,
            meta: {
                ...(song.meta || {}),
                picUrl: song.meta?.picUrl || coverUrl
            }
        };

        await fetch('/api/music/cache/download', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                songInfo: songInfoForCache,
                url, 
                quality,
                namingPattern: window.settings?.serverCacheNamingPattern || 'simple',
                embedLyric: !!(window.settings?.embedLyricToFile ?? true)
            })
        });
        // 移除 403 自动重试逻辑，API 不再报 403
    } catch (e) { console.error('[ServerCache] Trigger failed:', e); }
}

let lastNamingPattern = window.settings?.serverCacheNamingPattern || 'simple';

async function updateServerCacheConfig(location, pattern) {
    const loc = location || window.settings?.serverCacheLocation || 'root';
    const pat = pattern || window.settings?.serverCacheNamingPattern || 'simple';
    const oldPattern = lastNamingPattern;

    const headers = { 'Content-Type': 'application/json' };
    // 携带 Token（或兼容旧密码），让服务端正确识别身份
    Object.assign(headers, getUserAuthHeaders());
    const adminPass = getCredential('lx_admin_password');
    if (adminPass) headers['x-frontend-auth'] = adminPass;

    try {
        const response = await fetch('/api/music/cache/config', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                location: loc,
                namingPattern: pat
            })
        });
        if (!response.ok) {
            console.warn('[ServerCache] Config update failed:', response.status);
            // 失败时回滚 UI
            if (typeof syncSettingsUI === 'function') {
                if (location) syncSettingsUI('serverCacheLocation', settings.serverCacheLocation);
                if (pattern) syncSettingsUI('serverCacheNamingPattern', settings.serverCacheNamingPattern);
            }
        } else {
            console.log('[Cache] 服务器配置已同步:', loc, pat);

            // 如果命名模式真的发生了变化（且不是初始化同步）
            if (pattern && oldPattern && pattern !== oldPattern) {
                const confirmed = await showSelect('歌曲命名格式变更', `检测到命名方式已更改为 "${pat}"。是否将服务器上已下载的本地歌曲重新命名为新的格式？<br><br><span class="text-xs opacity-70">注：这会同时移动对应的歌词文件，确保播放器能正常识别。</span>`, {
                    confirmText: '现在重命名',
                    cancelText: '保持现状',
                    confirmColor: 'bg-emerald-500'
                });

                if (confirmed) {
                    showLoading('正在重命名服务器文件...');
                    try {
                        const renameRes = await fetch('/api/music/cache/rename', {
                            method: 'POST',
                            headers: headers
                        });
                        const renameData = await renameRes.json();
                        hideLoading();
                        if (renameData.success) {
                            showToast(`重命名完成！成功: ${renameData.successCount}, 跳过: ${renameData.skipCount}, 失败: ${renameData.failCount}`, 'success');
                            // 刷新可能的列表显示
                            if (typeof refreshCacheList === 'function') refreshCacheList();
                        } else {
                            showToast('重命名操作失败: ' + (renameData.message || '未知错误'), 'error');
                        }
                    } catch (e) {
                        hideLoading();
                        showToast('重命名请求异常', 'error');
                        console.error(e);
                    }
                }
            }
            lastNamingPattern = pat; // 更新最后同步的模式
        }
    } catch (e) {
        console.error('[ServerCache] Config update failed:', e);
    }
}
window.updateServerCacheConfig = updateServerCacheConfig; // Expose global

/**
 * playFromView handles user click on a song in the search/list view.
 * It ensures the playback queue is updated to match the viewed list.
 */
// Playback orchestration moved to features/playback.ts
// Audio Events
audio.addEventListener('timeupdate', () => {
    if (isDragging === 'progress') return; // Skip updating UI while user is dragging

    const current = audio.currentTime;
    const duration = audio.duration;

    // [Crossfade] 自然播放接近结束时提前淡出
    if (settings.enableCrossfade && duration > 5 && (duration - current < 1.0)) {
        if (!window._isFadingOut) {
            window._isFadingOut = true;
            fadeVolume(0, 1000);
        }
    } else if (duration - current > 1.5) {
        window._isFadingOut = false;
    }

    document.getElementById('time-current').innerText = formatTime(current);
    document.getElementById('time-total').innerText = formatTime(duration);

    const pct = (current / duration) * 100;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
        progressContainer.setAttribute('aria-valuemax', String(Number.isFinite(duration) ? Math.round(duration) : 0));
        progressContainer.setAttribute('aria-valuenow', String(Number.isFinite(current) ? Math.round(current) : 0));
    }

    // [iOS Fix] Throttled Media Session Position update for Dynamic Island / Lock Screen
    // 每秒同步一次进度，防止 iOS 将 Web Audio 桥接流识别为不可拖拽的“直播”
    const now = Date.now();
    if ('mediaSession' in navigator && (!window._lastMedPosUpdate || now - window._lastMedPosUpdate > 1000)) {
        updatePositionState();
        window._lastMedPosUpdate = now;
    }

    // 自动恢复：保存播放进度 (节流)
    if (settings.autoResume && (!window._lastStateSave || now - window._lastStateSave > 5000)) {
        savePlaybackState();
        window._lastStateSave = now;
    }
});

// Screen Wake Lock (NoSleep.js) Wrapper
let noSleepInstance = null;
function toggleNoSleep(enable) {
    if (typeof NoSleep === 'undefined') return;
    if (!noSleepInstance) {
        noSleepInstance = new NoSleep();
    }
    if (enable && settings.keepScreenAwake) {
        if (!noSleepInstance.isEnabled) {
            noSleepInstance.enable().catch(e => console.warn('[NoSleep] 启用失败:', e));
        }
    } else {
        if (noSleepInstance && noSleepInstance.isEnabled) {
            noSleepInstance.disable();
        }
    }
}

// Update Media Session State on Play/Pause
audio.addEventListener('play', () => {
    toggleNoSleep(true);
    // 确保播放时应用设置的倍速
    audio.playbackRate = currentPlaybackRate;

    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
        updatePositionState(); // 恢复调用，防止播放瞬间系统推断的外插值错误飞越到最后
    }

    // [Fix] 这里的状态更新确保 UI 与实际播放状态同步 (e.g. 键盘媒体键控制)
    setPlayerStatus('', true); // 使用智能状态显示
    updatePlayButton(true);

    // [Notice] 我们不再在这里调用 lyricPlayer.play，而是等待 'playing' 事件
    // 这样可以避免在网络缓冲时歌词就开始跑
    if (lyricPlayer) {
        isUserScrolling = false; // 切回自动滚动模式

        // 隐藏滚动指示器
        const indicator = document.getElementById('lyric-scroll-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
            indicator.style.display = 'none';
        }
    }
});

audio.addEventListener('playing', () => {
    // [Fix] 'playing' 事件表示音频真正开始震动输出，此时同步最准确
    setPlayerStatus('', true); // 恢复正常播放状态
    if ('mediaSession' in navigator) {
        updatePositionState(); // 立即同步

        // [iOS Stability Fix] 针对 iOS 刷新后失效的问题，在 500ms 和 1200ms 再次强制刷新
        // 确保系统在处理完 Web Audio 桥接流后，能再次接收到正确、有时长的 PositionState
        setTimeout(updatePositionState, 500);
        setTimeout(updatePositionState, 1200);
    }
    if (lyricPlayer) {
        lyricPlayer.play(audio.currentTime * 1000);
        isUserScrolling = false;
        scrollToActiveLine(true); // 强制对齐
    }
});

audio.addEventListener('pause', () => {
    toggleNoSleep(false);
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
    }

    // [Fix] 这里的状态更新确保 UI 与实际播放状态同步
    setPlayerStatus('', false); // 使用智能状态显示
    updatePlayButton(false);

    if (lyricPlayer) {
        lyricPlayer.pause();
    }
    if (wordAnimationId) cancelAnimationFrame(wordAnimationId); // 立即停止行动画
    if (settings.autoResume) savePlaybackState();
});

// ========================================
// Auto-Resume State Logic
// ========================================

function savePlaybackState() {
    if (!currentPlayingSong) return;
    try {
        const state = {
            song: currentPlayingSong,
            index: currentIndex,
            time: audio.currentTime,
            scope: currentPlayingScope,
            listId: window.currentViewingListId,
            // [Fix] 保存整个当前播放队列副本。
            // 限制长度为 300 首以兼顾性能和容量（通常足够临时列表使用）
            playlist: currentPlaylist ? currentPlaylist.slice(0, 300) : null,
            playMode: playMode,
            quality: currentQuality,
            timestamp: Date.now()
        };
        localStorage.setItem('lx_playback_state', JSON.stringify(state));
    } catch (e) {
        console.error('[Resume] 无法保存播放状态:', e);
    }
}

async function restorePlaybackState() {
    if (!settings.autoResume) {
        return;
    }

    try {
        const saved = localStorage.getItem('lx_playback_state');
        if (!saved) {
            return;
        }

        const state = JSON.parse(saved);
        if (!state || !state.song) {
            return;
        }

        console.log('[Resume] 正在恢复上次内容:', state.song.name, '队列长度:', state.playlist ? state.playlist.length : 0);

        // 1. 恢复播放模式
        if (state.playMode) {
            playMode = state.playMode;
            updatePlayModeUI();
        }

        // 2. 恢复播放列表 (优先从持久化队列恢复)
        if (state.playlist && state.playlist.length > 0) {
            currentPlaylist = state.playlist;
            currentPlayingScope = state.scope || 'network';
        } else if (['local_list', 'local_all', 'songlist'].includes(state.scope)) {
            // 回退逻辑：如果队列没存，根据作用域恢复
            currentPlayingScope = state.scope;
        }

        currentIndex = state.index >= 0 ? state.index : 0;
        currentPlayingSong = state.song;
        window.currentPlayingSong = state.song;
        currentQuality = state.quality || null;

        // 3. 更新 UI (静默更新)
        updatePlayerInfo(state.song, currentQuality);
        updateMediaSessionMetadata(state.song);
        renderQueue(); // 提前渲染队列 UI

        // 4. 设置恢复时间点
        const resumeTime = state.time || 0;
        window._resumeInfo = {
            time: resumeTime,
            song: state.song
        };

        // 5. 延迟加载播放源（静默模式）但不强制切换 Tab 破坏默认入口设置
        setTimeout(() => {
            // 初始化音频源但不立即播放（除非设置了自动播放，当前 playSong handles resumeTime）
            playSong(state.song, currentIndex, null, true);
        }, 800);

    } catch (e) {
        console.error('[Resume] 恢复播放状态失败:', e);
    }
}

// 辅助函数：根据 ID 查找列表内容
function findListById(data, id) {
    if (!data) return null;
    if (id === 'default') return data.defaultList;
    if (id === 'love') return data.loveList;
    const ul = data.userList.find(l => l.id === id);
    return ul ? ul.list : null;
}

// 辅助函数：获取所有歌曲（我的收藏）
function getAllSongs(data) {
    if (!data) return [];
    let all = [...data.defaultList, ...data.loveList];
    data.userList.forEach(l => {
        all = all.concat(l.list);
    });
    // 去重
    const seen = new Set();
    return all.filter(s => {
        const sid = s.id || s.songmid;
        if (seen.has(sid)) return false;
        seen.add(sid);
        return true;
    });
}

function updatePositionState() {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        const duration = audio.duration;
        const currentTime = audio.currentTime;
        // 确保当 duration 有效，避免传入 NaN/Infinity
        if (Number.isFinite(duration) && duration > 0) {
            try {
                const pos = Math.max(0, Math.min(currentTime, duration));
                // 显式同步播放状态，解决 iOS UI 有时出现的按钮与实际状态不同步的问题
                if (audio.paused) {
                    navigator.mediaSession.playbackState = 'paused';
                } else {
                    navigator.mediaSession.playbackState = 'playing';
                }

                navigator.mediaSession.setPositionState({
                    duration: duration,
                    playbackRate: audio.playbackRate || 1,
                    position: pos
                });
            } catch (e) {
                console.warn('[MediaSession] Failed to update position state:', e);
            }
        }
    }
}
window.updatePositionState = updatePositionState; // 暴露给保活模块调用

// 歌曲播放结束时根据播放模式处理
audio.addEventListener('ended', () => {
    playNext();
});

audio.addEventListener('canplay', () => {
    if ('mediaSession' in navigator) {
        updatePositionState();
    }
});

// Additional events to sync progress
audio.addEventListener('loadedmetadata', updatePositionState);
audio.addEventListener('ratechange', updatePositionState);
audio.addEventListener('seeked', () => {
    updatePositionState();
    setTimeout(updatePositionState, 200); // 针对跳转后的 iOS 二次确认
    if (lyricPlayer) {
        if (!audio.paused) {
            lyricPlayer.play(audio.currentTime * 1000);
        } else {
            // 如果处于暂停状态，只同步位置不启动计时器
            lyricPlayer.pause();
            const time = audio.currentTime * 1000;
            // 找到当前行并高亮
            const lineNum = lyricPlayer._findCurLineNum(time);
            if (lineNum !== undefined && lineNum >= 0) {
                syncLyricByLineNum(lineNum);
            }
        }
    }
});
audio.addEventListener('waiting', () => {
    setPlayerStatus('缓冲歌曲中', null, true);
    if (lyricPlayer) {
        lyricPlayer.pause();
    }
});

audio.addEventListener('stalled', () => {
    setPlayerStatus('缓冲歌曲中', null, true);
});

// Initialize Media Session Actions
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        togglePlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
        togglePlay();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
        playPrev();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
        playNext();
    });

    // Support seeking (Bidirectional Progress Control)
    navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
            audio.currentTime = details.seekTime;
            updatePositionState();
        }
    });

    /* 
    // 注释掉以下两个 Handler 以确保 iOS 优先显示“上一曲/下一曲”按钮
    // 进度条的拖动由上面的 'seekto' 处理，不依赖这两个按钮
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 10;
        audio.currentTime = Math.max(audio.currentTime - skipTime, 0);
        updatePositionState();
    });
 
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 10;
        audio.currentTime = Math.min(audio.currentTime + skipTime, audio.duration);
        updatePositionState();
    });
    */
}

function updateMediaSessionMetadata(song) {
    if (!('mediaSession' in navigator)) return;

    const imgUrl = getImgUrl(song);
    // Ensure absolute URL if possible
    const fullImgUrl = new URL(imgUrl, window.location.href).href;

    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.name,
            artist: song.singer,
            album: song.albumName || '',
            artwork: [
                { src: fullImgUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: fullImgUrl, sizes: '128x128', type: 'image/jpeg' },
                { src: fullImgUrl, sizes: '192x192', type: 'image/jpeg' },
                { src: fullImgUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: fullImgUrl, sizes: '384x384', type: 'image/jpeg' },
                { src: fullImgUrl, sizes: '512x512', type: 'image/jpeg' }
            ]
        });
        // Reset playback state logic is handled by event listeners, but metadata update often implies new song start
        // updatePositionState() will be called when loadedmetadata fires for new source
    } catch (e) {
        console.warn('[MediaSession] Failed to update metadata:', e);
    }
}


function seek(e) {
    // Prevent seek if audio is not ready or has infinite duration (live stream)
    if (!audio.duration || !Number.isFinite(audio.duration)) return;

    const container = document.getElementById('progress-container');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width)); // Clamp between 0 and 1
    const time = pct * audio.duration;

    // Ensure time is valid
    if (Number.isFinite(time)) {
        audio.currentTime = time;
    }
}

function handleProgressKeydown(event: KeyboardEvent) {
    if (!audio.duration || !Number.isFinite(audio.duration)) return;
    const step = audio.duration * 0.05;
    let nextTime = audio.currentTime;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextTime -= step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextTime += step;
    else if (event.key === 'Home') nextTime = 0;
    else if (event.key === 'End') nextTime = audio.duration;
    else return;

    event.preventDefault();
    audio.currentTime = Math.max(0, Math.min(audio.duration, nextTime));
}
window.handleProgressKeydown = handleProgressKeydown;

// ========== 音量控制 ==========
let currentVolume = 0.75; // 默认音量 75%
let isMuted = false;

// 初始化音量
audio.volume = currentVolume;
updateVolumeUI();

// 设置音量
function setVolume(e) {
    const container = document.getElementById('volume-container');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width)); // 限制在 0-1 之间

    currentVolume = pct;
    audio.volume = currentVolume;
    isMuted = false;

    updateVolumeUI();

    // 保存到本地存储
    try {
        localStorage.setItem('lx_volume', currentVolume.toString());
    } catch (e) {
        console.error('[Volume] 保存音量失败:', e);
    }
}

function handleVolumeKeydown(event: KeyboardEvent) {
    let nextVolume = currentVolume;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextVolume -= 0.05;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextVolume += 0.05;
    else if (event.key === 'Home') nextVolume = 0;
    else if (event.key === 'End') nextVolume = 1;
    else return;

    event.preventDefault();
    currentVolume = Math.max(0, Math.min(1, nextVolume));
    audio.volume = currentVolume;
    isMuted = false;
    updateVolumeUI();
    try {
        localStorage.setItem('lx_volume', currentVolume.toString());
    } catch (error) {
        console.warn('[Volume] 保存音量失败:', error);
    }
}
window.handleVolumeKeydown = handleVolumeKeydown;

// 切换静音
function toggleMute() {
    isMuted = !isMuted;
    audio.muted = isMuted;
    updateVolumeUI();
}

// 更新音量 UI
function updateVolumeUI() {
    const volumeBar = document.getElementById('volume-bar');
    const volumeIcon = document.getElementById('volume-icon');

    if (volumeBar) {
        const displayVolume = isMuted ? 0 : currentVolume;
        volumeBar.style.width = `${displayVolume * 100}%`;
        document.getElementById('volume-container')?.setAttribute('aria-valuenow', String(Math.round(displayVolume * 100)));
    }

    if (volumeIcon) {
        if (isMuted || currentVolume === 0) {
            volumeIcon.className = 'fas fa-volume-mute w-4';
        } else if (currentVolume < 0.5) {
            volumeIcon.className = 'fas fa-volume-down w-4';
        } else {
            volumeIcon.className = 'fas fa-volume-up w-4';
        }
    }
}

// ========== 播放模式 ==========
let playMode = 'list'; // 'list': 列表循环, 'single': 单曲循环, 'random': 随机播放, 'order': 顺序播放

// 设置播放模式
function setPlayMode(mode) {
    playMode = mode;
    // [Random Prefetch Fix] 切换模式时清空预读预选索引
    preSelectedNextIndex = null;
    updatePlayModeUI();

    // 保存到本地存储
    try {
        localStorage.setItem('lx_play_mode', mode);
    } catch (e) {
        console.error('[PlayMode] 保存播放模式失败:', e);
    }

    // Close menu (Mobile/Click mode)
    const menu = document.getElementById('play-mode-menu');
    if (menu) menu.classList.remove('force-visible');
    document.getElementById('play-mode-btn')?.setAttribute('aria-expanded', 'false');

    // 使用统一的 Toast 系统显示提示
    showSuccess(`播放模式：${getPlayModeName(mode)}`);
}

// 切换播放模式菜单（适配移动端点击）
function togglePlayModeMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('play-mode-menu');
    if (menu) {
        const isOpening = !menu.classList.contains('force-visible');
        menu.classList.toggle('force-visible', isOpening);
        document.getElementById('play-mode-btn')?.setAttribute('aria-expanded', String(isOpening));
    }
}

// 切换播放倍速菜单（适配移动端点击）
function togglePlaybackRateMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('playback-rate-menu');
    if (menu) {
        const isOpening = !menu.classList.contains('force-visible');
        menu.classList.toggle('force-visible', isOpening);
        document.getElementById('playback-rate-btn')?.setAttribute('aria-expanded', String(isOpening));
    }
}

// 设置播放倍速
function setPlaybackRate(rate) {
    currentPlaybackRate = parseFloat(rate);
    audio.playbackRate = currentPlaybackRate;
    if (lyricPlayer) {
        lyricPlayer.setPlaybackRate(currentPlaybackRate);
        // 强制同步当前音频时间，确保位置严格匹配
        lyricPlayer.play(audio.currentTime * 1000);
        isUserScrolling = false; // 重置手动滚动模式，进入自动跟随
        scrollToActiveLine(true); // 立即对齐并滚动到当前行
    }
    updatePlaybackRateUI();

    // 关闭菜单
    const menu = document.getElementById('playback-rate-menu');
    if (menu) menu.classList.remove('force-visible');
    document.getElementById('playback-rate-btn')?.setAttribute('aria-expanded', 'false');

    // 增加提示
    showInfo(`播放速度：${rate}x`);
}

// 更新播放倍速 UI
function updatePlaybackRateUI() {
    const btn = document.getElementById('playback-rate-btn');
    if (btn) {
        btn.innerText = currentPlaybackRate === 1.0 ? '1.0x' : `${currentPlaybackRate}x`;
        btn.classList.toggle('text-emerald-500', currentPlaybackRate !== 1.0);
        btn.setAttribute('aria-label', `播放速度：${currentPlaybackRate} 倍`);
    }

    const options = document.querySelectorAll('.playback-rate-option');
    options.forEach(opt => {
        const rate = parseFloat(opt.dataset.rate);
        if (rate === currentPlaybackRate) {
            opt.classList.add('active-option', 'font-bold');
        } else {
            opt.classList.remove('active-option', 'font-bold');
        }
    });
}

// 监听全局点击，关闭菜单
document.addEventListener('click', (e) => {
    // 关闭播放模式菜单
    const pmMenu = document.getElementById('play-mode-menu');
    const pmBtn = document.getElementById('play-mode-btn');
    if (pmMenu && pmBtn && !pmMenu.contains(e.target) && !pmBtn.contains(e.target)) {
        pmMenu.classList.remove('force-visible');
        pmBtn.setAttribute('aria-expanded', 'false');
    }

    // 关闭倍速菜单
    const prMenu = document.getElementById('playback-rate-menu');
    const prBtn = document.getElementById('playback-rate-btn');
    if (prMenu && prBtn && !prMenu.contains(e.target) && !prBtn.contains(e.target)) {
        prMenu.classList.remove('force-visible');
        prBtn.setAttribute('aria-expanded', 'false');
    }
});

// 更新播放模式 UI
function updatePlayModeUI() {
    const btn = document.getElementById('play-mode-btn');
    const options = document.querySelectorAll('.play-mode-option');

    // 更新按钮图标和颜色
    if (btn) {
        const icons = {
            'list': 'fa-redo',
            'single': 'fa-redo-alt',
            'random': 'fa-random',
            'order': 'fa-play'
        };
        const colors = {
            'list': 'text-emerald-500',
            'single': 'text-blue-500',
            'random': 'text-purple-500',
            'order': 'text-gray-500'
        };

        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = `fas ${icons[playMode]}`;
            Object.values(colors).forEach(color => btn.classList.remove(color));
            btn.classList.add(colors[playMode]);
            btn.title = getPlayModeName(playMode);
            btn.setAttribute('aria-label', `播放模式：${getPlayModeName(playMode)}`);
        }
    }

    // 高亮当前选中的选项
    options.forEach(opt => {
        if (opt.dataset.mode === playMode) {
            opt.classList.add('active-option', 'font-bold');
        } else {
            opt.classList.remove('active-option', 'font-bold');
        }
    });
}

function getPlayModeName(mode) {
    const names = {
        'list': '列表循环',
        'single': '单曲循环',
        'random': '随机播放',
        'order': '顺序播放'
    };
    return names[mode] || '未知';
}

function formatTime(s) {
    if (!s || isNaN(s)) return '00:00';
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
}


// Load settings from localStorage
function loadSettings() {
    try {
        const saved = localStorage.getItem('lx_settings');
        let legacyRemoteSyncCode = '';
        if (saved) {
            const loaded = JSON.parse(saved);
            legacyRemoteSyncCode = loaded?.remoteSyncCode || '';
            settings = normalizeStoredSettings({ ...settings, ...loaded });
            console.log('[Settings] 加载设置成功:', settings);
        }
        restoreRemoteSyncCode(legacyRemoteSyncCode);
    } catch (e) {
        console.error('[Settings] 加载设置失败:', e);
    }

    // 同步 UI 状态
    syncSettingsUI();
    setupNetworkListAutoCheck();
}

// ========== 键盘快捷键逻辑 ==========
let seekTimer = null;
let isLongPress = false;

function handleSeekKey(direction, action) {
    if (action === 'down') {
        if (seekTimer) return; // 已经在处理中

        // 初始步长跳转 (默认 5% 长度)
        let delta = direction === 'forward' ? 10 : -10;
        if (audio.duration && Number.isFinite(audio.duration)) {
            delta = audio.duration * (direction === 'forward' ? 0.05 : -0.05);
        }

        audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));

        // 设置长按逻辑 (500ms 后进入连续推进模式)
        seekTimer = setTimeout(() => {
            isLongPress = true;
            seekTimer = setInterval(() => {
                const step = direction === 'forward' ? 2 : -2; // 每 100ms 推进 2s = 20s/s
                audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + step));
            }, 100);
        }, 500);
    } else {
        // 松开按键，重置状态
        if (seekTimer) {
            if (isLongPress) clearInterval(seekTimer);
            else clearTimeout(seekTimer);
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
        localStorage.setItem('lx_volume', currentVolume.toString());
    } catch (e) { }
}

// 注册全局键盘监听
document.addEventListener('keydown', (e) => {
    if (!settings.enableKeyboardShortcuts) return;

    // 如果焦点在输入框中，忽略快捷键
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
    }

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            togglePlay();
            break;
        case 'ArrowUp':
            e.preventDefault();
            changeVolume(0.05);
            break;
        case 'ArrowDown':
            e.preventDefault();
            changeVolume(-0.05);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            handleSeekKey('backward', 'down');
            break;
        case 'ArrowRight':
            e.preventDefault();
            handleSeekKey('forward', 'down');
            break;
        case 'BracketLeft': // '['
            playPrev();
            break;
        case 'BracketRight': // ']'
            playNext();
            break;
        case 'KeyL':
            toggleLyrics();
            break;
        case 'Digit1':
            if (e.altKey) switchTab('search');
            break;
        case 'Digit2':
            if (e.altKey) switchTab('songlist');
            break;
        case 'Digit3':
            if (e.altKey) switchTab('leaderboard');
            break;
        case 'Digit4':
            if (e.altKey) switchTab('favorites');
            break;
        case 'Digit5':
            if (e.altKey) switchTab('settings');
            break;
        case 'Digit6':
            if (e.altKey) switchTab('about');
            break;
        case 'KeyF':
            updateSetting('showFooterVisualizer', !settings.showFooterVisualizer);
            break;
        case 'KeyG':
            updateSetting('showDetailVisualizer', !settings.showDetailVisualizer);
            break;
        case 'KeyH':
            if (typeof toggleCacheDrawer === 'function') toggleCacheDrawer();
            break;
        case 'KeyJ':
            if (typeof toggleDownloadDrawer === 'function') toggleDownloadDrawer();
            break;
    }
});

document.addEventListener('keyup', (e) => {
    if (!settings.enableKeyboardShortcuts) return;
    if (e.code === 'ArrowLeft') handleSeekKey('backward', 'up');
    if (e.code === 'ArrowRight') handleSeekKey('forward', 'up');
});

function getRemasterStorageUsername() {
    const username = currentListData?.username || localStorage.getItem('lx_sync_user') || '_open';
    return !username || username === 'default' ? '_open' : username;
}

async function toggleRemasterFeature(enabled) {
    const toggle = document.getElementById('setting-enable-remaster');
    try {
        await updateSetting('enableRemaster', !!enabled);
        if (toggle) toggle.checked = !!window.settings?.enableRemaster;
        window.LocalMusicManager?.syncRemasterVisibility();
    } catch (e) {
        if (toggle) toggle.checked = !!window.settings?.enableRemaster;
        showError(e.message || '更新洗版设置失败');
    }
}

window.getRemasterStorageUsername = getRemasterStorageUsername;
window.toggleRemasterFeature = toggleRemasterFeature;

async function updateSetting(key, value) {
    if (SETTINGS_UI_MAP[key]?.normalize) {
        value = SETTINGS_UI_MAP[key].normalize(value);
    }
    const restrictedKeys = ['enableServerCache', 'enableServerLyricCache', 'serverCacheLocation', 'serverCacheNamingPattern', 'downloadConcurrency', 'enableOnlyDownloadMode', 'enableRemaster', 'preferredQuality', 'enablePublicSources', 'embedLyricToFile', 'preferServerCache'];
    const isPublic = !isUserLoggedIn() || currentListData?.username === '_open' || currentListData?.username === 'default' || window.isViewingPublicFavorites;
    const enablePublicRestriction = window.lx_config?.['user.enablePublicRestriction'];
    const enableLoginCacheRestriction = window.lx_config?.['user.enableLoginCacheRestriction'];
    const isAdmin = !!getCredential('lx_admin_password');

    // 权限校验：针对不同用户类型的受限设置项校验 (置灰逻辑由 syncSettingsUI 同步)
    const isRestricted = !isAdmin && (
        (isPublic && enablePublicRestriction) ||
        (!isPublic && enableLoginCacheRestriction)
    );

    if (restrictedKeys.includes(key) && isRestricted) {
        showError('权限不足：公开受限模式下修改该设置项受限，请先验证管理员身份。');
        const authorized = await handleAdminAuth('该设置项受限，请输入管理员密码以修改');
        if (!authorized) {
            syncSettingsUI(key, settings[key]); // 还原 UI
            return;
        }
    }

    if (key === 'networkListAutoCheckInterval') {
        const intervalMs = parseNetworkListAutoCheckInterval(value);
        if (intervalMs === null) {
            showError('无效的自动检测间隔，请使用 30m / 6h / 1d 等格式');
            syncSettingsUI(key, settings[key]);
            return;
        }
    }

    settings[key] = value;
    window.settings = settings; // 确保全局引用同步
    try {
        if (key === 'remoteSyncCode') {
            if (value) credentialStorage.setItem('lx_sync_code', String(value));
            else credentialStorage.removeItem('lx_sync_code');
        }
        persistSettings();
        console.log(`[Settings] ${key} 已更新为:`, value);
    } catch (e) {
        console.error('[Settings] 保存设置失败:', e);
    }
    // 实时同步 UI 并应用效果
    syncSettingsUI(key, value);
    if (key === 'networkListAutoCheckInterval' || key === 'autoUpdateNetworkList') {
        setupNetworkListAutoCheck();
    }

    // [New] Push to server if enabled
    if (settings.saveAccountSettingsToFile) {
        pushSettingsToServer();
    }

    // Special handlers for visual changes
    if (key.includes('Visualizer') || key.startsWith('visualizer')) {
        if (window.musicVisualizer) {
            // 如果正在播放且开启了开关，尝试强制初始化 (防止第一次点击开关没反应)
            if (typeof audio !== 'undefined' && !audio.paused && (settings.showFooterVisualizer || settings.showDetailVisualizer)) {
                window.musicVisualizer.init();
            }
            window.musicVisualizer.applySettings();
        } else {
            // Visualization is an optional, animation-heavy feature. Load it only
            // when the user first changes a visualization setting.
            ensureVisualizerLoaded().then(() => window.musicVisualizer?.applySettings()).catch(() => {
                console.warn('[Visualizer] 可视化模块加载失败');
            });
        }

        // 更新透明度数值显示
        if (key === 'visualizerOpacity') {
            const el = document.getElementById('visualizer-opacity-value');
            if (el) el.innerText = value;
        }
    }

    if (key === 'playerBackground') {
        applyPlayerBackground(value);
    }

    if (key === 'enablePublicSources') {
        if (typeof updateSourceScopeUI === 'function') updateSourceScopeUI();
        if (typeof renderCustomSources === 'function') renderCustomSources();
    }
}
//缓存设置
// 核心设置项映射表: [key]: { id: 'element-id', type: 'checkbox|value|custom', action: (val) => { ... } }
const SETTINGS_UI_MAP = {
    // 逻辑 (Logic)
    defaultEntry: { id: 'setting-default-entry', type: 'value' },
    defaultDownloadTarget: { id: 'setting-default-download-target', type: 'value' },
    defaultDownloadQuality: {
        id: 'setting-default-download-quality',
        type: 'value',
        action: (v, isSingle) => {
            if (isSingle && window.showSuccess && window.QualityManager) {
                window.showSuccess(`默认下载音质已设置为: ${window.QualityManager.getQualityDisplayName(v)}`);
            }
        }
    },
    switchPlaylistOnSearchPlay: { id: 'setting-switch-playlist-search', type: 'checkbox' },
    switchPlaylistOnSongListPlay: { id: 'setting-switch-playlist-songlist', type: 'checkbox' },
    autoResume: { id: 'setting-auto-resume', type: 'checkbox' },
    autoCompactPlaybar: { id: 'setting-auto-compact-playbar', type: 'checkbox' },
    enableAutoSwitchSource: { id: 'setting-auto-switch-source', type: 'checkbox' },
    enableAutoSwitchApiSource: { id: 'setting-auto-switch-api-source', type: 'checkbox' },
    enableAutoSkipOnError: { id: 'setting-auto-skip-on-error', type: 'checkbox' },
    enableAutoDegradeQuality: { id: 'setting-auto-degrade-quality', type: 'checkbox' },
    playbackErrorPriority: { id: 'setting-playback-error-priority', type: 'value' },
    enablePreloader: { id: 'setting-enable-preloader', type: 'checkbox' },
    deduplicatePlaylistByQuality: { id: 'setting-deduplicate-playlist', type: 'checkbox' },
    enableSmtcLyric: {
        id: 'setting-enable-smtc-lyric',
        type: 'checkbox',
        action: (v) => {
            // 关闭时立即恢复 MediaSession title / artist 为歌曲名 / 歌手名
            if (!v && 'mediaSession' in navigator && navigator.mediaSession.metadata && currentPlayingSong) {
                try {
                    navigator.mediaSession.metadata.title = currentPlayingSong.name;
                    navigator.mediaSession.metadata.artist = currentPlayingSong.singer;
                } catch (e) { /* ignore */ }
            }
        }
    },
    downloadConcurrency: {
        id: 'setting-download-concurrency',
        type: 'value',
        normalize: normalizeDownloadConcurrency,
        action: (v) => {
            if (window.SystemDownloadManager) {
                window.SystemDownloadManager.updateMaxConcurrent(v);
            }
        }
    },
    enableRemaster: {
        id: 'setting-enable-remaster',
        type: 'checkbox',
        action: () => window.LocalMusicManager?.syncRemasterVisibility()
    },
    enableKeyboardShortcuts: { id: 'setting-enable-shortcuts', type: 'checkbox' },
    enableCrossfade: { id: 'setting-enable-crossfade', type: 'checkbox' },
    keepScreenAwake: {
        id: 'setting-keep-screen-awake',
        type: 'checkbox',
        action: (v) => toggleNoSleep(v && !audio.paused)
    },
    enablePersistentToken: {
        id: 'setting-enable-persistent-token',
        type: 'checkbox',
        action: (v) => {
            const container = document.getElementById('token-list-container');
            if (container) {
                if (v) {
                    container.classList.remove('hidden', 'opacity-50', 'pointer-events-none');
                } else {
                    container.classList.add('hidden', 'opacity-50', 'pointer-events-none');
                }
            }
        }
    },

    // 显示 (Display)
    showSidebarSongInfo: {
        id: 'setting-show-sidebar-info',
        type: 'checkbox',
        action: (v) => {
            const sidebarInfo = document.querySelector('.sidebar-song-info-wrapper');
            if (sidebarInfo) v ? sidebarInfo.classList.add('md:block') : sidebarInfo.classList.remove('md:block');
        }
    },
    showLyricTranslation: {
        id: 'setting-show-lyric-translation',
        type: 'checkbox',
        action: () => (lyricPlayer && currentRawLrc) && applyLyricUpdate()
    },
    showLyricRoma: {
        id: 'setting-show-lyric-roma',
        type: 'checkbox',
        action: () => (lyricPlayer && currentRawLrc) && applyLyricUpdate()
    },
    swapLyricTransRoma: {
        id: 'setting-swap-lyric-trans-roma',
        type: 'checkbox',
        action: () => (lyricPlayer && currentRawLrc) && applyLyricUpdate()
    },
    enableLyricGlow: {
        id: 'setting-enable-lyric-glow',
        type: 'checkbox',
        action: (v) => {
            // 同时更新歌词详情容器和歌词内容容器，实现实时生效
            const dv = document.getElementById('view-player-detail');
            if (dv) v ? dv.classList.add('enable-lyric-glow') : dv.classList.remove('enable-lyric-glow');
            const lc = document.getElementById('lyric-content');
            if (lc) v ? lc.classList.add('enable-lyric-glow') : lc.classList.remove('enable-lyric-glow');
        }
    },
    playerBackground: {
        id: 'setting-player-background',
        type: 'value',
        action: (v) => applyPlayerBackground(v)
    },
    lyricFontSize: {
        id: 'lyric-font-size-slider',
        type: 'value',
        action: (v) => {
            const valEl = document.getElementById('lyric-font-size-value');
            if (valEl) valEl.innerText = v;
            document.documentElement.style.setProperty('--lyric-font-size', `${v}rem`);
        }
    },
    lyricFontFamily: {
        id: 'lyric-font-family-select',
        type: 'value',
        action: (v) => document.documentElement.style.setProperty('--lyric-font-family', v || 'inherit')
    },

    // 视觉效果 (Visualizer)
    showFooterVisualizer: { id: 'setting-show-footer-visualizer', type: 'checkbox' },
    footerVisualizerStyle: { id: 'setting-footer-visualizer-style', type: 'value' },
    showDetailVisualizer: { id: 'setting-show-detail-visualizer', type: 'checkbox' },
    detailVisualizerStyle: { id: 'setting-detail-visualizer-style', type: 'value' },
    visualizerGlobalStyle: { id: 'setting-visualizer-global-style', type: 'value' },
    visualizerOpacity: {
        id: 'setting-visualizer-opacity',
        type: 'value',
        action: (v) => {
            const valEl = document.getElementById('visualizer-opacity-value');
            if (valEl) valEl.innerText = v;
        }
    },

    // 系统 & 网络 (System & Network)
    autoUpdateNetworkList: { id: 'setting-auto-update-list', type: 'checkbox' },
    networkListAutoCheckInterval: { id: 'setting-network-list-auto-check-interval', type: 'value' },
    saveAccountSettingsToFile: { id: 'setting-save-settings-to-file', type: 'checkbox' },
    enableLyricCache: { id: 'setting-enable-lyric-cache', type: 'checkbox' },
    enableSongUrlCache: { id: 'setting-enable-url-cache', type: 'checkbox' },
    enableServerCache: { id: 'setting-enable-server-cache', type: 'checkbox' },
    enableServerLyricCache: { id: 'setting-enable-server-lyric-cache', type: 'checkbox' },
    embedLyricToFile: { id: 'setting-embed-lyric-to-file', type: 'checkbox' },
    preferServerCache: { id: 'setting-prefer-server-cache', type: 'checkbox' },
    enableOnlyDownloadMode: { id: 'setting-only-download-mode', type: 'checkbox' },
    serverCacheLocation: { id: 'setting-server-cache-location', type: 'value' },
    serverCacheNamingPattern: {
        id: 'setting-server-cache-naming',
        type: 'value',
        normalize: value => value === 'standard' ? 'standard' : 'simple'
    },
    enableProxyPlayback: { id: 'toggle-proxy-playback', type: 'checkbox' },
    enableProxyDownload: { id: 'toggle-proxy-download', type: 'checkbox' },
    enableAutoProxy: { id: 'toggle-auto-proxy', type: 'checkbox' },
    enableCustomProxy: {
        id: 'toggle-custom-proxy',
        type: 'checkbox',
        action: (v) => {
            const row = document.getElementById('custom-proxy-url-row');
            if (row) row.classList.toggle('hidden', !v);
        }
    },
    customProxyUrl: { id: 'custom-proxy-url-input', type: 'value' },
    enablePublicSources: { id: 'toggle-public-sources', type: 'checkbox' },
    preferredQuality: {
        id: 'quality-select',
        type: 'value',
        action: (v, isSingle) => {
            if (isSingle && window.showSuccess && window.QualityManager) {
                window.showSuccess(`默认音质已设置为: ${window.QualityManager.getQualityDisplayName(v)}`);
            }
        }
    },
    hotSearchLimit: {
        id: 'hot-search-limit-input',
        type: 'value',
        action: () => document.getElementById('search-results-header')?.classList.contains('hidden') && showInitialSearchState()
    },
    itemsPerPage: { id: 'items-per-page-select', type: 'value' },
    enableClientModeSync: { id: 'setting-client-mode-sync', type: 'checkbox' }
};

//缓存设置项
function syncSettingsUI(key = null, value = null) {
    const isPublic = !isUserLoggedIn() || currentListData?.username === '_open' || currentListData?.username === 'default' || window.isViewingPublicFavorites;
    const enablePublicRestriction = window.lx_config?.['user.enablePublicRestriction'];
    const enableLoginCacheRestriction = window.lx_config?.['user.enableLoginCacheRestriction'];
    const isAdmin = !!getCredential('lx_admin_password');
    const restrictedKeys = ['enableServerCache', 'enableServerLyricCache', 'serverCacheLocation', 'serverCacheNamingPattern', 'downloadConcurrency', 'enableOnlyDownloadMode', 'enableRemaster', 'preferredQuality', 'enablePublicSources', 'embedLyricToFile', 'preferServerCache'];

    const updateItem = (itemKey, itemValue, isSingle) => {
        const config = SETTINGS_UI_MAP[itemKey];
        if (!config) return;

        if (config.normalize) itemValue = config.normalize(itemValue);
        if (settings[itemKey] !== itemValue) {
            settings[itemKey] = itemValue;
            window.settings = settings;
        }
        const el = document.getElementById(config.id);
        if (el) {
            if (config.type === 'checkbox') el.checked = !!itemValue;
            else el.value = itemValue;

            // 禁用受限设置项 (针对公开受限或登录用户受限)
            const isRestricted = !isAdmin && (
                (isPublic && enablePublicRestriction) ||
                (!isPublic && enableLoginCacheRestriction)
            );

            if (restrictedKeys.includes(itemKey) && isRestricted) {
                el.disabled = true;
                const container = el.closest('.flex.items-center.justify-between') || el.closest('.setting-item') || el.parentElement;
                if (container) container.classList.add('opacity-40', 'pointer-events-none');
            } else if (restrictedKeys.includes(itemKey)) {
                el.disabled = false;
                const container = el.closest('.flex.items-center.justify-between') || el.closest('.setting-item') || el.parentElement;
                if (container) container.classList.remove('opacity-40', 'pointer-events-none');
            }
        }

        if (config.action) config.action(itemValue, isSingle);
    };

    // [新增] 更新管理员 UI 状态 (标签、按钮)
    if (typeof updateAdminUI === 'function') updateAdminUI();

    if (key !== null && value !== null) {
        // 单项更新
        updateItem(key, value, true);
    } else {
        // 全局同步
        Object.keys(SETTINGS_UI_MAP).forEach(itemKey => {
            const val = settings[itemKey];
            // 处理默认值逻辑 (如果 settings 中没有，则可能需要 fallback 或跳过)
            if (val !== undefined) {
                updateItem(itemKey, val, false);
            }
        });
    }

    // 更新存储统计与缓存大小
    updateStorageStatsUI();
    updateServerCacheSize();
}

/**
 * 应用播放页背景样式
 * @param {string} mode - 'blur', 'solid', 'dark'
 */
function applyPlayerBackground(mode) {
    const detailBg = document.getElementById('view-player-detail');
    const bgCover = document.getElementById('detail-bg-cover');
    const bgOverlay = document.getElementById('player-detail-bg-overlay');
    if (!detailBg || !bgCover || !bgOverlay) return;

    console.log(`[PlayerBackground] Applying style: ${mode}`);

    // 重置默认状态
    bgCover.style.display = 'block';
    bgOverlay.className = 'absolute inset-0 t-bg-panel/30 backdrop-blur-3xl';
    bgOverlay.style.backgroundColor = '';
    bgOverlay.style.backdropFilter = '';
    detailBg.style.backgroundColor = '';

    if (mode === 'solid') {
        bgCover.style.display = 'none';
        bgOverlay.className = 'absolute inset-0 t-bg-panel';
        bgOverlay.style.backdropFilter = 'none';
    } else if (mode === 'dark') {
        bgCover.style.display = 'none';
        bgOverlay.className = 'absolute inset-0';
        bgOverlay.style.backgroundColor = '#000000';
        bgOverlay.style.backdropFilter = 'none';
    }
    // 'blur' 模式由上面的重置逻辑处理
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
// 音量控制
window.setVolume = setVolume;
window.toggleMute = toggleMute;
// 播放模式
window.setPlayMode = setPlayMode;
// --- Lyrics & Detail View Logic ---

let currentLyricLines = [];
let isLyricViewOpen = false;
let currentLyricIndex = -1;
let wordAnimationId = null; // 用于逐词歌词动画
let lyricPlayer = null; // LinePlayer instance for parsing and syncing
let isUserScrolling = false; // 用户是否正在手动滚动
let scrollLockTimeout = null; // 滚动锁定计时器
let isProgrammaticScroll = false; // 标记是否为程序自动滚动
const SCROLL_LOCK_DURATION = 5000; // 5秒后解除锁定
const lyricState = {
    get currentLyricLines() { return currentLyricLines; },
    set currentLyricLines(value) { currentLyricLines = value; },
    get isLyricViewOpen() { return isLyricViewOpen; },
    set isLyricViewOpen(value) { isLyricViewOpen = value; },
    get currentLyricIndex() { return currentLyricIndex; },
    set currentLyricIndex(value) { currentLyricIndex = value; },
    get wordAnimationId() { return wordAnimationId; },
    set wordAnimationId(value) { wordAnimationId = value; },
    get lyricPlayer() { return lyricPlayer; },
    set lyricPlayer(value) { lyricPlayer = value; },
    get isUserScrolling() { return isUserScrolling; },
    set isUserScrolling(value) { isUserScrolling = value; },
    get scrollLockTimeout() { return scrollLockTimeout; },
    set scrollLockTimeout(value) { scrollLockTimeout = value; },
    get isProgrammaticScroll() { return isProgrammaticScroll; },
    set isProgrammaticScroll(value) { isProgrammaticScroll = value; },
    get currentRawLrc() { return currentRawLrc; },
    set currentRawLrc(value) { currentRawLrc = value; },
    get currentRawTlrc() { return currentRawTlrc; },
    set currentRawTlrc(value) { currentRawTlrc = value; },
    get currentRawRlrc() { return currentRawRlrc; },
    set currentRawRlrc(value) { currentRawRlrc = value; },
    get currentRawKlrc() { return currentRawKlrc; },
    set currentRawKlrc(value) { currentRawKlrc = value; },
    get lastLyricSongId() { return lastLyricSongId; },
    set lastLyricSongId(value) { lastLyricSongId = value; },
};
const lyricFeature = initLyricFeature({
    state: lyricState,
    getSettings: () => settings,
    getAudio: () => audio as HTMLMediaElement,
    getCurrentPlayingSong: () => currentPlayingSong,
    getCurrentListData: () => currentListData,
    getCurrentQuality: () => currentQuality,
    getCurrentPlaybackRate: () => currentPlaybackRate,
    getUserAuthHeaders,
    getImgUrl,
    setImg,
    goBackToSearch,
    updateStorageStatsUI,
    escapeHtmlText,
    formatTime,
    startToggleLyricsBtnTimer: () => startToggleLyricsBtnTimer(),
    scrollLockDuration: SCROLL_LOCK_DURATION,
});
const {
    toggleLyrics,
    updateDetailInfo: updateLyricDetailInfo,
    fetchLyric,
    applyLyricUpdate,
    initLyricPlayer,
    getLyricOffset,
    scrollToActiveLine,
    syncLyricByLineNum,
    startWordProgressUpdate,
    handleLyricScroll,
    updateScrollIndicator,
    renderLyric,
} = lyricFeature;

// syncLyric removed - LinePlayer handles all syncing via syncLyricByLineNum callback
// Audio timeupdate listener removed - LinePlayer automatically syncs lyrics

// Playback feature updates lyric detail metadata through its context adapter.

window.toggleLyrics = toggleLyrics;

// Initial
console.log('App.js loaded successfully');

// Initialize Favorites as hidden (collapsed)
const favList = document.getElementById('favorites-children');
if (favList) {
    favList.style.height = '0px';
    // favList.classList.add('hidden'); // using height transition instead
}

function refreshFavoritesChildrenHeight() {
    const list = document.getElementById('favorites-children');
    if (!list || list.style.height === '0px' || list.style.height === '') return;

    const currentHeight = list.getBoundingClientRect().height;
    list.style.height = 'auto';
    const targetHeight = list.scrollHeight;
    list.style.height = currentHeight + 'px';

    requestAnimationFrame(() => {
        list.style.height = targetHeight + 'px';
    });
}

function toggleFavorites() {
    const list = document.getElementById('favorites-children');
    const arrow = document.getElementById('favorites-arrow');
    const trigger = document.getElementById('tab-favorites');
    if (!list) return;

    // Toggle logic
    if (list.style.height === '0px' || list.style.height === '') {
        list.style.height = 'auto';
        const targetHeight = list.scrollHeight;
        list.style.height = '0px';
        requestAnimationFrame(() => {
            list.style.height = targetHeight + 'px';
        });
        if (arrow) arrow.style.transform = 'rotate(0deg)'; // Arrow down
        trigger?.setAttribute('aria-expanded', 'true');
    } else {
        list.style.height = '0px';
        if (arrow) arrow.style.transform = 'rotate(-90deg)'; // Arrow right
        trigger?.setAttribute('aria-expanded', 'false');
    }
}

// Initial rotate for collapsed state
const favArrow = document.getElementById('favorites-arrow');
if (favArrow) favArrow.style.transform = 'rotate(-90deg)';
document.getElementById('tab-favorites')?.setAttribute('aria-expanded', 'false');

// Link SyncManager from user_sync.js
// Link SyncManager from user_sync.js
const syncManager = window.SyncManager;
let currentListData = null;
let syncModeResolve = null;
let currentRemoteOverwriteClient = null;
let remoteSyncModeResolve = null;
let lastSelectedRemoteSyncMode = null;

const syncState: SyncState = {
    get currentListData() { return currentListData; },
    set currentListData(value) { currentListData = value; },
    get syncModeResolve() { return syncModeResolve; },
    set syncModeResolve(value) { syncModeResolve = value; },
    get currentRemoteOverwriteClient() { return currentRemoteOverwriteClient; },
    set currentRemoteOverwriteClient(value) { currentRemoteOverwriteClient = value; },
    get remoteSyncModeResolve() { return remoteSyncModeResolve; },
    set remoteSyncModeResolve(value) { remoteSyncModeResolve = value; },
    get lastSelectedRemoteSyncMode() { return lastSelectedRemoteSyncMode; },
    set lastSelectedRemoteSyncMode(value) { lastSelectedRemoteSyncMode = value; },
    get userToken() { return userToken; },
    set userToken(value) { userToken = value; },
};
const syncFeature = initSyncFeature({
    state: syncState,
    syncManager,
    credentialStorage,
    getCredential,
    getSettings: () => settings,
    getUserToken: () => userToken,
    setUserToken: (token) => { userToken = token; },
    audio: audio as HTMLAudioElement | null,
    getLyricPlayer: () => lyricPlayer,
    persistSettings: (...args) => persistSettings(...args),
    pushSettingsToServer: (...args) => pushSettingsToServer(...args),
    loadTokenConfig: (...args) => loadTokenConfig(...args),
    loadLibraryData: (...args) => loadLibraryData(...args),
    updateUserUI: (...args) => updateUserUI(...args),
    updateSetting: (...args) => updateSetting(...args),
    renderMyLists: (...args) => renderMyLists(...args),
    pushDataChange: (...args) => pushDataChange(...args),
    updateAdminUI: (...args) => updateAdminUI(...args),
    showSelect,
    showSuccess,
    showError,
});
const {
    switchSyncMode,
    updateSyncStatus,
    handleSyncLogout,
    handleLocalLogin,
    showSyncModeModal,
    closeSyncModal,
    selectSyncMode,
    cancelSyncMode,
    handleRemoteStep1,
    handleRemoteBack,
    handleRemoteConnect,
    switchRemoteModalStep,
    showRemoteOverwriteModal,
    closeRemoteOverwriteModal,
    selectRemoteOverwriteMode,
    handleRemoteOverwriteConnect,
} = syncFeature;

// Sync feature implementation moved to features/sync.ts.
async function handleRemoveList(listId, event) {
    event.stopPropagation();
    if (!(await showSelect('删除歌单', '确定要删除歌单吗？', { danger: true }))) return;

    // 公开歌单需要管理员权限
    if (!(await requireAdminForOpenWrite('删除公开歌单'))) return;

    if (currentListData) {
        const index = currentListData.userList.findIndex(l => l.id === listId);
        if (index >= 0) {
            currentListData.userList.splice(index, 1);
            try {
                await pushDataChange();
                renderMyLists(currentListData);
            } catch (e) {
                showError('删除同步失败');
            }
        }
    }
}

function getFavoriteSidebarOrder() {
    return Array.isArray(settings.favoriteSidebarOrder) ? settings.favoriteSidebarOrder : [];
}

function getOrderedFavoriteSidebarItems(items) {
    const order = getFavoriteSidebarOrder();
    if (!order.length) return items;

    const itemMap = new Map(items.map(item => [item.id, item]));
    const orderedItems = [];
    order.forEach(id => {
        const item = itemMap.get(id);
        if (!item) return;
        orderedItems.push(item);
        itemMap.delete(id);
    });
    return [...orderedItems, ...itemMap.values()];
}

function persistFavoriteSidebarOrder(ids) {
    settings.favoriteSidebarOrder = ids;
    window.settings = settings;
    try {
        persistSettings();
    } catch (e) {
        console.error('[Settings] 保存收藏侧边栏排序失败:', e);
    }
    if (settings.saveAccountSettingsToFile) {
        pushSettingsToServer();
    }
}

async function persistUserListOrderFromSidebar(ids) {
    if (!currentListData || !Array.isArray(currentListData.userList)) return;

    const currentUserIds = currentListData.userList.map(list => list.id);
    const userOrder = ids.filter(id => currentUserIds.includes(id));
    if (userOrder.length !== currentUserIds.length) return;
    if (userOrder.every((id, index) => id === currentUserIds[index])) return;

    const listMap = new Map(currentListData.userList.map(list => [list.id, list]));
    currentListData.userList = userOrder.map(id => listMap.get(id)).filter(Boolean);
    try {
        await pushDataChange();
    } catch (e) {
        console.error('[Playlist] 保存歌单排序失败:', e);
        showError('保存歌单排序失败，请稍后重试');
    }
}

function initFavoriteSidebarSortable(container) {
    if (typeof Sortable === 'undefined' || !container) return;

    try {
        const oldSortable = Sortable.get(container);
        if (oldSortable) oldSortable.destroy();
    } catch (e) {
        console.warn('[Playlist] 重置侧边栏排序失败:', e);
    }

    Sortable.create(container, {
        animation: 150,
        handle: '.favorite-sidebar-drag-handle',
        ghostClass: 'opacity-50',
        chosenClass: 'bg-emerald-50',
        onEnd: () => {
            const ids = Array.from(container.querySelectorAll('[data-sidebar-sort-id]'))
                .map(el => el.getAttribute('data-sidebar-sort-id'))
                .filter(Boolean);
            persistFavoriteSidebarOrder(ids);
            persistUserListOrderFromSidebar(ids);
        }
    });
}

function renderMyLists(data) {
    const container = document.getElementById('my-lists-container');
    container.innerHTML = '';

    if (!data) {
        container.innerHTML = '<div class="px-6 py-2 text-sm t-text-muted">请先在设置中登录</div>';
        refreshFavoritesChildrenHeight();
        return;
    }

    // Helper to create list item
    const createItem = (listObj, name, icon, count) => {
        const id = typeof listObj === 'string' ? listObj : listObj.id;
        const idValue = String(id ?? '');
        const idArg = safeInlineString(idValue);
        const displayName = String(name || '未命名歌单');
        const div = document.createElement('div');
        div.className = "px-6 py-2 text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group transition-colors overflow-hidden";
        div.setAttribute('data-sidebar-list-id', idValue);
        div.setAttribute('data-sidebar-sort-id', idValue);
        const activateList = () => handleListClick(idValue);
        div.onclick = activateList;
        makeKeyboardActivatable(div, `打开歌单 ${displayName}`, activateList);

        // Use createMarqueeHtml for list name
        const nameHtml = displayName.length > 8
            ? createMarqueeHtml(displayName, 'flex-1')
            : `<span class="ml-2 flex-1 truncate">${escapeHtmlText(displayName)}</span>`;

        // Buttons logic (for collected external playlists)
        const showExternalOps = listObj && listObj.sourceListId && listObj.source;
        let opsHtml = '';
        if (showExternalOps) {
            const updateBadge = window.networkListUpdateMap && window.networkListUpdateMap.has(id)
                ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold mr-2" title="歌单有更新">!</span>`
                : '';
            opsHtml = `
                <button type="button" class="refresh-btn bg-transparent border-0 p-0 text-gray-400 hover:text-emerald-500 hidden group-hover:block flex-shrink-0 text-[10px] mr-2 transition-all active:rotate-180"
                   title="更新歌单内容" aria-label="更新歌单内容"
                   onclick="event.stopPropagation(); handleRefreshList(${idArg}, event)"><i class="fas fa-sync-alt" aria-hidden="true"></i></button>
                <button type="button" class="jump-btn bg-transparent border-0 p-0 text-gray-400 hover:text-emerald-500 hidden group-hover:block flex-shrink-0 text-[10px] mr-2 transition-all"
                   title="打开原始歌单" aria-label="打开原始歌单"
                   onclick="event.stopPropagation(); handleJumpToOriginalList(${idArg}, event)"><i class="fas fa-external-link-alt" aria-hidden="true"></i></button>
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
            ${typeof listObj !== 'string' ? `<button type="button" class="text-gray-300 hover:text-emerald-500 flex-shrink-0 mr-2 transition-colors" title="重命名歌单" aria-label="重命名歌单" onclick="event.stopPropagation(); handleRenameList(${idArg}, event)"><i class="fas fa-pen text-[10px]" aria-hidden="true"></i></button>` : ''}
            ${idValue !== 'default' && idValue !== 'love' ? `<button type="button" class="bg-transparent border-0 p-0 text-gray-300 hover:text-red-500 hidden group-hover:block flex-shrink-0" title="删除歌单" aria-label="删除歌单" onclick="event.stopPropagation(); handleRemoveList(${idArg}, event)"><i class="fas fa-trash" aria-hidden="true"></i></button>` : ''}
        `;
        return div;
    };

    // ---- 常驻：收藏歌手 / 收藏专辑 ----
    const createLibItem = (id, name, icon, countId, clickFn) => {
        const div = document.createElement('div');
        div.className = "px-6 py-2 text-sm t-text-muted hover:t-bg-main cursor-pointer flex items-center group transition-colors overflow-hidden";
        div.setAttribute('data-sidebar-list-id', id);
        div.setAttribute('data-sidebar-sort-id', id);
        div.onclick = clickFn;
        makeKeyboardActivatable(div, `打开${name}`, clickFn);
        div.innerHTML = `
            <span class="favorite-sidebar-drag-handle cursor-grab t-text-muted/60 hover:text-emerald-500 mr-2 flex-shrink-0 touch-none" title="拖拽排序">
                <i class="fas fa-grip-vertical text-xs"></i>
            </span>
            <i class="fas ${icon} w-5 t-text-muted group-hover:text-emerald-500 transition-colors flex-shrink-0"></i>
             <span class="ml-2 flex-1 truncate">${escapeHtmlText(name)}</span>
            <span id="${countId}" class="text-xs text-gray-300 group-hover:t-text-muted mr-2 flex-shrink-0">0</span>
        `;
        return div;
    };
    const sidebarItems = [];

    // [新增] 当开启了 enablePublicFavorites 且已登录账号时，在侧边栏第一行添加“公开收藏”
    const enablePublicFavorites = !!window.lx_config?.['user.enablePublicFavorites'];
    const isUserLoggedIn = typeof window.isUserLoggedIn === 'function' ? window.isUserLoggedIn() : false;

    if (enablePublicFavorites && isUserLoggedIn) {
        const isPublicActive = window.isViewingPublicFavorites === true;
        const publicFavItem = document.createElement('div');
        publicFavItem.className = `px-6 py-2 text-sm cursor-pointer flex items-center group transition-colors overflow-hidden ${isPublicActive ? 'text-emerald-500 font-bold bg-emerald-500/10' : 't-text-muted hover:t-bg-main'}`;
        publicFavItem.setAttribute('data-sidebar-list-id', '__public_favorites__');
        publicFavItem.setAttribute('data-sidebar-sort-id', '__public_favorites__');
        const activatePublicFavorites = () => handleTogglePublicFavorites();
        publicFavItem.onclick = activatePublicFavorites;
        makeKeyboardActivatable(publicFavItem, '切换公开收藏', activatePublicFavorites);
        publicFavItem.innerHTML = `
            <span class="favorite-sidebar-drag-handle cursor-grab t-text-muted/60 hover:text-emerald-500 mr-2 flex-shrink-0 touch-none" title="拖拽排序">
                <i class="fas fa-grip-vertical text-xs"></i>
            </span>
            <i class="fas fa-globe w-5 ${isPublicActive ? 'text-emerald-500' : 't-text-muted group-hover:text-emerald-500'} transition-colors flex-shrink-0"></i>
            <span class="ml-2 flex-1 truncate">公开收藏</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isPublicActive ? 'bg-emerald-500 text-white font-bold' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}">${isPublicActive ? '已开启' : '切换'}</span>
        `;
        sidebarItems.push({ id: '__public_favorites__', type: 'system', el: publicFavItem });
    }

    sidebarItems.push(
        { id: '__lib_artists__', type: 'lib', el: createLibItem('__lib_artists__', '收藏歌手', 'fa-user', 'lib-artist-count', handleArtistLibraryClick) },
        { id: '__lib_albums__', type: 'lib', el: createLibItem('__lib_albums__', '收藏专辑', 'fa-compact-disc', 'lib-album-count', handleAlbumLibraryClick) }
    );

    if (data.defaultList) {
        sidebarItems.push({ id: 'default', type: 'system', el: createItem('default', '默认列表', 'fa-list', data.defaultList.length) });
    }
    if (data.loveList) {
        sidebarItems.push({ id: 'love', type: 'system', el: createItem('love', '我的收藏', 'fa-heart', data.loveList.length) });
    }
    if (data.userList) {
        data.userList.forEach(l => {
            const listLen = l.list ? l.list.length : 0;
            sidebarItems.push({ id: l.id, type: 'user', el: createItem(l, l.name, 'fa-music', listLen) });
        });
    }

    getOrderedFavoriteSidebarItems(sidebarItems).forEach(item => container.appendChild(item.el));
    refreshLibrarySidebarCount();
    initFavoriteSidebarSortable(container);
    refreshFavoritesChildrenHeight();
}

function handleListClick(listId, skipAutoUpdate = false) {
    exitListSecondaryModes();

    if (!currentListData) return;

    if (!skipAutoUpdate) {
        // Selections belong to the previously rendered list. Keeping them here makes
        // the toolbar count include invisible songs after opening another favorite list.
        window.selectedItems?.clear();
        window.selectedSongObjects?.clear();
        if (typeof updateBatchToolbar === 'function') updateBatchToolbar();
    }

    // Mobile: Close sidebar when a list is selected
    if (window.innerWidth < 1025) {
        const sidebar = document.getElementById('main-sidebar');
        // If sidebar is open (class removed), close it
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            toggleSidebar();
        }
    }

    // Set current viewing list ID for batch operations
    window.currentViewingListId = listId;
    setCurrentSearchScope('local_list');

    let list = [];
    let title = '';

    if (listId === 'default') {
        list = currentListData.defaultList;
        title = '默认列表';
    } else if (listId === 'love') {
        list = currentListData.loveList;
        title = '我的收藏';
    } else {
        const uList = currentListData.userList.find(l => l.id === listId);
        if (uList) {
            list = uList.list;
            title = uList.name;
        }
    }

    // Switch to Search View (as List View)
    // Manually handle tab switch to avoid 'network' reset
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    const activeView = document.getElementById('view-search');
    activeView.classList.remove('hidden');

    // [New] 为歌单搜索视图重新初始化 ListSearch
    initGlobalListSearch();

    setTimeout(() => {
        activeView.classList.remove('opacity-0');
        activeView.classList.add('opacity-100');
    }, 10);

    // UI Updates
    document.getElementById('page-title').innerText = title;
    document.getElementById('search-input').value = '';
    document.getElementById('search-input').placeholder = `在 ${title} 中搜索...`;

    // Set Scope
    setCurrentSearchScope('local_list');
    document.getElementById('search-source').classList.add('hidden'); // Hide selector
    document.getElementById('search-type').classList.add('hidden');

    // Reset all tabs to muted, then highlight Favorites as the parent
    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.remove('active-tab', 'text-emerald-600');
        el.classList.add('t-text-muted');
    });
    const favTab = document.getElementById('tab-favorites');
    if (favTab) {
        favTab.classList.add('active-tab');
        favTab.classList.remove('t-text-muted');
    }

    // Highlight Child List
    document.querySelectorAll('[data-sidebar-list-id]').forEach(el => {
        el.classList.remove('active-sub-item');
        el.classList.add('t-text-muted');
    });
    const subItem = document.querySelector(`[data-sidebar-list-id="${listId}"]`);
    if (subItem) {
        subItem.classList.add('active-sub-item');
        subItem.classList.remove('t-text-muted');
    }

    // Render
    currentPage = 1; // Reset pagination
    renderResults(list);

    // [New] Auto Update Logic: If it's a network playlist (has sourceListId) and setting is ON, refresh background
    const uList = currentListData.userList ? currentListData.userList.find(l => l.id === listId) : null;
    if (!skipAutoUpdate && settings.autoUpdateNetworkList && uList && uList.sourceListId && uList.source) {
        console.log('[AutoUpdate] Triggering background refresh for list:', listId);
        handleRefreshList(listId, null, true); // true means silent/no-confirm
    }
}

function handleFavoritesClick() {
    exitListSecondaryModes();

    // Highlight Header
    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.remove('active-tab', 'text-emerald-600');
        el.classList.add('t-text-muted');
    });
    const favTab = document.getElementById('tab-favorites');
    if (favTab) {
        favTab.classList.add('active-tab');
        favTab.classList.remove('t-text-muted');
    }

    toggleFavorites();
}

async function handleCreateList() {
    const name = await showInput("新建歌单", "请输入新歌单的名称：", {
        placeholder: "歌单名称"
    });

    if (name && currentListData) {
        const activeListData = (window.isViewingPublicFavorites && window.myPersonalListData) ? window.myPersonalListData : currentListData;

        // 公开列表新建歌单需要管理员权限
        if (activeListData.username === '_open') {
            if (!(await requireAdminForOpenWrite('公开列表中新建歌单'))) return;
        }
        const newList = {
            id: 'webplayer_' + Date.now(),
            name: name,
            source: 'webplayer',
            list: []
        };
        activeListData.userList.push(newList);
        // Sync
        try {
            await pushDataChange(activeListData);
            renderMyLists(currentListData);
            // Re-render the add modal grid if it is open (or just to keep it fresh)
            if (typeof renderPlaylistAddGrid === 'function') {
                renderPlaylistAddGrid();
            }
            showSuccess('歌单创建成功');
        } catch (e) {
            console.error('Create list failed:', e);
            showError('创建失败，请重试');
        }
    }
}

async function handleRenameList(listId, event) {
    if (event) event.stopPropagation();
    if (!currentListData?.userList) return;

    const list = currentListData.userList.find(item => item.id === listId);
    if (!list) {
        showError('未找到要重命名的歌单');
        return;
    }

    const input = await showInput('重命名歌单', '请输入新的歌单名称：', {
        placeholder: '歌单名称',
        defaultValue: list.name || ''
    });
    if (input === null || input === undefined) return;

    const nextName = String(input).trim();
    if (!nextName) {
        showError('歌单名称不能为空');
        return;
    }
    if (nextName === list.name) return;

    if (!(await requireAdminForOpenWrite('重命名公开歌单'))) return;

    list.name = nextName;
    try {
        await pushDataChange();
        renderMyLists(currentListData);

        if (typeof renderPlaylistAddGrid === 'function' && !document.getElementById('playlist-add-modal')?.classList.contains('hidden')) {
            renderPlaylistAddGrid();
        }
        if (isCurrentlyViewingLocalList(listId)) {
            handleListClick(listId, true);
        }
        showSuccess('歌单名称已更新');
    } catch (e) {
        console.error('Rename list failed:', e);
        showError('重命名失败，请重试');
    }
}

function formatSongToLxMusicStandard(item) {
    if (!item) return item;
    const s = JSON.parse(JSON.stringify(item));

    // 获取封面地址 (兼容各种 SDK 原始字段和 meta 字段)
    const picUrl = s.img || s.pic || s.picUrl ||
        (s.meta && (s.meta.picUrl || s.meta.img || s.meta.pic)) ||
        (s.album && (s.album.picUrl || s.album.img)) ||
        (s.al && s.al.picUrl) || null;

    // 如果已经包含合法的 meta 且有 songId，且 ID 符合规范，可能是已格式化的
    if (s.meta && s.meta.songId && s.id && (String(s.id).includes('_') || s.source === 'mg')) {
        // 确保 picUrl 存在
        if (!s.meta.picUrl && picUrl) s.meta.picUrl = picUrl;
        return s;
    }

    const source = s.source || '';
    const songmid = s.songmid || s.id || '';

    // 1. 提取核心元数据
    const albumName = s.albumName ||
        (s.album && s.album.name) ||
        (s.al && s.al.name) ||
        (s.meta && s.meta.albumName) || '';

    const albumId = s.albumId ||
        (s.album && s.album.id) ||
        (s.al && s.al.id) ||
        (s.meta && s.meta.albumId) || null;

    // 2. 构造干净的 meta 对象（只保留标准字段）
    let meta = {
        songId: String(songmid),
        songmid: String(songmid),
        albumName: albumName,
        picUrl: picUrl,
        qualitys: s.qualitys || s.types || (s.meta && (s.meta.qualitys || s.meta.types)) || [],
        _qualitys: s._qualitys || s._types || (s.meta && (s.meta._qualitys || s.meta._types)) || {}
    };

    if (albumId) meta.albumId = String(albumId);

    // 3. 构造标准 root 对象
    const rootItem = {
        name: s.name || '',
        singer: s.singer || '',
        source: source,
        interval: s.interval || s.time || '',
        meta: meta
    };

    // 4. 针对各平台源的特殊 ID 处理
    switch (source) {
        case 'tx':
            if (s.strMediaMid || (s.meta && s.meta.strMediaMid))
                meta.strMediaMid = s.strMediaMid || s.meta.strMediaMid;
            if (s.albumMid || (s.meta && s.meta.albumMid))
                meta.albumMid = s.albumMid || s.meta.albumMid;
            if (s.songId || (s.meta && s.meta.songId))
                meta.songId = String(s.songId || s.meta.songId);
            rootItem.id = `tx_${songmid}`;
            break;
        case 'wy':
            rootItem.id = `wy_${songmid}`;
            break;
        case 'kg':
            let hash = s.hash || (s.meta && s.meta.hash) || '';
            if (!hash && String(songmid).includes('_')) {
                hash = String(songmid).split('_')[1];
            } else if (!hash && String(songmid).length === 32) {
                hash = songmid;
            }

            let kgSongId = s.songId || (s.meta && s.meta.songId) || (String(songmid).includes('_') ? String(songmid).split('_')[0] : songmid);
            if (kgSongId === hash) kgSongId = '';

            meta.songId = String(kgSongId || '');
            meta.hash = hash;

            if (kgSongId && hash) {
                rootItem.id = `${kgSongId}_${hash}`;
            } else if (hash) {
                rootItem.id = hash;
            } else {
                rootItem.id = `kg_${kgSongId}`;
            }
            break;
        case 'mg':
            if (s.copyrightId || (s.meta && s.meta.copyrightId))
                meta.copyrightId = s.copyrightId || s.meta.copyrightId;
            if (s.lrcUrl || (s.meta && s.meta.lrcUrl))
                meta.lrcUrl = s.lrcUrl || s.meta.lrcUrl;
            rootItem.id = String(songmid);
            break;
        case 'kw':
            rootItem.id = `kw_${songmid}`;
            break;
        default:
            rootItem.id = songmid;
            break;
    }

    return rootItem;
}

function collectCurrentSongList() {
    const activeListData = isUserLoggedIn() ? (window.myPersonalListData || currentListData) : currentListData;
    if (!activeListData || typeof window.SongListManager === 'undefined') return;
    const detail = window.SongListManager.getCurrentDetail();
    if (!detail || !detail.id || !detail.list || detail.list.length === 0) {
        if (window.showToast) window.showToast('error', '歌单数据不完整或为空');
        return;
    }

    if (!isUserLoggedIn() && activeListData.username === '_open') {
        requireAdminForOpenWrite('收藏歌单到公开列表').then(ok => {
            if (ok) _executeCollectSongList(activeListData, detail);
        });
        return;
    }

    _executeCollectSongList(activeListData, detail);
}

function _executeCollectSongList(activeListData, detail) {
    const existingIndex = activeListData.userList.findIndex(l => String(l.sourceListId) === String(detail.id) && l.source === detail.source);
    if (existingIndex >= 0) {
        if (window.showToast) window.showToast('info', '该歌单已在您的收藏中');
        return;
    }

    const randomHex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    const newId = `${detail.source}_${randomHex()}${randomHex()}${randomHex()}${randomHex()}`;

    const listWithSource = detail.list.map(s => {
        const item = formatSongToLxMusicStandard(s);
        if (!item.source) item.source = detail.source;
        return item;
    });

    const newList = {
        id: newId,
        name: detail.info.name || '未命名歌单',
        source: detail.source,
        sourceListId: String(detail.id),
        Album: detail.info.img || detail.info.pic || null,
        locationUpdateTime: null,
        list: listWithSource
    };

    activeListData.userList.push(newList);

    pushDataChange(activeListData).then(() => {
        renderMyLists(currentListData);
        if (window.showToast) window.showToast('success', '歌单收藏成功！');
    }).catch(err => {
        console.error('收藏失败:', err);
        if (window.showToast) window.showToast('error', '收藏失败，请重试');
    });
}

async function toggleLove() {
    const activeListData = isUserLoggedIn() ? (window.myPersonalListData || currentListData) : currentListData;
    if (!activeListData || currentIndex < 0) return;

    if (!isUserLoggedIn() && activeListData.username === '_open') {
        if (!(await requireAdminForOpenWrite('收藏歌曲到公开列表'))) return;
    }

    const song = currentPlaylist[currentIndex];
    const formattedSong = formatSongToLxMusicStandard(song);
    let targetId = formattedSong.id || song.id;

    const index = activeListData.loveList.findIndex(s => s.id === targetId || s.id === song.id);
    if (index >= 0) {
        activeListData.loveList.splice(index, 1);
    } else {
        activeListData.loveList.push(formattedSong);
    }

    updatePlayerInfo(song);
    await pushDataChange(activeListData);
}

async function handleRefreshList(listId, event, silent = false) {
    if (event) event.stopPropagation();
    if (!currentListData) return;

    const list = currentListData.userList.find(l => l.id === listId);
    if (!list || !list.sourceListId || !list.source) {
        if (!silent && window.showToast) window.showToast('info', '该歌单不支持在线刷新');
        return;
    }

    if (!silent) {
        const safeListName = escapeHtmlText(list.name || list.id || list.sourceListId || '');
        const confirmed = await showSelect('更新歌单', `是否更新当前歌单 "${safeListName}"？\n(确认后将重新从服务器拉取歌单并覆盖当前内容)`, {
            confirmText: '确定更新',
            confirmColor: 'bg-emerald-500'
        });

        if (!confirmed) return;
    }

    if (window.showToast) window.showToast('info', '正在同步最新歌单内容...');

    try {
        const url = `${API_BASE}/songList/detail?source=${encodeURIComponent(list.source)}&id=${encodeURIComponent(list.sourceListId)}&page=1`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data || !data.list) throw new Error('数据拉取失败');

        // 格式化新歌曲列表
        const newList = data.list.map(s => {
            const item = formatSongToLxMusicStandard(s);
            if (!item.source) item.source = list.source;
            return item;
        });

        // 更新列表模型
        list.list = newList;
        if (data.info) {
            if (data.info.name) list.name = data.info.name;
            if (data.info.img || data.info.pic) list.Album = data.info.img || data.info.pic;
        }

        // 清除该列表的更新标记
        if (window.networkListUpdateMap) {
            window.networkListUpdateMap.delete(listId);
        }

        // 推送同步并重绘 UI
        await pushDataChange();
        renderMyLists(currentListData);

        // 如果当前正处于该列表视图，刷新结果列表显示
        if (isCurrentlyViewingLocalList(listId)) {
            handleListClick(listId, true); // Skip auto-update to avoid loop
        }

        if (window.showToast) window.showToast('success', '歌单内容已同步至最新状态');
    } catch (e) {
        console.error('[Refresh] Failed:', e);
        if (window.showToast) window.showToast('error', '歌单同步失败: ' + e.message);
    }
}

async function handleJumpToOriginalList(listId, event) {
    if (event) event.stopPropagation();
    if (!currentListData) return;

    const list = currentListData.userList.find(l => l.id === listId);
    if (!list || !list.sourceListId || !list.source) {
        if (window.showToast) window.showToast('info', '该歌单不支持跳转到原始页');
        return;
    }

    // 1. Switch Tab to songlist
    switchTab('songlist');

    // 2. Adjust SongListManager source select if available
    const sourceSelect = document.getElementById('songlist-source');
    if (sourceSelect) {
        sourceSelect.value = list.source;
    }

    // 3. Open Detail view via SongListManager
    if (window.SongListManager && window.SongListManager.openDetail) {
        window.SongListManager.openDetail(list.sourceListId, list.source);
    }
}


// Auto-restore on page load
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Load settings first
    loadSettings();

    // Checkbox State
    const pubToggle = document.getElementById('toggle-public-sources');
    if (pubToggle) {
        pubToggle.checked = settings.enablePublicSources !== false;
    }

    // Update UI to match settings
    const selectEl = document.getElementById('items-per-page-select');
    if (selectEl && settings.itemsPerPage) {
        selectEl.value = settings.itemsPerPage.toString();
    }

    // [新增] 恢复音量设置
    try {
        const savedVolume = localStorage.getItem('lx_volume');
        if (savedVolume) {
            currentVolume = parseFloat(savedVolume);
            audio.volume = currentVolume;
            updateVolumeUI();
            console.log('[Volume] 已恢复音量设置:', currentVolume);
        }
    } catch (e) {
        console.error('[Volume] 恢复音量设置失败:', e);
    }

    // [新增] 恢复播放模式设置
    try {
        const savedMode = localStorage.getItem('lx_play_mode');
        if (savedMode && ['list', 'single', 'random', 'order'].includes(savedMode)) {
            playMode = savedMode;
            updatePlayModeUI();
            console.log('[PlayMode] 已恢复播放模式:', playMode);
        } else {
            // 默认模式
            updatePlayModeUI();
        }
    } catch (e) {
        console.error('[PlayMode] 恢复播放模式失败:', e);
    }

    // 1. Restore cached list data (from IndexedDB) for logged in user only
    try {
        const cachedList = await window.ListStore.get();
        if (cachedList && isUserLoggedIn()) {
            currentListData = cachedList;
            const savedUser = localStorage.getItem('lx_sync_user');
            if (savedUser && currentListData) {
                currentListData.username = savedUser;
            }
            window.myPersonalListData = currentListData;
            renderMyLists(currentListData);
            console.log('[Cache] 已恢复缓存的个人列表数据');
        }
    } catch (e) {
        console.error('[Cache] 恢复列表数据失败:', e);
    }

    // [New] Switch to the user's default entry tab on load
    const defaultTab = settings.defaultEntry || 'favorites';
    switchTab(defaultTab);

    // 2. Auto-reconnect or auto-login
    const syncMode = localStorage.getItem('lx_sync_mode');

    if (syncMode === 'local') {
        // Local mode: auto-login
        const user = localStorage.getItem('lx_sync_user');
        const pass = getCredential('lx_sync_pass');
        if (user && pass) {
            document.getElementById('sync-local-user').value = user;
            document.getElementById('sync-local-pass').value = pass;
            console.log('[Cache] 自动登录本地账号:', user);
            handleLocalLogin();
        }
    } else if (syncMode === 'remote') {
        // Remote mode: auto-reconnect
        const url = localStorage.getItem('lx_sync_url');
        const code = getCredential('lx_sync_code');
        const authStr = getCredential('lx_ws_auth');

        if (url && code) {
            document.getElementById('sync-remote-url').value = url;
            document.getElementById('sync-remote-code').value = code;

            // Check if we have saved authInfo
            if (authStr) {
                try {
                    const authInfo = JSON.parse(authStr);
                    console.log('[Cache] 使用缓存的认证信息自动重连...');

                    // Pre-populate authInfo in client
                    syncManager.initRemote(url, code, {
                        getData: async () => {
                            const cachedData = await window.ListStore.get().catch(() => null);
                            return cachedData || { defaultList: [], loveList: [], userList: [] };
                        },
                        setData: async (data) => {
                            await window.ListStore.set(data).catch(e => console.error('[IDBStore] 保存失败:', e));
                            const oldUsername = currentListData ? currentListData.username : null;
                            currentListData = data;
                            if (oldUsername) currentListData.username = oldUsername; // Preserve username

                            renderMyLists(data);
                            document.getElementById('sync-status').innerHTML = '<i class="fas fa-check-circle text-blue-500"></i> 数据已同步';
                        },
                        getSyncMode: async () => {
                            return new Promise((resolve) => {
                                syncModeResolve = resolve;
                                showSyncModeModal();
                            });
                        }
                    });

                    syncManager.client.authInfo = authInfo; // Reuse saved auth
                    syncManager.client.onLogin = (success) => {
                        if (success) {
                            console.log('[Cache] 自动重连成功');
                            updateSyncStatus('<i class="fas fa-check-circle text-green-500"></i> 已自动重连');
                        } else {
                            console.log('[Cache] 自动重连失败,需要手动重新配对');
                            credentialStorage.removeItem('lx_ws_auth'); // Clear invalid auth
                        }
                    };
                    syncManager.client.connect();
                } catch (e) {
                    console.error('[Cache] 自动重连失败:', e);
                }
            } else {
                console.log('[Cache] 无缓存认证信息,请手动连接');
            }
        }
    }
});

window.switchSyncMode = switchSyncMode;
window.handleLocalLogin = handleLocalLogin;
window.handleSyncLogout = handleSyncLogout;
window.resetAllSettings = resetAllSettings;

// Helper to Push Changes to Remote
async function pushDataChange(customListData) {
    const listToSave = customListData || currentListData;
    if (!listToSave) return;

    // 1. 优先同步保存到客户端 IndexedDB 本地缓存
    await window.ListStore.set(listToSave).catch(e => console.error('[IDBStore] 保存失败:', e));

    const isUserLoggedIn = !!userToken && localStorage.getItem('lx_sync_mode') === 'local';
    const isPublicList = listToSave.username === '_open' || listToSave.username === 'default';

    // 2. 如果是公开/未登录用户且开启了公开收藏开关
    if (isPublicList && window.lx_config?.['user.enablePublicFavorites']) {
        const isAdmin = !!getCredential('lx_admin_password');
        if (isAdmin) {
            try {
                const res = await fetch('/api/user/list?user=_open', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getUserAuthHeaders()
                    },
                    body: JSON.stringify(listToSave)
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('[PublicList] 推送保存公共歌单失败:', errorText);
                    showError('保存公共歌单失败: ' + errorText);
                    return;
                }
                console.log('[PublicList] 公共歌单成功保存至服务器');
            } catch (e) {
                console.error('[PublicList] 推送公共歌单网络异常:', e);
            }
        }
        return;
    }

    // 3. 登录普通用户的 SyncManager 推送逻辑
    try {
        if (window.SyncManager && window.SyncManager.client) {
            await window.SyncManager.push(listToSave);
            console.log('Data Pushed to Remote');
        } else {
            // 本地无同步模式：调用 REST API 推送给当前用户
            const headers = getUserAuthHeaders();
            if (headers['x-user-name'] === '_open') {
                const syncUser = localStorage.getItem('lx_sync_user');
                if (syncUser) headers['x-user-name'] = syncUser;
                else delete headers['x-user-name'];
            }
            const res = await fetch('/api/user/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(listToSave)
            });
            if (!res.ok) throw new Error(await res.text());
        }
    } catch (e) {
        console.error('Push Failed', e);
    }
}

async function refreshUserListData() {
    if (!window.SyncManager) return;
    try {
        const listData = await window.SyncManager.sync();
        window.currentListData = listData;
        if (listData && listData.username !== '_open') {
            window.myPersonalListData = listData;
        }
        if (typeof renderMyLists === 'function') {
            renderMyLists(listData);
        }

        // If currently viewing a local list, refresh its contents in main view
        if (isCurrentlyViewingLocalList(window.currentViewingListId)) {
            console.log('[Sync] Auto-refreshing current list view:', window.currentViewingListId);
            handleListClick(window.currentViewingListId, true); // true to skip background auto-update
        }

        // Save to cache
        await window.ListStore.set(listData).catch(e => console.error('[IDBStore] 保存失败:', e));
        console.log('[Sync] List Data Refreshed');
    } catch (e) {
        console.error('[Sync] Failed to refresh list data:', e);
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


// ========================================
// 导出函数到 window (ES Module 需要显式暴露)
// ========================================

// Custom Source functions
window.openCustomSourceModal = openCustomSourceModal;
window.closeCustomSourceModal = closeCustomSourceModal;
window.switchCustomSourceMode = switchCustomSourceMode;
window.handleFileUpload = handleFileUpload;
window.handleUrlImport = handleUrlImport;

// Playlist Modal functions
window.openPlaylistAddModal = openPlaylistAddModal;
window.closePlaylistAddModal = closePlaylistAddModal;
window.toggleSongInList = toggleSongInList;


// 新版函数名
window.toggleSource = toggleSource;
window.deleteSource = deleteSource;
window.reloadSource = reloadSource;

// 兼容旧版函数名 (Alias)
window.toggleCustomSource = toggleSource;
window.deleteCustomSource = deleteSource;
window.importFromUrl = handleUrlImport;

window.togglePublicSourcesSetting = togglePublicSourcesSetting;

// Core functions
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

// Volume
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.setPlayMode = setPlayMode;
window.showSelect = showSelect;
window.showSuccess = showSuccess;
window.showInfo = showInfo;
window.showError = showError;

// Lyrics
window.toggleLyrics = toggleLyrics;

// Favorites & Lists
window.toggleFavorites = toggleFavorites;
window.handleFavoritesClick = handleFavoritesClick;
window.handleListClick = handleListClick;
window.handleCreateList = handleCreateList;
window.handleRefreshList = handleRefreshList;
window.handleJumpToOriginalList = handleJumpToOriginalList;
window.handleRemoveList = handleRemoveList;
window.toggleLove = toggleLove;

// Sync functions
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

// Comment functions
window.toggleCommentModal = toggleCommentModal;
window.switchCommentType = switchCommentType;
window.refreshComments = refreshComments;
window.fetchComments = fetchComments;
window.checkServerCache = checkServerCache;


// [Redundant block removed]

// ========================================
// UI Helper Functions (Toast Notifications)
// ========================================

/**
 * 播放栏下载/缓存按钮点击处理
 */
async function handleDownloadClick(event) {
    if (event) event.stopPropagation();

    if (!currentPlayingSong) {
        showInfo('当前没有正在播放的歌曲');
        return;
    }

    if (typeof downloadSong === 'function') {
        await downloadSong(currentPlayingSong);
    } else {
        showError('下载功能未就绪');
    }
}

// 监听窗口大小变化
window.addEventListener('resize', () => {
    const indicator = document.getElementById('lyric-scroll-indicator');
    if (indicator) {
        indicator.dataset.positioned = '';
    }
});

// ========== 页面初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] 页面加载完成');

    // 预加载自定义源数据，确保设置界面和模态框打开时有数据
    loadCustomSources();

    // [优化] 此处不再立即调用 showInitialSearchState()，移至下方的 setTimeout 中

    // [Fix] Listen to scroll event for real-time highlighting
    const lyricContainer = document.getElementById('lyric-container');
    if (lyricContainer) {
        // Core user interaction detection
        // 只有当用户真的 "摸" 了或者是 "滑" 了，才认为是用户滚动
        // 纯 scroll 事件会被 scrollTo 触发，所以不能仅依赖 scroll 事件来 *启动* 手动模式
        const setUserInteracting = () => {
            // 强制清除程序滚动标记，因为用户干预了
            isProgrammaticScroll = false;
            if (window.programmaticScrollTimer) {
                clearTimeout(window.programmaticScrollTimer);
                window.programmaticScrollTimer = null;
            }
        };

        lyricContainer.addEventListener('mousedown', setUserInteracting, { passive: true });
        lyricContainer.addEventListener('touchstart', setUserInteracting, { passive: true });
        lyricContainer.addEventListener('touchmove', setUserInteracting, { passive: true });
        lyricContainer.addEventListener('wheel', setUserInteracting, { passive: true });
        lyricContainer.addEventListener('keydown', setUserInteracting, { passive: true }); // Keyboard arrow keys

        // 使用 passive: true 提高滚动性能
        lyricContainer.addEventListener('scroll', handleLyricScroll, { passive: true });
    }

    // 绑定音质选择
    const qualitySelect = document.getElementById('quality-select');
    if (qualitySelect && settings.preferredQuality) {
        qualitySelect.value = settings.preferredQuality;
    }

    const downloadTargetSelect = document.getElementById('setting-default-download-target');
    if (downloadTargetSelect) downloadTargetSelect.value = settings.defaultDownloadTarget;

    const downloadQualitySelect = document.getElementById('setting-default-download-quality');
    if (downloadQualitySelect) downloadQualitySelect.value = settings.defaultDownloadQuality;

    // [优化] 延迟执行非关键初始化逻辑（设置恢复、状态重置、自动登录等）
    // 允许浏览器先完成主要的渲染和 load 事件，释放 PWA 安装按钮并显示刷新图标
    setTimeout(() => {
        console.log('[Init] 启动后台初始化任务...');
        loadSettings();
        restorePlaybackState();

        // [新增] 延迟显示热搜，避免启动请求堆积
        if (typeof showInitialSearchState === 'function') {
            showInitialSearchState();
        }

        // 监听源切换，自动刷新热搜
        const searchSourceSelect = document.getElementById('search-source');
        if (searchSourceSelect) {
            searchSourceSelect.addEventListener('change', () => {
                const searchInput = document.getElementById('search-input');
                // 仅当搜索框为空（即处于显示热搜状态）时刷新
                if (!searchInput || !searchInput.value.trim()) {
                    showInitialSearchState();
                }
            });
        }

        // [Fix] Auto-Login logic (Restore Session)
        const savedMode = localStorage.getItem('lx_sync_mode');
        if (savedMode === 'local') {
            const u = localStorage.getItem('lx_sync_user');
            const p = getCredential('lx_sync_pass');
            if (u && p) {
                // [优化] 如果已经有有效的 Token，不再重复登录
                if (userToken) {
                    console.log('[AutoLogin] 检测到有效 Token，跳过自动登录流程并直接恢复会话。');
                    return;
                }

                console.log('[AutoLogin] 检测到本地账户且无有效 Token，正在自动登录...');
                // Fill UI
                const uInput = document.getElementById('sync-local-user');
                const pInput = document.getElementById('sync-local-pass');
                if (uInput) uInput.value = u;
                if (pInput) pInput.value = p;
                // Trigger login
                handleLocalLogin();
            }
        } else if (savedMode === 'remote') {
            const url = localStorage.getItem('lx_sync_url');
            const code = getCredential('lx_sync_code');
            if (url && code) {
                console.log('[AutoLogin] 检测到远程同步设置，正在自动连接...');
                // Fill UI
                const remoteUrlInput = document.getElementById('sync-remote-url');
                const remoteStep1 = document.getElementById('sync-remote-step1');
                const remoteStep2 = document.getElementById('sync-remote-step2');
                const remoteCodeInput = document.getElementById('sync-remote-code');

                if (remoteUrlInput) remoteUrlInput.value = url;
                if (remoteStep1) remoteStep1.classList.add('hidden');
                if (remoteStep2) remoteStep2.classList.remove('hidden');
                if (remoteCodeInput) remoteCodeInput.value = code;

                // Trigger connect
                handleRemoteConnect();
            }
        }
    }, 100);

    // [New] 全局精简播放栏控制函数
    window.setCompactPlaybar = function (compact, showToastMsg = false) {
        const infoEl = document.getElementById('player-song-info');
        const collapseBtn = document.getElementById('btn-collapse-panel');
        if (!infoEl) return;

        if (compact) {
            infoEl.style.display = 'none';
            if (collapseBtn) collapseBtn.style.display = 'none';
            if (showToastMsg) showToast('info', '已开启精简播放控制栏', 1500);
        } else {
            infoEl.style.display = '';
            if (collapseBtn) collapseBtn.style.display = '';
            if (showToastMsg) showToast('info', '已恢复完整播放栏控制', 1500);
        }

        // 重新计算并应用底栏自适应布局高度 (解决手机端 Footer 高度重叠)
        if (window.musicVisualizer && window.musicVisualizer.applySettings) {
            setTimeout(() => window.musicVisualizer.applySettings(), 50);
        }
    };

    // [New] 长按播放键隐藏播放栏内容 (精简模式)
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
        let pressTimer;
        const infoEl = document.getElementById('player-song-info');

        const startPress = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return; // 仅限左键
            window.playBtnIsLongPress = false;
            pressTimer = setTimeout(() => {
                window.playBtnIsLongPress = true;
                if (navigator.vibrate) navigator.vibrate(50);

                if (infoEl) {
                    const isHidden = infoEl.style.display === 'none';
                    window.setCompactPlaybar(!isHidden, true);
                }
            }, 600); // 600ms = 长按
        };

        const cancelPress = () => {
            if (pressTimer) clearTimeout(pressTimer);
        };

        // 事件绑定
        btnPlay.addEventListener('mousedown', startPress);
        btnPlay.addEventListener('touchstart', startPress, { passive: true });
        btnPlay.addEventListener('mouseup', cancelPress);
        btnPlay.addEventListener('touchend', cancelPress);
        btnPlay.addEventListener('mouseleave', cancelPress);
        btnPlay.addEventListener('touchcancel', cancelPress);
    }
});

// ========================================
// Global Overrides
// ========================================

// Override batch_pagination.js helper to access local currentSearchScope
window.getCurrentActiveListId = function () {
    if (window.currentSearchScope === 'local_list') return window.currentViewingListId;
    if (window.currentSearchScope === 'local_all') return 'love';
    return null;
};



// ========================================
// Mobile Optimization Logic
// ========================================

// Mobile Sidebar Toggle
function toggleSidebar(forceState?: boolean) {
    const sidebar = document.getElementById('main-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    const menuBtn = document.getElementById('mobile-menu-btn');
    if (!sidebar) return;

    const isCurrentlyClosed = sidebar.classList.contains('-translate-x-full');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : isCurrentlyClosed;

    if (shouldOpen) {
        // Open
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        if (backdrop) backdrop.classList.remove('hidden');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
        document.body.classList.add('sidebar-open');
    } else {
        // Close
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('sidebar-open');
    }
}
(window as any).toggleSidebar = toggleSidebar;

// Auto-adjust layout on resize
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('main-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');

    if (sidebar && window.innerWidth >= 1025) {
        // Reset styles for desktop
        sidebar.classList.remove('-translate-x-full', 'translate-x-0');
        if (backdrop) backdrop.classList.add('hidden');
    } else if (sidebar) {
        // Ensure default closed state for mobile if not explicitly open
        if (!sidebar.classList.contains('translate-x-0')) {
            sidebar.classList.add('-translate-x-full');
        }
    }
});

// 切换详情页封面显示（移动端优化）
function toggleDetailCover() {
    const cover = document.getElementById('mobile-player-cover-container');
    const container = document.getElementById('player-detail-container');
    const lyricsWrapper = document.getElementById('lyrics-wrapper');
    const lyricContent = document.getElementById('lyric-content');
    const detailTitle = document.getElementById('detail-title');

    // 获取标题区域父容器
    const titleParent = lyricsWrapper ? lyricsWrapper.querySelector('div:first-child') : null;

    if (!cover || !container) return;

    // 根据 cover 的透明度状态判断当前是否隐藏
    const isHidden = cover.classList.contains('opacity-0');

    if (!isHidden) {
        // --- 隐藏封面 ---
        cover.style.display = 'none'; // 彻底移除渲染占位
        cover.classList.add('opacity-0', 'scale-90', 'border-0');

        // 隐藏封面时，不再需要那么大的 pt-8/md:pt-32。
        // 保留 md:pt-10 左右以避开顶部 Now Playing 即可，让歌词有更多纵向空间
        container.classList.remove('pt-8', 'mt-4', 'md:pt-0', 'md:pt-24');
        container.classList.add('pt-4', 'md:pt-10');

        if (lyricsWrapper) {
            lyricsWrapper.classList.remove('md:w-auto', 'md:max-w-[50%]', 'md:w-[500px]', 'lg:w-[600px]', 'flex-shrink-0');
            lyricsWrapper.classList.add('md:w-2/3', 'mx-auto', 'lyrics-centered');
            // 隐藏封面时允许歌词区域更高
            lyricsWrapper.style.maxHeight = '85vh';
        }

        if (lyricContent) {
            lyricContent.classList.remove('md:items-start', 'md:text-left', 'md:pl-6');
            lyricContent.classList.add('items-center', 'text-center');
        }

        if (titleParent) {
            titleParent.classList.remove('md:text-left', 'md:pl-6');
            titleParent.classList.add('text-center');
        }

        if (detailTitle) {
            detailTitle.classList.remove('md:mx-0');
            detailTitle.classList.add('mx-auto');
        }

        container.classList.add('has-centered-lyrics');

    } else {
        // --- 显示封面 ---
        cover.style.display = 'block'; // 恢复显示
        cover.classList.remove('opacity-0', 'scale-90', 'border-0');

        container.classList.remove('has-centered-lyrics');

        // 恢复当前使用的固定间距
        container.classList.add('gap-4', 'md:gap-20');
        container.classList.remove('pt-8', 'md:pt-32', 'md:pt-10'); // 移除纯歌词专用间距

        // 手机端恢复默认 pt
        if (window.innerWidth < 1025) {
            container.classList.add('pt-8', 'mt-4');
        }


        if (lyricsWrapper) {
            lyricsWrapper.classList.remove('md:w-auto', 'md:max-w-[50%]', 'md:w-2/3', 'mx-auto', 'lyrics-centered');
            // 锁定桌面端宽度，防止长短歌词导致封面抖动
            lyricsWrapper.classList.add('md:w-[500px]', 'lg:w-[600px]', 'flex-shrink-0');
            lyricsWrapper.style.maxHeight = ''; // 恢复默认值
        }

        if (lyricContent) {
            lyricContent.classList.add('items-center', 'md:items-start', 'text-center', 'md:text-left', 'md:pl-6');
        }

        if (titleParent) {
            titleParent.classList.add('text-center', 'md:text-left', 'md:pl-6');
        }

        if (detailTitle) {
            detailTitle.classList.add('md:mx-0');
        }
    }
}
(window as any).toggleDetailCover = toggleDetailCover;

// Initialize mobile gestures & touch interactions
function initMobileGestures() {
    // 1. Sidebar Touch Gestures (Swipe left to close)
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) {
        let touchStartX = 0;
        let touchStartY = 0;
        let isSwiping = false;

        sidebar.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }, { passive: true });

        sidebar.addEventListener('touchmove', (e: TouchEvent) => {
            if (!isSwiping || e.touches.length !== 1) return;
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - touchStartX;
            const diffY = currentY - touchStartY;
            if (diffX < -45 && Math.abs(diffX) > Math.abs(diffY)) {
                isSwiping = false;
                toggleSidebar(false);
            }
        }, { passive: true });

        sidebar.addEventListener('touchend', () => {
            isSwiping = false;
        }, { passive: true });
    }

    // 2. Fullscreen Player Detail swipe-down-to-dismiss
    const detailView = document.getElementById('view-player-detail');
    if (detailView) {
        let detailTouchStartY = 0;
        let detailTouchStartX = 0;
        let canSwipeDown = false;

        detailView.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            detailTouchStartY = e.touches[0].clientY;
            detailTouchStartX = e.touches[0].clientX;
            const lyricContainer = document.getElementById('lyric-container');
            const isAtTop = !lyricContainer || lyricContainer.scrollTop <= 5;
            canSwipeDown = isAtTop || detailTouchStartY < 120;
        }, { passive: true });

        detailView.addEventListener('touchmove', (e: TouchEvent) => {
            if (!canSwipeDown || e.touches.length !== 1) return;
            const diffY = e.touches[0].clientY - detailTouchStartY;
            const diffX = e.touches[0].clientX - detailTouchStartX;
            if (diffY > 75 && Math.abs(diffY) > Math.abs(diffX) * 1.4) {
                canSwipeDown = false;
                toggleLyrics();
            }
        }, { passive: true });

        detailView.addEventListener('touchend', () => {
            canSwipeDown = false;
        }, { passive: true });
    }

    // 3. Mobile Player Bar: Tapping song info opens full-screen lyrics/player
    const playerSongInfo = document.getElementById('player-song-info');
    if (playerSongInfo) {
        playerSongInfo.addEventListener('click', (e: MouseEvent) => {
            if (window.innerWidth < 768) {
                const target = e.target as HTMLElement | null;
                if (target && target.closest('button, a, input, select')) return;
                toggleLyrics();
            }
        });
    }

    // 4. Escape key closes mobile sidebar
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            const sidebar = document.getElementById('main-sidebar');
            if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 1025) {
                toggleSidebar(false);
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileGestures);
} else {
    initMobileGestures();
}

// 启动展开按钮淡化计时器
function startExpandBtnTimer() {
    const expandBtn = document.getElementById('btn-expand-panel');
    if (!expandBtn) return;

    if (expandBtnTimeout) clearTimeout(expandBtnTimeout);
    expandBtn.classList.remove('faint');

    expandBtnTimeout = setTimeout(() => {
        // 只有当播放栏仍处于隐藏状态时才淡化
        const footer = document.getElementById('player-footer');
        if (footer && footer.classList.contains('translate-y-[110%]')) {
            expandBtn.classList.add('faint');
        }
    }, 3000);
}

// 启动歌词按钮淡化计时器
function startToggleLyricsBtnTimer() {
    const toggleBtn = document.getElementById('btn-toggle-lyrics');
    if (!toggleBtn) return;

    if (toggleLyricsBtnTimeout) clearTimeout(toggleLyricsBtnTimeout);
    toggleBtn.classList.remove('faint');

    toggleLyricsBtnTimeout = setTimeout(() => {
        // 只有当歌词页面处于显示状态时才淡化
        const view = document.getElementById('view-player-detail');
        if (view && !view.classList.contains('translate-y-[100%]')) {
            toggleBtn.classList.add('faint');
        }
    }, 3000);
}

// 切换底部播放栏显示/隐藏 (移动端)
function togglePlayerMoreMenu(event?: Event) {
    event?.stopPropagation();
    const menu = document.getElementById('player-more-menu');
    const button = document.getElementById('player-more-btn');
    if (!menu || !button) return;

    const isOpening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !isOpening);
    button.setAttribute('aria-expanded', String(isOpening));
}

window.togglePlayerMoreMenu = togglePlayerMoreMenu;

document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('#player-more-menu, #player-more-btn')) return;
    const menu = document.getElementById('player-more-menu');
    const button = document.getElementById('player-more-btn');
    if (!menu || menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    button?.setAttribute('aria-expanded', 'false');
});

function togglePlayerPanel() {
    const footer = document.getElementById('player-footer');
    const expandBtn = document.getElementById('btn-expand-panel');
    const container = document.getElementById('player-detail-container');

    if (!footer || !expandBtn) return;

    // 检查是否已经隐藏 (通过 transform 判断)
    // 注意: Tailwind 的 translate-y-full 等同于 transform: translateY(100%)
    const isHidden = footer.classList.contains('translate-y-[110%]');

    const views = ['view-search', 'view-settings', 'view-favorites', 'view-about', 'main-sidebar', 'view-songlist', 'songlist-detail-view'];
    const playerDetail = document.getElementById('view-player-detail');
    const lyricsWrapper = document.getElementById('lyrics-wrapper');

    if (isHidden) {
        // 显示播放栏
        footer.classList.remove('translate-y-[110%]');
        footer.style.opacity = '1';
        footer.style.pointerEvents = 'auto';
        document.getElementById('btn-collapse-panel')?.setAttribute('aria-expanded', 'true');
        expandBtn.setAttribute('aria-expanded', 'false');

        // 隐藏展开按钮
        expandBtn.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
        expandBtn.classList.add('translate-y-20', 'scale-75', 'opacity-0');

        // 重置状态
        if (expandBtnTimeout) clearTimeout(expandBtnTimeout);
        expandBtn.classList.remove('faint');

        // 恢复内容底部 Padding
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('pb-32', 'pb-44', 'md:pb-32');
                el.classList.add('pb-44', 'md:pb-32');
            }
        });

        // 歌词页: 增加底部 Padding (避开播放栏)
        if (playerDetail) {
            playerDetail.classList.add('pb-24');
            playerDetail.classList.remove('pb-0');
        }

        // 桌面端: 恢复 md:pt-0 (垂直居中, 无顶部Padding)
        if (container) {
            container.classList.remove('translate-y-12', 'opacity-80', 'scale-95');
            container.classList.remove('md:pt-24', 'md:pt-12');
            container.classList.add('md:pt-0');
        }
    } else {
        // 隐藏播放栏 (向下移出屏幕) 
        footer.classList.add('translate-y-[110%]');
        footer.style.opacity = '0';
        footer.style.pointerEvents = 'none';
        document.getElementById('btn-collapse-panel')?.setAttribute('aria-expanded', 'false');
        expandBtn.setAttribute('aria-expanded', 'true');

        // 停止动画并清除可视化画布，防止在偏移后仍有残留渲染
        if (window.musicVisualizer && window.musicVisualizer.clear) {
            window.musicVisualizer.clear('footer');
        }
        setTimeout(() => {
            expandBtn.classList.remove('translate-y-20', 'scale-75', 'opacity-0');
            expandBtn.classList.add('translate-y-0', 'scale-100', 'opacity-100');
        }, 300);

        // 开启 3s 自动淡化计时器
        startExpandBtnTimer();

        // 移除内容底部 Padding (内容延伸到底部)
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('pb-32', 'pb-44', 'md:pb-32');
        });

        // 歌词页: 移除底部 Padding (利用底部空间)
        if (playerDetail) {
            playerDetail.classList.remove('pb-24');
            playerDetail.classList.add('pb-0');
        }

        // 桌面端: 移除 md:pt-0, 添加 md:pt-24 (避免遮挡顶部 NOW PLAYING)
        // 调整内容容器以填满全屏
        if (container) {
            container.classList.remove('md:pt-0');
            container.classList.add('md:pt-24');
            container.classList.add('translate-y-12', 'opacity-80', 'scale-95');
            // 稍后移除微调，保持丝滑
            setTimeout(() => {
                container.classList.remove('translate-y-12', 'opacity-80', 'scale-95');
            }, 600);
        }
    }

    // [New] 触发可视化模块更新布局 (Padding 处理)
    if (window.musicVisualizer) {
        window.musicVisualizer.applySettings();
    }

    // 重新校准歌词位置 (动画结束后执行)
    setTimeout(() => {
        scrollToActiveLine(true);
    }, 300);
}

// 导出函数
window.togglePlayerPanel = togglePlayerPanel;
window.updateSetting = updateSetting;

// Initialize Sound Effects on first play/click
function initAudioEngine() {
    const initializeAudioEngine = () => {
        if (!window.soundEffects || window._audioEngineInited) return;
        window.soundEffects.init();
        window._audioEngineInited = true;
        console.log('[AudioEngine] Sound effects initialized via AudioEngine');

        // Ensure Visualizer captures correct source
        const initializeVisualizer = () => {
            if (window.musicVisualizer?.init) window.musicVisualizer.init();
        };
        if (window.musicVisualizer) initializeVisualizer();
        else ensureVisualizerLoaded().then(initializeVisualizer).catch(() => {
            console.warn('[Visualizer] 可视化模块加载失败');
        });

        // iOS: 在用户手势上下文中立即启动 anchor audio，建立后台音频会话
        if (window.iOSBackgroundAudio) {
            window.iOSBackgroundAudio.ensureAnchorPlaying();
        }
    };

    if (window.soundEffects) {
        initializeAudioEngine();
    } else {
        ensureSoundEffectsLoaded().then(initializeAudioEngine).catch(() => {
            console.warn('[AudioEngine] 音效模块加载失败');
        });
    }
}

// Intercept play for audio engine init
const originalTogglePlay = window.togglePlay;
window.togglePlay = function () {
    initAudioEngine();
    if (originalTogglePlay) originalTogglePlay();
};

document.addEventListener('click', initAudioEngine, { once: true });


// Ensure initSearchTips runs on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchTips);
} else {
    initSearchTips();
}
// ── 全新自定义下拉框管理模块 ──
initCustomSelectManager(() => SETTINGS_UI_MAP, () => DEFAULT_SETTINGS);
