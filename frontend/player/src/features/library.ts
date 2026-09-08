import { safeImageUrl, safeInlineString } from '../player_security';

export interface LibraryFeatureContext {
    getCredential: (key: string) => string | null;
    getUserAuthHeaders: () => Record<string, string>;
    isUserLoggedIn: () => boolean;
    requireAdminForOpenWrite: (action: string) => Promise<boolean>;
    showInfo: (message: string) => void;
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
    showSelect: (...args: any[]) => Promise<boolean>;
    makeKeyboardActivatable: (element: HTMLElement, label: string, activate: (event: any) => void) => void;
    enterArtist: (id: any, source?: string) => void;
    enterAlbum: (id: any, source?: string) => void;
    downloadArtistAlbumSongs: (album: any, button: HTMLElement) => Promise<void>;
    exitListSecondaryModes: () => void;
    leaveSearchNavigation?: () => void;
    setCurrentSearchScope: (scope: string) => void;
    getSourceTag: (source: any) => string;
}

export function initLibraryFeature(context: LibraryFeatureContext) {
    const getCredential = context.getCredential;
    const getUserAuthHeaders = context.getUserAuthHeaders;
    const isUserLoggedIn = context.isUserLoggedIn;
    const requireAdminForOpenWrite = context.requireAdminForOpenWrite;
    const showInfo = context.showInfo;
    const showSuccess = context.showSuccess;
    const showError = context.showError;
    const showSelect = context.showSelect;
    const makeKeyboardActivatable = context.makeKeyboardActivatable;
    const enterArtist = context.enterArtist;
    const enterAlbum = context.enterAlbum;
    const downloadArtistAlbumSongs = context.downloadArtistAlbumSongs;
    const exitListSecondaryModes = context.exitListSecondaryModes;
    const leaveSearchNavigation = context.leaveSearchNavigation;
    const setCurrentSearchScope = context.setCurrentSearchScope;
    const getSourceTag = context.getSourceTag;
    const API_BASE = '/api/music';

/** 全局 library 数据 */
window.libraryData = { artists: [], albums: [] };

/** 批量选中的 library 条目（id 集合） */
window.libraryBatchSelected = new Set();
window.libraryBatchMode = false; // 'artist' | 'album' | false

/** 从后端加载两个 library 文件（自动感知公开收藏状态） */
async function loadLibraryData() {
    try {
        const isPublic = window.isViewingPublicFavorites === true || !isUserLoggedIn();
        let headers = {};
        let artistsUrl = '/api/user/library/artists';
        let albumsUrl  = '/api/user/library/albums';

        if (isPublic) {
            // 公开收藏模式：拉 _open 的歌手/专辑库
            const adminPass = getCredential('lx_admin_password');
            if (adminPass) headers['x-frontend-auth'] = adminPass;
            headers['x-user-name'] = '_open';
            artistsUrl += '?user=_open';
            albumsUrl  += '?user=_open';
        } else {
            headers = getUserAuthHeaders();
        }

        const [ar, al] = await Promise.all([
            fetch(artistsUrl, { headers }).then(r => r.ok ? r.json() : []),
            fetch(albumsUrl,  { headers }).then(r => r.ok ? r.json() : [])
        ]);
        window.libraryData.artists = Array.isArray(ar) ? ar : [];
        window.libraryData.albums  = Array.isArray(al) ? al : [];

        if (!isPublic && isUserLoggedIn()) {
            window.myPersonalLibraryData = {
                artists: [...window.libraryData.artists],
                albums: [...window.libraryData.albums]
            };
        }

        // 刷新侧边栏数量
        refreshLibrarySidebarCount();
        if (window.currentViewingListId === '__lib_artists__' && typeof renderLibraryArtists === 'function') {
            renderLibraryArtists(window.libraryData.artists);
        } else if (window.currentViewingListId === '__lib_albums__' && typeof renderLibraryAlbums === 'function') {
            renderLibraryAlbums(window.libraryData.albums);
        }
    } catch (e) {
        console.warn('[Library] 加载失败:', e);
    }
}
window.loadLibraryData = loadLibraryData;


/** 刷新侧边栏常驻项的数量徽标 */
function refreshLibrarySidebarCount() {
    const artCount = document.getElementById('lib-artist-count');
    const albCount = document.getElementById('lib-album-count');
    if (artCount) artCount.textContent = window.libraryData.artists.length;
    if (albCount) albCount.textContent = window.libraryData.albums.length;
}

/** 持久化 artists 到后端（自动感知公开收藏状态） */
async function saveLibraryArtists(customList = null) {
    try {
        const isPublic = !isUserLoggedIn() || (!customList && window.isViewingPublicFavorites);
        const listToSave = customList || window.libraryData.artists;
        let headers = { 'Content-Type': 'application/json' };
        let url = '/api/user/library/artists';
        if (isPublic) {
            const adminPass = getCredential('lx_admin_password');
            if (adminPass) headers['x-frontend-auth'] = adminPass;
            headers['x-user-name'] = '_open';
            url += '?user=_open';
        } else {
            headers = { 'Content-Type': 'application/json', ...getUserAuthHeaders() };
        }
        await fetch(url, { method: 'POST', headers, body: JSON.stringify(listToSave) });
        refreshLibrarySidebarCount();
    } catch (e) { console.error('[Library] 保存歌手失败:', e); }
}

/** 持久化 albums 到后端（自动感知公开收藏状态） */
async function saveLibraryAlbums(customList = null) {
    try {
        const isPublic = !isUserLoggedIn() || (!customList && window.isViewingPublicFavorites);
        const listToSave = customList || window.libraryData.albums;
        let headers = { 'Content-Type': 'application/json' };
        let url = '/api/user/library/albums';
        if (isPublic) {
            const adminPass = getCredential('lx_admin_password');
            if (adminPass) headers['x-frontend-auth'] = adminPass;
            headers['x-user-name'] = '_open';
            url += '?user=_open';
        } else {
            headers = { 'Content-Type': 'application/json', ...getUserAuthHeaders() };
        }
        await fetch(url, { method: 'POST', headers, body: JSON.stringify(listToSave) });
        refreshLibrarySidebarCount();
    } catch (e) { console.error('[Library] 保存专辑失败:', e); }
}


/** 切换歌手收藏；返回最新收藏状态 true/false */
async function toggleArtistFavorite(id, source, name, picUrl) {
    if (isUserLoggedIn()) {
        const targetList = (window.isViewingPublicFavorites && window.myPersonalLibraryData)
            ? window.myPersonalLibraryData.artists
            : window.libraryData.artists;

        const idx = targetList.findIndex(a => String(a.id) === String(id) && a.source === source);
        if (idx >= 0) {
            targetList.splice(idx, 1);
            await saveLibraryArtists(targetList);
            showInfo(`已取消收藏歌手「${name}」`);
            return false;
        } else {
            targetList.push({ id, source, name, picUrl: picUrl || '' });
            await saveLibraryArtists(targetList);
            showSuccess(`已收藏歌手「${name}」`);
            return true;
        }
    } else {
        if (!(await requireAdminForOpenWrite('修改公开收藏歌手'))) return false;
        const list = window.libraryData.artists;
        const idx = list.findIndex(a => String(a.id) === String(id) && a.source === source);
        if (idx >= 0) {
            list.splice(idx, 1);
            await saveLibraryArtists(list);
            showInfo(`已取消公开收藏歌手「${name}」`);
            return false;
        } else {
            list.push({ id, source, name, picUrl: picUrl || '' });
            await saveLibraryArtists(list);
            showSuccess(`已收藏公开歌手「${name}」`);
            return true;
        }
    }
}
window.toggleArtistFavorite = toggleArtistFavorite;

/** 检查歌手是否已收藏 */
function isArtistFavorited(id, source) {
    const list = (isUserLoggedIn() && window.isViewingPublicFavorites && window.myPersonalLibraryData)
        ? window.myPersonalLibraryData.artists
        : window.libraryData.artists;
    return list.some(a => String(a.id) === String(id) && a.source === source);
}
window.isArtistFavorited = isArtistFavorited;

/** 切换专辑收藏；返回最新收藏状态 true/false */
async function toggleAlbumFavorite(id, source, name, picUrl, artistName) {
    if (isUserLoggedIn()) {
        const targetList = (window.isViewingPublicFavorites && window.myPersonalLibraryData)
            ? window.myPersonalLibraryData.albums
            : window.libraryData.albums;

        const idx = targetList.findIndex(a => String(a.id) === String(id) && a.source === source);
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
                picUrl: picUrl || '',
                artistName: artistName || '',
                interval: '00:00',
                meta: { albumId: id, picUrl: picUrl || '', albumName: name }
            });
            await saveLibraryAlbums(targetList);
            showSuccess(`已收藏专辑「${name}」`);
            return true;
        }
    } else {
        if (!(await requireAdminForOpenWrite('修改公开收藏专辑'))) return false;
        const list = window.libraryData.albums;
        const idx = list.findIndex(a => String(a.id) === String(id) && a.source === source);
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
                picUrl: picUrl || '',
                artistName: artistName || '',
                interval: '00:00',
                meta: { albumId: id, picUrl: picUrl || '', albumName: name }
            });
            await saveLibraryAlbums(list);
            showSuccess(`已收藏公开专辑「${name}」`);
            return true;
        }
    }
}
window.toggleAlbumFavorite = toggleAlbumFavorite;


