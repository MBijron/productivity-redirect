import { Component, Signal, inject } from '@angular/core';
import { LauncherAction, LauncherService } from '../../core/services/launcher.service';
import { ShortcutUsageStoreService } from '../../core/services/shortcut-usage-store.service';
import { ShortcutButtonComponent } from '../../shared/shortcut-button/shortcut-button.component';
import { WatchPopupComponent } from '../../shared/watch-popup/watch-popup.component';

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
  protected readonly dailyFactCount: Signal<number> = this.shortcutUsageStore.dailyFactCount;
  protected readonly showWatchPopup: Signal<boolean> = this.launcherService.showWatchPopup;

  protected launchAction(action: LauncherAction): void {
    this.launcherService.launchAction(action);
  }

  protected usageCount(actionId: string): number {
    return this.todayCounts()[actionId] || 0;
  }
}
