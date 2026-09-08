import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.join(import.meta.dir, '..');

function read(relativePath: string): string {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Player manager module boundaries', () => {
    it('does not expose song list or download managers through window', () => {
        const source = [
            read('frontend/player/src/legacy/songlist_manager.ts'),
            read('frontend/player/src/legacy/download_manager.ts'),
            read('frontend/player/src/index.ts'),
        ].join('\n');

        expect(source).not.toContain('window.SongListManager');
        expect(source).not.toContain('window.SystemDownloadManager');
    });

    it('uses delegated data actions instead of manager inline handlers', () => {
        const html = read('public/music/index.html');
        const songListSource = read('frontend/player/src/legacy/songlist_manager.ts');
        const downloadSource = read('frontend/player/src/legacy/download_manager.ts');

        expect(html).not.toContain('songlist_manager.js');
        expect(html).not.toContain('download_manager.js');
        expect(html).toContain('data-songlist-action="open-external"');
        expect(songListSource).toContain('data-songlist-action="open-detail"');
        expect(html).toContain('data-download-action="retry-all-failed"');
        expect(songListSource).toContain("closest('[data-songlist-action]')");
        expect(downloadSource).toContain("closest('[data-download-action]')");
        expect(songListSource).not.toContain('onclick="window.SongListManager');
        expect(downloadSource).not.toContain('onclick="window.SystemDownloadManager');
    });

    it('does not cache removed standalone manager bundles', () => {
        const serviceWorker = read('public/music/sw.js');
        expect(serviceWorker).not.toContain('./js/songlist_manager.js');
        expect(serviceWorker).not.toContain('./js/download_manager.js');
    });
});