/**
 * [新增] 当加载专辑详情后，更新收藏库中该专辑的元数据（如音质列表、时长等）
 */
async function updateAlbumLibraryMeta(id, source, data) {
    if (!window.libraryData || !window.libraryData.albums) return;
    const album = window.libraryData.albums.find(a => String(a.id) === String(id) && a.source === source);
    if (!album) return;

    const info = data.info || {};
    const songList = data.list || [];

    // [核心修改] 将完整的歌曲列表保存到 album.list 字段下
    if (songList.length > 0) {
        album.list = songList;

        // 补充专辑本身的展示元数据和时长
        const first = songList[0];
        album.interval = first.interval || album.interval || '00:00';

        album.meta = album.meta || {};
        album.meta.albumId = id;
        album.meta.picUrl = album.picUrl || info.img || info.pic || first.meta?.picUrl;
        album.meta.albumName = album.name || info.name || first.meta?.albumName;

        // 兼容性字段：取第一首歌的 meta 信息（对应用户示例）
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
        console.error('[Library] 自动更新专辑元数据失败:', e);
    }
}
window.updateAlbumLibraryMeta = updateAlbumLibraryMeta;

/**
 * [新增] 一键同步所有收藏专辑的歌曲列表
 */
async function syncAllLibraryAlbums() {
    if (!window.libraryData || !window.libraryData.albums.length) return;
    const list = window.libraryData.albums;

    const btn = document.getElementById('sync-all-albums-btn');
    if (!btn) return;

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');

    let successCount = 0;
    try {
        for (let i = 0; i < list.length; i++) {
            const album = list[i];
            btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> ${i + 1}/${list.length}`;

            try {
                const res = await fetch(`${API_BASE}/albumSongs?id=${album.id}&source=${album.source || 'wy'}`);
                if (res.ok) {
                    const data = await res.json();
                    await updateAlbumLibraryMeta(album.id, album.source || 'wy', data);
                    successCount++;
                }
            } catch (err) {
                console.error(`[Library] 同步专辑「${album.name}」失败:`, err);
            }
            // 避免请求过快
            if (list.length > 3) await new Promise(r => setTimeout(r, 200));
        }
        showSuccess(`同步完成！成功更新 ${successCount} 个专辑的数据。`);
        // 重新渲染当前视图
        if (window.currentSearchScope === 'lib_albums') {
            renderLibraryAlbums(window.libraryData.albums);
        }
    } catch (err) {
        showError('全量同步过程中发生异常');
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = originalContent;
    }
}
window.syncAllLibraryAlbums = syncAllLibraryAlbums;

/** 检查专辑是否已收藏 */
function isAlbumFavorited(id, source) {
    const list = (isUserLoggedIn() && window.isViewingPublicFavorites && window.myPersonalLibraryData)
        ? window.myPersonalLibraryData.albums
        : window.libraryData.albums;
    return list.some(a => String(a.id) === String(id) && a.source === source);
}
window.isAlbumFavorited = isAlbumFavorited;

/**
 * 渲染收藏歌手列表（带批量操作支持）
 * 直接复用搜索结果容器
 */
function renderLibraryArtists(list) {
    const container = document.getElementById('search-results');
    const header = document.getElementById('search-results-header');
    const paginationBar = document.getElementById('search-pagination-bar');
    if (header) header.classList.add('hidden');
    if (paginationBar) paginationBar.classList.add('hidden');

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
                <button data-event-click-action="enterLibraryArtistBatch" class="text-xs px-3 py-1.5 border t-border-main rounded-lg t-text-muted hover:text-emerald-600 hover:border-emerald-400 transition-all flex items-center gap-1">
                    <i class="fas fa-tasks"></i> 批量管理
                </button>
            </div>
        </div>
        <div id="lib-artist-batch-bar" class="hidden bg-emerald-50 border-b border-emerald-200 p-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <span class="text-sm text-emerald-700">已选: <span id="lib-artist-sel-count" class="font-bold">0</span></span>
                <button data-event-click-action="libSelectAllArtists" class="text-xs px-3 py-1 t-bg-panel border border-emerald-300 rounded hover:bg-emerald-50 text-emerald-700">全选</button>
                <button data-event-click-action="libDeselectAllArtists" class="text-xs px-3 py-1 t-bg-panel border t-border-main rounded hover:t-bg-track t-text-muted">清空</button>
                <button data-event-click-action="exitLibraryArtistBatch" class="text-xs px-3 py-1 t-bg-panel border border-red-300 rounded hover:bg-red-50 text-red-600">退出</button>
            </div>
            <button data-event-click-action="libDeleteSelectedArtists" class="text-xs px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-1">
                <i class="fas fa-trash"></i> 删除所选
            </button>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 md:gap-4 p-3 md:p-6" id="lib-artist-grid"></div>`;

    const grid = container.querySelector('#lib-artist-grid');
    list.forEach(singer => {
        const singerId = String(singer.id ?? '');
        const singerSource = String(singer.source || 'wy');
        const singerName = String(singer.name || '未命名歌手');
        const div = document.createElement('div');
        div.className = 'group relative flex flex-col items-center p-2 md:p-4 rounded-2xl transition-all hover:t-bg-panel hover:shadow-md cursor-pointer border border-transparent hover:border-emerald-500/30';
        div.dataset.libArtistId = singerId;
        div.dataset.libArtistSource = singerSource;
        const activateArtist = (e) => {
            if (e.target.closest('.lib-batch-check') || e.target.closest('.lib-fav-btn')) return;
            if (window.libraryBatchMode === 'artist') {
                toggleLibArtistBatchSelect(singerId);
                return;
            }
            enterArtist(singerId, singerSource);
        };
        div.onclick = activateArtist;
        makeKeyboardActivatable(div, `打开收藏歌手 ${singerName}`, activateArtist);
         div.innerHTML = `
            <div class="relative mb-2 md:mb-3">
                <div class="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full overflow-hidden shadow-sm">
                    <img src="${escapeHtmlText(safeImageUrl(singer.picUrl))}" alt="${escapeHtmlText(singerName)}头像" width="128" height="128" loading="lazy" decoding="async"
                         data-event-error-action="fallback-image"
                         class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                </div>
                <div class="lib-batch-check absolute inset-0 bg-black/40 hidden items-center justify-center rounded-full">
                    <i class="fas fa-check-circle text-white text-2xl"></i>
                </div>
                <button class="lib-fav-btn absolute -top-1 -right-1 w-6 h-6 md:w-7 md:h-7 rounded-full bg-red-400/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
                        title="取消收藏"
                        data-event-click-action="removeLibraryArtist" data-event-click-args="[${safeInlineString(singerId)}, ${safeInlineString(singerSource)}]" data-event-stop="true">
                    <i class="fas fa-times text-[10px]"></i>
                </button>
            </div>
            <span class="text-[11px] md:text-sm font-bold t-text-main text-center truncate w-full" title="${escapeHtmlText(singerName)}">${escapeHtmlText(singerName)}</span>
            <div class="mt-1">${getSourceTag ? getSourceTag(singerSource) : escapeHtmlText(singerSource.toUpperCase())}</div>`;
        grid.appendChild(div);
    });
}
window.renderLibraryArtists = renderLibraryArtists;

/** 渲染收藏专辑列表（带批量操作支持） */
function renderLibraryAlbums(list) {
    const container = document.getElementById('search-results');
    const header = document.getElementById('search-results-header');
    const paginationBar = document.getElementById('search-pagination-bar');
    if (header) header.classList.add('hidden');
    if (paginationBar) paginationBar.classList.add('hidden');

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
                <button id="sync-all-albums-btn" data-event-click-action="syncAllLibraryAlbums" class="text-xs px-3 py-1.5 border t-border-main rounded-lg t-text-muted hover:text-blue-500 hover:border-blue-400 transition-all flex items-center gap-1">
                    <i class="fas fa-sync-alt"></i> 同步所有
                </button>
                <button data-event-click-action="enterLibraryAlbumBatch" class="text-xs px-3 py-1.5 border t-border-main rounded-lg t-text-muted hover:text-emerald-600 hover:border-emerald-400 transition-all flex items-center gap-1">
                    <i class="fas fa-tasks"></i> 批量管理
                </button>
            </div>
        </div>
        <div id="lib-album-batch-bar" class="hidden bg-emerald-50 border-b border-emerald-200 p-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <span class="text-sm text-emerald-700">已选: <span id="lib-album-sel-count" class="font-bold">0</span></span>
                <button data-event-click-action="libSelectAllAlbums" class="text-xs px-3 py-1 t-bg-panel border border-emerald-300 rounded hover:bg-emerald-50 text-emerald-700">全选</button>
                <button data-event-click-action="libDeselectAllAlbums" class="text-xs px-3 py-1 t-bg-panel border t-border-main rounded hover:t-bg-track t-text-muted">清空</button>
                <button data-event-click-action="exitLibraryAlbumBatch" class="text-xs px-3 py-1 t-bg-panel border border-red-300 rounded hover:bg-red-50 text-red-600">退出</button>
            </div>
            <button data-event-click-action="libDeleteSelectedAlbums" class="text-xs px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-1">
                <i class="fas fa-trash"></i> 删除所选
            </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-6" id="lib-album-grid"></div>`;

    const grid = container.querySelector('#lib-album-grid');
    list.forEach(item => {
        const albumId = String(item.id ?? '');
        const albumSource = String(item.source || 'wy');
        const albumName = String(item.name || '未命名专辑');
        const div = document.createElement('div');
        div.className = 'group relative flex flex-col p-3 rounded-2xl transition-all hover:t-bg-panel hover:shadow-lg cursor-pointer border border-transparent hover:border-emerald-500/20';
        div.dataset.libAlbumId = albumId;
        div.dataset.libAlbumSource = albumSource;
        const activateAlbum = (e) => {
            if (e.target.closest('.lib-batch-check') || e.target.closest('.lib-fav-btn') || e.target.closest('.lib-album-download-btn')) return;
            if (window.libraryBatchMode === 'album') {
                toggleLibAlbumBatchSelect(albumId);
                return;
            }
            enterAlbum(albumId, albumSource);
        };
        div.onclick = activateAlbum;
        makeKeyboardActivatable(div, `打开收藏专辑 ${albumName}`, activateAlbum);
        div.innerHTML = `
            <div class="aspect-square rounded-xl overflow-hidden shadow-md mb-3 relative">
                <img src="${escapeHtmlText(safeImageUrl(item.picUrl))}" alt="${escapeHtmlText(albumName)}封面" width="320" height="320" loading="lazy" decoding="async"
                     data-event-error-action="fallback-image"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="lib-batch-check absolute inset-0 bg-black/40 hidden items-center justify-center rounded-xl">
                    <i class="fas fa-check-circle text-white text-3xl"></i>
                </div>
                <div class="absolute top-1.5 right-1.5 flex gap-1.5">
                    <button type="button" class="lib-album-download-btn w-8 h-8 rounded-full bg-black/45 hover:bg-emerald-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all shadow-sm disabled:opacity-60 disabled:cursor-wait" title="下载本专辑全部歌曲">
                        <i class="fas fa-download text-xs"></i>
                    </button>
                    <button type="button" class="lib-fav-btn w-8 h-8 rounded-full bg-red-400/80 hover:bg-red-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all shadow-sm" title="取消收藏"
                            data-event-click-action="removeLibraryAlbum" data-event-click-args="[${safeInlineString(albumId)}, ${safeInlineString(albumSource)}]" data-event-stop="true">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </div>
            </div>
            <span class="text-sm font-bold t-text-main line-clamp-2 h-10 leading-5 mb-1" title="${escapeHtmlText(albumName)}">${escapeHtmlText(albumName)}</span>
            <div class="flex items-center justify-between mt-1">
                <span class="text-[10px] t-text-muted truncate flex-1">
                    ${escapeHtmlText(item.artistName || '未知歌手')}
                    ${item.list && item.list.length ? `<span class="ml-1 text-emerald-500 font-bold">(${item.list.length} 首)</span>` : ''}
                </span>
                <span class="text-[10px] t-text-muted ml-2">${getSourceTag ? getSourceTag(item.source) : ''}</span>
            </div>`;
        const downloadButton = div.querySelector('.lib-album-download-btn');
        downloadButton?.addEventListener('click', async event => {
            event.stopPropagation();
            await downloadArtistAlbumSongs(item, downloadButton);
        });
        grid.appendChild(div);
    });
}
window.renderLibraryAlbums = renderLibraryAlbums;

/** 点击侧边栏"收藏歌手"，切换到展示视图 */
function handleArtistLibraryClick() {
    leaveSearchNavigation?.();
    exitListSecondaryModes && exitListSecondaryModes();
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    const activeView = document.getElementById('view-search');
    activeView.classList.remove('hidden');
    setTimeout(() => activeView.classList.remove('opacity-0'), 10);

    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.remove('active-tab', 'text-emerald-600');
        el.classList.add('t-text-muted');
    });
    const favTab = document.getElementById('tab-favorites');
    if (favTab) { favTab.classList.add('active-tab'); favTab.classList.remove('t-text-muted'); }

    document.querySelectorAll('[data-sidebar-list-id]').forEach(el => { el.classList.remove('active-sub-item'); el.classList.add('t-text-muted'); });
    const subItem = document.querySelector('[data-sidebar-list-id="__lib_artists__"]');
    if (subItem) { subItem.classList.add('active-sub-item'); subItem.classList.remove('t-text-muted'); }

    document.getElementById('page-title').innerText = '收藏歌手';
    document.getElementById('search-input').value = '';
    document.getElementById('search-input').placeholder = '搜索收藏歌手...';
    document.getElementById('search-source').classList.add('hidden');
    document.getElementById('search-type').classList.add('hidden');

    setCurrentSearchScope('lib_artists');
    window.currentViewingListId = '__lib_artists__';
    renderLibraryArtists(window.libraryData.artists);
}
window.handleArtistLibraryClick = handleArtistLibraryClick;

