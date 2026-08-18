import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface ChartProps {
  type: 'line' | 'bar' | 'gauge';
  data?: number[] | number[][];
  categories?: string[];
  title?: string;
  color?: string[];
  style?: React.CSSProperties;
}

const defaultColors = ['#4fc3f7', '#66bb6a', '#ffa726', '#ef5350'];

export default function Chart({ type, data, categories, title, color = defaultColors, style }: ChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  const isEmpty = !data || (Array.isArray(data) && data.length === 0)
    || (Array.isArray(data) && Array.isArray(data[0]) && (data as number[][]).every(s => s.length === 0));

  // Dispose ECharts instance when data becomes empty
  useEffect(() => {
    if (isEmpty && instanceRef.current) {
      instanceRef.current.dispose();
      instanceRef.current = null;
    }
  }, [isEmpty]);

  // Chart rendering effect — guarded: if isEmpty, chartRef.current is null (no div), so early-return
  useEffect(() => {
    if (isEmpty || !chartRef.current) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      title: title
        ? {
            text: title,
            textStyle: { color: '#1a237e', fontSize: 14, fontWeight: 600 },
            left: 'center',
            top: 0,
          }
        : undefined,
      grid: { top: title ? 36 : 16, right: 16, bottom: 24, left: 40 },
      tooltip: { trigger: 'axis' },
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut',
    };

    if (type === 'line') {
      option.xAxis = {
        type: 'category',
        data: categories || [],
        axisLabel: { color: 'rgba(13,27,62,0.45)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(79,195,247,0.2)' } },
        axisTick: { show: false },
      };
      option.yAxis = {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(79,195,247,0.08)', type: 'dashed' } },
        axisLabel: { color: 'rgba(13,27,62,0.45)', fontSize: 11 },
      };
      // Support both single series and multi-series
      if (data && Array.isArray(data[0])) {
        option.legend = { data: ['SOC %', '电价×100', '电网kW'].slice(0, (data as number[][]).length), textStyle: { color: 'rgba(13,27,62,0.55)', fontSize: 11 }, top: 0, right: 0 };
        option.grid = { top: 36, right: 16, bottom: 24, left: 40 };
        option.series = (data as number[][]).map((series, idx) => ({
          type: 'line',
          name: ['SOC %', '电价×100', '电网kW'][idx] || `系列${idx}`,
          data: series,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: color[idx] || defaultColors[idx] },
          itemStyle: { color: color[idx] || defaultColors[idx] },
        }));
      } else {
        option.series = [{
          type: 'line',
          data: (data as number[]) || [],
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 3, color: color[0] },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(79,195,247,0.3)' },
              { offset: 1, color: 'rgba(79,195,247,0.02)' },
            ]),
          },
          itemStyle: { color: color[0] },
        }];
      }
    } else if (type === 'bar') {
      option.xAxis = {
        type: 'category',
        data: categories || [],
        axisLabel: { color: 'rgba(13,27,62,0.45)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(79,195,247,0.2)' } },
        axisTick: { show: false },
      };
      option.yAxis = {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(79,195,247,0.08)', type: 'dashed' } },
        axisLabel: { color: 'rgba(13,27,62,0.45)', fontSize: 11 },
      };
      option.series = [
        {
          type: 'bar',
          data: data || [],
          barWidth: '60%',
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color[0] },
              { offset: 1, color: color[1] || 'rgba(102,187,106,0.6)' },
            ]),
          },
        },
      ];
    } else if (type === 'gauge') {
      option.series = [
        {
          type: 'gauge',
          center: ['50%', '60%'],
          radius: '80%',
          startAngle: 220,
          endAngle: -40,
          min: 0,
          max: 100,
          detail: {
            fontSize: 28,
            fontWeight: 700,
            color: '#1a237e',
            formatter: '{value}%',
            offsetCenter: [0, '40%'],
          },
          progress: {
            show: true,
            width: 12,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#4fc3f7' },
                { offset: 1, color: '#66bb6a' },
              ]),
            },
          },
          axisLine: {
            lineStyle: {
              width: 12,
              color: [[1, 'rgba(79,195,247,0.12)']],
            },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          data: [{ value: (data as number[])?.[0] ?? 0 }],
        },
      ];
    }

    instanceRef.current.setOption(option, true);

    const handleResize = () => instanceRef.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [type, data, categories, title, color, isEmpty]);

  // Dispose ECharts instance on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (instanceRef.current) {
        instanceRef.current.dispose();
        instanceRef.current = null;
      }
    };
  }, []);

  if (isEmpty) {
    return (
      <div style={{ width: '100%', height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
        <span style={{ color: 'rgba(13,27,62,0.25)', fontSize: 13 }}>暂无数据</span>
      </div>
    );
  }

  return <div ref={chartRef} style={{ width: '100%', height: 220, ...style }} />;
}
