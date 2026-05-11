/// <reference types="jasmine" />

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HomePageComponent } from './home-page.component';
import { LauncherAction, LauncherService } from '../../core/services/launcher.service';
import { ShortcutUsageStoreService } from '../../core/services/shortcut-usage-store.service';

describe('HomePageComponent', () => {
  const actions: readonly LauncherAction[] = [
    { id: 'open-elevate', label: 'Open Elevate', target: '', className: '', kind: 'tasker', icon: { viewBox: '0 0 24 24', shapes: [] } },
    { id: 'open-google-play-books', label: 'Open Play Books', target: '', className: '', kind: 'tasker', icon: { viewBox: '0 0 24 24', shapes: [] } },
    { id: 'open-breathing', label: 'Breathing', target: '', className: '', kind: 'tasker', icon: { viewBox: '0 0 24 24', shapes: [] } },
    { id: 'open-random-wikipedia', label: 'Random Wikipedia', target: '', className: '', kind: 'route', icon: { viewBox: '0 0 24 24', shapes: [] } },
    { id: 'open-duolingo', label: 'Open Duolingo', target: '', className: '', kind: 'tasker', icon: { viewBox: '0 0 24 24', shapes: [] } },
    { id: 'open-ai-news-summary', label: 'News Summary', target: '', className: '', kind: 'tasker', icon: { viewBox: '0 0 24 24', shapes: [] } },
    { id: 'open-daily-fact', label: 'Daily Fact', target: '', className: '', kind: 'tasker', icon: { viewBox: '0 0 24 24', shapes: [] } }
  ];

  const todayCounts = signal<Record<string, number>>({});
  const weekCounts = signal<Record<string, number>>({});
  const showWatchPopup = signal(false);

  const launcherServiceStub: Pick<LauncherService, 'actions' | 'showWatchPopup' | 'launchAction'> = {
    actions,
    showWatchPopup,
    launchAction: jasmine.createSpy('launchAction')
  };

  const shortcutUsageStoreStub: Pick<ShortcutUsageStoreService, 'todayCounts' | 'weekCounts' | 'dailyFactCount' | 'countFor' | 'countForWeek'> = {
    todayCounts,
    weekCounts,
    dailyFactCount: signal(0),
    countFor: (actionId: string) => todayCounts()[actionId] ?? 0,
    countForWeek: (actionId: string) => weekCounts()[actionId] ?? 0
  };

  beforeEach(async () => {
    todayCounts.set({});
    weekCounts.set({});

    await TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [
        { provide: LauncherService, useValue: launcherServiceStub },
        { provide: ShortcutUsageStoreService, useValue: shortcutUsageStoreStub }
      ]
    }).compileComponents();
  });

  it('keeps important actions on top with zero-use actions first', () => {
    todayCounts.set({
      'open-elevate': 1,
      'open-duolingo': 0,
      'open-daily-fact': 0
    });
    weekCounts.set({
      'open-ai-news-summary': 2
    });

    const fixture = TestBed.createComponent(HomePageComponent);
    const component = fixture.componentInstance as HomePageComponent & {
      displayedActions: () => { action: LauncherAction; urgent: boolean }[];
    };

    const orderedIds = component.displayedActions().map((item) => item.action.id);

    expect(orderedIds).toEqual([
      'open-duolingo',
      'open-daily-fact',
      'open-elevate',
      'open-ai-news-summary',
      'open-google-play-books',
      'open-random-wikipedia',
      'open-breathing'
    ]);
  });

  it('marks news as urgent before first weekly click and disables it after three', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    const component = fixture.componentInstance as HomePageComponent & {
      displayedActions: () => { action: LauncherAction; urgent: boolean; faded: boolean; disabled: boolean }[];
    };

    let news = component.displayedActions().find((item) => item.action.id === 'open-ai-news-summary');
    expect(news).toEqual(jasmine.objectContaining({ urgent: true, faded: false, disabled: false }));

    weekCounts.set({
      'open-ai-news-summary': 3
    });

    news = component.displayedActions().find((item) => item.action.id === 'open-ai-news-summary');
    expect(news).toEqual(jasmine.objectContaining({ urgent: false, faded: true, disabled: true }));
  });
});