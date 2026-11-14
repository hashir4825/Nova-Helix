import { DOCUMENT, Injectable, computed, inject } from '@angular/core';
import { ThemeStore } from '../../core/state/theme';

export interface ChartTokens {
  text1: string;
  text2: string;
  text3: string;
  line: string;
  lineStrong: string;
  surface: string;
  surface3: string;
  series1: string;
  series2: string;
  accent: string;
  crew: string;
  band: string;
  bandLine: string;
  nominal: string;
  watch: string;
  alert: string;
  event: string;
  fontSans: string;
  fontMono: string;
}

/** Reads design tokens at runtime so ECharts follows light/dark theme switches. */
@Injectable({ providedIn: 'root' })
export class ChartTokensService {
  private readonly doc = inject(DOCUMENT);
  private readonly theme = inject(ThemeStore);

  readonly tokens = computed<ChartTokens>(() => {
    this.theme.theme(); // re-read on theme change
    const cs = getComputedStyle(this.doc.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return {
      text1: v('--text-1'),
      text2: v('--text-2'),
      text3: v('--text-3'),
      line: v('--line'),
      lineStrong: v('--line-strong'),
      surface: v('--surface-1'),
      surface3: v('--surface-3'),
      series1: v('--series-1'),
      series2: v('--series-2'),
      accent: v('--accent'),
      crew: v('--crew'),
      band: v('--baseline-band'),
      bandLine: v('--baseline-line'),
      nominal: v('--nominal'),
      watch: v('--watch'),
      alert: v('--alert'),
      event: v('--event-mark'),
      fontSans: v('--font-sans'),
      fontMono: v('--font-mono'),
    };
  });
}
