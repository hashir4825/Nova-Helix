import { Pipe, PipeTransform } from '@angular/core';
import { formatClock, formatDelay, formatMissionTime, formatRelative } from '../core/util/format';

/** Mission hour → "D142 14:32" */
@Pipe({ name: 'missionTime' })
export class MissionTimePipe implements PipeTransform {
  transform(hour: number | null | undefined): string {
    return hour === null || hour === undefined ? '—' : formatMissionTime(hour);
  }
}

/** Mission hour → "14:32" ship time */
@Pipe({ name: 'clock' })
export class ClockPipe implements PipeTransform {
  transform(hour: number | null | undefined): string {
    return hour === null || hour === undefined ? '—' : formatClock(hour);
  }
}

/** Mission hour relative to now → "3h ago" */
@Pipe({ name: 'relTime' })
export class RelTimePipe implements PipeTransform {
  transform(hour: number | null | undefined, now: number): string {
    return hour === null || hour === undefined ? '—' : formatRelative(hour, now);
  }
}

@Pipe({ name: 'delay' })
export class DelayPipe implements PipeTransform {
  transform(seconds: number): string {
    return formatDelay(seconds);
  }
}