/** 点击侧边栏"收藏专辑"，切换到展示视图 */
function handleAlbumLibraryClick() {
    leaveSearchNavigation?.();
    exitListSecondaryModes && exitListSecondaryModes();
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    const activeView = document.getElementById('view-search');
    activeView.classList.remove('hidden');
    setTimeout(() => activeView.classList.remove('opacity-0'), 10);

    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.remove('active-tab', 'text-emerald-600');
        el.classList.add('t-text-muted');
    });
    const favTab = document.getElementById('tab-favorites');
    if (favTab) { favTab.classList.add('active-tab'); favTab.classList.remove('t-text-muted'); }

    document.querySelectorAll('[data-sidebar-list-id]').forEach(el => { el.classList.remove('active-sub-item'); el.classList.add('t-text-muted'); });
    const subItem = document.querySelector('[data-sidebar-list-id="__lib_albums__"]');
    if (subItem) { subItem.classList.add('active-sub-item'); subItem.classList.remove('t-text-muted'); }

    document.getElementById('page-title').innerText = '收藏专辑';
    document.getElementById('search-input').value = '';
    document.getElementById('search-input').placeholder = '搜索收藏专辑...';
    document.getElementById('search-source').classList.add('hidden');
    document.getElementById('search-type').classList.add('hidden');

    setCurrentSearchScope('lib_albums');
    window.currentViewingListId = '__lib_albums__';
    renderLibraryAlbums(window.libraryData.albums);
}
window.handleAlbumLibraryClick = handleAlbumLibraryClick;

