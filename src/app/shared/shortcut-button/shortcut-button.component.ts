import { NgClass } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { LauncherAction } from '../../core/services/launcher.service';

@Component({
  selector: 'app-shortcut-button',
  imports: [NgClass],
  templateUrl: './shortcut-button.component.html',
  styleUrl: './shortcut-button.component.css'
})
export class ShortcutButtonComponent {
  readonly action = input.required<LauncherAction>();
  readonly launch = output<LauncherAction>();

  protected handleClick(): void {
    this.launch.emit(this.action());
  }
}
