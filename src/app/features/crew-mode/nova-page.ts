import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { CompanionApi } from '../../core/data/apis';
import { ChatMessage, SYMPTOM_LABEL, Symptom } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { SessionStore } from '../../core/state/session';
import { formatClock, formatDelay } from '../../core/util/format';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { ICON } from '../../shared/ui/icons';

const LEVEL = ['', 'Very low', 'Low', 'OK', 'Good', 'Very good'];

const PROMPTS = [
  { label: 'Do my check-in', text: 'Can you do my check-in?' },
  { label: 'I can’t sleep', text: 'I can’t sleep well lately.' },
  { label: 'I miss home', text: 'I really miss my family.' },
  { label: 'Breathing exercise', text: 'I feel anxious, can we do a breathing exercise?' },
  { label: 'Nervous about the EVA', text: 'I’m nervous about the spacewalk.' },
  { label: 'Tell Haleem something', text: 'Please tell Haleem I would like to talk.' },
];

@Component({
  selector: 'nh-nova-page',
  imports: [Icon, TipDirective, RouterLink],
  templateUrl: './nova-page.html',
  styleUrl: './nova-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NovaPage {
  private readonly api = inject(CompanionApi);
  private readonly clock = inject(MissionClock);
  protected readonly session = inject(SessionStore);
  protected readonly icons = ICON;
  protected readonly prompts = PROMPTS;
  protected readonly surgeon = this.clock.config.team.flightSurgeon;
  protected readonly level = LEVEL;
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  constructor() {
    this.session.role.set('astronaut');
    // Start the conversation (greeting) once consent is given.
    effect(() => {
      const id = this.session.astronautId();
      if (this.consented()) untracked(() => this.api.start(id).subscribe());
    });
    // Keep the newest message in view.
    effect(() => {
      this.messages();
      this.typing();
      const el = this.list()?.nativeElement;
      if (el) queueMicrotask(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    });
  }

  // ── Consent (stored on this device) ─────────────────────────────
  private readonly consentVersion = signal(0);
  protected readonly consented = computed(() => {
    this.consentVersion();
    try {
      return localStorage.getItem(`nh.nova-consent.${this.session.astronautId()}`) === '1';
    } catch {
      return false;
    }
  });

  protected accept(): void {
    try {
      localStorage.setItem(`nh.nova-consent.${this.session.astronautId()}`, '1');
    } catch {
      /* storage unavailable: consent lasts for this session */
    }
    this.consentVersion.update((v) => v + 1);
  }

  // ── Conversation ─────────────────────────────────────────────────
  private readonly crew$ = toObservable(this.session.astronautId);
  protected readonly messages = toSignal(this.crew$.pipe(switchMap((id) => this.api.history(id))), { initialValue: [] });
  protected readonly typing = toSignal(this.crew$.pipe(switchMap((id) => this.api.typing(id))), { initialValue: false });
  protected readonly draft = signal('');
  protected readonly confirmClear = signal(false);
  protected readonly shareEdits = signal<Record<string, string>>({});
  protected readonly showPrompts = computed(() => this.messages().filter((m) => m.role === 'astronaut').length < 2);

  protected readonly delay = computed(() => formatDelay(this.clock.link().delaySeconds));

  protected send(text?: string): void {
    const t = (text ?? this.draft()).trim();
    if (!t) return;
    this.api.send(this.session.astronautId(), t).subscribe();
    this.draft.set('');
    this.input()?.nativeElement.focus();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  protected resolve(m: ChatMessage, action: 'confirm' | 'dismiss'): void {
    const edited = m.card?.kind === 'share' ? this.shareEdits()[m.id] : undefined;
    this.api.resolveCard(this.session.astronautId(), m.id, action, edited).subscribe();
  }

  protected editShare(id: string, text: string): void {
    this.shareEdits.update((e) => ({ ...e, [id]: text }));
  }

  protected clear(): void {
    this.api.clear(this.session.astronautId()).subscribe(() => {
      this.confirmClear.set(false);
      this.api.start(this.session.astronautId()).subscribe();
    });
  }

  protected time(h: number): string {
    return formatClock(h);
  }

  protected symptomText(list: Symptom[]): string {
    return list.length ? list.map((s) => SYMPTOM_LABEL[s]).join(', ') : 'None';
  }

  protected readonly privacyTip = {
    title: 'How Nova keeps things private',
    body:
      `Only you can see this conversation. Nothing is shared unless you choose to send a check-in or a note. ` +
      `One exception: if you describe a risk of serious harm or an urgent medical problem, Nova tells ${this.clock.config.team.flightSurgeon} that you need help, without sharing what you wrote, and tells you it has done so.`,
  };

  protected readonly onboardTip = {
    title: 'Runs on board',
    body: 'Nova is designed to run on the spacecraft, so it works even when the link to Earth is slow or lost. In this demo the replies are simulated.',
  };
}
