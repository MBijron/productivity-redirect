/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { ShortcutUsageStoreService } from './shortcut-usage-store.service';

describe('ShortcutUsageStoreService', () => {
  beforeEach(() => {
    localStorage.clear();
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('increments both daily and weekly counts', () => {
    jasmine.clock().mockDate(new Date('2026-05-11T09:00:00'));
    TestBed.configureTestingModule({});

    const service = TestBed.inject(ShortcutUsageStoreService);
    service.increment('open-elevate');

    expect(service.countFor('open-elevate')).toBe(1);
    expect(service.countForWeek('open-elevate')).toBe(1);
  });

  it('resets weekly counts on monday', () => {
    jasmine.clock().mockDate(new Date('2026-05-17T12:00:00'));
    TestBed.configureTestingModule({});

    const service = TestBed.inject(ShortcutUsageStoreService);
    service.increment('open-ai-news-summary');
    expect(service.countForWeek('open-ai-news-summary')).toBe(1);

    jasmine.clock().mockDate(new Date('2026-05-18T09:00:00'));

    expect(service.countForWeek('open-ai-news-summary')).toBe(0);
  });
});