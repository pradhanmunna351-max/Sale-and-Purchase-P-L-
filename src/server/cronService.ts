import { mongoService, BATCH_CONFIG } from './db.js';
import { AutoSyncConfig, KeepAliveConfig } from '../types.js';
import { mapRecordByColumnMapping } from './schemaMapper.js';
import Papa from 'papaparse';

// Auto-Sync background cron state
class BackgroundSyncManager {
  private autoSyncIntervalId: NodeJS.Timeout | null = null;
  private keepAliveIntervalId: NodeJS.Timeout | null = null;

  public autoSyncConfig: AutoSyncConfig = {
    enabled: true,
    intervalMinutes: 10, // Sync every 10 mins automatically
    lastAutoSyncTime: null,
    nextAutoSyncTime: null,
    syncHistory: [],
  };

  public keepAliveConfig: KeepAliveConfig = {
    enabled: true,
    intervalMinutes: 5, // Ping every 5 minutes to prevent Render free-tier sleep
    targetUrl: process.env.APP_URL || 'http://localhost:3000',
    pingsSent: 0,
    lastPingTime: null,
    lastPingStatus: 'idle',
    lastPingLatencyMs: 0,
  };

  constructor() {
    this.init();
  }

  private async init() {
    // Read persisted configs from MongoDB if available
    try {
      const savedAutoSync = await mongoService.getConfig('autoSyncConfig');
      if (savedAutoSync) {
        this.autoSyncConfig = { ...this.autoSyncConfig, ...savedAutoSync };
      }
      const savedKeepAlive = await mongoService.getConfig('keepAliveConfig');
      if (savedKeepAlive) {
        this.keepAliveConfig = { ...this.keepAliveConfig, ...savedKeepAlive };
      }
    } catch {}

    this.startAutoSyncCron();
    this.startKeepAliveCron();
  }

  // Google Sheets Auto-Sync Scheduler
  public startAutoSyncCron(minutes?: number) {
    if (this.autoSyncIntervalId) {
      clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }

    if (minutes !== undefined) {
      this.autoSyncConfig.intervalMinutes = Math.max(1, minutes);
    }

    if (!this.autoSyncConfig.enabled) return;

    const intervalMs = this.autoSyncConfig.intervalMinutes * 60 * 1000;
    this.autoSyncConfig.nextAutoSyncTime = new Date(Date.now() + intervalMs).toLocaleTimeString('en-US');

    this.autoSyncIntervalId = setInterval(async () => {
      await this.runAutoSync();
    }, intervalMs);

    console.log(`⏱️ Auto-Sync cron scheduled every ${this.autoSyncConfig.intervalMinutes} minutes.`);
  }

  public stopAutoSyncCron() {
    if (this.autoSyncIntervalId) {
      clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
    this.autoSyncConfig.enabled = false;
    this.autoSyncConfig.nextAutoSyncTime = null;
    mongoService.setConfig('autoSyncConfig', this.autoSyncConfig);
  }

  // Trigger immediate automatic sync across all 4 sheet links
  public async runAutoSync(customUrls?: Record<string, string>): Promise<{
    success: boolean;
    counts: { sales: number; purchase: number; expense: number; payment: number };
    message: string;
    elapsedMs: number;
  }> {
    const startTime = Date.now();
    const sheetUrls = customUrls || (await mongoService.getConfig('sheetUrls')) || {};

    const syncSingleCategory = async (url: string, category: 'sales' | 'purchase' | 'expense' | 'payment'): Promise<number> => {
      if (!url || typeof url !== 'string' || !url.trim()) return 0;
      let csvUrl = url.trim();
      const match = csvUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const sheetId = match[1];
        let gid = '0';
        const gidMatch = csvUrl.match(/gid=([0-9]+)/);
        if (gidMatch) gid = gidMatch[1];
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      }

      const resp = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });

      if (!resp.ok) return 0;

      const csvText = await resp.text();
      const parsed = Papa.parse(csvText, { skipEmptyLines: true });
      if (!parsed.data || parsed.data.length < 2) return 0;

      const headers = (parsed.data[0] as string[]).map((h) => String(h || '').trim());
      const rawRows = (parsed.data.slice(1) as string[][]).filter((row) =>
        row.some((cell) => cell && String(cell).trim() !== '')
      );

      const rawRecords = rawRows.map((row) => {
        const obj: Record<string, any> = {};
        headers.forEach((h, index) => {
          obj[h] = row[index] || '';
        });
        return obj;
      });

      const cachedKeys = rawRecords.length > 0 ? Object.keys(rawRecords[0]).map(k => ({ original: k, lower: k.toLowerCase().trim() })) : [];
      const mappedRecords = rawRecords.map((r, idx) => mapRecordByColumnMapping(r, {}, category, idx, cachedKeys));

      const collectionMap: Record<string, 'sales' | 'purchases' | 'expenses' | 'payments'> = {
        sales: 'sales',
        purchase: 'purchases',
        expense: 'expenses',
        payment: 'payments',
      };

      const result = await mongoService.chunkedBatchInsert(collectionMap[category], mappedRecords, {
        chunkSize: BATCH_CONFIG.DEFAULT_CHUNK_SIZE,
        concurrency: BATCH_CONFIG.MAX_CONCURRENCY,
        replaceAll: true,
      });

