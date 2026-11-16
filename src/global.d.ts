import type { MaraiApi } from '../shared/api';

declare global {
  interface Window {
    marai: MaraiApi;
  }
}

export {};
