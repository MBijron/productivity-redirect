import { Component, Signal, computed, inject } from '@angular/core';
import { LauncherAction, LauncherService } from '../../core/services/launcher.service';
import { ShortcutUsageStoreService } from '../../core/services/shortcut-usage-store.service';
import { ShortcutButtonComponent } from '../../shared/shortcut-button/shortcut-button.component';
import { WatchPopupComponent } from '../../shared/watch-popup/watch-popup.component';

type UsagePeriodLabel = 'today' | 'this week';

interface HomeActionViewModel {
  action: LauncherAction;
  usageCount: number;
  usagePeriodLabel: UsagePeriodLabel;
  urgent: boolean;
  faded: boolean;
  disabled: boolean;
  priorityCount: number;
}

const IMPORTANT_ACTION_IDS = [
  'open-elevate',
  'open-duolingo',
  'open-daily-fact',
  'open-ai-news-summary'
] as const;

const IMPORTANT_ACTION_ORDER = new Map<string, number>(IMPORTANT_ACTION_IDS.map((id, index) => [id, index]));
const SECONDARY_ACTION_IDS = ['open-google-play-books', 'open-random-wikipedia', 'open-breathing'] as const;
const NEWS_ACTION_ID = 'open-ai-news-summary';

@Component({
  selector: 'app-home-page',
  imports: [ShortcutButtonComponent, WatchPopupComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css'
})
export class HomePageComponent {
  private readonly launcherService: LauncherService = inject(LauncherService);
  private readonly shortcutUsageStore: ShortcutUsageStoreService = inject(ShortcutUsageStoreService);

  protected readonly actions: readonly LauncherAction[] = this.launcherService.actions;
  protected readonly todayCounts: Signal<Record<string, number>> = this.shortcutUsageStore.todayCounts;
  protected readonly weekCounts: Signal<Record<string, number>> = this.shortcutUsageStore.weekCounts;
  protected readonly dailyFactCount: Signal<number> = this.shortcutUsageStore.dailyFactCount;
  protected readonly showWatchPopup: Signal<boolean> = this.launcherService.showWatchPopup;
  protected readonly displayedActions: Signal<readonly HomeActionViewModel[]> = computed(() => {
    const importantActions = this.actions
      .filter((action) => IMPORTANT_ACTION_ORDER.has(action.id))
      .map((action) => this.toViewModel(action))
      .sort((left, right) => this.compareImportantActions(left, right));

    const secondaryActions = SECONDARY_ACTION_IDS
      .map((actionId) => this.actions.find((action) => action.id === actionId))
      .filter((action): action is LauncherAction => action !== undefined)
      .map((action) => this.toViewModel(action));

    return [...importantActions, ...secondaryActions];
  });

  protected launchAction(action: LauncherAction): void {
    this.launcherService.launchAction(action);
  }

  protected usageCount(actionId: string): number {
    return this.todayCounts()[actionId] || 0;
  }

  private toViewModel(action: LauncherAction): HomeActionViewModel {
    const isNews = action.id === NEWS_ACTION_ID;
    const priorityCount = isNews ? this.shortcutUsageStore.countForWeek(action.id) : this.shortcutUsageStore.countFor(action.id);

    return {
      action,
      usageCount: priorityCount,
      usagePeriodLabel: isNews ? 'this week' : 'today',
      urgent: IMPORTANT_ACTION_ORDER.has(action.id) && priorityCount === 0,
      faded: isNews && priorityCount > 0,
      disabled: isNews && priorityCount >= 3,
      priorityCount
    };
  }

  private compareImportantActions(left: HomeActionViewModel, right: HomeActionViewModel): number {
    if (left.urgent !== right.urgent) {
      return left.urgent ? -1 : 1;
    }

    if (left.priorityCount !== right.priorityCount) {
      return left.priorityCount - right.priorityCount;
    }

    return (IMPORTANT_ACTION_ORDER.get(left.action.id) ?? Number.MAX_SAFE_INTEGER)
      - (IMPORTANT_ACTION_ORDER.get(right.action.id) ?? Number.MAX_SAFE_INTEGER);
  }
}
