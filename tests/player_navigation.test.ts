import { describe, it, expect, beforeAll } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Player Navigation and State Restoration Safety', () => {
    const playerSrcPath = path.join(import.meta.dir, '../frontend/player/src/index.ts');
    const playbackSrcPath = path.join(import.meta.dir, '../frontend/player/src/features/playback.ts');
    const searchSrcPath = path.join(import.meta.dir, '../frontend/player/src/features/search.ts');
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
        const activeTabRule = css.match(/\.active-tab\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const highlightRule = css.match(/\.cs-wrapper\.highlight \.cs-trigger\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const activeSelectRule = css.match(/\.cs-wrapper\.active \.cs-trigger\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        const triggerFocusRule = css.match(/\.cs-trigger:focus-visible\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        expect(activeTabRule.includes('border-right')).toBe(false);
        expect(highlightRule.includes('border-color')).toBe(false);
        expect(highlightRule.includes('box-shadow')).toBe(false);
        expect(activeSelectRule.includes('border-color')).toBe(false);
        expect(activeSelectRule.includes('box-shadow')).toBe(false);
        expect(triggerFocusRule.includes('outline: none')).toBe(true);
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
