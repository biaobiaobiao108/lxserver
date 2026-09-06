import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Player Navigation and State Restoration Safety', () => {
    const playerSrcPath = path.join(import.meta.dir, '../frontend/player/src/index.ts');
    const playerDistPath = path.join(import.meta.dir, '../public/music/app.js');

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
        const srcContent = fs.readFileSync(playerSrcPath, 'utf8');
        const fallbackSnippetMatch = srcContent.match(/shouldFallback\s*=\s*settings\.switchPlaylistOnSongListPlay\s*===\s*false[\s\S]*?currentIndex\s*=\s*0;[\s\S]*?currentPlayingScope\s*=\s*'local_list';/);
        expect(fallbackSnippetMatch).not.toBeNull();
        if (fallbackSnippetMatch) {
            expect(fallbackSnippetMatch[0].includes("window.currentViewingListId = 'default'")).toBe(false);
        }
    });
});