// ---- 批量操作：歌手 ----

function enterLibraryArtistBatch() {
    window.libraryBatchMode = 'artist';
    window.libraryBatchSelected.clear();
    const bar = document.getElementById('lib-artist-batch-bar');
    if (bar) bar.classList.remove('hidden');
    updateLibArtistBatchCount();
}
function exitLibraryArtistBatch() {
    window.libraryBatchMode = false;
    window.libraryBatchSelected.clear();
    const bar = document.getElementById('lib-artist-batch-bar');
    if (bar) bar.classList.add('hidden');
    // 取消所有选中视觉效果
    document.querySelectorAll('#lib-artist-grid .lib-batch-check').forEach(el => el.classList.remove('flex'));
    document.querySelectorAll('#lib-artist-grid .lib-batch-check').forEach(el => el.classList.add('hidden'));
}
function toggleLibArtistBatchSelect(id) {
    if (window.libraryBatchSelected.has(String(id))) {
        window.libraryBatchSelected.delete(String(id));
    } else {
        window.libraryBatchSelected.add(String(id));
    }
    // 更新视觉状态
    document.querySelectorAll('#lib-artist-grid [data-lib-artist-id]').forEach(card => {
        const check = card.querySelector('.lib-batch-check');
        if (!check) return;
        if (window.libraryBatchSelected.has(card.dataset.libArtistId)) {
            check.classList.remove('hidden'); check.classList.add('flex');
        } else {
            check.classList.add('hidden'); check.classList.remove('flex');
        }
    });
    updateLibArtistBatchCount();
}
function libSelectAllArtists() {
    window.libraryData.artists.forEach(a => window.libraryBatchSelected.add(String(a.id)));
    document.querySelectorAll('#lib-artist-grid .lib-batch-check').forEach(el => { el.classList.remove('hidden'); el.classList.add('flex'); });
    updateLibArtistBatchCount();
}
function libDeselectAllArtists() {
    window.libraryBatchSelected.clear();
    document.querySelectorAll('#lib-artist-grid .lib-batch-check').forEach(el => { el.classList.add('hidden'); el.classList.remove('flex'); });
    updateLibArtistBatchCount();
}
function updateLibArtistBatchCount() {
    const el = document.getElementById('lib-artist-sel-count');
    if (el) el.textContent = window.libraryBatchSelected.size;
}
async function libDeleteSelectedArtists() {
    if (window.libraryBatchSelected.size === 0) { showInfo('请先选择要删除的歌手'); return; }
    if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
        if (!(await requireAdminForOpenWrite('删除公开收藏歌手'))) return;
    }
    const confirmed = await showSelect('删除收藏歌手', `确定删除选中的 ${window.libraryBatchSelected.size} 位歌手吗？`, { danger: true });
    if (!confirmed) return;
    window.libraryData.artists = window.libraryData.artists.filter(a => !window.libraryBatchSelected.has(String(a.id)));
    await saveLibraryArtists();
    exitLibraryArtistBatch();
    renderLibraryArtists(window.libraryData.artists);
    showSuccess('已删除所选歌手');
}
async function removeLibraryArtist(id, source) {
    if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
        if (!(await requireAdminForOpenWrite('删除公开收藏歌手'))) return;
    }
    window.libraryData.artists = window.libraryData.artists.filter(a => !(String(a.id) === String(id) && a.source === source));
    await saveLibraryArtists();
    renderLibraryArtists(window.libraryData.artists);
    showInfo('已取消收藏');
}
window.enterLibraryArtistBatch = enterLibraryArtistBatch;
window.exitLibraryArtistBatch = exitLibraryArtistBatch;
window.libSelectAllArtists = libSelectAllArtists;
window.libDeselectAllArtists = libDeselectAllArtists;
window.libDeleteSelectedArtists = libDeleteSelectedArtists;
window.removeLibraryArtist = removeLibraryArtist;

