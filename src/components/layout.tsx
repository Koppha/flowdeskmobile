import { Children, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { layout, spacing } from "@/theme";

// Screen-size awareness for tablets. Backgrounds always run edge to edge;
// content is kept readable by widening the side gutters, and wide screens
// get extra columns / a second pane instead of stretched single rows.
export function useLayout() {
  const { width } = useWindowDimensions();
  return {
    width,
    isTablet: width >= layout.tabletMinWidth,
    /** Side-by-side panes (tablet landscape, large portrait tablets). */
    twoPane: width >= layout.twoPaneMinWidth,
    /** Card/tile columns for grids. */
    columns: width >= layout.threeColumnMinWidth ? 3 : width >= layout.tabletMinWidth ? 2 : 1,
    /** Horizontal padding that centres content within `max` but never drops below `base`. */
    gutter: (max: number = layout.maxContentWidth, base: number = spacing.lg) => Math.max(base, (width - max) / 2)
  };
}

/** Lays children out in equal-width columns, wrapping onto new rows. */
export function Grid({ columns, gap = spacing.md, children }: { columns: number; gap?: number; children: ReactNode }) {
  const items = Children.toArray(children);
  if (columns <= 1) return <View style={{ gap }}>{items}</View>;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -gap / 2, rowGap: gap }}>
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, paddingHorizontal: gap / 2 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Two columns side by side on wide screens, stacked otherwise. */
export function Panes({ left, right, gap = spacing.lg }: { left: ReactNode; right: ReactNode; gap?: number }) {
  const { twoPane } = useLayout();
  if (!twoPane) {
    return (
      <>
        {left}
        {right}
      </>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap }}>
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
    </View>
  );
}
