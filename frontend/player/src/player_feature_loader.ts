type FeatureLoader<T> = () => Promise<T>;

const featurePromises = new Map<string, Promise<unknown>>();

/**
 * Load a player feature once and allow a failed load to be retried.
 *
 * The promise cache is deliberately kept outside the feature modules. This
 * keeps lazy-loaded modules free to own their state while the entrypoint
 * remains the single place that coordinates loading and user feedback.
 */
export function loadPlayerFeature<T>(
    name: string,
    loader: FeatureLoader<T>,
    loadingMessage = '正在加载功能模块...'
): Promise<T> {
    const cached = featurePromises.get(name) as Promise<T> | undefined;
    if (cached) return cached;

    const showLoading = (window as any).showLoading;
    const hideLoading = (window as any).hideLoading;
    if (typeof showLoading === 'function') showLoading(loadingMessage);

    const promise = loader()
        .catch((error) => {
            featurePromises.delete(name);
            const showError = (window as any).showError;
            if (typeof showError === 'function') {
                showError('功能模块加载失败，请稍后重试');
            }
            throw error;
        })
        .finally(() => {
            if (typeof hideLoading === 'function') hideLoading();
        });

    featurePromises.set(name, promise);
    return promise;
}

export function isPlayerFeatureLoaded(name: string): boolean {
    return featurePromises.has(name);
}
