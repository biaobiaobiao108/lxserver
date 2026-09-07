import { describe, it, expect, beforeAll } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Player Navigation and State Restoration Safety', () => {
    const playerSrcPath = path.join(import.meta.dir, '../frontend/player/src/index.ts');
    const playbackSrcPath = path.join(import.meta.dir, '../frontend/player/src/features/playback.ts');
    const searchSrcPath = path.join(import.meta.dir, '../frontend/player/src/features/search.ts');
    const customSelectSrcPath = path.join(import.meta.dir, '../frontend/player/src/custom_select.ts');
    const playerCssPath = path.join(import.meta.dir, '../public/music/css/app.css');
    const playerDistPath = path.join(import.meta.dir, '../public/music/app.js');

    beforeAll(() => {
        if (!fs.existsSync(playerDistPath)) {
            const { execSync } = require('child_process');
            execSync('bun run build:frontend', { cwd: path.join(import.meta.dir, '..'), stdio: 'ignore' });
        }
    });

    it('frontend player source should not contain navigation-hijacking _pendingResumeListId', () => {
        const srcContent = fs.readFileSync(playerSrcPath, 'utf8');
        expect(srcContent.includes('_pendingResumeListId')).toBe(false);
    });

    it('built frontend distribution (public/music/app.js) should not contain _pendingResumeListId', () => {
        const distContent = fs.readFileSync(playerDistPath, 'utf8');
        expect(distContent.includes('_pendingResumeListId')).toBe(false);
    });

    it('frontend player source defines and uses isCurrentlyViewingLocalList for guarded navigation', () => {
        const srcContent = fs.readFileSync(playerSrcPath, 'utf8');
        expect(srcContent.includes('function isCurrentlyViewingLocalList')).toBe(true);
        expect(srcContent.includes('isCurrentlyViewingLocalList(window.currentViewingListId)')).toBe(true);
    });

    it('playSong queue fallback does not hijack window.currentViewingListId', () => {
        const srcContent = [playerSrcPath, playbackSrcPath]
            .map(filePath => fs.readFileSync(filePath, 'utf8'))
            .join('\n');
        const fallbackSnippetMatch = srcContent.match(/shouldFallback\s*=\s*settings\.switchPlaylistOnSongListPlay\s*===\s*false[\s\S]*?currentIndex\s*=\s*0;[\s\S]*?currentPlayingScope\s*=\s*'local_list';/);
        expect(fallbackSnippetMatch).not.toBeNull();
        if (fallbackSnippetMatch) {
            expect(fallbackSnippetMatch[0].includes("window.currentViewingListId = 'default'")).toBe(false);
        }
    });

    it('frontend player exposes toggleSidebar and toggleDetailCover to window', () => {
        const srcContent = fs.readFileSync(playerSrcPath, 'utf8');
        expect(srcContent.includes('(window as any).toggleSidebar = toggleSidebar')).toBe(true);
        expect(srcContent.includes('(window as any).toggleDetailCover = toggleDetailCover')).toBe(true);

        const distContent = fs.readFileSync(playerDistPath, 'utf8');
        expect(distContent.includes('toggleSidebar')).toBe(true);
        expect(distContent.includes('toggleDetailCover')).toBe(true);
    });

    it('music index.html has viewport-fit=cover and mobile menu button', () => {
        const playerHtmlPath = path.join(import.meta.dir, '../public/music/index.html');
        const html = fs.readFileSync(playerHtmlPath, 'utf8');
        expect(html.includes('viewport-fit=cover')).toBe(true);
        expect(html.includes('id="mobile-menu-btn"')).toBe(true);
        expect(html.includes('toggleSidebar()')).toBe(true);
    });

    it('artist and album searches guard favorite callbacks and use the auth bridge', () => {
        const srcContent = fs.readFileSync(playerSrcPath, 'utf8');
        const searchContent = fs.readFileSync(searchSrcPath, 'utf8');
        expect(srcContent.includes('getUserAuthHeaders: getPlayerUserAuthHeaders')).toBe(true);
        expect(srcContent.includes('isUserLoggedIn: isPlayerUserLoggedIn')).toBe(true);
        expect(srcContent.indexOf('let authToken')).toBeLessThan(srcContent.indexOf('const playlistModalFeature'));
        expect(srcContent.indexOf('let userToken')).toBeLessThan(srcContent.indexOf('const playlistModalFeature'));
        expect(searchContent.includes("typeof context.isArtistFavorited === 'function'")).toBe(true);
        expect(searchContent.includes("typeof context.isAlbumFavorited === 'function'")).toBe(true);
    });

    it('player active states do not add the removed accent borders', () => {
        const css = fs.readFileSync(playerCssPath, 'utf8');
        const customSelect = fs.readFileSync(customSelectSrcPath, 'utf8');
        const playerSrc = fs.readFileSync(playerSrcPath, 'utf8');
        const activeTabRule = css.match(/\.active-tab\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const activeLmSelectRule = css.match(/\.lm-select\.active\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const activeSelectRule = css.match(/\.cs-wrapper\.active \.cs-trigger\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const triggerFocusRule = css.match(/\.cs-trigger:focus-visible\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const selectedOptionRule = css.match(/\.cs-option\.selected\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const selectedQualityRule = css.match(/\.player-quality-option\[aria-checked="true"\][\s\S]*?\{([\s\S]*?)\}/)?.[1] ?? '';
        expect(activeTabRule.includes('border-right')).toBe(false);
        expect(css.includes('.cs-wrapper.highlight .cs-trigger')).toBe(false);
        expect(css.includes('.cs-wrapper.highlight .cs-trigger-icon')).toBe(false);
        expect(customSelect.includes("wrapper.classList.remove('highlight')")).toBe(true);
        expect(customSelect.includes("wrapper.classList.add('highlight')")).toBe(false);
        expect(activeLmSelectRule.includes('var(--c-500)')).toBe(false);
        expect(activeLmSelectRule.includes('box-shadow')).toBe(false);
        expect(activeSelectRule.includes('var(--c-500)')).toBe(false);
        expect(activeSelectRule.includes('box-shadow')).toBe(false);
        expect(triggerFocusRule.includes('outline: 2px solid')).toBe(true);
        expect(selectedOptionRule.includes('background: transparent')).toBe(true);
        expect(selectedOptionRule.includes('box-shadow: none')).toBe(true);
        expect(selectedOptionRule.includes('inset')).toBe(false);
        expect(selectedOptionRule.includes('font-weight: 700')).toBe(false);
        expect(selectedQualityRule.includes('background: transparent')).toBe(true);
        expect(selectedQualityRule.includes('box-shadow: none')).toBe(true);
        expect(css.includes('background: color-mix(in srgb, var(--c-500) 12%, transparent)')).toBe(false);
        expect(css.includes('.active-option')).toBe(false);
        expect(css.includes('.cs-option:hover')).toBe(true);
        expect(css.includes('.header-clock-immersive')).toBe(true);
        expect(css.includes('.header-source-pill')).toBe(false);
        expect(css.includes('.player-quality-option:hover')).toBe(true);
        expect(customSelect.includes("item.setAttribute('aria-selected', String(selected))")).toBe(true);
        expect(customSelect.includes("check.className = 'fas fa-check'")).toBe(true);
        expect(playerSrc.includes("opt.setAttribute('aria-pressed', String(selected))")).toBe(true);
        expect(playerSrc.includes('window.togglePlayModeMenu = togglePlayModeMenu')).toBe(true);
        expect(playerSrc.includes('window.setPlaybackRate = setPlaybackRate')).toBe(true);
        expect(playerSrc.includes('window.togglePlaybackRateMenu = togglePlaybackRateMenu')).toBe(true);
    });

    it('album detail navigation cancels stale searches and isolates history events', () => {
        const searchContent = fs.readFileSync(searchSrcPath, 'utf8');
        const lyricsContent = fs.readFileSync(path.join(import.meta.dir, '../frontend/player/src/features/lyrics.ts'), 'utf8');
        const albumSection = searchContent.match(/async function enterAlbum\([\s\S]*?\n}\n\nfunction goBackToSearch/)?.[0] ?? '';

        expect(searchContent.includes('function invalidateSearchRequest')).toBe(true);
        expect(searchContent.includes('if (prefetch && searchDetailOpen) return;')).toBe(true);
        expect(searchContent.includes("if (!searchDetailOpen && window.currentSearchScope === 'network'" )).toBe(true);
        expect(searchContent.includes('function isAlbumRequestCurrent')).toBe(true);
        expect(searchContent.includes("kind: 'album'" )).toBe(true);
        expect(searchContent.includes("kind: 'artist'" )).toBe(true);
        expect(searchContent.includes('function handleSearchPopState')).toBe(true);
        expect(searchContent.includes("switchTab('search', true)")).toBe(true);
        expect(searchContent.includes('function leaveSearchView')).toBe(true);
        expect(searchContent.includes('获取专辑歌曲失败：${escapeHtmlText(e.message)}')).toBe(true);
        expect(albumSection.includes('goBackToSearch();')).toBe(false);
        expect(lyricsContent.includes('lyricHistoryClosePending')).toBe(true);
        expect(lyricsContent.includes('handleSearchPopState(e.state)')).toBe(true);
        expect(lyricsContent.includes("if (e.state?.page === 'player-detail') return;")).toBe(true);
        expect(lyricsContent.includes("if (e.state?.page === 'player-detail') {\n        toggleLyrics(true);\n        return;\n    }")).toBe(true);
        expect(fs.readFileSync(path.join(import.meta.dir, '../frontend/player/src/index.ts'), 'utf8').includes("window.history.replaceState({ page: 'player' }, '')")).toBe(true);
    });

    it('single mode distinguishes manual skipping from automatic ended replay', () => {
        const songUrlContent = fs.readFileSync(path.join(import.meta.dir, '../frontend/player/src/features/song_url.ts'), 'utf8');
        const playbackContent = fs.readFileSync(playbackSrcPath, 'utf8');
        const indexContent = fs.readFileSync(playerSrcPath, 'utf8');

        // getNextIndex accepts isManual flag
        expect(songUrlContent.includes('function getNextIndex(isManual = false)')).toBe(true);
        expect(songUrlContent.includes("case 'single':\n            if (isManual) {")).toBe(true);

        // playNext and playPrev forward isManual flag
        expect(playbackContent.includes('function playNext(depth = 0, isManual = true)')).toBe(true);
        expect(playbackContent.includes('function playPrev(isManual = true)')).toBe(true);

        // ended event replays seamlessly for single mode
        expect(indexContent.includes("if (playMode === 'single') {\n        audio.currentTime = 0;")).toBe(true);
    });

    it('queue clearing resets player state and protects empty togglePlay', () => {
        const queueContent = fs.readFileSync(path.join(import.meta.dir, '../frontend/player/src/features/queue.ts'), 'utf8');
        const indexContent = fs.readFileSync(playerSrcPath, 'utf8');
        const playbackContent = fs.readFileSync(playbackSrcPath, 'utf8');

        expect(queueContent.includes('resetPlayer?: () => void;')).toBe(true);
        expect(queueContent.includes('context.resetPlayer();')).toBe(true);
        expect(indexContent.includes('function resetPlayer()')).toBe(true);
        expect(playbackContent.includes("if (!state.currentPlayingSong && (!state.currentPlaylist || state.currentPlaylist.length === 0))")).toBe(true);
    });

    it('volume fade and crossfade strictly preserve mute state', () => {
        const playbackContent = fs.readFileSync(playbackSrcPath, 'utf8');
        expect(playbackContent.includes('if (state.isMuted || targetVolume <= 0)')).toBe(true);
        expect(playbackContent.includes('audio.muted = isMuted;')).toBe(true);
        expect(playbackContent.includes('if (settings.enableCrossfade && !isMuted && effectiveVol > 0)')).toBe(true);
    });
});

describe('Update Notification Engine & PostHog Removal', () => {
    const notificationEnginePath = path.join(import.meta.dir, '../public/js/notification-engine.js');
    const adminHtmlPath = path.join(import.meta.dir, '../public/index.html');
    const playerHtmlPath = path.join(import.meta.dir, '../public/music/index.html');
    const swPath = path.join(import.meta.dir, '../public/sw.js');

    it('notification-engine.js should be completely removed from public/js', () => {
        expect(fs.existsSync(notificationEnginePath)).toBe(false);
    });

    it('public/index.html should not include PostHog analytics or notification-engine.js', () => {
        const content = fs.readFileSync(adminHtmlPath, 'utf8');
        expect(content.includes('posthog')).toBe(false);
        expect(content.includes('notification-engine.js')).toBe(false);
        expect(content.includes('app.checkForUpdates')).toBe(false);
    });

    it('public/music/index.html should not include PostHog analytics or notification-engine.js', () => {
        const content = fs.readFileSync(playerHtmlPath, 'utf8');
        expect(content.includes('posthog')).toBe(false);
        expect(content.includes('notification-engine.js')).toBe(false);
        expect(content.includes('checkForUpdates')).toBe(false);
    });

    it('public/sw.js should not cache notification-engine.js', () => {
        const content = fs.readFileSync(swPath, 'utf8');
        expect(content.includes('notification-engine.js')).toBe(false);
    });
});
