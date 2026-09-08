import type { DownloadManager } from './legacy/download_manager';
import type { SongListManagerApi } from './legacy/songlist_manager';

let songListManager: SongListManagerApi | null = null;
let downloadManager: DownloadManager | null = null;

export function registerSongListManager(manager: SongListManagerApi): void {
    songListManager = manager;
}

export function registerDownloadManager(manager: DownloadManager): void {
    downloadManager = manager;
}

export function getSongListManager(): SongListManagerApi | null {
    return songListManager;
}

export function getDownloadManager(): DownloadManager | null {
    return downloadManager;
}
