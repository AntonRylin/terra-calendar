import { useState, useEffect, useMemo } from 'react';
import { friendlyDate, todayISO } from '../../core/dates';
import { parseQuickEntry } from '../../core/timeParser';
import { timeToMinutes, minutesToTime, DEFAULT_DURATION_MIN } from '../../core/timeOfDay';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { useSettingsStore } from '../../app/settingsStore';
import { QuickEntryDemo } from './QuickEntryDemo';
import './quickEntry.css';

interface HourlyWeatherItem {
  time: string;
  emoji: string;
  rainChance: number;
  temp: number;
  uvIndex: number;
}

function getWeatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if ([1, 2, 3].includes(code)) return '⛅';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '☀️';
}

function getWeatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57].includes(code)) return 'Freezing drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([71, 73, 75].includes(code)) return 'Snow fall';
  if (code === 77) return 'Snow grains';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if ([96, 99].includes(code)) return 'Thunderstorm with hail';
  return 'Unknown weather';
}

function getUvIntensityInfo(uv: number) {
  const rounded = Math.round(uv);
  if (rounded <= 2) return { label: 'Low', color: '#2e7d32' };
  if (rounded <= 5) return { label: 'Moderate', color: '#f57c00' };
  if (rounded <= 7) return { label: 'High', color: '#d84315' };
  if (rounded <= 10) return { label: 'Very High', color: '#8e24aa' };
  return { label: 'Extreme', color: '#b71c1c' };
}

