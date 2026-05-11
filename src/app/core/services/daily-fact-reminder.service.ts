import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { ShortcutUsageStoreService } from './shortcut-usage-store.service';

const DAILY_FACT_ACTION_ID = 'open-daily-fact';
const REMINDER_HOUR = 15;

@Injectable({
  providedIn: 'root'
})
export class DailyFactReminderService {
  private readonly document: Document = inject(DOCUMENT);
  private readonly usageStore: ShortcutUsageStoreService = inject(ShortcutUsageStoreService);
  private readonly window: Window | null = this.document.defaultView;
  private reminderHandle: number | null = null;
  private initialized = false;

  initialize(): void {
    if (!this.window || this.initialized) {
      return;
    }

    this.initialized = true;
    this.syncReminderSchedule();
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') {
        this.syncReminderSchedule();
      }
    });
  }

  handleUserInteraction(): void {
    this.requestPermissionIfSupported();
    this.syncReminderSchedule();
  }

  private syncReminderSchedule(): void {
    this.clearReminderHandle();
    this.usageStore.resetIfPeriodChanged();

    if (this.usageStore.hasUsed(DAILY_FACT_ACTION_ID) || this.usageStore.hasShownDailyFactReminder()) {
      return;
    }

    const reminderAt = new Date();
    reminderAt.setHours(REMINDER_HOUR, 0, 0, 0);

    if (Date.now() >= reminderAt.getTime()) {
      this.notifyIfNeeded();
      return;
    }

    this.reminderHandle = this.window?.setTimeout(() => {
      this.notifyIfNeeded();
    }, reminderAt.getTime() - Date.now()) ?? null;
  }

  private notifyIfNeeded(): void {
    this.usageStore.resetIfPeriodChanged();
    if (this.usageStore.hasUsed(DAILY_FACT_ACTION_ID) || this.usageStore.hasShownDailyFactReminder()) {
      return;
    }

    if (!('Notification' in this.window!) || Notification.permission !== 'granted') {
      return;
    }

    new Notification('Daily Fact reminder', {
      body: 'You have not opened Daily Fact yet today.',
      tag: 'daily-fact-reminder'
    });
    this.usageStore.markDailyFactReminderShown();
  }

  private requestPermissionIfSupported(): void {
    if (!this.window || !('Notification' in this.window) || Notification.permission !== 'default') {
      return;
    }

    void Notification.requestPermission().then(() => this.syncReminderSchedule());
  }

  private clearReminderHandle(): void {
    if (this.reminderHandle === null || !this.window) {
      return;
    }

    this.window.clearTimeout(this.reminderHandle);
    this.reminderHandle = null;
  }
}
