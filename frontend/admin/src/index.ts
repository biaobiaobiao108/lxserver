/*
 * Copyright 2026 xcq0607 (https://github.com/xcq0607)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { initAdminAccessibility } from './accessibility';
import { createAdminRequest } from './api';
import { initConfigFeature } from './features/config';
import { initDashboardFeature } from './features/dashboard';
import { initDataFeature } from './features/data';
import { initLogsFeature } from './features/logs';
import { initShellFeature } from './features/shell';
import { initSnapshotsFeature } from './features/snapshots';
import { initUsersFeature } from './features/users';
import { initWebDAVFeature } from './features/webdav';
import {
    escapeHtml,
    formatFileSize,
    formatMemory,
    formatTime,
    formatUptime,
    safeInlineString,
    safeResourceUrl,
    stringToColor,
} from './utils';

class App {
    [key: string]: any;
    password: string | null = null;
    currentView = 'dashboard';
    users: any[] = [];
    allUsers: any[] = [];
    configLoaded = false;
    currentUserData: any = null;
    currentPlaylistView: number | string | null = null;
    editingUser: string | null = null;
    deferredPrompt: any = null;
    monitorTimer: ReturnType<typeof setInterval> | null = null;
    systemCpuHistory: number[] = [];
    processCpuHistory: number[] = [];
    systemMemHistory: number[] = [];
    processMemHistory: number[] = [];
    request: (url: string, options?: RequestInit) => Promise<any>;

    constructor() {
        this.request = createAdminRequest(() => this.password, () => this.logout());
        this.initializeFeatures();
        this.init();
    }

    private initializeFeatures(): void {
        const sharedMethods = {
            escapeHtml,
            formatFileSize,
            formatMemory,
            formatTime,
            formatUptime,
            safeInlineString,
            safeResourceUrl,
            stringToColor,
        };

        Object.assign(
            this,
            sharedMethods,
            initShellFeature({ app: this }),
            initDashboardFeature({ app: this }),
            initUsersFeature({ app: this }),
            initDataFeature({ app: this }),
            initConfigFeature({ app: this }),
            initLogsFeature({ app: this }),
            initWebDAVFeature({ app: this }),
            initSnapshotsFeature({ app: this }),
        );
    }

    private init(): void {
        initAdminAccessibility();

        this.bindShellEvents();
        this.bindUsersEvents();
        this.bindDataEvents();
        this.bindConfigEvents();
        this.bindLogsEvents();
        this.bindWebDAVFeatureEvents();
        this.bindSnapshotsEvents();

        const savedPassword = window.sessionStorage.getItem('lx_auth');
        if (savedPassword) {
            this.password = savedPassword;
            this.showApp();
            void this.loadConfig();
            void this.loadDashboard();
        }
    }
}

const app = new App();
(window as any).app = app;
