/**
 * Otomatik güncelleme: GitHub Releases'te yeni sürüm yayınlandığında indirir ve
 * kullanıcıya "yeniden başlat ve güncelle" seçeneği sunar. Yeni MCP'ler bu yolla herkese ulaşır.
 */
import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../shared/types';

const { autoUpdater } = electronUpdater;

export class Updater {
  private status: UpdateStatus = { state: 'idle' };

  constructor(private readonly onStatus: (s: UpdateStatus) => void) {}

  get current(): UpdateStatus {
    return this.status;
  }

  private set(s: UpdateStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  init(): void {
    if (!app.isPackaged) {
      this.set({ state: 'dev' });
      return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'none' }));
    autoUpdater.on('update-available', (info) => this.set({ state: 'available', version: info.version }));
    autoUpdater.on('download-progress', (p) => {
      const version = this.status.state === 'available' || this.status.state === 'downloading' ? this.status.version : '';
      this.set({ state: 'downloading', version, percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version }));
    autoUpdater.on('error', (err) => this.set({ state: 'error', message: err?.message ?? String(err) }));
    setTimeout(() => void this.check(), 8000);
    setInterval(() => void this.check(), 6 * 60 * 60 * 1000).unref();
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.status;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return this.status;
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall(false, true);
  }
}
