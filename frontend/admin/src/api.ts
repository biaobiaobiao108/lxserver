const API_BASE = '';

export function createAdminRequest(getPassword: () => string | null, onUnauthorized: () => void) {
    return async function request(url: string, options: RequestInit = {}): Promise<any> {
        const defaultOptions: RequestInit = {
            headers: {
                'Content-Type': 'application/json',
                'X-Frontend-Auth': getPassword() as any,
            },
        };

        const response = await fetch(API_BASE + url, { ...defaultOptions, ...options });

        if (response.status === 401) {
            onUnauthorized();
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Request failed');
        }

        return response.json();
    };
}
