type QualityEntry = string | { type?: string; isPlatformQuality?: boolean };

const QUALITY_PRIORITY = ['master', 'atmos_plus', 'atmos', 'hires', 'flac24bit', 'flac', '320k', '192k', '128k'];
const QUALITY_ORDER_LOW_TO_HIGH = [...QUALITY_PRIORITY].reverse();
const PLATFORM_SELECTABLE_QUALITIES: Record<string, string[]> = {
    tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
    wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
};
const QUALITY_NAMES: Record<string, string> = {
    master: '母带音质', atmos_plus: '增强空间音频', atmos: '空间音频', hires: '高解析度',
    flac24bit: '24bit无损', flac: '无损音质', '320k': '高音质', '192k': '192k', '128k': '128k',
};
const QUALITY_COLORS: Record<string, string> = {
    master: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700/50',
    atmos_plus: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-700/50',
    atmos: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700/50',
    hires: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50',
    flac24bit: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
    flac: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
    '320k': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
    '192k': 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50',
    '128k': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

function getRawQualityData(songInfo: any): any {
    if (!songInfo) return {};
    return songInfo.types || songInfo._types || songInfo.qualitys || songInfo._qualitys ||
        (songInfo.meta && (songInfo.meta.qualitys || songInfo.meta._qualitys || songInfo.meta.types || songInfo.meta._types)) || {};
}

function sortQualitiesLowToHigh(qualities: string[]): string[] {
    return qualities.filter(Boolean).sort((a, b) => {
        const aIndex = QUALITY_ORDER_LOW_TO_HIGH.indexOf(a);
        const bIndex = QUALITY_ORDER_LOW_TO_HIGH.indexOf(b);
        return (aIndex === -1 ? QUALITY_ORDER_LOW_TO_HIGH.length : aIndex) -
            (bIndex === -1 ? QUALITY_ORDER_LOW_TO_HIGH.length : bIndex);
    });
}

function isQualityEntryAvailable(entry: any): boolean {
    return !!entry && (typeof entry !== 'object' || !entry.isPlatformQuality);
}

function getAvailableQualities(songInfo: any): string[] {
    if (!songInfo) return ['128k'];
    const types = getRawQualityData(songInfo);
    if (Array.isArray(types)) {
        return sortQualitiesLowToHigh(types.filter(isQualityEntryAvailable).map((item: QualityEntry) =>
            typeof item === 'string' ? item : item.type || ''));
    }
    return sortQualitiesLowToHigh(Object.keys(types).filter(key => isQualityEntryAvailable(types[key])));
}

function getSelectableQualities(songInfo: any): string[] {
    const source = songInfo?.source || songInfo?.meta?.source;
    return PLATFORM_SELECTABLE_QUALITIES[source] ? [...PLATFORM_SELECTABLE_QUALITIES[source]] : getAvailableQualities(songInfo);
}

function getBestQuality(songInfo: any, userPreference = '320k'): string {
    if (!songInfo) return '128k';
    const available = getAvailableQualities(songInfo);
    if (!available.length) return '128k';
    const startIndex = QUALITY_PRIORITY.indexOf(userPreference);
    if (startIndex === -1) return available[0] || '128k';
    for (let i = startIndex; i < QUALITY_PRIORITY.length; i++) {
        if (available.includes(QUALITY_PRIORITY[i])) return QUALITY_PRIORITY[i];
    }
    return available[0] || '128k';
}

function getNextLowerQuality(currentQuality: string, songInfo: any = null): string | null {
    const index = QUALITY_PRIORITY.indexOf(currentQuality);
    if (index === -1 || index === QUALITY_PRIORITY.length - 1) return null;
    const available = songInfo ? getAvailableQualities(songInfo) : null;
    for (let i = index + 1; i < QUALITY_PRIORITY.length; i++) {
        if (!available || available.includes(QUALITY_PRIORITY[i])) return QUALITY_PRIORITY[i];
    }
    return null;
}

function getQualityDisplayName(quality: string): string {
    return QUALITY_NAMES[quality] || String(quality || '').toUpperCase();
}

function getQualityBadgeLabel(quality: string): string {
    switch (String(quality || '').toLowerCase()) {
        case 'master': return 'Master';
        case 'atmos_plus': return 'Atmos+';
        case 'atmos': return 'Atmos';
        case 'hires':
        case 'flac24bit': return 'Hi-Res';
        case 'flac': return 'SQ';
        case '320k': return '320K';
        case '192k': return '192K';
        case '128k': return '128K';
        default: return String(quality || '').toUpperCase();
    }
}

function getQualityBadgeClass(quality: string): string {
    const normalized = String(quality || '').toLowerCase();
    if (normalized === 'flac') return 'badge-quality-sq';
    if (normalized === 'hires' || normalized === 'flac24bit') return 'badge-quality-hires';
    return 'badge-quality-runtime';
}

function getQualityColor(quality: string): string {
    return QUALITY_COLORS[quality] || QUALITY_COLORS['128k'];
}

const qualityManager = {
    QUALITY_PRIORITY,
    QUALITY_ORDER_LOW_TO_HIGH,
    PLATFORM_SELECTABLE_QUALITIES,
    QUALITY_NAMES,
    QUALITY_COLORS,
    getBestQuality,
    getNextLowerQuality,
    getAvailableQualities,
    getSelectableQualities,
    getQualityDisplayName,
    getQualityBadgeLabel,
    getQualityBadgeClass,
    getQualityColor,
    isQualityAvailable: (songInfo: any, quality: string) => getAvailableQualities(songInfo).includes(quality),
};

(window as any).QualityManager = qualityManager;
export { qualityManager };
