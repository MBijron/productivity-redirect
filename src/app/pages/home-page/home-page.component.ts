import { Component, DestroyRef, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LauncherAction, LauncherService } from '../../core/services/launcher.service';
import { ShortcutButtonComponent } from '../../shared/shortcut-button/shortcut-button.component';
import { WatchPopupComponent } from '../../shared/watch-popup/watch-popup.component';

@Component({
  selector: 'app-home-page',
  imports: [ShortcutButtonComponent, WatchPopupComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css'
})
export class HomePageComponent {
  private readonly launcherService = inject(LauncherService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly actions = this.launcherService.actions;
  protected readonly redirectDelaySeconds = computed(() => this.launcherService.redirectDelayMs / 1000);
  protected readonly showWatchPopup = this.launcherService.showWatchPopup;

  constructor() {
    // The home page owns the auto-redirect lifecycle so navigation away cancels it cleanly.
    this.launcherService.startAutoRedirect(this.route.snapshot.queryParamMap.get('preview') === '1');
    this.destroyRef.onDestroy(() => this.launcherService.cancelAutoRedirect());
  }

  protected launchAction(action: LauncherAction): void {
    this.launcherService.launchAction(action);
  }
}
