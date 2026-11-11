import { useState } from "react";
import { Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Path, Polyline, Text as SvgText } from "react-native-svg";
import type { AssistantChartData } from "@/lib/assistant";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

// A chart the AI Assistant drew (its show_chart tool): bar, line or pie -
// the same charts as the web assistant. Colours are the validated
// categorical order, with their own dark-mode steps; identity is never
// colour alone - a legend for 2+ series, tap a mark for its value, and a
// table of the same numbers.

const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
};

const H = 220;
const PAD = { top: 10, right: 8, bottom: 48, left: 44 };

function fmt(v: number, unit?: string) {
  const n = Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (!unit) return n;
  return unit.length <= 2 && /^[^\d\s]+$/.test(unit) ? `${unit}${n}` : `${n} ${unit}`;
}

function short(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}k`;
  return `${+v.toFixed(2)}`;
}

function ticks(min: number, max: number) {
  const lo = Math.min(0, min);
  const span = max - lo || 1;
  const step0 = span / 4;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export default function AssistantChart({ chart }: { chart: AssistantChartData }) {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const [table, setTable] = useState(false);
  // The mark last tapped: "series:index".
  const [picked, setPicked] = useState<string | null>(null);
  const palette = isDark ? SERIES.dark : SERIES.light;
  const color = (i: number) => palette[i % palette.length];
  const W = Math.min(width - 72, 560);
  const { labels, series, unit } = chart;

  const pickedText = (() => {
    if (!picked) return null;
    const [si, i] = picked.split(":").map(Number);
    const s = series[si];
    if (!s) return null;
    if (chart.type === "pie") {
      const total = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
      return `${labels[i]}: ${fmt(s.values[i], unit)} (${Math.round((Math.max(0, s.values[i]) / total) * 100)}%)`;
    }
    return `${labels[i]}${series.length > 1 ? ` · ${s.name}` : ""}: ${fmt(s.values[i], unit)}`;
  })();
  const tap = (si: number, i: number) => setPicked(picked === `${si}:${i}` ? null : `${si}:${i}`);

  let plot: React.ReactNode;
  if (chart.type === "pie") {
    const values = series[0].values.map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const r = Math.min(W, H) / 2 - 12;
    const cx = W / 2;
    const cy = H / 2;
    // Each slice's start angle: from 12 o'clock, clockwise.
    const starts = values.map((_, i) => -Math.PI / 2 + (values.slice(0, i).reduce((a, b) => a + b, 0) / total) * Math.PI * 2);
    plot = (
      <Svg width={W} height={H}>
        {values.map((v, i) => {
          const a0 = starts[i];
          const a1 = a0 + (v / total) * Math.PI * 2;
          const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          const d = v >= total
            ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`
            : `M${cx},${cy} L${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
          return <Path key={i} d={d} fill={color(i)} stroke={colors.surface} strokeWidth={2} opacity={picked && picked !== `0:${i}` ? 0.55 : 1} onPress={() => tap(0, i)} />;
        })}
      </Svg>
    );
  } else {
    const all = series.flatMap((s) => s.values);
    const t = ticks(Math.min(...all), Math.max(...all));
    const lo = t[0];
    const hi = t[t.length - 1];
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const band = plotW / labels.length;
    const x = (i: number) => PAD.left + band * i + band / 2;
    const zero = y(Math.max(lo, 0));
    const every = Math.ceil(labels.length / 8);
    plot = (
      <Svg width={W} height={H}>
        {t.map((v) => (
          <G key={v}>
            <Line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? colors.muted : colors.border} strokeWidth={1} opacity={v === 0 ? 0.6 : 1} />
            <SvgText x={PAD.left - 6} y={y(v) + 3.5} fontSize={10} fill={colors.muted} textAnchor="end">{short(v)}</SvgText>
          </G>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <SvgText key={l} x={x(i)} y={H - PAD.bottom + 14} fontSize={10} fill={colors.muted} textAnchor="end" rotation={-35} originX={x(i)} originY={H - PAD.bottom + 14}>
              {l.length > 12 ? `${l.slice(0, 11)}…` : l}
            </SvgText>
          ) : null
        )}
        {chart.type === "bar" &&
          series.map((s, si) => {
            const groupW = band * 0.68;
            const barW = Math.max(2, (groupW - 2 * (series.length - 1)) / series.length);
            return s.values.map((v, i) => {
              const bx = PAD.left + band * i + (band - groupW) / 2 + si * (barW + 2);
              const top = Math.min(y(v), zero);
              const h = Math.max(1, Math.abs(zero - y(v)));
              const r = Math.min(4, barW / 2, h);
              const d = v >= 0
                ? `M${bx},${top + h} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + barW - r} Q${bx + barW},${top} ${bx + barW},${top + r} V${top + h} Z`
                : `M${bx},${top} V${top + h - r} Q${bx},${top + h} ${bx + r},${top + h} H${bx + barW - r} Q${bx + barW},${top + h} ${bx + barW},${top + h - r} V${top} Z`;
              return <Path key={`${si}-${i}`} d={d} fill={color(si)} opacity={picked && picked !== `${si}:${i}` ? 0.55 : 1} onPress={() => tap(si, i)} />;
            });
          })}
        {chart.type === "line" &&
          series.map((s, si) => (
            <G key={s.name}>
              <Polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={color(si)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <G key={i}>
                  <Circle cx={x(i)} cy={y(v)} r={4} fill={color(si)} stroke={colors.surface} strokeWidth={2} />
                  {/* Bigger than the dot, so it's easy to tap. */}
                  <Circle cx={x(i)} cy={y(v)} r={14} fill="transparent" onPress={() => tap(si, i)} />
                </G>
              ))}
            </G>
          ))}
      </Svg>
    );
  }

  const legend = chart.type === "pie" ? labels : series.length > 1 ? series.map((s) => s.name) : [];
  return (
    <View style={styles.card} accessible accessibilityLabel={chart.title}>
      <Text style={styles.title}>{chart.title}</Text>
      <Text style={styles.picked}>{pickedText || "Tap a bar, point or slice for its value"}</Text>
      {plot}
      {legend.length > 0 && (
        <View style={styles.legend}>
          {legend.map((name, i) => (
            <View key={name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: color(i) }]} />
              <Text style={styles.legendText}>{name}</Text>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity onPress={() => setTable(!table)} style={styles.toggle} accessibilityRole="button" accessibilityState={{ expanded: table }}>
        <Text style={styles.toggleText}>{table ? "Hide table" : "Table"}</Text>
      </TouchableOpacity>
      {table && (
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.cell, styles.head, { flex: 1.4 }]} />
            {series.map((s) => <Text key={s.name} style={[styles.cell, styles.head, styles.num]}>{s.name}</Text>)}
          </View>
          {labels.map((l, i) => (
            <View key={l} style={styles.row}>
              <Text style={[styles.cell, { flex: 1.4 }]}>{l}</Text>
              {series.map((s) => <Text key={s.name} style={[styles.cell, styles.num]}>{fmt(s.values[i], unit)}</Text>)}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { marginVertical: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  title: { fontSize: 13.5, fontWeight: "700", color: colors.ink },
  picked: { fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, color: colors.ink },
  toggle: { alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: 3, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  toggleText: { fontSize: 12, color: colors.muted },
  table: { marginTop: spacing.sm },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  cell: { flex: 1, paddingVertical: 4, paddingHorizontal: 4, fontSize: 12, color: colors.ink },
  head: { fontWeight: "700", color: colors.muted },
  num: { textAlign: "right" }
}));
