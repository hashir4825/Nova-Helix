import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { Icon } from './icon';
import { ICON } from './icons';

export interface FancyOption {
  value: string;
  label: string;
  /** Second line, e.g. a role. */
  sub?: string;
  /** Letter shown in the avatar circle; omitted = no avatar. */
  initial?: string;
  /** Small pill on the right, e.g. an active count. */
  badge?: string;
}

let nextId = 0;

/**
 * Styled single-select (listbox pattern) replacing native <select> where its OS-drawn menu
 * clashes with the app. Keyboard: Enter/Space/Arrows open; Arrows/Home/End move; Enter/Space
 * choose; Esc/Tab close. Click outside closes. Focus returns to the trigger.
 */
@Component({
  selector: 'nh-fancy-select',
  imports: [Icon],
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      [class.open]="open()"
      [class.compact]="compact()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <span class="visually-hidden">{{ ariaLabel() }}: </span>
      @if (current()?.initial; as ini) {
        <span class="avatar" aria-hidden="true">{{ ini }}</span>
      }
      <span class="t-label">{{ current()?.label ?? placeholder() }}</span>
      @if (current()?.badge && !compact(); as b) {
        <span class="badge">{{ current()?.badge }}</span>
      }
      <nh-icon class="chev" [icon]="icons.chevronRight" [size]="14" [stroke]="2" />
    </button>

    @if (open()) {
      <ul
        #list
        class="panel"
        [class.right]="align() === 'right'"
        role="listbox"
        tabindex="-1"
        [id]="listId"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-activedescendant]="listId + '-' + active()"
        (keydown)="onListKey($event)"
      >
        @for (o of options(); track o.value; let i = $index) {
          <li
            role="option"
            class="opt"
            [id]="listId + '-' + i"
            [class.active]="i === active()"
            [class.selected]="o.value === value()"
            [attr.aria-selected]="o.value === value()"
            (pointerenter)="active.set(i)"
            (click)="choose(i)"
          >
            @if (o.initial) {
              <span class="avatar" aria-hidden="true">{{ o.initial }}</span>
            }
            <span class="o-text">
              <span class="o-label">{{ o.label }}</span>
              @if (o.sub) {
                <span class="o-sub">{{ o.sub }}</span>
              }
            </span>
            @if (o.badge) {
              <span class="badge">{{ o.badge }}</span>
            }
            <span class="tick" aria-hidden="true">
              @if (o.value === value()) {
                <nh-icon [icon]="icons.check" [size]="15" [stroke]="2.5" />
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      position: relative;
      display: inline-block;
      --c: var(--accent);
      --c-ink: var(--accent-ink);
      --c-soft: var(--accent-soft);
    }
    :host(.crew) {
      --c: var(--crew);
      --c-ink: var(--crew-ink);
      --c-soft: var(--crew-soft);
    }
    .visually-hidden {
      @include visually-hidden;
    }
    .trigger {
      @include reset-button;
      @include focus-ring;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: 44px;
      min-width: 100%;
      padding: 0 var(--space-3) 0 var(--space-2);
      border-radius: var(--radius-round);
      border: 1px solid var(--line-strong);
      background: var(--surface-2);
      color: var(--text-1);
      font-weight: var(--weight-semibold);
      transition:
        border-color var(--dur-fast) var(--ease-out),
        background-color var(--dur-fast) var(--ease-out),
        box-shadow var(--dur-fast) var(--ease-out);
      &:hover {
        border-color: color-mix(in srgb, var(--c) 60%, transparent);
      }
      &.open {
        border-color: var(--c);
        box-shadow: 0 0 0 3px var(--c-soft);
      }
      &.compact {
        height: 38px;
        padding-left: 4px;
        font-size: var(--type-caption);
      }
    }
    .trigger:not(:has(.avatar)) {
      padding-left: var(--space-4);
    }
    .t-label {
      flex: 1;
      text-align: left;
      white-space: nowrap;
    }
    .chev {
      color: var(--text-2);
      transform: rotate(90deg);
      transition: transform var(--dur-base) var(--ease-out);
    }
    .open .chev {
      transform: rotate(-90deg);
      color: var(--c);
    }
    .avatar {
      @include display;
      display: grid;
      place-items: center;
      flex: none;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      font-size: var(--type-micro);
      background: var(--c);
      color: var(--c-ink);
    }
    .panel {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      z-index: 50;
      min-width: max(100%, 240px);
      margin: 0;
      padding: var(--space-1);
      list-style: none;
      border-radius: var(--radius-3);
      border: 1px solid var(--line-strong);
      background: var(--surface-1);
      box-shadow: var(--elev-3);
      outline: none;
      text-align: left;
      transform-origin: top left;
      animation: pop var(--dur-base) var(--ease-out);
      &.right {
        left: auto;
        right: 0;
        transform-origin: top right;
      }
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translateY(-6px) scale(0.97);
      }
    }
    .opt {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
      border-radius: var(--radius-2);
      cursor: pointer;
      color: var(--text-1);
      &.active {
        background: var(--surface-2);
      }
      &.selected .o-label {
        color: var(--c);
      }
      &:not(:has(.avatar)) {
        padding-left: var(--space-3);
      }
    }
    .opt .avatar {
      background: var(--surface-3);
      color: var(--text-1);
    }
    .opt.selected .avatar,
    .opt.active .avatar {
      background: var(--c);
      color: var(--c-ink);
    }
    .o-text {
      flex: 1;
      display: grid;
      line-height: 1.25;
      min-width: 0;
    }
    .o-label {
      font-weight: var(--weight-semibold);
      white-space: nowrap;
    }
    .o-sub {
      font-size: var(--type-micro);
      color: var(--text-3);
      white-space: nowrap;
    }
    .badge {
      @include mono;
      padding: 2px 8px;
      border-radius: var(--radius-round);
      background: var(--c-soft);
      color: var(--c);
      font-size: var(--type-micro);
    }
    .tick {
      display: grid;
      place-items: center;
      width: 18px;
      color: var(--c);
    }
    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
      .chev {
        transition: none;
      }
    }
  `,
  host: {
    '[class.crew]': "tone() === 'crew'",
    '(document:pointerdown)': 'onOutside($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FancySelect {
  readonly options = input.required<FancyOption[]>();
  readonly value = model<string>('');
  readonly ariaLabel = input.required<string>();
  readonly placeholder = input('Choose');
  readonly tone = input<'accent' | 'crew'>('accent');
  readonly compact = input(false);
  readonly align = input<'left' | 'right'>('left');

  protected readonly icons = ICON;
  protected readonly listId = `nh-fs-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()));

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.show();
  }

  private show(): void {
    const i = this.options().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(0, i));
    this.open.set(true);
    // Focus the list once it is rendered so arrow keys work immediately.
    queueMicrotask(() => setTimeout(() => this.list()?.nativeElement.focus()));
  }

  private close(refocus: boolean): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  protected choose(i: number): void {
    const o = this.options()[i];
    if (o) this.value.set(o.value);
    this.close(true);
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp'].includes(e.key) && !this.open()) {
      e.preventDefault();
      this.show();
    }
  }

  protected onListKey(e: KeyboardEvent): void {
    const n = this.options().length;
    const move = (i: number) => {
      e.preventDefault();
      this.active.set((i + n) % n);
      this.list()?.nativeElement.querySelector(`#${this.listId}-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(this.active() + 1);
      case 'ArrowUp':
        return move(this.active() - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(n - 1);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return this.choose(this.active());
      case 'Escape':
        e.preventDefault();
        return this.close(true);
      case 'Tab':
        return this.close(false);
    }
  }

  protected onOutside(e: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close(false);
  }
}