async function fetchHourlyWeatherForDate(dateStr: string, lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=weathercode,temperature_2m,precipitation_probability,windgusts_10m,uv_index&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error();
  const data = await res.json();
  
  const hourlyTime = data.hourly.time as string[];
  const hourlyCode = data.hourly.weathercode as number[];
  const hourlyTemp = data.hourly.temperature_2m as number[];
  const hourlyPrecipProb = data.hourly.precipitation_probability as number[];
  const hourlyWindGusts = data.hourly.windgusts_10m as number[];
  const hourlyUv = data.hourly.uv_index as number[];

  const matchingHours: { hourNum: number; timeStr: string; code: number; temp: number; rainChance: number; windGust: number; uvIndex: number }[] = [];

  for (let i = 0; i < hourlyTime.length; i++) {
    if (hourlyTime[i].startsWith(dateStr)) {
      const hourPart = hourlyTime[i].slice(11, 16); // "HH:MM"
      const hourNum = parseInt(hourPart.slice(0, 2), 10);
      
      let displayTime = '';
      if (hourNum === 0) displayTime = '12AM';
      else if (hourNum === 12) displayTime = '12PM';
      else if (hourNum > 12) displayTime = `${hourNum - 12}PM`;
      else displayTime = `${hourNum}AM`;

      matchingHours.push({
        hourNum,
        timeStr: displayTime,
        code: hourlyCode[i],
        temp: Math.round(hourlyTemp[i]),
        rainChance: hourlyPrecipProb[i],
        windGust: hourlyWindGusts[i],
        uvIndex: hourlyUv ? hourlyUv[i] : 0,
      });
    }
  }

  if (matchingHours.length === 0) {
    return null;
  }

  let summary = '';
  const rainHour = matchingHours.find(h => [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(h.code) || h.rainChance >= 20);
  const maxWind = Math.max(...matchingHours.map(h => h.windGust), 0);
  const maxTemp = Math.max(...matchingHours.map(h => h.temp), 0);
  const minTemp = Math.min(...matchingHours.map(h => h.temp), 100);
  
  if (rainHour) {
    summary += `${getWeatherDescription(rainHour.code)} expected around ${rainHour.timeStr}. `;
  } else {
    const codesCount: Record<number, number> = {};
    matchingHours.forEach(h => {
      codesCount[h.code] = (codesCount[h.code] || 0) + 1;
    });
    let mostFrequentCode = 0;
    let maxCount = -1;
    Object.entries(codesCount).forEach(([c, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentCode = Number(c);
      }
    });
    summary += `${getWeatherDescription(mostFrequentCode)} expected. `;
  }

  if (maxWind > 5) {
    summary += `Wind gusts are up to ${Math.round(maxWind)} m/s. `;
  }

  summary += `Temps range from ${Math.round(minTemp)}° to ${Math.round(maxTemp)}°.`;

  return {
    summary,
    hours: matchingHours.map(h => ({
      time: h.timeStr,
      emoji: getWeatherEmoji(h.code),
      rainChance: h.rainChance,
      temp: h.temp,
      uvIndex: h.uvIndex,
    })),
  };
}

export function QuickEntryHost() {
  const target = useUiStore((s) => s.quickEntry);
  if (!target) return null;
  return (
    <QuickEntryForm
      key={`${target.date}T${target.time ?? ''}`}
      date={target.date}
      anchorEl={target.anchorEl}
      slotTime={target.time}
      slotEndTime={target.endTime}
    />
  );
}

const CHART_START_X = 10;
const CHART_END_X = 255;
const CHART_WIDTH = CHART_END_X - CHART_START_X;

function QuickEntryForm({
  date,
  anchorEl,
  slotTime,
  slotEndTime,
}: {
  date: string;
  anchorEl: Element;
  slotTime?: string;
  slotEndTime?: string;
}) {
  const close = useUiStore((s) => s.closeOverlays);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const target = useUiStore((s) => s.quickEntry);
  const value = target?.value ?? '';
  const setValue = (v: string) => {
    useUiStore.setState((s) => ({
      quickEntry: s.quickEntry ? { ...s.quickEntry, value: v } : null,
    }));
  };
  const parsed = parseQuickEntry(value);
  const canSave = parsed.title.length > 0;

  const showUvIndex = useSettingsStore((s) => s.showUvIndex);
  const showHourlyWeather = useSettingsStore((s) => s.showHourlyWeather);
  const showQuickEntryDemo = useSettingsStore((s) => s.showQuickEntryDemo);
  const setShowUvIndex = useSettingsStore((s) => s.setShowUvIndex);
  const setShowHourlyWeather = useSettingsStore((s) => s.setShowHourlyWeather);

  const [weatherData, setWeatherData] = useState<{
    summary: string;
    hours: HourlyWeatherItem[];
  } | null>(null);

  const [hoveredHourIndex, setHoveredHourIndex] = useState<number | null>(null);

  // The syntax demo is for people staring at an empty box. Once the first
  // keystroke lands it retires for the rest of this popover — a looping
  // animation under a box you're already typing in is just noise. Latched, so
  // clearing the field doesn't make it pop back.
  const [startedTyping, setStartedTyping] = useState(value.length > 0);
  useEffect(() => {
    if (value.length > 0) setStartedTyping(true);
  }, [value]);

  useEffect(() => {
    const saved = localStorage.getItem('open-calendar.weather-coords');
    const coords = saved ? JSON.parse(saved) : { lat: 51.5074, lon: -0.1278 };
    
    const fetchAndSet = () => {
      fetchHourlyWeatherForDate(date, coords.lat, coords.lon)
        .then(data => setWeatherData(data))
        .catch(err => console.error('Failed to load hourly weather:', err));
    };

    fetchAndSet();

    const interval = setInterval(fetchAndSet, 60000);
    return () => clearInterval(interval);
  }, [date]);

  async function submit() {
    if (!canSave) return;
    // A time typed into the entry wins; otherwise the clicked week-view slot
    // (if any) supplies start and end. addEvent defaults the end to +1h.
    const time = parsed.time ?? slotTime ?? undefined;
    const endTime = parsed.endTime ?? (parsed.time ? undefined : slotEndTime);
    await addEvent({ date, title: parsed.title, time, endTime });
    close();
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (e.deltaY !== 0) {
      container.scrollLeft += e.deltaY;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xInViewBox = ((e.clientX - rect.left) / rect.width) * 280;
    const index = Math.round(((xInViewBox - CHART_START_X) / CHART_WIDTH) * 23);
    const clampedIndex = Math.max(0, Math.min(23, index));
    setHoveredHourIndex(clampedIndex);
  };

  const handleMouseLeave = () => {
    setHoveredHourIndex(null);
  };

  const weatherCalc = useMemo(() => {
    if (!weatherData || weatherData.hours.length === 0) return null;
    const points = weatherData.hours.map((h, i) => {
      const x = CHART_START_X + (i / 23) * CHART_WIDTH;
      const y = 120 - (Math.min(h.uvIndex, 11) / 11) * 110;
      return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[23].x.toFixed(1)} 120 L ${points[0].x.toFixed(1)} 120 Z`;

    const isToday = date === todayISO();
    const currentHour = new Date().getHours();
    const currentUv = weatherData.hours[currentHour]?.uvIndex ?? 0;
    const peakUv = Math.max(...weatherData.hours.map(h => h.uvIndex), 0);

    const displayUv = isToday ? currentUv : peakUv;
    const uvInfo = getUvIntensityInfo(displayUv);

    const nowIndex = currentHour;
    const nowX = CHART_START_X + (nowIndex / 23) * CHART_WIDTH;
    const nowY = 120 - (Math.min(currentUv, 11) / 11) * 110;

    return {
      linePath,
      areaPath,
      isToday,
      currentHour,
      currentUv,
      peakUv,
      displayUv,
      uvInfo,
      nowX,
      nowY,
    };
  }, [weatherData, date]);

  const activeUv = hoveredHourIndex !== null && weatherData && weatherData.hours[hoveredHourIndex]
    ? weatherData.hours[hoveredHourIndex].uvIndex
    : (weatherCalc?.displayUv ?? 0);
  const activeUvInfo = getUvIntensityInfo(activeUv);
  const activeSubtitle = hoveredHourIndex !== null && weatherData && weatherData.hours[hoveredHourIndex]
    ? `UV Index at ${weatherData.hours[hoveredHourIndex].time}`
    : weatherCalc
      ? (weatherCalc.isToday ? 'UV Index Right Now' : 'Peak UV Index Today') + ' · WHO UVI'
      : '';

  return (
    <AnchoredPopover anchorEl={anchorEl} onClose={close} className="popover-quick-entry-wrapper">
      {weatherData && weatherCalc && (showUvIndex || showHourlyWeather) && (
        <div className="quick-entry-weather-card">
          {showUvIndex && (
            <div className="quick-entry-weather-uv-section" style={{ position: 'relative' }}>
              <button
                className="qe-close-btn"
                title="Hide UV Index"
                aria-label="Hide UV Index"
                onClick={() => setShowUvIndex(false)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
              <div className="quick-entry-weather-uv-header">
                <div className="uv-header-subtitle">
                  {activeSubtitle}
                </div>
                <div className="uv-header-title">
                  {hoveredHourIndex !== null ? activeUv.toFixed(1) : activeUv.toFixed(0)}{' '}
                  <span className="uv-header-label" style={{ color: activeUvInfo.color }}>
                    {activeUvInfo.label}
                  </span>
                </div>
              </div>
              <div className="quick-entry-weather-uv-chart">
                <svg
                  width="100%"
                  height="150"
                  viewBox="0 0 280 150"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  style={{ cursor: 'pointer' }}
                >
                  <defs>
                    <linearGradient id="uv-gradient" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#2e7d32" />
                      <stop offset="30%" stopColor="#f57c00" />
                      <stop offset="60%" stopColor="#d84315" />
                      <stop offset="85%" stopColor="#8e24aa" />
                      <stop offset="100%" stopColor="#b71c1c" />
                    </linearGradient>
                    <linearGradient id="uv-area-gradient" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#2e7d32" stopOpacity="0.0" />
                      <stop offset="30%" stopColor="#f57c00" stopOpacity="0.1" />
                      <stop offset="60%" stopColor="#d84315" stopOpacity="0.2" />
                      <stop offset="85%" stopColor="#8e24aa" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#b71c1c" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>
                  {/* Y Grid lines */}
                  <line x1={CHART_START_X} y1="10" x2={CHART_END_X} y2="10" stroke="var(--color-border)" strokeDasharray="3,3" strokeWidth="0.5" />
                  <line x1={CHART_START_X} y1="30" x2={CHART_END_X} y2="30" stroke="var(--color-border)" strokeDasharray="3,3" strokeWidth="0.5" />
                  <line x1={CHART_START_X} y1="60" x2={CHART_END_X} y2="60" stroke="var(--color-border)" strokeDasharray="3,3" strokeWidth="0.5" />
                  <line x1={CHART_START_X} y1="90" x2={CHART_END_X} y2="90" stroke="var(--color-border)" strokeDasharray="3,3" strokeWidth="0.5" />
                  <line x1={CHART_START_X} y1="120" x2={CHART_END_X} y2="120" stroke="var(--color-border)" strokeWidth="0.5" />

                  {/* Left Category Labels */}
                  <text x={CHART_START_X + 2} y="14" fontSize="7" fontWeight="600" fill="var(--color-text-faint)" opacity="0.8">EXTREME</text>
                  <text x={CHART_START_X + 2} y="34" fontSize="7" fontWeight="600" fill="var(--color-text-faint)" opacity="0.8">VERY HIGH</text>
                  <text x={CHART_START_X + 2} y="64" fontSize="7" fontWeight="600" fill="var(--color-text-faint)" opacity="0.8">HIGH</text>
                  <text x={CHART_START_X + 2} y="94" fontSize="7" fontWeight="600" fill="var(--color-text-faint)" opacity="0.8">MODERATE</text>
                  <text x={CHART_START_X + 2} y="118" fontSize="7" fontWeight="600" fill="var(--color-text-faint)" opacity="0.8">LOW</text>

                  {/* Right Y-Axis values */}
                  <text x={CHART_END_X + 5} y="13" fontSize="8" fill="var(--color-text-secondary)" textAnchor="start">11</text>
                  <text x={CHART_END_X + 5} y="33" fontSize="8" fill="var(--color-text-secondary)" textAnchor="start">9</text>
                  <text x={CHART_END_X + 5} y="63" fontSize="8" fill="var(--color-text-secondary)" textAnchor="start">6</text>
                  <text x={CHART_END_X + 5} y="93" fontSize="8" fill="var(--color-text-secondary)" textAnchor="start">3</text>
                  <text x={CHART_END_X + 5} y="123" fontSize="8" fill="var(--color-text-secondary)" textAnchor="start">0</text>

                  {/* Area under curve */}
                  <path d={weatherCalc.areaPath} fill="url(#uv-area-gradient)" />
                  
                  {/* Curve line */}
                  <path d={weatherCalc.linePath} stroke="url(#uv-gradient)" strokeWidth="2.5" fill="none" strokeLinecap="round" />

                  {/* X Axis labels */}
                  <text x={CHART_START_X} y="135" fontSize="8" fill="var(--color-text-secondary)" textAnchor="middle">12AM</text>
                  <text x={CHART_START_X + (6 / 23) * CHART_WIDTH} y="135" fontSize="8" fill="var(--color-text-secondary)" textAnchor="middle">6AM</text>
                  <text x={CHART_START_X + (12 / 23) * CHART_WIDTH} y="135" fontSize="8" fill="var(--color-text-secondary)" textAnchor="middle">12PM</text>
                  <text x={CHART_START_X + (18 / 23) * CHART_WIDTH} y="135" fontSize="8" fill="var(--color-text-secondary)" textAnchor="middle">6PM</text>

                  {/* Current Time indicator circle */}
                  {weatherCalc.isToday && (
                    <circle cx={weatherCalc.nowX} cy={weatherCalc.nowY} r="3.5" fill="var(--color-surface)" stroke="var(--color-text)" strokeWidth="2" />
                  )}

                  {/* Hover line, circle, pulse and tooltip */}
                  {hoveredHourIndex !== null && weatherData && weatherData.hours[hoveredHourIndex] && (() => {
                    const hoveredX = CHART_START_X + (hoveredHourIndex / 23) * CHART_WIDTH;
                    const hoveredY = 120 - (Math.min(weatherData.hours[hoveredHourIndex].uvIndex, 11) / 11) * 110;
                    const uvInfo = getUvIntensityInfo(weatherData.hours[hoveredHourIndex].uvIndex);
                    
                    const tooltipWidth = 75;
                    const tooltipHeight = 36;
                    const tooltipX = Math.max(CHART_START_X, Math.min(CHART_END_X - tooltipWidth, hoveredX - tooltipWidth / 2));
                    const tooltipY = hoveredY > 50 ? hoveredY - tooltipHeight - 8 : hoveredY + 12;

                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        {/* Hover vertical dashed line */}
                        <line
                          className="uv-hover-line"
                          x1={hoveredX}
                          y1="10"
                          x2={hoveredX}
                          y2="120"
                          stroke="var(--color-text-secondary)"
                          strokeWidth="1.2"
                          strokeDasharray="3,3"
                          opacity="0.65"
                        />
                        {/* Hover circle */}
                        <circle
                          className="uv-hover-circle"
                          cx={hoveredX}
                          cy={hoveredY}
                          r="4.5"
                          fill="var(--color-surface)"
                          stroke={uvInfo.color}
                          strokeWidth="2.5"
                        />
                        {/* Pulse Ring */}
                        <circle
                          className="uv-hover-circle uv-pulse-ring"
                          cx={hoveredX}
                          cy={hoveredY}
                          r="8.5"
                          fill="none"
                          stroke={uvInfo.color}
                          strokeWidth="1"
                          opacity="0.4"
                        />
                        {/* Tooltip Group */}
                        <g className="uv-tooltip">
                          <rect
                            x={tooltipX}
                            y={tooltipY}
                            width={tooltipWidth}
                            height={tooltipHeight}
                            rx="4"
                            fill="var(--color-surface)"
                            stroke="var(--color-border)"
                            strokeWidth="1.5"
                          />
                          <text
                            x={tooltipX + tooltipWidth / 2}
                            y={tooltipY + 14}
                            fontSize="10"
                            fontWeight="600"
                            fill="var(--color-text-secondary)"
                            textAnchor="middle"
                          >
                            {weatherData.hours[hoveredHourIndex].time}
                          </text>
                          <text
                            x={tooltipX + tooltipWidth / 2}
                            y={tooltipY + 28}
                            fontSize="12.5"
                            fontWeight="800"
                            fill={uvInfo.color}
                            textAnchor="middle"
                          >
                            UV {weatherData.hours[hoveredHourIndex].uvIndex.toFixed(1)}
                          </text>
                        </g>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}
          {showHourlyWeather && (
            <div className="quick-entry-weather-hours-container">
              <button
                className="qe-close-btn"
                title="Hide Hourly Forecast"
                aria-label="Hide Hourly Forecast"
                onClick={() => setShowHourlyWeather(false)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
              <div className="quick-entry-weather-hours" onWheel={handleWheel}>
                {weatherData.hours.map((h, i) => (
                  <div key={i} className="weather-hour-col">
                    <span className="weather-hour-time">{h.time}</span>
                    <span className="weather-hour-emoji">{h.emoji}</span>
                    <span className="weather-hour-rain">
                      {h.rainChance > 0 ? `${h.rainChance}%` : '\u00A0'}
                    </span>
                    <span className="weather-hour-temp">{h.temp}°</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* The demo hangs off this wrapper rather than sitting in the popover's
          flow: on desktop it's absolutely positioned, so floating-ui measures
          the input card alone and centres THAT on the day cell — the demo can
          grow without dragging the box you're typing in off the day. */}
      <div className="quick-entry-input-anchor">
        <div className="quick-entry-input-card">
          <input
            className="quick-entry-input"
            autoFocus
            placeholder="9 30 11 30 spanish lesson..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <div className="quick-entry-hint">
            {(() => {
              const displayTime = parsed.time ?? slotTime;
              const displayEndTime = parsed.endTime ?? (parsed.time
                ? minutesToTime(Math.min(timeToMinutes(parsed.time) + DEFAULT_DURATION_MIN, 24 * 60 - 1))
                : slotEndTime);
              return (
                <>
                  {friendlyDate(date, displayTime, todayISO())}
                  {displayTime && displayEndTime ? `–${displayEndTime}` : ''} · Enter to save · Esc to cancel
                </>
              );
            })()}
          </div>
        </div>
        {showQuickEntryDemo && !startedTyping && <QuickEntryDemo />}
      </div>
    </AnchoredPopover>
  );
}
