import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';

interface WikipediaParseResponse {
  parse?: {
    text?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WikipediaCuratorService {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly parser = new DOMParser();

  private readonly wikipediaOrigin = 'https://en.wikipedia.org';
  private readonly fallbackArticleUrl = `${this.wikipediaOrigin}/wiki/Special:Random`;
  private readonly featuredPageName = 'Wikipedia:Featured_articles';
  private readonly vitalOverviewPageName = 'Wikipedia:Vital_articles';
  private readonly vitalSubpagePathPrefix = '/wiki/Wikipedia:Vital_articles/Level_4/';

  private currentArticlePath = '';
  private featuredPoolPromise?: Promise<string[]>;
  private vitalSubpagesPromise?: Promise<string[]>;
  private readonly vitalPoolPromisesByPage = new Map<string, Promise<string[]>>();

  readonly isLoading = signal(false);
  readonly articleUrl = signal<SafeResourceUrl>(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));

  reset(): void {
    this.isLoading.set(false);
    this.articleUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));
  }

  async loadRandomArticle(): Promise<void> {
    this.isLoading.set(true);

    try {
      const articlePath = await this.loadCuratedArticlePath();
      const targetUrl = articlePath ? `${this.wikipediaOrigin}${articlePath}` : this.fallbackArticleUrl;

      if (articlePath) {
        this.currentArticlePath = articlePath;
      } else {
        this.currentArticlePath = '';
      }

      this.articleUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(targetUrl));
    } finally {
      this.isLoading.set(false);
    }
  }

  private buildParseApiUrl(pageName: string): string {
    const targetUrl = new URL('/w/api.php', this.wikipediaOrigin);
    targetUrl.searchParams.set('action', 'parse');
    targetUrl.searchParams.set('page', pageName);
    targetUrl.searchParams.set('prop', 'text');
    targetUrl.searchParams.set('format', 'json');
    targetUrl.searchParams.set('formatversion', '2');
    targetUrl.searchParams.set('origin', '*');
    return targetUrl.toString();
  }

  private async fetchPageHtml(pageName: string): Promise<string> {
    const payload = await firstValueFrom(this.http.get<WikipediaParseResponse>(this.buildParseApiUrl(pageName)));

    if (!payload.parse || typeof payload.parse.text !== 'string') {
      throw new Error(`Wikipedia parse response missing HTML for ${pageName}`);
    }

    return payload.parse.text;
  }

  private parseHtml(html: string): Document {
    return this.parser.parseFromString(html, 'text/html');
  }

  private normalizeArticlePath(href: string | null): string {
    if (!href) {
      return '';
    }

    try {
      const articleUrl = new URL(href, this.wikipediaOrigin);

      if (articleUrl.origin !== this.wikipediaOrigin || !articleUrl.pathname.startsWith('/wiki/')) {
        return '';
      }

      const articleSlug = decodeURIComponent(articleUrl.pathname.slice('/wiki/'.length));

      if (!articleSlug || articleSlug.includes(':') || articleUrl.pathname === '/wiki/Main_Page') {
        return '';
      }

      return articleUrl.pathname;
    } catch {
      return '';
    }
  }

  private extractArticlePaths(html: string): string[] {
    const document = this.parseHtml(html);
    const articlePaths = new Set<string>();

    for (const anchor of document.querySelectorAll(".mw-parser-output a[href^='/wiki/']")) {
      if (anchor.classList.contains('new') || anchor.closest('.mw-editsection, .navbox, .vertical-navbox, .metadata')) {
        continue;
      }

      const articlePath = this.normalizeArticlePath(anchor.getAttribute('href'));

      if (articlePath) {
        articlePaths.add(articlePath);
      }
    }

    return Array.from(articlePaths);
  }

  private extractVitalSubpages(html: string): string[] {
    const document = this.parseHtml(html);
    const pageNames = new Set<string>();

    for (const anchor of document.querySelectorAll(`a[href^='${this.vitalSubpagePathPrefix}']`)) {
      const href = anchor.getAttribute('href');

      if (!href) {
        continue;
      }

      const articleUrl = new URL(href, this.wikipediaOrigin);
      const pageName = decodeURIComponent(articleUrl.pathname.slice('/wiki/'.length));

      if (pageName.startsWith('Wikipedia:Vital_articles/Level_4/')) {
        pageNames.add(pageName);
      }
    }

    return Array.from(pageNames);
  }

  private pickRandomItem(items: string[], excludedItem: string): string {
    const availableItems = items.filter((item) => item !== excludedItem);
    const sourceItems = availableItems.length > 0 ? availableItems : items;

    if (sourceItems.length === 0) {
      return '';
    }

    return sourceItems[Math.floor(Math.random() * sourceItems.length)];
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
  }

  private loadFeaturedPool(): Promise<string[]> {
    if (this.featuredPoolPromise) {
      return this.featuredPoolPromise;
    }

    this.featuredPoolPromise = this.fetchPageHtml(this.featuredPageName)
      .then((html) => this.extractArticlePaths(html))
      .catch((error) => {
        this.featuredPoolPromise = undefined;
        throw error;
      });

    return this.featuredPoolPromise;
  }

  private loadVitalSubpages(): Promise<string[]> {
    if (this.vitalSubpagesPromise) {
      return this.vitalSubpagesPromise;
    }

    this.vitalSubpagesPromise = this.fetchPageHtml(this.vitalOverviewPageName)
      .then((html) => this.extractVitalSubpages(html))
      .catch((error) => {
        this.vitalSubpagesPromise = undefined;
        throw error;
      });

    return this.vitalSubpagesPromise;
  }

  private loadVitalPool(pageName: string): Promise<string[]> {
    const existingPromise = this.vitalPoolPromisesByPage.get(pageName);

    if (existingPromise) {
      return existingPromise;
    }

    const pendingPromise = this.fetchPageHtml(pageName)
      .then((html) => this.extractArticlePaths(html))
      .catch((error) => {
        this.vitalPoolPromisesByPage.delete(pageName);
        throw error;
      });

    this.vitalPoolPromisesByPage.set(pageName, pendingPromise);
    return pendingPromise;
  }

  private async pickFeaturedArticlePath(): Promise<string> {
    const articlePaths = await this.loadFeaturedPool();
    return this.pickRandomItem(articlePaths, this.currentArticlePath);
  }

  private async pickVitalArticlePath(): Promise<string> {
    const vitalSubpages = await this.loadVitalSubpages();
    const pageName = this.pickRandomItem(vitalSubpages, '');

    if (!pageName) {
      return '';
    }

    const articlePaths = await this.loadVitalPool(pageName);
    return this.pickRandomItem(articlePaths, this.currentArticlePath);
  }

  private async loadCuratedArticlePath(): Promise<string> {
    const sourceLoaders = this.shuffle([() => this.pickFeaturedArticlePath(), () => this.pickVitalArticlePath()]);

    for (const loadArticlePath of sourceLoaders) {
      try {
        const articlePath = await loadArticlePath();

        if (articlePath) {
          return articlePath;
        }
      } catch {
        // If one curated source fails, try the other before falling back.
      }
    }

    return '';
  }
}
