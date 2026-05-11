import { Component, InputSignal, input } from '@angular/core';

@Component({
  selector: 'app-watch-popup',
  imports: [],
  templateUrl: './watch-popup.component.html',
  styleUrl: './watch-popup.component.css'
})
export class WatchPopupComponent {
  readonly visible: InputSignal<boolean> = input(false);
}