      return result.totalRecords;
    };

    let salesCount = 0;
    let purchaseCount = 0;
    let expenseCount = 0;
    let paymentCount = 0;

    try {
      const results = await Promise.allSettled([
        sheetUrls.sales ? syncSingleCategory(sheetUrls.sales, 'sales') : Promise.resolve(0),
        sheetUrls.purchase ? syncSingleCategory(sheetUrls.purchase, 'purchase') : Promise.resolve(0),
        sheetUrls.expense ? syncSingleCategory(sheetUrls.expense, 'expense') : Promise.resolve(0),
        sheetUrls.payment ? syncSingleCategory(sheetUrls.payment, 'payment') : Promise.resolve(0),
      ]);

      if (results[0].status === 'fulfilled') salesCount = results[0].value;
      if (results[1].status === 'fulfilled') purchaseCount = results[1].value;
      if (results[2].status === 'fulfilled') expenseCount = results[2].value;
      if (results[3].status === 'fulfilled') paymentCount = results[3].value;

      const elapsedMs = Math.max(Date.now() - startTime, 1);
      const timestamp = new Date().toLocaleTimeString('en-US');

      this.autoSyncConfig.lastAutoSyncTime = timestamp;
      const intervalMs = this.autoSyncConfig.intervalMinutes * 60 * 1000;
      this.autoSyncConfig.nextAutoSyncTime = new Date(Date.now() + intervalMs).toLocaleTimeString('en-US');

      const logItem = {
        timestamp,
        success: true,
        counts: { sales: salesCount, purchase: purchaseCount, expense: expenseCount, payment: paymentCount },
        message: `Auto-synced ${salesCount + purchaseCount + expenseCount + paymentCount} docs directly into MongoDB`,
        elapsedMs,
      };

      this.autoSyncConfig.syncHistory.unshift(logItem);
      if (this.autoSyncConfig.syncHistory.length > 20) {
        this.autoSyncConfig.syncHistory.pop();
      }

      await mongoService.setConfig('autoSyncConfig', this.autoSyncConfig);

      console.log(`🔄 [Auto-Sync]: Synchronized database in ${elapsedMs}ms (Sales: ${salesCount}, Purchases: ${purchaseCount}, Expenses: ${expenseCount}, Payments: ${paymentCount})`);

      return {
        success: true,
        counts: { sales: salesCount, purchase: purchaseCount, expense: expenseCount, payment: paymentCount },
        message: logItem.message,
        elapsedMs,
      };
    } catch (err: any) {
      const elapsedMs = Math.max(Date.now() - startTime, 1);
      const timestamp = new Date().toLocaleTimeString('en-US');
      this.autoSyncConfig.syncHistory.unshift({
        timestamp,
        success: false,
        counts: { sales: 0, purchase: 0, expense: 0, payment: 0 },
        message: `Auto-sync error: ${err.message}`,
        elapsedMs,
      });
      return {
        success: false,
        counts: { sales: 0, purchase: 0, expense: 0, payment: 0 },
        message: err.message,
        elapsedMs,
      };
    }
  }

  // Render Keep-Alive Ping Service
  public startKeepAliveCron(targetUrl?: string, minutes?: number) {
    if (this.keepAliveIntervalId) {
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    }

    if (targetUrl) this.keepAliveConfig.targetUrl = targetUrl;
    if (minutes !== undefined) this.keepAliveConfig.intervalMinutes = Math.max(1, minutes);

    if (!this.keepAliveConfig.enabled) return;

    const intervalMs = this.keepAliveConfig.intervalMinutes * 60 * 1000;

    this.keepAliveIntervalId = setInterval(async () => {
      await this.pingKeepAlive();
    }, intervalMs);

    console.log(`💓 Render 24/7 Keep-Alive ping scheduled every ${this.keepAliveConfig.intervalMinutes} minutes for: ${this.keepAliveConfig.targetUrl}`);
  }

  public async pingKeepAlive(): Promise<boolean> {
    const pingTarget = this.keepAliveConfig.targetUrl.replace(/\/+$/, '') + '/api/health';
    const pingStart = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(pingTarget, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Render-KeepAlive-Cron/1.0' },
      });
      clearTimeout(timeout);

      this.keepAliveConfig.pingsSent += 1;
      this.keepAliveConfig.lastPingTime = new Date().toLocaleTimeString('en-US');
      this.keepAliveConfig.lastPingLatencyMs = Date.now() - pingStart;
      this.keepAliveConfig.lastPingStatus = res.ok ? 'ok' : 'error';

      await mongoService.setConfig('keepAliveConfig', this.keepAliveConfig);
      console.log(`💓 [Keep-Alive Ping #${this.keepAliveConfig.pingsSent}]: ${pingTarget} -> ${res.status} OK (${this.keepAliveConfig.lastPingLatencyMs}ms)`);
      return res.ok;
    } catch (err: any) {
      this.keepAliveConfig.pingsSent += 1;
      this.keepAliveConfig.lastPingTime = new Date().toLocaleTimeString('en-US');
      this.keepAliveConfig.lastPingLatencyMs = Date.now() - pingStart;
      this.keepAliveConfig.lastPingStatus = 'error';
      console.warn(`⚠️ [Keep-Alive Ping Warning]:`, err.message);
      return false;
    }
  }

  public stopKeepAliveCron() {
    if (this.keepAliveIntervalId) {
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    }
    this.keepAliveConfig.enabled = false;
    mongoService.setConfig('keepAliveConfig', this.keepAliveConfig);
  }
}

export const syncManager = new BackgroundSyncManager();
