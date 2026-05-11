import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

interface PathIconShape {
  type: 'path';
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface CircleIconShape {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

type IconShape = PathIconShape | CircleIconShape;

export interface LauncherAction {
  id: string;
  label: string;
  target: string;
  className: string;
  kind: 'tasker' | 'route';
  icon: {
    viewBox: string;
    shapes: IconShape[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class LauncherService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly window = this.document.defaultView;
  private redirectHandle: number | null = null;
  private popupHandle: number | null = null;

  readonly redirectDelayMs = 1000;
  readonly showWatchPopup = signal(false);
  readonly actions: LauncherAction[] = [
    {
      id: 'open-elevate',
      label: 'Open Elevate',
      target: 'tasker://assistantactions?task=OpenProductivity',
      className: '',
      kind: 'tasker',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [{ type: 'path', fill: 'currentColor', d: 'M6.5 18 12 6l5.5 12h-3.3L12 12.8 9.8 18z' }]
      }
    },
    {
      id: 'open-google-play-books',
      label: 'Open Play Books',
      target: 'tasker://assistantactions?task=OpenBooks',
      className: 'button-play-books',
      kind: 'tasker',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [{ type: 'path', fill: 'currentColor', d: 'M6.5 6A2.5 2.5 0 0 0 4 8.5v8.3c0 .5.6.8 1 .5a8.1 8.1 0 0 1 4.5-1.4c1.4 0 2.8.4 4 1.1V7.7A7.6 7.6 0 0 0 9.5 6Zm11 0h-3a7.6 7.6 0 0 0-4 1.1V17a8.2 8.2 0 0 1 4-1.1c1.6 0 3.1.5 4.5 1.4.4.3 1 0 1-.5V8.5A2.5 2.5 0 0 0 17.5 6Z' }]
      }
    },
    {
      id: 'open-breathing',
      label: 'Breathing',
      target: 'tasker://assistantactions?task=StartBreathingExercise',
      className: 'button-breathing',
      kind: 'tasker',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [
          { type: 'circle', cx: 12, cy: 12, r: 6.1, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
          { type: 'circle', cx: 12, cy: 12, r: 1.45, fill: 'currentColor' },
          { type: 'path', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, d: 'M12 3.8v3.5M12 16.7v3.5M3.8 12h3.5M16.7 12h3.5M6.4 6.4l2.5 2.5M15.1 15.1l2.5 2.5M17.6 6.4l-2.5 2.5M8.9 15.1l-2.5 2.5' }
        ]
      }
    },
    {
      id: 'open-random-wikipedia',
      label: 'Random Wikipedia',
      target: 'wikipedia',
      className: 'button-wide button-wikipedia',
      kind: 'route',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [
          { type: 'path', fill: 'currentColor', d: 'M6 5h12v2H6zm0 4h7v2H6zm0 4h12v2H6zm0 4h8v2H6z' },
          { type: 'path', fill: 'currentColor', d: 'm15.9 9.1 1.4 1.4-1.8 1.8H20v2h-4.5l1.8 1.8-1.4 1.4-4.2-4.2z' }
        ]
      }
    },
    {
      id: 'open-duolingo',
      label: 'Open Duolingo',
      target: 'tasker://assistantactions?task=OpenDuolingo',
      className: 'button-wide button-duolingo',
      kind: 'tasker',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [{ type: 'path', fill: 'currentColor', d: 'M12 4.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Zm4.6 6.2h-2.2a11.5 11.5 0 0 0-.7-3 5.3 5.3 0 0 1 2.9 3Zm-4.6-3.8c.5.7 1 1.9 1.2 3.8h-2.4c.2-1.9.7-3.1 1.2-3.8Zm-1.7.8a11.5 11.5 0 0 0-.7 3H7.4a5.3 5.3 0 0 1 2.9-3Zm-2.9 4.6h2.2c.1 1.1.3 2.1.7 3a5.3 5.3 0 0 1-2.9-3Zm4.6 3.8c-.5-.7-1-1.9-1.2-3.8h2.4c-.2 1.9-.7 3.1-1.2 3.8Zm1.7-.8c.4-.9.6-1.9.7-3h2.2a5.3 5.3 0 0 1-2.9 3Z' }]
      }
    },
    {
      id: 'open-ai-news-summary',
      label: 'News Summary',
      target: 'tasker://assistantactions?task=AiNewsSummary',
      className: 'button-wide button-insights',
      kind: 'tasker',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [{ type: 'path', fill: 'currentColor', d: 'M5 5.5A1.5 1.5 0 0 1 6.5 4h9A1.5 1.5 0 0 1 17 5.5V7h1.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 17.5V17H6.5A1.5 1.5 0 0 1 5 15.5Zm3 1.5h7V5.5a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5H8Zm1.5 2a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5ZM11 11h6v1h-6Zm0 3h6v1h-6Zm0 3h4v1h-4Z' }]
      }
    },
    {
      id: 'open-daily-fact',
      label: 'Daily Fact',
      target: 'tasker://assistantactions?task=AiWorldlyKnowledge',
      className: 'button-wide button-insights',
      kind: 'tasker',
      icon: {
        viewBox: '0 0 24 24',
        shapes: [{ type: 'path', fill: 'currentColor', d: 'M12 3.5a6 6 0 0 1 6 6c0 2.1-1 3.8-2.4 5.2-.8.8-1.2 1.5-1.3 2.3h-4.6c-.1-.8-.5-1.5-1.3-2.3C7 13.3 6 11.6 6 9.5a6 6 0 0 1 6-6Zm-2.1 15h4.2a1 1 0 0 1-1 1h-2.2a1 1 0 0 1-1-1Zm.4 2h3.4a1.8 1.8 0 0 1-1.7 1H12a1.8 1.8 0 0 1-1.7-1Z' }]
      }
    }
  ];

  startAutoRedirect(isPreviewMode: boolean): void {
    if (isPreviewMode || !this.window) {
      return;
    }

    this.cancelAutoRedirect();
    this.redirectHandle = this.window.setTimeout(() => {
      this.openTaskerTarget('tasker://assistantactions?task=OpenProductivity');
    }, this.redirectDelayMs);
  }

  cancelAutoRedirect(): void {
    if (this.redirectHandle !== null && this.window) {
      this.window.clearTimeout(this.redirectHandle);
      this.redirectHandle = null;
    }
  }

  launchAction(action: LauncherAction): void {
    this.cancelAutoRedirect();

    if (action.id === 'open-breathing') {
      this.showBreathingPopup();
      this.window?.setTimeout(() => this.openAction(action), 180);
      return;
    }

    this.openAction(action);
  }

  private openAction(action: LauncherAction): void {
    if (action.kind === 'route') {
      void this.router.navigateByUrl(action.target);
      return;
    }

    this.openTaskerTarget(action.target);
  }

  private openTaskerTarget(target: string): void {
    if (!this.window) {
      return;
    }

    this.window.location.href = target;
  }

  private showBreathingPopup(): void {
    this.showWatchPopup.set(true);

    if (this.popupHandle !== null && this.window) {
      this.window.clearTimeout(this.popupHandle);
    }

    this.popupHandle = this.window?.setTimeout(() => {
      this.showWatchPopup.set(false);
      this.popupHandle = null;
    }, 1400) ?? null;
  }
}