// ---- 批量操作：专辑 ----

function enterLibraryAlbumBatch() {
    window.libraryBatchMode = 'album';
    window.libraryBatchSelected.clear();
    const bar = document.getElementById('lib-album-batch-bar');
    if (bar) bar.classList.remove('hidden');
    updateLibAlbumBatchCount();
}
function exitLibraryAlbumBatch() {
    window.libraryBatchMode = false;
    window.libraryBatchSelected.clear();
    const bar = document.getElementById('lib-album-batch-bar');
    if (bar) bar.classList.add('hidden');
    document.querySelectorAll('#lib-album-grid .lib-batch-check').forEach(el => { el.classList.add('hidden'); el.classList.remove('flex'); });
}
function toggleLibAlbumBatchSelect(id) {
    if (window.libraryBatchSelected.has(String(id))) {
        window.libraryBatchSelected.delete(String(id));
    } else {
        window.libraryBatchSelected.add(String(id));
    }
    document.querySelectorAll('#lib-album-grid [data-lib-album-id]').forEach(card => {
        const check = card.querySelector('.lib-batch-check');
        if (!check) return;
        if (window.libraryBatchSelected.has(card.dataset.libAlbumId)) {
            check.classList.remove('hidden'); check.classList.add('flex');
        } else {
            check.classList.add('hidden'); check.classList.remove('flex');
        }
    });
    updateLibAlbumBatchCount();
}
function libSelectAllAlbums() {
    window.libraryData.albums.forEach(a => window.libraryBatchSelected.add(String(a.id)));
    document.querySelectorAll('#lib-album-grid .lib-batch-check').forEach(el => { el.classList.remove('hidden'); el.classList.add('flex'); });
    updateLibAlbumBatchCount();
}
function libDeselectAllAlbums() {
    window.libraryBatchSelected.clear();
    document.querySelectorAll('#lib-album-grid .lib-batch-check').forEach(el => { el.classList.add('hidden'); el.classList.remove('flex'); });
    updateLibAlbumBatchCount();
}
function updateLibAlbumBatchCount() {
    const el = document.getElementById('lib-album-sel-count');
    if (el) el.textContent = window.libraryBatchSelected.size;
}
async function libDeleteSelectedAlbums() {
    if (window.libraryBatchSelected.size === 0) { showInfo('请先选择要删除的专辑'); return; }
    if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
        if (!(await requireAdminForOpenWrite('删除公开收藏专辑'))) return;
    }
    const confirmed = await showSelect('删除收藏专辑', `确定删除选中的 ${window.libraryBatchSelected.size} 张专辑吗？`, { danger: true });
    if (!confirmed) return;
    window.libraryData.albums = window.libraryData.albums.filter(a => !window.libraryBatchSelected.has(String(a.id)));
    await saveLibraryAlbums();
    exitLibraryAlbumBatch();
    renderLibraryAlbums(window.libraryData.albums);
    showSuccess('已删除所选专辑');
}
async function removeLibraryAlbum(id, source) {
    if (window.isViewingPublicFavorites || !isUserLoggedIn()) {
        if (!(await requireAdminForOpenWrite('删除公开收藏专辑'))) return;
    }
    window.libraryData.albums = window.libraryData.albums.filter(a => !(String(a.id) === String(id) && a.source === source));
    await saveLibraryAlbums();
    renderLibraryAlbums(window.libraryData.albums);
    showInfo('已取消收藏');
}

window.enterLibraryAlbumBatch = enterLibraryAlbumBatch;
window.exitLibraryAlbumBatch = exitLibraryAlbumBatch;
window.libSelectAllAlbums = libSelectAllAlbums;
window.libDeselectAllAlbums = libDeselectAllAlbums;
window.libDeleteSelectedAlbums = libDeleteSelectedAlbums;
window.removeLibraryAlbum = removeLibraryAlbum;

    const feature = {
        loadLibraryData,
        refreshLibrarySidebarCount,
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
        updateLibArtistBatchCount,
        libDeleteSelectedArtists,
        removeLibraryArtist,
        enterLibraryAlbumBatch,
        exitLibraryAlbumBatch,
        toggleLibAlbumBatchSelect,
        libSelectAllAlbums,
        libDeselectAllAlbums,
        updateLibAlbumBatchCount,
        libDeleteSelectedAlbums,
        removeLibraryAlbum,
    };

    Object.assign(window, feature);
    return feature;
}
