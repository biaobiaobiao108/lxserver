import CryptoJS from 'crypto-js';
import * as pako from 'pako';
import NoSleep from 'nosleep.js';
import Sortable from 'sortablejs';

const runtime = globalThis as typeof globalThis & {
  CryptoJS: typeof CryptoJS;
  pako: typeof pako;
  NoSleep: typeof NoSleep;
  Sortable: typeof Sortable;
};

runtime.CryptoJS = CryptoJS;
runtime.pako = pako;
runtime.NoSleep = NoSleep;
runtime.Sortable = Sortable;
