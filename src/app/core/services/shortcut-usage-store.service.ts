import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';

interface DailyShortcutUsageState {
  dateKey: string;
  counts: Record<string, number>;
  dailyFactReminderShown: boolean;
  lastUpdatedAt: string;
}

const STORAGE_KEY = 'productivity-redirect.daily-usage';
const DAILY_FACT_ACTION_ID = 'open-daily-fact';

@Injectable({
  providedIn: 'root'
})
export class ShortcutUsageStoreService {
  private readonly document: Document = inject(DOCUMENT);
  private readonly window: Window | null = this.document.defaultView;
  private readonly state = signal<DailyShortcutUsageState>(this.loadState());

  readonly usage: Signal<DailyShortcutUsageState> = this.state.asReadonly();
  readonly todayCounts: Signal<Record<string, number>> = computed(() => this.state().counts);
  readonly dailyFactCount: Signal<number> = computed(() => this.countFor(DAILY_FACT_ACTION_ID));

  countFor(actionId: string): number {
    this.resetIfDayChanged();
    return this.state().counts[actionId] ?? 0;
  }

  hasUsed(actionId: string): boolean {
    return this.countFor(actionId) > 0;
  }

  increment(actionId: string): void {
    const current = this.getCurrentState();
    const next: DailyShortcutUsageState = {
      ...current,
      counts: {
        ...current.counts,
        [actionId]: (current.counts[actionId] ?? 0) + 1
      },
      lastUpdatedAt: new Date().toISOString()
    };

    this.commit(next);
  }

  resetIfDayChanged(): void {
    const todayKey = this.getTodayKey();
    if (this.state().dateKey === todayKey) {
      return;
    }

    this.commit(this.createEmptyState(todayKey));
  }

  hasShownDailyFactReminder(): boolean {
    this.resetIfDayChanged();
    return this.state().dailyFactReminderShown;
  }

  markDailyFactReminderShown(): void {
    const current = this.getCurrentState();
    if (current.dailyFactReminderShown) {
      return;
    }

    this.commit({
      ...current,
      dailyFactReminderShown: true,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  private getCurrentState(): DailyShortcutUsageState {
    this.resetIfDayChanged();
    return this.state();
  }

  private commit(next: DailyShortcutUsageState): void {
    this.state.set(next);
    this.persist(next);
  }

  private loadState(): DailyShortcutUsageState {
    const todayKey = this.getTodayKey();
    const storage = this.window?.localStorage;

    if (!storage) {
      return this.createEmptyState(todayKey);
    }

    try {
      const rawState = storage.getItem(STORAGE_KEY);
      if (!rawState) {
        return this.createEmptyState(todayKey);
      }

      const parsedState = JSON.parse(rawState) as Partial<DailyShortcutUsageState>;
      if (parsedState.dateKey !== todayKey || !parsedState.counts) {
        return this.createEmptyState(todayKey);
      }

      return {
        dateKey: parsedState.dateKey,
        counts: parsedState.counts,
        dailyFactReminderShown: parsedState.dailyFactReminderShown === true,
        lastUpdatedAt: parsedState.lastUpdatedAt ?? new Date().toISOString()
      };
    } catch {
      return this.createEmptyState(todayKey);
    }
  }

  private persist(state: DailyShortcutUsageState): void {
    try {
      this.window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage failures so launching shortcuts still works.
    }
  }

  private createEmptyState(dateKey: string): DailyShortcutUsageState {
    return {
      dateKey,
      counts: {},
      dailyFactReminderShown: false,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  private getTodayKey(): string {
    return new Date().toLocaleDateString('en-CA');
  }
}
