import { Component, DestroyRef, Signal, inject } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';
import { WikipediaCuratorService } from '../../core/services/wikipedia-curator.service';

@Component({
  selector: 'app-wikipedia-page',
  imports: [],
  templateUrl: './wikipedia-page.component.html',
  styleUrl: './wikipedia-page.component.css'
})
export class WikipediaPageComponent {
  private readonly wikipediaCurator: WikipediaCuratorService = inject(WikipediaCuratorService);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);

  protected readonly articleUrl: Signal<SafeResourceUrl> = this.wikipediaCurator.articleUrl;
  protected readonly isLoading: Signal<boolean> = this.wikipediaCurator.isLoading;

  constructor() {
    // Load the first article immediately and reset state if this page is destroyed.
    void this.wikipediaCurator.loadRandomArticle();
    this.destroyRef.onDestroy(() => this.wikipediaCurator.reset());
  }

  protected refreshArticle(): void {
    void this.wikipediaCurator.loadRandomArticle();
  }
}
