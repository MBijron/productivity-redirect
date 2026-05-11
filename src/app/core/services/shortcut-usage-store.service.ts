import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';

interface ShortcutUsageState {
  dailyDateKey: string;
  dailyCounts: Record<string, number>;
  weeklyDateKey: string;
  weeklyCounts: Record<string, number>;
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
  private readonly state = signal<ShortcutUsageState>(this.loadState());

  readonly usage: Signal<ShortcutUsageState> = this.state.asReadonly();
  readonly todayCounts: Signal<Record<string, number>> = computed(() => this.state().dailyCounts);
  readonly weekCounts: Signal<Record<string, number>> = computed(() => this.state().weeklyCounts);
  readonly dailyFactCount: Signal<number> = computed(() => this.countFor(DAILY_FACT_ACTION_ID));

  countFor(actionId: string): number {
    this.resetIfPeriodChanged();
    return this.state().dailyCounts[actionId] ?? 0;
  }

  countForWeek(actionId: string): number {
    this.resetIfPeriodChanged();
    return this.state().weeklyCounts[actionId] ?? 0;
  }

  hasUsed(actionId: string): boolean {
    return this.countFor(actionId) > 0;
  }

  increment(actionId: string): void {
    const current = this.getCurrentState();
    const next: ShortcutUsageState = {
      ...current,
      dailyCounts: {
        ...current.dailyCounts,
        [actionId]: (current.dailyCounts[actionId] ?? 0) + 1
      },
      weeklyCounts: {
        ...current.weeklyCounts,
        [actionId]: (current.weeklyCounts[actionId] ?? 0) + 1
      },
      lastUpdatedAt: new Date().toISOString()
    };

    this.commit(next);
  }

  resetIfPeriodChanged(): void {
    const current = this.state();
    const todayKey = this.getTodayKey();
    const weekKey = this.getCurrentWeekKey();
    const dailyDateKey = current.dailyDateKey === todayKey ? current.dailyDateKey : todayKey;
    const weeklyDateKey = current.weeklyDateKey === weekKey ? current.weeklyDateKey : weekKey;
    const dailyCounts = current.dailyDateKey === todayKey ? current.dailyCounts : {};
    const weeklyCounts = current.weeklyDateKey === weekKey ? current.weeklyCounts : {};
    const dailyFactReminderShown = current.dailyDateKey === todayKey ? current.dailyFactReminderShown : false;

    if (
      current.dailyDateKey === dailyDateKey &&
      current.weeklyDateKey === weeklyDateKey &&
      current.dailyCounts === dailyCounts &&
      current.weeklyCounts === weeklyCounts &&
      current.dailyFactReminderShown === dailyFactReminderShown
    ) {
      return;
    }

    this.commit({
      ...current,
      dailyDateKey,
      weeklyDateKey,
      dailyCounts,
      weeklyCounts,
      dailyFactReminderShown,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  hasShownDailyFactReminder(): boolean {
    this.resetIfPeriodChanged();
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

  private getCurrentState(): ShortcutUsageState {
    this.resetIfPeriodChanged();
    return this.state();
  }

  private commit(next: ShortcutUsageState): void {
    this.state.set(next);
    this.persist(next);
  }

  private loadState(): ShortcutUsageState {
    const todayKey = this.getTodayKey();
    const weekKey = this.getCurrentWeekKey();
    const storage = this.window?.localStorage;

    if (!storage) {
      return this.createEmptyState(todayKey, weekKey);
    }

    try {
      const rawState = storage.getItem(STORAGE_KEY);
      if (!rawState) {
        return this.createEmptyState(todayKey, weekKey);
      }

      return this.normalizeState(JSON.parse(rawState) as Partial<ShortcutUsageState>, todayKey, weekKey);
    } catch {
      return this.createEmptyState(todayKey, weekKey);
    }
  }

  private persist(state: ShortcutUsageState): void {
    try {
      this.window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage failures so launching shortcuts still works.
    }
  }

  private normalizeState(
    parsedState: Partial<ShortcutUsageState> & {
      dateKey?: string;
      counts?: Record<string, number>;
    },
    todayKey: string,
    weekKey: string
  ): ShortcutUsageState {
    const legacyDateKey = parsedState.dateKey;
    const legacyCounts = parsedState.counts;
    const dailyDateKey = parsedState.dailyDateKey ?? legacyDateKey;
    const dailyCounts = parsedState.dailyCounts ?? legacyCounts;

    return {
      dailyDateKey: dailyDateKey === todayKey && dailyCounts ? dailyDateKey : todayKey,
      dailyCounts: dailyDateKey === todayKey && dailyCounts ? dailyCounts : {},
      weeklyDateKey: weekKey,
      weeklyCounts: parsedState.weeklyDateKey === weekKey && parsedState.weeklyCounts ? parsedState.weeklyCounts : {},
      dailyFactReminderShown: dailyDateKey === todayKey && parsedState.dailyFactReminderShown === true,
      lastUpdatedAt: parsedState.lastUpdatedAt ?? new Date().toISOString()
    };
  }

  private createEmptyState(dailyDateKey: string, weeklyDateKey: string): ShortcutUsageState {
    return {
      dailyDateKey,
      dailyCounts: {},
      weeklyDateKey,
      weeklyCounts: {},
      dailyFactReminderShown: false,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  private getTodayKey(): string {
    return new Date().toLocaleDateString('en-CA');
  }

  private getCurrentWeekKey(): string {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - mondayOffset);
    return monday.toLocaleDateString('en-CA');
  }
}
