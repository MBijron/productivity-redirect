import { NgClass } from '@angular/common';
import { Component, InputSignal, OutputEmitterRef, input, output } from '@angular/core';
import { LauncherAction } from '../../core/services/launcher.service';

type UsagePeriodLabel = 'today' | 'this week';

@Component({
  selector: 'app-shortcut-button',
  imports: [NgClass],
  templateUrl: './shortcut-button.component.html',
  styleUrl: './shortcut-button.component.css'
})
export class ShortcutButtonComponent {
  readonly action: InputSignal<LauncherAction> = input.required<LauncherAction>();
  readonly usageCount: InputSignal<number> = input(0);
  readonly usagePeriodLabel: InputSignal<UsagePeriodLabel> = input<UsagePeriodLabel>('today');
  readonly urgent: InputSignal<boolean> = input(false);
  readonly faded: InputSignal<boolean> = input(false);
  readonly disabled: InputSignal<boolean> = input(false);
  readonly launch: OutputEmitterRef<LauncherAction> = output<LauncherAction>();

  protected handleClick(): void {
    if (this.disabled()) {
      return;
    }

    this.launch.emit(this.action());
  }

  protected buttonClasses(): string[] {
    const classes = ['button', this.action().className];

    if (this.urgent()) {
      classes.push('button-attention');
    }

    if (this.faded()) {
      classes.push('button-muted');
    }

    return classes;
  }

  protected usageAriaLabel(): string {
    return `Used ${this.usageCount()} times ${this.usagePeriodLabel()}`;
  }
}
