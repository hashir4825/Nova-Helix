// Tree-shaken ECharts build: only what Nova Healix draws. Loaded lazily.
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, AriaComponent, SVGRenderer]);

export default echarts;
