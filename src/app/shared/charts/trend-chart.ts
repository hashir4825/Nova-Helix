import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { Baseline, METRICS, MetricKey, MissionEvent, Sample } from '../../core/models';
import { formatClock, formatMetric, formatMissionTime, missionDay } from '../../core/util/format';
import { ChartTokensService } from './chart-tokens';

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Point = [number, number];

/**
 * Time-series chart in mission hours with the astronaut's personal baseline band,
 * threshold lines and mission-event annotations. Styled entirely from tokens.
 */
@Component({
  selector: 'nh-trend-chart',
  imports: [NgxEchartsDirective],
  template: `
    @if (samples().length) {
      <div
        class="chart"
        echarts
        [options]="options()"
        [autoResize]="true"
        [style.height.px]="height()"
        role="img"
        [attr.aria-label]="aria()"
      ></div>
    } @else {
      <div class="empty" [style.height.px]="height()">
        <p>No measurements in this period.</p>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .chart {
      width: 100%;
    }
    .empty {
      display: grid;
      place-items: center;
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius-2);
      color: var(--text-3);
      font-size: var(--type-caption);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrendChart {
  readonly metric = input.required<MetricKey>();
  readonly samples = input<Sample[]>([]);
  /** Optional second series (e.g. diastolic with systolic). */
  readonly secondary = input<Sample[] | null>(null);
  readonly secondaryLabel = input('');
  readonly baseline = input<Baseline | null>(null);
  readonly from = input.required<number>();
  readonly to = input.required<number>();
  readonly events = input<MissionEvent[]>([]);
  readonly kind = input<'line' | 'bar'>('line');
  readonly height = input(220);
  readonly showThresholds = input(true);
  /** Label for the baseline band, e.g. "Hashir's normal". */
  readonly bandLabel = input('Personal normal');
  /** Extra horizontal reference line, e.g. career limit. */
  readonly limit = input<{ value: number; label: string } | null>(null);

  private readonly tokens = inject(ChartTokensService).tokens;

  protected readonly aria = computed(() => {
    const def = METRICS[this.metric()];
    const s = this.samples();
    if (!s.length) return `${def.label}: no data`;
    const vals = s.map((x) => x.v);
    const last = s[s.length - 1].v;
    const b = this.baseline();
    return (
      `${def.label} from ${formatMissionTime(this.from())} to ${formatMissionTime(this.to())}. ` +
      `Latest ${formatMetric(def.key, last)}, range ${formatMetric(def.key, Math.min(...vals))} to ${formatMetric(def.key, Math.max(...vals))}.` +
      (b ? ` Personal normal ${formatMetric(def.key, b.low, false)} to ${formatMetric(def.key, b.high)}.` : '')
    );
  });

  protected readonly options = computed<EChartsCoreOption>(() => {
    const t = this.tokens();
    const def = METRICS[this.metric()];
    const s = this.samples();
    const sec = this.secondary();
    const b = this.baseline();
    const from = this.from();
    const to = this.to();
    const span = to - from;
    const lim = this.limit();

    // y range from data + band, clipped to the metric's plausible range
    const vals = [...s.map((x) => x.v), ...(sec ?? []).map((x) => x.v)];
    let lo = Math.min(...vals, ...(b ? [b.low] : []));
    let hi = Math.max(...vals, ...(b ? [b.high] : []), ...(lim ? [lim.value] : []));
    const visibleThresholds = this.showThresholds()
      ? def.thresholds.filter((th) => th.value >= lo - (hi - lo) * 0.6 && th.value <= hi + (hi - lo) * 0.6)
      : [];
    for (const th of visibleThresholds) {
      lo = Math.min(lo, th.value);
      hi = Math.max(hi, th.value);
    }
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
    lo = Math.max(def.range[0], lo - pad);
    hi = Math.min(Math.max(def.range[1], hi), hi + pad);
    if (def.key === 'radDose') lo = 0;

    const xLabel = (h: number) => (span <= 48 ? formatClock(h) : `D${missionDay(h)}`);
    const hasPoints = def.cadence !== 'hourly' && s.length < 80;
    const dec = def.decimals;

    // Mission events ≥ 1 h as shaded columns; exercise only labelled on short ranges
    const eventAreas = this.events()
      .filter((e) => !e.missed && e.end - e.start >= 0.9 && e.end >= from && e.start <= to)
      .map((e) => {
        const ex = e.kind === 'exercise';
        const color = e.kind === 'spe' ? t.alert : e.kind === 'eva' ? t.accent : ex ? t.nominal : t.event;
        return [
          {
            xAxis: Math.max(from, e.start),
            itemStyle: { color, opacity: ex ? 0.07 : 0.1 },
            label: {
              // Only significant events get text; minor ones stay as shading (details in the tooltip).
              show: ex ? span <= 30 : e.kind === 'eva' || e.kind === 'spe' || e.kind === 'anomaly' || e.kind === 'sleep-shift',
              position: 'insideTop',
              formatter: ex ? 'Ex' : e.label.split(' ')[0].replace('Solar', 'SPE'),
              color: t.text3,
              fontSize: 10,
              fontFamily: t.fontSans,
            },
          },
          { xAxis: Math.min(to, e.end) },
        ];
      });

    const bandArea = b
      ? [
          [
            {
              yAxis: b.low,
              itemStyle: { color: t.band },
              label: {
                show: true,
                position: 'insideBottomLeft',
                formatter: this.bandLabel(),
                color: t.text3,
                fontSize: 10,
                fontFamily: t.fontSans,
              },
            },
            { yAxis: b.high },
          ],
        ]
      : [];

    const markLines: object[] = [];
    if (b) markLines.push({ yAxis: b.mean, lineStyle: { color: t.bandLine, type: [2, 3], width: 1 }, label: { show: false } });
    for (const th of visibleThresholds) {
      const c = th.level === 'alert' ? t.alert : t.watch;
      markLines.push({
        yAxis: th.value,
        lineStyle: { color: c, type: [4, 4], width: 1 },
        label: {
          formatter: `${th.level === 'alert' ? 'Alert' : 'Watch'} ${th.value}`,
          color: c,
          fontSize: 10,
          fontFamily: t.fontSans,
          position: 'insideStartTop',
        },
      });
    }
    if (lim) {
      markLines.push({
        yAxis: lim.value,
        lineStyle: { color: t.alert, type: 'solid', width: 1 },
        label: { formatter: lim.label, color: t.alert, fontSize: 10, fontFamily: t.fontSans, position: 'insideEndTop' },
      });
    }

    const toPoints = (arr: Sample[]): Point[] => arr.map((x) => [x.t, x.v]);
    const unit = def.unit ? ` ${def.unit}` : '';

    const series: object[] = [
      {
        name: def.label,
        type: this.kind(),
        data: toPoints(s),
        showSymbol: hasPoints,
        symbol: 'circle',
        symbolSize: 6,
        smooth: false,
        barMaxWidth: 14,
        lineStyle: { color: t.series1, width: 1.6 },
        itemStyle: { color: t.series1, opacity: this.kind() === 'bar' ? 0.85 : 1, borderRadius: this.kind() === 'bar' ? [3, 3, 0, 0] : 0 },
        emphasis: { disabled: true },
        markArea: { silent: true, data: [...bandArea, ...eventAreas] },
        markLine: { silent: true, symbol: 'none', data: markLines },
        z: 3,
      },
    ];
    if (sec?.length) {
      series.push({
        name: this.secondaryLabel(),
        type: 'line',
        data: toPoints(sec),
        showSymbol: false,
        lineStyle: { color: t.series2, width: 1.4 },
        itemStyle: { color: t.series2 },
        emphasis: { disabled: true },
        z: 2,
      });
    }

    return {
      animation: !REDUCED,
      animationDuration: 320,
      grid: { left: 4, right: 12, top: 20, bottom: 4, containLabel: true },
      xAxis: {
        type: 'value',
        min: from,
        max: to,
        splitNumber: 6,
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: t.text3, fontFamily: t.fontMono, fontSize: 10, formatter: xLabel, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: Number(lo.toFixed(Math.max(dec, 1))),
        max: Number(hi.toFixed(Math.max(dec, 1))),
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: t.line, type: [2, 4] } },
        axisLabel: {
          color: t.text3,
          fontFamily: t.fontMono,
          fontSize: 10,
          showMinLabel: false,
          showMaxLabel: false,
          formatter: (v: number) => v.toFixed(dec > 1 ? 2 : dec),
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: t.surface3,
        borderColor: t.lineStrong,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.text1, fontFamily: t.fontSans, fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: t.lineStrong } },
        formatter: (params: { value: Point; seriesName: string }[]) => {
          if (!params.length) return '';
          const head = `<span style="color:${t.text3}">${formatMissionTime(params[0].value[0])}</span>`;
          const rows = params
            .map((p) => `${params.length > 1 ? p.seriesName + ' ' : ''}<b style="font-family:${t.fontMono}">${p.value[1].toFixed(dec)}</b>${unit}`)
            .join('<br/>');
          const normal = b ? `<br/><span style="color:${t.text3}">Normal ${b.low.toFixed(dec)}–${b.high.toFixed(dec)}${unit}</span>` : '';
          return `${head}<br/>${rows}${normal}`;
        },
      },
      series,
    };
  });
}
