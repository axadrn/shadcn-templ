/**
 * shadcn-templ chart - client renderer.
 *
 * The server emits the chart model as JSON; this module is the pendant of
 * Recharts in the browser and draws everything. It is a literal port of
 * the parts of the reference libraries the chart components need:
 * - recharts ResponsiveContainer: render at the container's real pixel
 *   size via ResizeObserver, so bars, radii and text keep their sizes.
 * - recharts-scale getNiceTickValues: the radar domain and tick values.
 * - recharts CartesianAxis preserveEnd: tick culling with measured label
 *   sizes and minTickGap.
 * - d3-shape: curveNatural, curveLinear, curveStep and stackOffsetExpand.
 * - d3-array ticks: the grid angles of a radial chart, whose angle axis
 *   has no tick count and so falls back to d3's default ten.
 * - recharts Sector: the sector path and its rounded corners, plus
 *   getBarPosition and computeRadialBarDataItems for the radial rings.
 * - react-smooth: entrance and update animations with the CSS ease bezier,
 *   the from state paints synchronously on mount and the clock starts on
 *   the first real frame.
 * - shadcn ChartTooltipContent and ChartStyle: tooltip markup, classes and
 *   the per chart color variables.
 * Optional model fields carry Recharts' prop defaults at the JSON boundary
 * (xAxisHeight 0, minTickGap 5, tickCount 5, innerRadius 0).
 */

const TOOLTIP_CLASS = "cn-chart-tooltip grid min-w-32 items-start";

/* ---------------------------------------------------------------- */
/* Geometry (ports of the Go engine)                                */
/* ---------------------------------------------------------------- */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtF(v) {
  return String(Math.round(v * 1000) / 1000);
}

function getDigitCount(v) {
  if (v === 0) return 1;
  return Math.floor(Math.log10(Math.abs(v))) + 1;
}

function adaptiveStep(rough, correction) {
  if (rough <= 0) return 0;
  const digitCount = getDigitCount(rough);
  const digitCountValue = Math.pow(10, digitCount);
  const stepRatio = rough / digitCountValue;
  const scale = digitCount !== 1 ? 0.05 : 0.1;
  return (Math.ceil(stepRatio / scale) + correction) * scale * digitCountValue;
}

/* recharts-scale getFormatStep: the step between two ticks that reads
 * well (10, 20, 25). */
function getFormatStep(roughStep, allowDecimals, correctionFactor) {
  if (roughStep <= 0) return 0;
  const digitCount = getDigitCount(roughStep);
  const digitCountValue = Math.pow(10, digitCount);
  const stepRatio = roughStep / digitCountValue;
  const stepRatioScale = digitCount !== 1 ? 0.05 : 0.1;
  const amendStepRatio = (Math.ceil(stepRatio / stepRatioScale) + correctionFactor) * stepRatioScale;
  const formatStep = amendStepRatio * digitCountValue;
  return allowDecimals ? formatStep : Math.ceil(formatStep);
}

/* recharts-scale calculateStep: zero is always a tick when the interval
 * contains it, and the step grows until the ticks cover the interval. */
function calculateStep(min, max, tickCount, allowDecimals, correctionFactor = 0) {
  if (!Number.isFinite((max - min) / (tickCount - 1))) {
    return { step: 0, tickMin: 0, tickMax: 0 };
  }
  const step = getFormatStep((max - min) / (tickCount - 1), allowDecimals, correctionFactor);
  let middle;
  if (min <= 0 && max >= 0) {
    middle = 0;
  } else {
    middle = (min + max) / 2;
    middle = middle - (middle % step);
  }
  let belowCount = Math.ceil((middle - min) / step);
  let upCount = Math.ceil((max - middle) / step);
  const scaleCount = belowCount + upCount + 1;
  if (scaleCount > tickCount) {
    return calculateStep(min, max, tickCount, allowDecimals, correctionFactor + 1);
  }
  if (scaleCount < tickCount) {
    upCount = max > 0 ? upCount + (tickCount - scaleCount) : upCount;
    belowCount = max > 0 ? belowCount : belowCount + (tickCount - scaleCount);
  }
  return { step, tickMin: middle - belowCount * step, tickMax: middle + upCount * step };
}

/* recharts-scale getNiceTickValues: the tick values of an interval, with
 * the count guaranteed. */
function niceTickValues(min, max, tickCount = 6, allowDecimals = true) {
  const count = Math.max(tickCount, 2);
  if (min === max) return [min];
  const { step, tickMin, tickMax } = calculateStep(min, max, count, allowDecimals);
  if (step <= 0) return [0];
  const values = [];
  for (let v = tickMin; v <= tickMax + 0.1 * step; v += step) values.push(v);
  return values;
}

function linearY(v, dmax, top, height) {
  if (dmax === 0) return top + height;
  return top + height - (v / dmax) * height;
}

/* expandValues normalizes stacked values per index to a total of 1
 * (d3-shape stackOffsetExpand behind Recharts' "expand"). */
function expandValues(series) {
  const n = series[0].values.length;
  const vals = series.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const s of series) if (!s.hidden) sum += s.values[i];
    if (sum > 0) {
      series.forEach((s, si) => {
        if (!s.hidden) vals[si][i] = s.values[i] / sum;
      });
    }
  }
  return vals;
}

/* domainTicks computes a model's nice tick values (stacked aware); the
 * domain spans from the first to the last tick, like Recharts. */
function domainTicks(m, tickCount = 5) {
  if (m.stackOffset === "expand") {
    return Array.from({ length: tickCount }, (_, i) => i / (tickCount - 1));
  }
  let max = 0;
  let min = 0;
  const n = m.series[0].values.length;
  if (m.stacked) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const s of m.series) sum += s.values[i];
      if (sum > max) max = sum;
      if (sum < min) min = sum;
    }
  } else {
    for (const s of m.series) {
      for (const v of s.values) {
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
  }
  return niceTickValues(min, max, tickCount);
}

/* valueScale maps a value onto its pixel position. With negative values
 * the domain spans [min, max] and the zero baseline sits inside the plot,
 * like Recharts' linear scale. */
function valueScale(m, start, length) {
  const [min, max] = m.domain;
  const span = max - min || 1;
  return {
    max,
    min,
    // pos returns the pixel of a value along the axis from start.
    pos: (v) => start + length - ((v - min) / span) * length,
    zero: start + length - ((0 - min) / span) * length,
  };
}

function barPositions(band, categoryGap, count) {
  const gap = categoryGap * band;
  let realBarGap = 4;
  if (band - 2 * gap - (count - 1) * realBarGap <= 0) realBarGap = 0;
  let size = (band - 2 * gap - (count - 1) * realBarGap) / count;
  if (size > 1) size = Math.round(size);
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(gap + (size + realBarGap) * i);
  return [offsets, size];
}

/* getRectanglePath from Recharts' Rectangle: the radius is one value for
 * all corners or four values starting at the top left, clamped to half the
 * rectangle. */
function roundedBarPath(x, y, w, h, radius) {
  const corners = Array.isArray(radius) ? radius : [radius || 0];
  const [tl, tr, br, bl] = corners.length === 4 ? corners : [corners[0] || 0, corners[0] || 0, corners[0] || 0, corners[0] || 0];
  const max = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
  const c = [tl, tr, br, bl].map((v) => Math.max(0, Math.min(v, max)));
  if (c.every((v) => v === 0)) {
    return `M ${fmtF(x)},${fmtF(y)} h ${fmtF(w)} v ${fmtF(h)} h ${fmtF(-w)} Z`;
  }
  return (
    `M ${fmtF(x)},${fmtF(y + c[0])} a ${fmtF(c[0])},${fmtF(c[0])} 0 0 1 ${fmtF(c[0])},${fmtF(-c[0])} ` +
    `h ${fmtF(w - c[0] - c[1])} a ${fmtF(c[1])},${fmtF(c[1])} 0 0 1 ${fmtF(c[1])},${fmtF(c[1])} ` +
    `v ${fmtF(h - c[1] - c[2])} a ${fmtF(c[2])},${fmtF(c[2])} 0 0 1 ${fmtF(-c[2])},${fmtF(c[2])} ` +
    `h ${fmtF(-(w - c[2] - c[3]))} a ${fmtF(c[3])},${fmtF(c[3])} 0 0 1 ${fmtF(-c[3])},${fmtF(-c[3])} Z`
  );
}

function naturalControls(x) {
  const n = x.length - 1;
  const a = new Array(n);
  const b = new Array(n);
  const r = new Array(n);
  a[0] = 0;
  b[0] = 2;
  r[0] = x[0] + 2 * x[1];
  for (let i = 1; i < n - 1; i++) {
    a[i] = 1;
    b[i] = 4;
    r[i] = 4 * x[i] + 2 * x[i + 1];
  }
  a[n - 1] = 2;
  b[n - 1] = 7;
  r[n - 1] = 8 * x[n - 1] + x[n];
  for (let i = 1; i < n; i++) {
    const m = a[i] / b[i - 1];
    b[i] -= m;
    r[i] -= m * r[i - 1];
  }
  a[n - 1] = r[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    a[i] = (r[i] - a[i + 1]) / b[i];
  }
  b[n - 1] = (x[n] + a[n - 1]) / 2;
  for (let i = 0; i < n - 1; i++) {
    b[i] = 2 * x[i + 1] - a[i + 1];
  }
  return [a, b];
}

function naturalPath(xs, ys) {
  if (xs.length < 2) return "";
  const [cx1, cx2] = naturalControls(xs);
  const [cy1, cy2] = naturalControls(ys);
  let d = `M${fmtF(xs[0])},${fmtF(ys[0])}`;
  for (let i = 0; i < xs.length - 1; i++) {
    d += `C${fmtF(cx1[i])},${fmtF(cy1[i])},${fmtF(cx2[i])},${fmtF(cy2[i])},${fmtF(xs[i + 1])},${fmtF(ys[i + 1])}`;
  }
  return d;
}

/* d3-shape curveLinear. */
function linearPath(xs, ys) {
  if (xs.length < 2) return "";
  let d = `M${fmtF(xs[0])},${fmtF(ys[0])}`;
  for (let i = 1; i < xs.length; i++) {
    d += `L${fmtF(xs[i])},${fmtF(ys[i])}`;
  }
  return d;
}

/* d3-shape curveStep (t = 0.5): y switches at the midpoint, ends on the
 * last point. */
function stepPath(xs, ys) {
  if (xs.length < 2) return "";
  let d = `M${fmtF(xs[0])},${fmtF(ys[0])}`;
  for (let i = 1; i < xs.length; i++) {
    const x1 = (xs[i - 1] + xs[i]) / 2;
    d += `L${fmtF(x1)},${fmtF(ys[i - 1])}L${fmtF(x1)},${fmtF(ys[i])}`;
  }
  d += `L${fmtF(xs[xs.length - 1])},${fmtF(ys[ys.length - 1])}`;
  return d;
}

/* d3-shape curveMonotoneX (Steffen 1990 monotone Hermite interpolation),
 * Recharts' type="monotone". */
function monotonePath(xs, ys) {
  if (xs.length < 2) return "";
  const sign = (x) => (x < 0 ? -1 : 1);
  const slope3 = (x0, y0, x1, y1, x2, y2) => {
    const h0 = x1 - x0;
    const h1 = x2 - x1;
    const s0 = (y1 - y0) / (h0 || (h1 < 0 && -0));
    const s1 = (y2 - y1) / (h1 || (h0 < 0 && -0));
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  };
  const slope2 = (x0, y0, x1, y1, t) => {
    const h = x1 - x0;
    return h ? (3 * (y1 - y0) / h - t) / 2 : t;
  };
  const bezier = (x0, y0, x1, y1, t0, t1) => {
    const dx = (x1 - x0) / 3;
    return `C${fmtF(x0 + dx)},${fmtF(y0 + dx * t0)},${fmtF(x1 - dx)},${fmtF(y1 - dx * t1)},${fmtF(x1)},${fmtF(y1)}`;
  };
  let d = `M${fmtF(xs[0])},${fmtF(ys[0])}`;
  let t0 = NaN;
  for (let i = 1; i < xs.length; i++) {
    let t1;
    if (i < xs.length - 1) {
      t1 = slope3(xs[i - 1], ys[i - 1], xs[i], ys[i], xs[i + 1], ys[i + 1]);
    } else {
      t1 = slope2(xs[i - 1], ys[i - 1], xs[i], ys[i], t0);
    }
    if (i === 1) t0 = slope2(xs[0], ys[0], xs[1], ys[1], t1);
    d += bezier(xs[i - 1], ys[i - 1], xs[i], ys[i], t0, t1);
    t0 = t1;
  }
  return d;
}

/* isGap says whether a series has no value at a row. */
function isGap(s, i) {
  return !!(s.gaps && s.gaps[i]);
}

/* gappedPath draws one subpath per run of values, the pendant of
 * connectNulls off: the curve breaks at every gap. */
function gappedPath(curve, xs, ys, gaps) {
  if (!gaps) return curvePath(curve, xs, ys);
  let d = "";
  let start = 0;
  for (let i = 0; i <= xs.length; i++) {
    if (i < xs.length && !gaps[i]) continue;
    if (i === start + 1) d += `M${fmtF(xs[start])},${fmtF(ys[start])}Z`;
    else if (i > start) d += curvePath(curve, xs.slice(start, i), ys.slice(start, i));
    start = i + 1;
  }
  return d;
}

function gappedAreaPath(curve, xs, top, base, gaps) {
  if (!gaps) return areaPathBetween(curve, xs, top, base);
  let d = "";
  let start = 0;
  for (let i = 0; i <= xs.length; i++) {
    if (i < xs.length && !gaps[i]) continue;
    if (i === start + 1) d += `M${fmtF(xs[start])},${fmtF(top[start])}L${fmtF(xs[start])},${fmtF(base[start])}Z`;
    else if (i > start) d += areaPathBetween(curve, xs.slice(start, i), top.slice(start, i), base.slice(start, i));
    start = i + 1;
  }
  return d;
}

function curvePath(curve, xs, ys) {
  if (curve === "linear") return linearPath(xs, ys);
  if (curve === "step") return stepPath(xs, ys);
  if (curve === "monotone") return monotonePath(xs, ys);
  return naturalPath(xs, ys);
}

/* Recharts' Text verticalAnchor as an SVG dy: the anchor names where the
 * text box sits relative to y. */
function verticalAnchorDy(anchor) {
  if (anchor === "start") return "0.71em";
  if (anchor === "middle") return "0.355em";
  return "0";
}

/* pathLength measures a path string like Recharts measures the rendered
 * curve for the line entrance (strokeDasharray animation). */
let lengthPath = null;
function pathLength(d) {
  if (!lengthPath) {
    lengthPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  }
  lengthPath.setAttribute("d", d);
  return lengthPath.getTotalLength();
}

function areaPathBetween(curve, xs, ysTop, ysBase) {
  const rx = [...xs].reverse();
  const rb = [...ysBase].reverse();
  const base = curvePath(curve, rx, rb);
  return curvePath(curve, xs, ysTop) + "L" + base.slice(1) + "Z";
}

/* preserveEnd tick culling with real text measurement, like Recharts. */
let measureCtx = null;
function measureLabel(label, refEl) {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  const cs = getComputedStyle(refEl);
  measureCtx.font = `${cs.fontSize} ${cs.fontFamily}`;
  return measureCtx.measureText(label).width;
}

/* The label height Recharts reads from the DOM: 1.5 times the font size,
 * matching the measured 18px at 12px text. */
function measureLabelHeight(refEl) {
  return parseFloat(getComputedStyle(refEl).fontSize) * 1.5;
}

function preserveEndTicks(coords, sizes, start, end, minTickGap) {
  let sign = 1;
  if (coords.length >= 2 && coords[1] < coords[0]) sign = -1;
  const kept = [];
  for (let i = coords.length - 1; i >= 0; i--) {
    const size = sizes[i];
    let tickCoord = coords[i];
    if (i === coords.length - 1) {
      const gap = sign * (tickCoord + (sign * size) / 2 - end);
      if (gap > 0) tickCoord -= gap * sign;
    }
    if (sign * tickCoord < sign * start || sign * tickCoord > sign * end) continue;
    if (sign * (tickCoord - (sign * size) / 2 - start) >= 0 && sign * (tickCoord + (sign * size) / 2 - end) <= 0) {
      end = tickCoord - sign * (size / 2 + minTickGap);
      kept.push({ index: i, coord: tickCoord });
    }
  }
  return kept.reverse();
}

/* Recharts' CartesianAxis tickSize: the tick line length, and part of the
 * label offset even when the line is hidden. */
const TICK_SIZE = 6;

/* ---------------------------------------------------------------- */
/* Rendering                                                        */
/* ---------------------------------------------------------------- */

let uid = 0;

/* swapSVG applies a newly built SVG to the panel. While the structure is
 * unchanged (animation frames) it only syncs attributes and text in
 * place, like React's reconciliation in Recharts, so frames never churn
 * DOM nodes. */
function swapSVG(panel, svgString) {
  const old = panel.querySelector("svg.recharts-surface");
  if (!old) {
    panel.insertAdjacentHTML("beforeend", svgString);
    return;
  }
  // Hover overlays (cursor band, active dots) are transient additions,
  // drop them before comparing so animation frames keep the fast path.
  old.querySelectorAll(".recharts-tooltip-cursor").forEach((c) => c.parentElement.remove());
  old.querySelectorAll(".recharts-active-dots").forEach((d) => d.remove());
  const tpl = document.createElement("template");
  tpl.innerHTML = svgString;
  const next = tpl.content.firstElementChild;
  const a = old.querySelectorAll("*");
  const b = next.querySelectorAll("*");
  if (a.length !== b.length) {
    old.replaceWith(next);
    return;
  }
  syncAttrs(old, next);
  for (let i = 0; i < a.length; i++) {
    if (a[i].tagName !== b[i].tagName) {
      old.replaceWith(next);
      return;
    }
    syncAttrs(a[i], b[i]);
    if (b[i].childElementCount === 0 && a[i].textContent !== b[i].textContent) {
      a[i].textContent = b[i].textContent;
    }
  }
}

function syncAttrs(el, src) {
  for (const attr of src.attributes) {
    if (el.getAttribute(attr.name) !== attr.value) {
      el.setAttribute(attr.name, attr.value);
    }
  }
}

// Recharts 2.15.4 Line.repeat and Line.getStrokeDasharray: retain the
// user's pattern inside the animated sweep.
function repeat(lines, count) {
  const linesUnit = lines.length % 2 !== 0 ? [...lines, 0] : lines;
  let result = [];
  for (let i = 0; i < count; ++i) result = [...result, ...linesUnit];
  return result;
}

function generateSimpleStrokeDasharray(totalLength, length) {
  return `${length}px ${totalLength - length}px`;
}

function getStrokeDasharray(length, totalLength, lines) {
  const lineLength = lines.reduce((pre, next) => pre + next);
  if (!lineLength) return generateSimpleStrokeDasharray(totalLength, length);
  const count = Math.floor(length / lineLength);
  const remainLength = length % lineLength;
  const restLength = totalLength - length;
  let remainLines = [];
  for (let i = 0, sum = 0; i < lines.length; sum += lines[i], ++i) {
    if (sum + lines[i] > remainLength) {
      remainLines = [...lines.slice(0, i), remainLength - sum];
      break;
    }
  }
  const emptyLines = remainLines.length % 2 === 0 ? [0, restLength] : [restLength];
  return [...repeat(lines, count), ...remainLines, ...emptyLines].map(line => `${line}px`).join(", ");
}

/* CSS 'ease' (cubic-bezier(0.25, 0.1, 0.25, 1)), Recharts' default
 * animation easing. */
function cssEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  // Solve x(u) = t for u, then return y(u).
  const bx = (u) => 3 * u * (1 - u) * (1 - u) * 0.25 + 3 * u * u * (1 - u) * 0.25 + u * u * u;
  const by = (u) => 3 * u * (1 - u) * (1 - u) * 0.1 + 3 * u * u * (1 - u) * 1 + u * u * u;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < t) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* The Recharts entrance animation: bars grow from the baseline over
 * 400ms, areas reveal left to right and pies sweep over 1500ms.
 * Like react-smooth, the from state paints synchronously on mount (axes
 * and grid are visible immediately) and the clock starts on the first
 * real frame, so charts in throttled frames play the full entrance the
 * moment frames arrive instead of getting stuck blank. */
function animateChart(panel, m, state, render) {
  if (reducedMotion.matches) {
    render(1);
    return;
  }
  const duration = m.kind === "bar" ? 400 : 1500;
  render(0);
  let beginTime;
  const frame = (now) => {
    if (!beginTime) beginTime = now;
    const alpha = cssEase(Math.min(1, (now - beginTime) / duration));
    render(alpha);
    if (alpha < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* The Recharts update animation: every graphical item interpolates its
 * previous points into the new ones in pixel space, index mapped by
 * prevPointsDiffFactor when the point count changed. */
function morphChart(panel, m, state, render, prevPoints) {
  if (reducedMotion.matches) {
    render(1);
    return;
  }
  const duration = m.kind === "bar" ? 400 : 1500;
  const paint = (t) => {
    state.morph = t < 1 ? { prev: prevPoints, t } : null;
    render(1);
  };
  // Like the entrance: the previous state paints synchronously, the clock
  // starts on the first real frame.
  paint(0);
  let beginTime;
  const frame = (now) => {
    if (!beginTime) beginTime = now;
    const t = cssEase(Math.min(1, (now - beginTime) / duration));
    paint(t);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* interpolate of Recharts' DataUtils. */
function interpolate(start, end, t) {
  if (start == null) return end;
  return start + (end - start) * t;
}

/* morphPoints maps a series' points onto the previous ones the way
 * Recharts does: prevPointsDiffFactor picks the previous index. */
function morphPoints(morph, si, coords, key) {
  if (!morph || !morph.prev || !morph.prev[key] || !morph.prev[key][si]) return coords;
  const prev = morph.prev[key][si];
  const factor = prev.length / coords.length;
  return coords.map((v, i) => {
    const p = prev[Math.floor(i * factor)];
    return p == null ? v : interpolate(p, v, morph.t);
  });
}

function renderCartesian(panel, m, state, alpha = 1) {
  const W = panel.clientWidth;
  const H = panel.clientHeight;
  if (!W || !H) return;
  const legendHeight = legendSize(panel, m);

  const vertical = m.layout === "vertical";
  // selectChartOffsetInternal: the axes add to the margins, the legend box
  // adds to the bottom (or the top with verticalAlign "top", Recharts'
  // appendOffsetOfLegend), and the plot never goes negative.
  const yAxisW = m.yAxisWidth || 0;
  const plotX = m.marginLeft + yAxisW;
  const plotY = m.marginTop + (m.legendVAlign === "top" ? legendHeight : 0);
  const plotW = Math.max(W - m.marginLeft - m.marginRight - yAxisW, 0);
  const plotH = Math.max(H - m.marginTop - m.marginBottom - (m.xAxisHeight || 0) - legendHeight, 0);
  const plotBottom = plotY + plotH;
  const n = m.labels.length;

  // During a morph the scale is pinned to the target domain like
  // Recharts, which interpolates pixel positions on the new scale.
  const ticks = m.ticks;
  const [domainMin, domainMax] = m.domain;

  // Category positions: band centers for bars, evenly spaced points for
  // lines and areas.
  const catStart = vertical ? plotY : plotX;
  const catLength = vertical ? plotH : plotW;
  const bandSize = m.kind === "bar" ? catLength / n : 0;
  const cats = [];
  for (let i = 0; i < n; i++) {
    cats.push(m.kind === "bar" ? catStart + i * bandSize + bandSize / 2 : plotX + (i * plotW) / (n - 1));
  }

  // Explicit pixel size like Recharts' Surface: the svg never stretches
  // between resize frames, every frame lays out fresh. The accessibility
  // layer puts Recharts' role and tabIndex on the surface; it is on unless
  // the chart opted out, Recharts' accessibilityLayer !== false.
  const a11y = m.accessibilityLayer !== false ? ` role="application" tabindex="0"` : "";
  let svg = `<svg class="recharts-surface"${a11y} width="${fmtF(W)}" height="${fmtF(H)}" viewBox="0 0 ${fmtF(W)} ${fmtF(H)}">`;

  if (m.defs && m.defs.length) {
    svg += "<defs>";
    for (const g of m.defs) {
      // The stops are raw markup from the demo, passed through verbatim
      // like Recharts passes defs children through.
      svg += `<linearGradient id="${state.uid}-${g.ID}" x1="${g.X1}" y1="${g.Y1}" x2="${g.X2}" y2="${g.Y2}">${g.Stops || ""}</linearGradient>`;
    }
    svg += "</defs>";
  }

  if (yAxisW > 0 && vertical) {
    // Vertical layout: the y axis carries the category labels.
    const ySizes = cats.map(() => measureLabelHeight(panel));
    const labelX = plotX - TICK_SIZE - (m.yAxisMargin || 0);
    svg += `<g class="recharts-layer recharts-cartesian-axis recharts-yAxis yAxis"><g class="recharts-cartesian-axis-ticks">`;
    // The category coordinates ascend downwards, so the bounds run from
    // the top of the surface to its bottom.
    for (const tk of preserveEndTicks(cats, ySizes, 0, H, m.minTickGap || 5)) {
      svg += `<g class="recharts-layer recharts-cartesian-axis-tick"><text orientation="left" width="${fmtF(yAxisW)}" x="${fmtF(labelX)}" y="${fmtF(tk.coord)}" stroke="none" fill="#666" class="recharts-text recharts-cartesian-axis-tick-value" text-anchor="end"><tspan dy="0.355em">${m.labels[tk.index]}</tspan></text></g>`;
    }
    svg += "</g></g>";
  } else if (yAxisW > 0) {
    const yCoords = ticks.map((tv) => linearY(tv - domainMin, domainMax - domainMin, plotY, plotH));
    const ySizes = ticks.map(() => measureLabelHeight(panel));
    const labelX = plotX - TICK_SIZE - (m.yAxisMargin || 0);
    svg += `<g class="recharts-layer recharts-cartesian-axis recharts-yAxis yAxis">`;
    if (m.yAxisLine) {
      svg += `<line orientation="left" class="recharts-cartesian-axis-line" stroke="#666" fill="none" x1="${fmtF(plotX)}" y1="${fmtF(plotY)}" x2="${fmtF(plotX)}" y2="${fmtF(plotBottom)}"/>`;
    }
    svg += `<g class="recharts-cartesian-axis-ticks">`;
    for (const tk of preserveEndTicks(yCoords, ySizes, H, 0, m.minTickGap || 5)) {
      svg += `<g class="recharts-layer recharts-cartesian-axis-tick">`;
      if (m.yTickLine) {
        svg += `<line orientation="left" class="recharts-cartesian-axis-tick-line" stroke="#666" fill="none" x1="${fmtF(plotX - TICK_SIZE)}" y1="${fmtF(yCoords[tk.index])}" x2="${fmtF(plotX)}" y2="${fmtF(yCoords[tk.index])}"/>`;
      }
      svg += `<text orientation="left" width="${fmtF(yAxisW)}" x="${fmtF(labelX)}" y="${fmtF(tk.coord)}" stroke="none" fill="#666" class="recharts-text recharts-cartesian-axis-tick-value" text-anchor="end"><tspan dy="0.355em">${escapeHTML(m.tickLabels[tk.index])}</tspan></text></g>`;
    }
    svg += "</g></g>";
  }

  if (m.grid) {
    // Recharts draws a line per tick of the value axis and per category of
    // the other one; both directions default to on.
    const valueCoords = ticks.map((tv) => {
      const p = linearY(tv - domainMin, domainMax - domainMin, vertical ? plotX : plotY, vertical ? plotW : plotH);
      return vertical ? plotX + plotW - (p - plotX) : p;
    });
    svg += `<g class="recharts-layer recharts-cartesian-grid">`;
    if (m.gridHorizontal) {
      svg += `<g class="recharts-cartesian-grid-horizontal">`;
      for (const y of vertical ? cats : valueCoords) {
        svg += `<line stroke="#ccc" fill="none" x1="${fmtF(plotX)}" y1="${fmtF(y)}" x2="${fmtF(plotX + plotW)}" y2="${fmtF(y)}"/>`;
      }
      svg += "</g>";
    }
    if (m.gridVertical) {
      svg += `<g class="recharts-cartesian-grid-vertical">`;
      for (const x of vertical ? valueCoords : cats) {
        svg += `<line stroke="#ccc" fill="none" x1="${fmtF(x)}" y1="${fmtF(plotY)}" x2="${fmtF(x)}" y2="${fmtF(plotBottom)}"/>`;
      }
      svg += "</g>";
    }
    svg += "</g>";
  }

  if (m.allowDataOverflow) {
    const id = `${state.uid}-overflow`;
    svg += `<defs><clipPath id="${id}"><rect x="${fmtF(vertical ? plotX : plotX - plotW / 2)}" y="${fmtF(vertical ? plotY - plotH / 2 : plotY)}" width="${fmtF(vertical ? plotW : plotW * 2)}" height="${fmtF(vertical ? plotH * 2 : plotH)}"/></clipPath></defs><g clip-path="url(#${id})">`;
  }
  let xs = [];
  let band = 0;
  // The update-animation sources, Recharts' prevPoints/prevData: full
  // point geometry per series (xs and tops for curves, the signed
  // rectangles for bars, the numeric base line for areas).
  state.points = { tops: [], xs: [], rects: [], base: plotBottom };
  const vals = m.stackOffset === "expand" ? expandValues(m.series) : m.series.map((s) => s.values);

  if (m.kind === "bar") {
    // The category axis runs along x, or along y when the layout is
    // vertical and the bars grow to the right.
    band = bandSize;
    // Stacked bars share one slot per category, like Recharts' stackId.
    const slots = m.stacked ? 1 : m.series.filter(s => !s.hidden).length;
    const [offsets, barSize] = barPositions(band, m.categoryGap, slots);
    const scale = valueScale(m, vertical ? plotX : plotY, vertical ? plotW : plotH);
    // In a vertical layout the value axis grows from left to right, so the
    // scale is mirrored around the plot.
    const valuePos = (v) => (vertical ? plotX + plotW - (scale.pos(v) - plotX) : scale.pos(v));
    const zero = vertical ? plotX + plotW - (scale.zero - plotX) : scale.zero;

    let visibleIndex = 0;
    const stackBase = new Array(n).fill(0);
    state.tops = [];
    for (let si = 0; si < m.series.length; si++) {
      const s = m.series[si];
      if (s.hidden) {
        state.tops.push([]);
        state.points.rects.push([]);
        continue;
      }
      const slot = m.stacked ? 0 : visibleIndex++;

      const tops = [];
      const rects = [];
      // Recharts' Bar geometry keeps the rectangle signed: the origin is
      // the value end and the size runs back to the baseline, so negative
      // bars carry a negative size. Label positions read those signs.
      const rectPos = [];
      const rectSize = [];
      svg += `<g class="recharts-layer recharts-bar"><g class="recharts-layer recharts-bar-rectangles">`;
      for (let i = 0; i < n; i++) {
        const raw = vals[si][i];
        const from = m.stacked ? stackBase[i] : 0;
        const to = m.stacked ? stackBase[i] + raw : raw;
        const base = valuePos(from);
        const end = valuePos(to);
        const cat = catStart + i * band + offsets[slot];
        // The signed rectangle like Recharts computes it: the origin sits
        // at the value end and the size runs back to the baseline.
        let rect = vertical
          ? { x: base, y: cat, width: end - base, height: barSize }
          : { x: cat, y: end, width: barSize, height: base - end };
        // renderRectanglesWithAnimation: with a previous rectangle at the
        // same index all four sides interpolate; without one the bar plays
        // the entrance at the animation clock instead.
        if (state.morph) {
          const prevRects = state.morph.prev.rects && state.morph.prev.rects[si];
          const prev = prevRects && prevRects[i];
          const t = state.morph.t;
          if (prev) {
            rect = {
              x: interpolate(prev.x, rect.x, t),
              y: interpolate(prev.y, rect.y, t),
              width: interpolate(prev.width, rect.width, t),
              height: interpolate(prev.height, rect.height, t),
            };
          } else if (vertical) {
            rect.width = rect.width * t;
          } else {
            const h = rect.height * t;
            rect = { ...rect, y: rect.y + rect.height - h, height: h };
          }
        }
        // The entrance grows the height from the baseline, vertical the
        // width, Recharts' no-prev branch driven by the entrance clock.
        if (alpha < 1) {
          if (vertical) {
            rect.width = rect.width * alpha;
          } else {
            const h = rect.height * alpha;
            rect = { ...rect, y: rect.y + rect.height - h, height: h };
          }
        }
        const fill = (s.cells && s.cells[i]) || s.color;
        const active = s.activeIndex != null && s.activeIndex === i && s.activeBar;
        let attrs = `fill="${fill}"`;
        if (active) {
          const ab = s.activeBar;
          attrs += ` fill-opacity="${fmtF(ab.FillOpacity || 1)}" stroke="${ab.Stroke || fill}"`;
          if (ab.StrokeDasharray) attrs += ` stroke-dasharray="${fmtF(ab.StrokeDasharray)}"`;
          if (ab.StrokeDashoffset) attrs += ` stroke-dashoffset="${fmtF(ab.StrokeDashoffset)}"`;
          if (s.strokeWidth) attrs += ` stroke-width="${fmtF(s.strokeWidth)}"`;
        }
        let d;
        if (vertical) {
          d = roundedBarPath(Math.min(rect.x, rect.x + rect.width), rect.y, Math.abs(rect.width), rect.height, s.radius);
        } else {
          d = roundedBarPath(rect.x, Math.min(rect.y, rect.y + rect.height), rect.width, Math.abs(rect.height), s.radius);
        }
        tops.push(vertical ? rect.x + rect.width : rect.y);
        rectPos.push(vertical ? rect.x : rect.y);
        rectSize.push(vertical ? rect.width : rect.height);
        rects.push(rect);
        svg += `<g class="recharts-layer recharts-bar-rectangle"><path class="recharts-rectangle" ${attrs} d="${d}"/></g>`;
        if (m.stacked) stackBase[i] = to;
      }
      svg += "</g>";
      // Label lists paint after the entrance and after an update morph,
      // like Recharts gates them on isAnimationFinished.
      if (alpha >= 1 && !state.morph && s.labelLists) {
        for (const ll of s.labelLists) {
          svg += `<g class="recharts-layer recharts-label-list">`;
          for (let i = 0; i < n; i++) {
            const catCenter = catStart + i * band + offsets[slot] + barSize / 2;
            const offset = ll.offset || 5;
            // getAttrsOfCartesianLabel: the sign of the rectangle flips the
            // offset and the anchor, so a negative bar labels below its end.
            let x, y, anchor, vAnchor;
            if (vertical) {
              const width = rectSize[i];
              const sign = width >= 0 ? 1 : -1;
              y = catCenter;
              vAnchor = "middle";
              anchor = sign > 0 ? "start" : "end";
              x = ll.position === "right" ? rectPos[i] + width + sign * offset : rectPos[i] + sign * offset;
            } else {
              const height = rectSize[i];
              const sign = height >= 0 ? 1 : -1;
              x = catCenter;
              y = rectPos[i] - sign * offset;
              anchor = "middle";
              vAnchor = sign > 0 ? "end" : "start";
            }
            const fo = ll.fillOpacity ? ` fill-opacity="${fmtF(ll.fillOpacity)}"` : "";
            // LabelList inherits the entry's presentation props, so a label
            // without its own class takes the bar's fill.
            const fill = ll.class ? "" : ` fill="${(s.cells && s.cells[i]) || s.color}"`;
            svg += `<text x="${fmtF(x)}" y="${fmtF(y)}" class="recharts-text recharts-label ${ll.class || ""}" text-anchor="${anchor}" font-size="${fmtF(ll.fontSize || 12)}"${fill}${fo}><tspan dy="${verticalAnchorDy(vAnchor)}">${ll.labels[i]}</tspan></text>`;
          }
          svg += `</g>`;
        }
      }
      svg += "</g>";
      state.tops.push(tops);
      state.points.rects.push(rects);
    }
    xs = cats;
  } else if (m.kind === "line") {
    xs = cats;
    state.tops = [];
    for (let si = 0; si < m.series.length; si++) {
      const s = m.series[si];
      // stepPoints of the update animation: x and y both interpolate from
      // the previous point picked by prevPointsDiffFactor.
      const sx = morphPoints(state.morph, si, cats.slice(), "xs");
      const top = morphPoints(state.morph, si, vals[si].map((v) => linearY(v - domainMin, domainMax - domainMin, plotY, plotH)), "tops");
      if (s.hidden) {
        state.tops.push(top);
        state.points.xs.push(sx);
        continue;
      }
      const d = gappedPath(s.curve, sx, top, s.gaps);
      // The Recharts line entrance: strokeDasharray sweeps the measured
      // curve length from 0 to totalLength.
      let dash = s.strokeDasharray ? ` stroke-dasharray="${s.strokeDasharray}"` : "";
      if (alpha < 1) {
        const total = pathLength(d);
        const pattern = s.strokeDasharray
          ? getStrokeDasharray(total * alpha, total, String(s.strokeDasharray).split(/[,\s]+/gim).map(num => parseFloat(num)))
          : generateSimpleStrokeDasharray(total, total * alpha);
        dash = ` stroke-dasharray="${pattern}"`;
      }
      svg +=
        `<g class="recharts-layer recharts-line">` +
        `<path class="recharts-curve recharts-line-curve" stroke="${s.stroke || s.color}" stroke-width="${s.strokeWidth || 1}" fill="none"${dash} d="${d}"/>`;
      // Dots and labels appear when the entrance and the update morph
      // finished, like Recharts' isAnimationFinished gate on renderDots
      // and LabelList.
      if (alpha >= 1 && !state.morph && s.dot) {
        svg += `<g class="recharts-layer recharts-line-dots">`;
        for (let i = 0; i < n; i++) {
          if (isGap(s, i) || (s.dot.shown && !s.dot.shown[i])) continue;
          if (s.dot.icon) {
            const size = s.dot.size || 24;
            svg += `<g transform="translate(${fmtF(sx[i] - size / 2)},${fmtF(top[i] - size / 2)})">${s.dot.icon}</g>`;
          } else {
            const fill = (s.dot.fills && s.dot.fills[i]) || s.dot.fill || "#fff";
            const stroke = (s.dot.fills && s.dot.fills[i]) || s.stroke || s.color;
            // A dot from the data fill is the demos' explicit Dot element,
            // which carries no strokeWidth, so the SVG default of one wins;
            // a plain dot inherits the line's strokeWidth like Recharts
            // spreading the line props into renderDots.
            const dotStrokeWidth = s.dot.fills ? 1 : s.strokeWidth || 1;
            svg += `<circle r="${fmtF(s.dot.r || 3)}" stroke="${stroke}" stroke-width="${fmtF(dotStrokeWidth)}" fill="${fill}" class="recharts-dot recharts-line-dot" cx="${fmtF(sx[i])}" cy="${fmtF(top[i])}"/>`;
          }
        }
        svg += `</g>`;
      }
      if (alpha >= 1 && !state.morph && s.labelList) {
        const ll = s.labelList;
        svg += `<g class="recharts-layer recharts-label-list">`;
        for (let i = 0; i < n; i++) {
          if (isGap(s, i)) continue;
          const fill = ll.class ? "" : ` fill="${s.stroke || s.color}"`;
          svg += `<text x="${fmtF(sx[i])}" y="${fmtF(top[i] - (ll.offset || 5))}" class="recharts-text recharts-label ${ll.class || ""}" text-anchor="middle" font-size="${fmtF(ll.fontSize || 12)}"${fill}><tspan>${ll.labels[i]}</tspan></text>`;
        }
        svg += `</g>`;
      }
      svg += `</g>`;
      state.tops.push(top);
      state.points.xs.push(sx);
    }
  } else {
    xs = cats;
    // Recharts' entrance animation reveals areas left to right through a
    // clipPath rect (AreaRevealShape). A numeric base line interpolates
    // during the update morph like stepBaseLine.
    const baseY = state.morph && state.morph.prev.base != null ? interpolate(state.morph.prev.base, plotBottom, state.morph.t) : plotBottom;
    const baseline = new Array(n).fill(baseY);
    let base = baseline;
    state.tops = [];
    for (let si = 0; si < m.series.length; si++) {
      const s = m.series[si];
      // stepPoints of the update animation: x and y both interpolate from
      // the previous point picked by prevPointsDiffFactor.
      const sx = morphPoints(state.morph, si, cats.slice(), "xs");
      const top = morphPoints(
        state.morph,
        si,
        m.stacked
          ? base.map((b, i) => b - ((vals[si][i] / (domainMax - domainMin)) * plotH || 0))
          : vals[si].map((v) => linearY(v - domainMin, domainMax - domainMin, plotY, plotH)),
        "tops"
      );
      if (s.hidden) {
        state.tops.push(top);
        state.points.xs.push(sx);
        continue;
      }
      const fill = (s.fill || "").replace("url(#", `url(#${state.uid}-`) || s.color;
      const fillOpacity = s.fillOpacity || 0.6;
      const areaD = m.stacked ? areaPathBetween(s.curve, sx, top, base) : gappedAreaPath(s.curve, sx, top, baseline, s.gaps);
      // HorizontalRect: the reveal spans the point range and reaches the
      // lowest painted y plus the stroke width.
      let clip = "";
      let clipOpen = "";
      if (alpha < 1) {
        const width = alpha * Math.abs(sx[0] - sx[n - 1]);
        const maxY = Math.max(...top, ...(m.stacked ? base : baseline));
        const id = `${state.uid}-reveal-${si}`;
        clip = `<defs><clipPath id="${id}"><rect x="${fmtF(sx[0] < sx[n - 1] ? sx[0] : sx[0] - width)}" y="0" width="${fmtF(width)}" height="${fmtF(Math.floor(maxY + 1))}"/></clipPath></defs>`;
        clipOpen = ` clip-path="url(#${id})"`;
      }
      svg +=
        clip +
        `<g class="recharts-layer recharts-area"${clipOpen}>` +
        `<path class="recharts-curve recharts-area-area" fill="${fill}" fill-opacity="${fillOpacity}" stroke="none" d="${areaD}"/>` +
        `<path class="recharts-curve recharts-area-curve" stroke="${s.stroke || s.color}" fill="none" stroke-width="1" d="${gappedPath(s.curve, sx, top, m.stacked ? null : s.gaps)}"/>` +
        `</g>`;
      state.tops.push(top);
      state.points.xs.push(sx);
      if (m.stacked) base = top;
    }
  }

  if (m.allowDataOverflow) svg += "</g>";

  // The x axis only renders when the chart declared a visible one.
  if (m.xAxisHeight) {
  const labels = vertical ? m.tickLabels : m.labels;
  const coords = vertical ? ticks.map(v => plotX + (v - domainMin) / (domainMax - domainMin || 1) * plotW) : xs;
  const widths = labels.map((l) => measureLabel(l, panel));
  const labelY = plotBottom + TICK_SIZE + (m.tickMargin || 0);
  svg += `<g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis">`;
  if (m.xAxisLine) {
    svg += `<line orientation="bottom" class="recharts-cartesian-axis-line" stroke="#666" fill="none" x1="${fmtF(plotX)}" y1="${fmtF(plotBottom)}" x2="${fmtF(plotX + plotW)}" y2="${fmtF(plotBottom)}"/>`;
  }
  svg += `<g class="recharts-cartesian-axis-ticks">`;
  for (const tk of preserveEndTicks(coords, widths, 0, W, m.minTickGap || 5)) {
    svg += `<g class="recharts-layer recharts-cartesian-axis-tick">`;
    if (m.xTickLine) {
      svg += `<line orientation="bottom" class="recharts-cartesian-axis-tick-line" stroke="#666" fill="none" x1="${fmtF(coords[tk.index])}" y1="${fmtF(plotBottom + TICK_SIZE)}" x2="${fmtF(coords[tk.index])}" y2="${fmtF(plotBottom)}"/>`;
    }
    svg += `<text orientation="bottom" height="${fmtF(m.xAxisHeight)}" x="${fmtF(tk.coord)}" y="${fmtF(labelY)}" stroke="none" fill="#666" class="recharts-text recharts-cartesian-axis-tick-value" text-anchor="middle"><tspan dy="0.71em">${escapeHTML(labels[tk.index])}</tspan></text></g>`;
  }
  svg += "</g></g>";
  }
  svg += "</svg>";

  swapSVG(panel, svg);

  state.points.tops = state.tops || [];
  state.geom = { W, H, plotX, plotY, plotW, plotH, plotBottom, band, xs, cats, n, vertical };
}

/* Pie sector path, the port of the Go SectorPath (degrees, 0 at three
 * o'clock, counterclockwise positive). */
/* useElementOffset and setLegendSize: the legend reports its rendered
 * bounding box, and appendOffsetOfLegend takes that height off the chart.
 * The model height is the fallback until the legend has been laid out. */
function legendSize(panel, m) {
  if (!m.legendHeight) return 0;
  const el = panel.querySelector(".recharts-legend-wrapper");
  if (el) {
    const h = el.getBoundingClientRect().height;
    if (h > 0) return h;
  }
  return m.legendHeight;
}

/* polarToCartesian of Recharts: degrees, zero at three o'clock, positive
 * counterclockwise. */
function polarToCartesian(cx, cy, radius, angle) {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy - Math.sin(rad) * radius };
}

/* getAngleOfPoint of Recharts' PolarUtils: the polar coordinates of a
 * point around the chart center. */
function angleOfPoint(x, y, cx, cy) {
  const radius = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (radius <= 0) return { radius, angle: 0 };
  let angleInRadian = Math.acos((x - cx) / radius);
  if (y > cy) angleInRadian = 2 * Math.PI - angleInRadian;
  return { radius, angle: (angleInRadian * 180) / Math.PI };
}

/* calculateActiveTickIndex for an angle axis that spans a full circle:
 * the pointer belongs to the tick whose half intervals contain it. */
function activeAngleIndex(coordinate, ticks) {
  const len = ticks.length;
  if (len <= 1) return 0;
  const range = [90, -270];
  for (let i = 0; i < len; i++) {
    const before = i > 0 ? ticks[i - 1] : ticks[len - 1];
    const cur = ticks[i];
    const after = i >= len - 1 ? ticks[0] : ticks[i + 1];
    const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
    let sameDirectionCoord;
    if (sign(cur - before) !== sign(after - cur)) {
      const diffInterval = [];
      if (sign(after - cur) === sign(range[1] - range[0])) {
        sameDirectionCoord = after;
        const curInRange = cur + range[1] - range[0];
        diffInterval[0] = Math.min(curInRange, (curInRange + before) / 2);
        diffInterval[1] = Math.max(curInRange, (curInRange + before) / 2);
      } else {
        sameDirectionCoord = before;
        const afterInRange = after + range[1] - range[0];
        diffInterval[0] = Math.min(cur, (afterInRange + cur) / 2);
        diffInterval[1] = Math.max(cur, (afterInRange + cur) / 2);
      }
      const sameInterval = [Math.min(cur, (sameDirectionCoord + cur) / 2), Math.max(cur, (sameDirectionCoord + cur) / 2)];
      if ((coordinate > sameInterval[0] && coordinate <= sameInterval[1]) || (coordinate >= diffInterval[0] && coordinate <= diffInterval[1])) {
        return i;
      }
    } else {
      const minValue = Math.min(before, after);
      const maxValue = Math.max(before, after);
      if (coordinate > (minValue + cur) / 2 && coordinate <= (maxValue + cur) / 2) {
        return i;
      }
    }
  }
  return -1;
}

/* formatAngleOfSector plus the angle test of inRangeOfSector. */
function inAngleRangeOfSector(angle, startAngle, endAngle) {
  const min = Math.min(Math.floor(startAngle / 360), Math.floor(endAngle / 360));
  const start = startAngle - min * 360;
  const end = endAngle - min * 360;
  let formatAngle = angle;
  if (start <= end) {
    while (formatAngle > end) formatAngle -= 360;
    while (formatAngle < start) formatAngle += 360;
    return formatAngle >= start && formatAngle <= end;
  }
  while (formatAngle > start) formatAngle -= 360;
  while (formatAngle < end) formatAngle += 360;
  return formatAngle >= end && formatAngle <= start;
}

/* calculateActiveTickIndex for ticks that run in a single direction. */
function activeTickIndex(coordinate, ticks) {
  const len = ticks.length;
  if (len <= 1) return 0;
  for (let i = 0; i < len; i++) {
    if (
      (i === 0 && coordinate <= (ticks[i] + ticks[i + 1]) / 2) ||
      (i > 0 && i < len - 1 && coordinate > (ticks[i] + ticks[i - 1]) / 2 && coordinate <= (ticks[i] + ticks[i + 1]) / 2) ||
      (i === len - 1 && coordinate > (ticks[i] + ticks[i - 1]) / 2)
    ) {
      return i;
    }
  }
  return -1;
}

/* getPolygonPath of Recharts' PolarGrid. */
function polarPolygonPath(radius, cx, cy, angles) {
  let path = "";
  angles.forEach((angle, i) => {
    const p = polarToCartesian(cx, cy, radius, angle);
    path += (i ? "L " : "M ") + fmtF(p.x) + "," + fmtF(p.y);
  });
  return path + "Z";
}

/* PolarGrid: ConcentricCircle and ConcentricPolygon carry the radius twice
 * like Recharts does, PolarAngles runs the radial lines from the inner to
 * the outer radius. The stroke defaults to Recharts' "#ccc", the demos
 * that paint their rings through a class pass "none" instead. */
function polarGridSVG(polar, cx, cy, innerRadius, outerRadius, radii, angles) {
  const stroke = polar.stroke || "#ccc";
  const strokeWidth = polar.strokeWidth ? ` stroke-width="${fmtF(polar.strokeWidth)}"` : "";
  const cls = polar.gridClass ? " " + polar.gridClass : "";
  let svg = `<g class="recharts-polar-grid"><g class="recharts-polar-grid-concentric">`;
  for (const r of radii) {
    if (polar.gridType === "circle") {
      svg += `<circle class="recharts-polar-grid-concentric-circle${cls}" stroke="${stroke}" fill="none"${strokeWidth} cx="${fmtF(cx)}" cy="${fmtF(cy)}" radius="${fmtF(r)}" r="${fmtF(r)}"/>`;
    } else {
      svg += `<path class="recharts-polar-grid-concentric-polygon${cls}" stroke="${stroke}" fill="none"${strokeWidth} d="${polarPolygonPath(r, cx, cy, angles)}"/>`;
    }
  }
  svg += `</g>`;
  if (polar.radialLines) {
    svg += `<g class="recharts-polar-grid-angle">`;
    for (const a of angles) {
      const start = polarToCartesian(cx, cy, innerRadius, a);
      const end = polarToCartesian(cx, cy, outerRadius, a);
      svg += `<line stroke="${stroke}"${strokeWidth} x1="${fmtF(start.x)}" y1="${fmtF(start.y)}" x2="${fmtF(end.x)}" y2="${fmtF(end.y)}"/>`;
    }
    svg += `</g>`;
  }
  return svg + `</g>`;
}

/* The Label content of the demos: a text in the middle of the chart with
 * one tspan per line, each at its own offset off the center. */
function centerLabelSVG(cx, cy, label) {
  const baseline = label.dominantBaseline ? ` dominant-baseline="${label.dominantBaseline}"` : "";
  let svg = `<text x="${fmtF(cx)}" y="${fmtF(cy)}" text-anchor="middle"${baseline}>`;
  for (const span of label.spans || []) {
    const cls = span.class ? ` class="${span.class}"` : "";
    svg += `<tspan x="${fmtF(cx)}" y="${fmtF(cy + (span.offsetY || 0))}"${cls}>${span.text}</tspan>`;
  }
  return svg + `</text>`;
}

/* renderRadar draws a RadarChart: the polar grid, the angle axis labels and
 * one polygon per series. The geometry follows RadarChart's defaults, a
 * start angle of 90 running to -270 and an outer radius of 80%. */
function renderRadar(panel, m, state, alpha = 1) {
  const W = panel.clientWidth;
  const H = panel.clientHeight;
  if (!W || !H) return;
  const legendHeight = legendSize(panel, m);
  const offsetW = Math.max(W - m.marginLeft - m.marginRight, 0);
  const offsetH = Math.max(H - m.marginTop - m.marginBottom - legendHeight, 0);
  const cx = m.marginLeft + offsetW / 2;
  const cy = m.marginTop + offsetH / 2;
  const maxRadius = Math.min(offsetW, offsetH) / 2;
  const outerRadius = maxRadius * 0.8;
  const n = m.series.length ? m.series[0].values.length : 0;
  if (!n) return;

  // The angle axis is a band scale from 90 to -270, one tick per row.
  const step = -360 / n;
  const angles = Array.from({ length: n }, (_, i) => 90 + step * i);
  const ticks = domainTicks(m, m.tickCount || 5);
  const domainMax = ticks[ticks.length - 1];
  const polar = m.polar || {};
  const radii = polar.polarRadius && polar.polarRadius.length ? polar.polarRadius : ticks.map((t) => (t / domainMax) * outerRadius);

  let svg = `<svg class="recharts-surface" width="${fmtF(W)}" height="${fmtF(H)}" viewBox="0 0 ${fmtF(W)} ${fmtF(H)}">`;

  if (polar.hasGrid) {
    svg += polarGridSVG(polar, cx, cy, 0, outerRadius, radii, angles);
  }

  if (polar.hasAngleAxis) {
    // getTickLineCoord with the default tickSize of 8 and the outer
    // orientation, plus getTickTextAnchor and getTickTextVerticalAnchor.
    const eps = 1e-5;
    const COS_45 = Math.cos((45 * Math.PI) / 180);
    svg += `<g class="recharts-polar-angle-axis recharts-axis">`;
    // AxisLine: a polygon through the ticks at the outer radius, the
    // default axisLineType of "polygon".
    svg += `<path class="recharts-polygon recharts-polar-angle-axis-line" fill="none" d="${polarPolygonPath(outerRadius, cx, cy, angles)}"/>`;
    svg += `<g class="recharts-polar-angle-axis-ticks">`;
    for (let i = 0; i < n; i++) {
      const coord = angles[i];
      const p = polarToCartesian(cx, cy, outerRadius + 8, coord);
      const cos = Math.cos((-coord * Math.PI) / 180);
      const sin = Math.sin((-coord * Math.PI) / 180);
      const anchor = cos > eps ? "start" : cos < -eps ? "end" : "middle";
      const vAnchor = Math.abs(cos) <= COS_45 ? (sin > 0 ? "start" : "end") : "middle";
      // getTickLineCoord: from the axis out by the default tickSize of 8.
      const p1 = polarToCartesian(cx, cy, outerRadius, coord);
      svg += `<line class="recharts-polar-angle-axis-tick-line" fill="none" x1="${fmtF(p1.x)}" y1="${fmtF(p1.y)}" x2="${fmtF(p.x)}" y2="${fmtF(p.y)}"/>`;
      const custom = polar.ticks && polar.ticks[i];
      if (custom) {
        const y = p.y + (custom.offsetY || 0);
        const fs = custom.fontSize ? ` font-size="${fmtF(custom.fontSize)}"` : "";
        const fw = custom.fontWeight ? ` font-weight="${custom.fontWeight}"` : "";
        svg += `<text class="recharts-text recharts-polar-angle-axis-tick-value" x="${fmtF(p.x)}" y="${fmtF(y)}" text-anchor="${anchor}"${fs}${fw} fill="currentColor">`;
        for (const span of custom.spans) {
          const attrs =
            (span.resetX ? ` x="${fmtF(p.x)}"` : "") +
            (span.dy ? ` dy="${span.dy}"` : "") +
            (span.fontSize ? ` font-size="${fmtF(span.fontSize)}"` : "") +
            (span.class ? ` class="${span.class}"` : "");
          svg += `<tspan${attrs}>${span.text}</tspan>`;
        }
        svg += `</text>`;
      } else {
        svg += `<text class="recharts-text recharts-polar-angle-axis-tick-value" x="${fmtF(p.x)}" y="${fmtF(p.y)}" text-anchor="${anchor}" fill="#666"><tspan dy="${verticalAnchorDy(vAnchor)}">${m.labels[i]}</tspan></text>`;
      }
    }
    svg += `</g></g>`;
  }

  state.tops = [];
  state.points = { radar: [] };
  const morph = state.morph;
  for (let si = 0; si < m.series.length; si++) {
    const s = m.series[si];
    // interpolatePolarPoint: the points grow out of the center on mount and
    // interpolate from the previous points on an update.
    const prev = morph && morph.prev && morph.prev.radar ? morph.prev.radar[si] : null;
    const factor = prev ? prev.length / s.values.length : 0;
    const pts = s.values.map((v, i) => {
      const target = polarToCartesian(cx, cy, (v / domainMax) * outerRadius, angles[i]);
      if (morph) {
        const p = prev && prev[Math.floor(i * factor)];
        if (p) return { x: interpolate(p.x, target.x, morph.t), y: interpolate(p.y, target.y, morph.t) };
        return { x: interpolate(cx, target.x, morph.t), y: interpolate(cy, target.y, morph.t) };
      }
      if (alpha < 1) {
        return { x: interpolate(cx, target.x, alpha), y: interpolate(cy, target.y, alpha) };
      }
      return target;
    });
    const d = pts.map((p, i) => (i ? "L" : "M") + fmtF(p.x) + "," + fmtF(p.y)).join("") + "Z";
    // filterProps only forwards the props that are set, so an unset fill
    // opacity leaves the SVG default of 1 in place.
    const fillOpacity = s.fillOpacityPtr != null ? ` fill-opacity="${fmtF(s.fillOpacityPtr)}"` : "";
    const stroke = s.stroke ? ` stroke="${s.stroke}"` : "";
    const strokeWidth = s.strokeWidth ? ` stroke-width="${fmtF(s.strokeWidth)}"` : "";
    svg +=
      `<g class="recharts-layer recharts-radar">` +
      `<g class="recharts-radar-polygon">` +
      `<path class="recharts-polygon" fill="${s.fill || s.color}"${fillOpacity}${stroke}${strokeWidth} d="${d}"/>`;
    // StaticPolygon renders the dots together with the polygon, so they
    // travel with it during the animation.
    if (s.dot) {
      svg += `<g class="recharts-radar-dots">`;
      for (const p of pts) {
        const dotOpacity = s.dot.fillOpacity ? ` fill-opacity="${fmtF(s.dot.fillOpacity)}"` : "";
        svg += `<circle class="recharts-dot recharts-radar-dot" r="${fmtF(s.dot.r || 3)}" fill="${s.dot.fill || s.fill || s.color}"${dotOpacity}${stroke} cx="${fmtF(p.x)}" cy="${fmtF(p.y)}"/>`;
      }
      svg += `</g>`;
    }
    svg += `</g></g>`;
    state.tops.push(pts.map((p) => p.y));
    state.points.radar.push(pts);
  }

  svg += "</svg>";
  swapSVG(panel, svg);
  state.geom = { W, H, cx, cy, outerRadius, angles, n };
}

/* tickSpec and ticks of d3-array: the angle axis of a radial chart has no
 * tick count of its own, so its grid angles are d3's default ten. */
function d3TickSpec(start, stop, count) {
  const e10 = Math.sqrt(50);
  const e5 = Math.sqrt(10);
  const e2 = Math.sqrt(2);
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log10(step));
  const error = step / Math.pow(10, power);
  const factor = error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1;
  let i1, i2, inc;
  if (power < 0) {
    inc = Math.pow(10, -power) / factor;
    i1 = Math.round(start * inc);
    i2 = Math.round(stop * inc);
    if (i1 / inc < start) ++i1;
    if (i2 / inc > stop) --i2;
    inc = -inc;
  } else {
    inc = Math.pow(10, power) * factor;
    i1 = Math.round(start / inc);
    i2 = Math.round(stop / inc);
    if (i1 * inc < start) ++i1;
    if (i2 * inc > stop) --i2;
  }
  if (i2 < i1 && 0.5 <= count && count < 2) return d3TickSpec(start, stop, count * 2);
  return [i1, i2, inc];
}

function d3Ticks(start, stop, count) {
  if (!(count > 0)) return [];
  if (start === stop) return [start];
  const reverse = stop < start;
  const [i1, i2, inc] = reverse ? d3TickSpec(stop, start, count) : d3TickSpec(start, stop, count);
  if (!(i2 >= i1)) return [];
  const n = i2 - i1 + 1;
  const out = new Array(n);
  if (reverse) {
    if (inc < 0) for (let i = 0; i < n; ++i) out[i] = (i2 - i) / -inc;
    else for (let i = 0; i < n; ++i) out[i] = (i2 - i) * inc;
  } else {
    if (inc < 0) for (let i = 0; i < n; ++i) out[i] = (i1 + i) / -inc;
    else for (let i = 0; i < n; ++i) out[i] = (i1 + i) * inc;
  }
  return out;
}

/* getBarPosition of Recharts for the chart defaults, a bar gap of 4 and a
 * bar category gap of 10% of the band. The size is truncated to whole
 * pixels, which is Recharts' own ">>= 0". */
function barPosition(bandSize, len) {
  let realBarGap = 4;
  const offset = 0.1 * bandSize;
  if (bandSize - 2 * offset - (len - 1) * realBarGap <= 0) realBarGap = 0;
  let originalSize = (bandSize - 2 * offset - (len - 1) * realBarGap) / len;
  if (originalSize > 1) originalSize = Math.trunc(originalSize);
  return { offset, size: originalSize, gap: realBarGap };
}

/* truncateByDomain of Recharts: a stacked range is clamped into the number
 * axis domain on both ends. */
function truncateByDomain(value, domainMin, domainMax) {
  const minValue = Math.min(domainMin, domainMax);
  const maxValue = Math.max(domainMin, domainMax);
  const result = [value[0], value[1]];
  if (value[0] < minValue) result[0] = minValue;
  if (value[1] > maxValue) result[1] = maxValue;
  if (result[0] > maxValue) result[0] = maxValue;
  if (result[1] < minValue) result[1] = minValue;
  return result;
}

/* getTangentCircle of Recharts' Sector: the circle a rounded corner runs
 * on, with the two points it is tangent to. */
function tangentCircle({ cx, cy, radius, angle, sign, isExternal, cornerRadius, cornerIsExternal }) {
  const RADIAN = Math.PI / 180;
  const centerRadius = cornerRadius * (isExternal ? 1 : -1) + radius;
  const theta = Math.asin(cornerRadius / centerRadius) / RADIAN;
  const centerAngle = cornerIsExternal ? angle : angle + sign * theta;
  const center = polarToCartesian(cx, cy, centerRadius, centerAngle);
  const circleTangency = polarToCartesian(cx, cy, radius, centerAngle);
  const lineTangencyAngle = cornerIsExternal ? angle - sign * theta : angle;
  const lineTangency = polarToCartesian(cx, cy, centerRadius * Math.cos(theta * RADIAN), lineTangencyAngle);
  return { center, circleTangency, lineTangency, theta };
}

/* getSectorWithCorner of Recharts' Sector. */
function sectorWithCornerPath(cx, cy, innerR, outerR, cornerRadius, startAngle, endAngle) {
  const sign = endAngle - startAngle < 0 ? -1 : endAngle - startAngle > 0 ? 1 : 0;
  const { circleTangency: soct, lineTangency: solt, theta: sot } = tangentCircle({ cx, cy, radius: outerR, angle: startAngle, sign, cornerRadius });
  const { circleTangency: eoct, lineTangency: eolt, theta: eot } = tangentCircle({ cx, cy, radius: outerR, angle: endAngle, sign: -sign, cornerRadius });
  const outerArcAngle = Math.abs(startAngle - endAngle) - sot - eot;
  if (outerArcAngle < 0) {
    return sectorPath(cx, cy, innerR, outerR, startAngle, endAngle);
  }
  let path =
    `M ${fmtF(solt.x)},${fmtF(solt.y)} A${fmtF(cornerRadius)},${fmtF(cornerRadius)},0,0,${sign < 0 ? 1 : 0},${fmtF(soct.x)},${fmtF(soct.y)}` +
    ` A${fmtF(outerR)},${fmtF(outerR)},0,${outerArcAngle > 180 ? 1 : 0},${sign < 0 ? 1 : 0},${fmtF(eoct.x)},${fmtF(eoct.y)}` +
    ` A${fmtF(cornerRadius)},${fmtF(cornerRadius)},0,0,${sign < 0 ? 1 : 0},${fmtF(eolt.x)},${fmtF(eolt.y)}`;
  if (innerR > 0) {
    const { circleTangency: sict, lineTangency: silt, theta: sit } = tangentCircle({ cx, cy, radius: innerR, angle: startAngle, sign, isExternal: true, cornerRadius });
    const { circleTangency: eict, lineTangency: eilt, theta: eit } = tangentCircle({ cx, cy, radius: innerR, angle: endAngle, sign: -sign, isExternal: true, cornerRadius });
    const innerArcAngle = Math.abs(startAngle - endAngle) - sit - eit;
    if (innerArcAngle < 0 && cornerRadius === 0) {
      return `${path}L${fmtF(cx)},${fmtF(cy)}Z`;
    }
    path +=
      `L${fmtF(eilt.x)},${fmtF(eilt.y)} A${fmtF(cornerRadius)},${fmtF(cornerRadius)},0,0,${sign < 0 ? 1 : 0},${fmtF(eict.x)},${fmtF(eict.y)}` +
      ` A${fmtF(innerR)},${fmtF(innerR)},0,${innerArcAngle > 180 ? 1 : 0},${sign > 0 ? 1 : 0},${fmtF(sict.x)},${fmtF(sict.y)}` +
      ` A${fmtF(cornerRadius)},${fmtF(cornerRadius)},0,0,${sign < 0 ? 1 : 0},${fmtF(silt.x)},${fmtF(silt.y)}Z`;
  } else {
    path += `L${fmtF(cx)},${fmtF(cy)}Z`;
  }
  return path;
}

/* Sector of Recharts: a corner radius bends the ends, and it is capped at
 * half the ring width. */
function sector(cx, cy, innerR, outerR, startAngle, endAngle, cornerRadius) {
  if (outerR < innerR || startAngle === endAngle) return "";
  const deltaRadius = outerR - innerR;
  const cr = cornerRadius || 0;
  if (cr > 0 && Math.abs(startAngle - endAngle) < 360) {
    return sectorWithCornerPath(cx, cy, innerR, outerR, Math.min(cr, deltaRadius / 2), startAngle, endAngle);
  }
  return sectorPath(cx, cy, innerR, outerR, startAngle, endAngle);
}

/* getSectorPath of Recharts' Sector. */
function sectorPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  // getDeltaAngle stops just short of a full turn, so a sector that goes
  // all the way around still has two distinct arc ends and paints.
  const sign = endAngle - startAngle < 0 ? -1 : 1;
  const angle = Math.min(Math.abs(endAngle - startAngle), 359.999) * sign;
  const tempEndAngle = startAngle + angle;
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, tempEndAngle);
  const large = Math.abs(angle) > 180 ? 1 : 0;
  let path =
    `M ${fmtF(outerStart.x)},${fmtF(outerStart.y)} A ${fmtF(outerR)},${fmtF(outerR)},0,${large},` +
    `${startAngle > tempEndAngle ? 1 : 0},${fmtF(outerEnd.x)},${fmtF(outerEnd.y)}`;
  if (innerR > 0) {
    const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
    const innerEnd = polarToCartesian(cx, cy, innerR, tempEndAngle);
    path +=
      `L ${fmtF(innerEnd.x)},${fmtF(innerEnd.y)} A ${fmtF(innerR)},${fmtF(innerR)},0,${large},` +
      `${startAngle <= tempEndAngle ? 1 : 0},${fmtF(innerStart.x)},${fmtF(innerStart.y)} Z`;
  } else {
    path += `L ${fmtF(cx)},${fmtF(cy)} Z`;
  }
  return path;
}

/* getTextAnchor of Pie's labels. */
function pieTextAnchor(x, cx) {
  if (x > cx) return "start";
  if (x < cx) return "end";
  return "middle";
}

const PIE_LABEL_OFFSET = 20;

function renderPie(panel, m, state, alpha = 1) {
  const W = panel.clientWidth;
  const H = panel.clientHeight;
  if (!W || !H) return;
  // The Pie defaults: centered in the offset box, 80% of its radius. The
  // legend adds to the bottom offset, so it shrinks the pie instead of
  // covering it.
  const margin = 5;
  const offsetW = Math.max(W - 2 * margin, 0);
  const offsetH = Math.max(H - 2 * margin - legendSize(panel, m), 0);
  const cx = margin + offsetW / 2;
  const cy = margin + offsetH / 2;
  const maxR = Math.min(offsetW, offsetH) / 2;

  let svg = `<svg class="recharts-surface" width="${fmtF(W)}" height="${fmtF(H)}" viewBox="0 0 ${fmtF(W)} ${fmtF(H)}">`;
  state.points = { sectors: [] };

  (m.pies || []).forEach((pie, pi) => {
    const outerR = pie.outerRadius || maxR * 0.8;
    const innerR = pie.innerRadius || 0;
    const total = pie.values.reduce((a, b) => a + b, 0);
    const stroke = pie.stroke === "0" ? "" : ` stroke="${pie.stroke || "#fff"}"`;
    const strokeWidth = pie.strokeWidth ? ` stroke-width="${fmtF(pie.strokeWidth)}"` : "";
    const sectors = [];
    // The Pie animation: every sector interpolates its own angle and they
    // chain. On mount it starts at zero, on an update it starts at the
    // previous sector's angle.
    const morph = state.morph;
    const prevSectors = morph && morph.prev && morph.prev.sectors ? morph.prev.sectors[pi] : null;
    let angle = 0;
    for (let i = 0; i < pie.values.length; i++) {
      const target = (pie.values[i] / total) * 360 * alpha;
      let sweep = target;
      if (prevSectors && prevSectors[i]) {
        sweep = interpolate(prevSectors[i].end - prevSectors[i].start, target, morph.t);
      }
      sectors.push({ start: angle, end: angle + sweep, mid: angle + sweep / 2 });
      angle += sweep;
    }

    svg += `<g class="recharts-layer recharts-pie">`;
    for (let i = 0; i < sectors.length; i++) {
      const sc = sectors[i];
      const fill = pie.colors[i];
      const active = pie.activeIndex != null && pie.activeIndex === i && pie.activeShape && pie.activeShape.length;
      const shapes = active
        ? pie.activeShape.map((sp) => ({ inner: sp.InnerRadius ? outerR + sp.InnerRadius : innerR, outer: outerR + (sp.OuterRadius || 0) }))
        : [{ inner: innerR, outer: outerR }];
      svg += `<g class="recharts-layer recharts-pie-sector">`;
      for (const sh of shapes) {
        svg += `<path class="recharts-sector"${stroke}${strokeWidth} fill="${fill}" data-templ-chart-pie="${pi}" data-templ-chart-sector="${i}" d="${sectorPath(cx, cy, sh.inner, sh.outer, sc.start, sc.end)}"/>`;
      }
      svg += `</g>`;
    }

    // PieLabels: the label sits offsetRadius past the sector, the line
    // runs from the sector edge to it.
    if (alpha >= 1 && pie.label) {
      svg += `<g class="recharts-layer recharts-pie-labels">`;
      for (let i = 0; i < sectors.length; i++) {
        const mid = sectors[i].mid;
        const endPoint = polarToCartesian(cx, cy, outerR + PIE_LABEL_OFFSET, mid);
        const fill = pie.label.fill || pie.colors[i];
        if (pie.labelLine) {
          const startPoint = polarToCartesian(cx, cy, outerR, mid);
          svg += `<path class="recharts-curve recharts-pie-label-line" stroke="${pie.colors[i]}" fill="none" d="M${fmtF(startPoint.x)},${fmtF(startPoint.y)}L${fmtF(endPoint.x)},${fmtF(endPoint.y)}"/>`;
        }
        svg += `<text class="recharts-text recharts-pie-label-text" x="${fmtF(endPoint.x)}" y="${fmtF(endPoint.y)}" fill="${fill}" text-anchor="${pieTextAnchor(endPoint.x, cx)}" alignment-baseline="middle">${fmtF(pie.values[i])}</text>`;
      }
      svg += `</g>`;
    }

    // A LabelList on a Pie is a polar label: it sits at the middle radius
    // of its sector.
    if (alpha >= 1 && pie.labelList) {
      const ll = pie.labelList;
      svg += `<g class="recharts-layer recharts-label-list">`;
      for (let i = 0; i < sectors.length; i++) {
        const r = (innerR + outerR) / 2;
        const pt = polarToCartesian(cx, cy, r, sectors[i].mid);
        svg += `<text class="recharts-text recharts-label ${ll.class || ""}" x="${fmtF(pt.x)}" y="${fmtF(pt.y)}" text-anchor="middle" font-size="${fmtF(ll.fontSize || 12)}"><tspan dy="0.355em">${ll.labels[i]}</tspan></text>`;
      }
      svg += `</g>`;
    }

    if (pie.center) {
      svg += centerLabelSVG(cx, cy, pie.center);
    }
    svg += "</g>";
    state.points.sectors.push(sectors);
  });

  svg += "</svg>";
  swapSVG(panel, svg);
  state.geom = { W, H };
}

/* renderRadialLabel of Recharts' Label: an insideStart label runs along an
 * arc through the middle of its own sector. */
function radialLabelSVG(id, text, ll, fill, cx, cy, sc) {
  const radius = (sc.inner + sc.outer) / 2;
  // getDeltaAngle, then the insideStart branch with the default offset of 5.
  const delta = (sc.end - sc.start < 0 ? -1 : 1) * Math.min(Math.abs(sc.end - sc.start), 360);
  const sign = delta >= 0 ? 1 : -1;
  const labelAngle = sc.start + sign * (ll.offset || 5);
  // clockWise is false on a radial bar's view box, and a positive sweep
  // flips it.
  const direction = delta <= 0 ? false : true;
  const startPoint = polarToCartesian(cx, cy, radius, labelAngle);
  const endPoint = polarToCartesian(cx, cy, radius, labelAngle + (direction ? 1 : -1) * 359);
  const path = `M${fmtF(startPoint.x)},${fmtF(startPoint.y)} A${fmtF(radius)},${fmtF(radius)},0,1,${direction ? 0 : 1}, ${fmtF(endPoint.x)},${fmtF(endPoint.y)}`;
  const fontSize = ll.fontSize ? ` font-size="${fmtF(ll.fontSize)}"` : "";
  return (
    `<text fill="${fill}"${fontSize} dominant-baseline="central" class="recharts-radial-bar-label${ll.class ? " " + ll.class : ""}">` +
    `<defs><path id="${id}" d="${path}"/></defs><textPath xlink:href="#${id}">${text}</textPath></text>`
  );
}

/* renderRadial draws a RadialBarChart: the radius axis is a band scale over
 * the rings, the angle axis a linear scale over the values. */
function renderRadial(panel, m, state, alpha = 1) {
  const W = panel.clientWidth;
  const H = panel.clientHeight;
  if (!W || !H) return;
  const legendHeight = legendSize(panel, m);
  const offsetW = Math.max(W - m.marginLeft - m.marginRight, 0);
  const offsetH = Math.max(H - m.marginTop - m.marginBottom - legendHeight, 0);
  const cx = m.marginLeft + offsetW / 2;
  const cy = m.marginTop + offsetH / 2;
  // getMaxRadius, then the RadialBarChart defaults: no inner radius and an
  // outer radius of 80%.
  const maxRadius = Math.min(offsetW, offsetH) / 2;
  const rad = m.radial || {};
  const innerRadius = rad.innerRadius || 0;
  const outerRadius = rad.outerRadius || maxRadius * 0.8;
  const startAngle = rad.startAngle || 0;
  const endAngle = rad.endAngle;
  const n = m.series.length ? m.series[0].values.length : 0;
  if (!n) return;

  // The angle axis is a number axis with the [0, 'auto'] default domain, so it
  // spans zero to the tallest stack, like getDomainOfStackGroups. Chaining the
  // totals in the same order as the ranges below keeps every range inside it.
  let domainMin = 0;
  let domainMax = 0;
  for (let i = 0; i < n; i++) {
    const stackTops = {};
    for (const s of m.series) {
      const v = s.values[i];
      let top = v;
      if (s.stackId) {
        top = (stackTops[s.stackId] || 0) + v;
        stackTops[s.stackId] = top;
      }
      if (top > domainMax) domainMax = top;
      if (top < domainMin) domainMin = top;
    }
  }
  const span = domainMax - domainMin || 1;
  const angleOf = (v) => startAngle + ((v - domainMin) / span) * (endAngle - startAngle);

  // The radius axis is a band scale, one band per row, and getBarPosition
  // places the bars inside it. Bars of one stack share their position.
  const bandSize = (outerRadius - innerRadius) / n;
  const groupKeys = [];
  const groupOf = m.series.map((s, si) => {
    const key = s.stackId ? "stack:" + s.stackId : "bar:" + si;
    let gi = groupKeys.indexOf(key);
    if (gi < 0) {
      gi = groupKeys.length;
      groupKeys.push(key);
    }
    return gi;
  });
  const pos = barPosition(bandSize, groupKeys.length);

  // A stack chains its ranges and truncateByDomain clamps each one into
  // the angle domain, so a stacked bar never runs past the chart's end
  // angle. An unstacked bar starts at the base value of the number axis,
  // zero.
  const totals = {};
  const ranges = m.series.map((s) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (s.stackId) {
        const key = s.stackId + "|" + i;
        const base = totals[key] || 0;
        out.push(truncateByDomain([base, base + v], domainMin, domainMax));
        totals[key] = base + v;
      } else {
        out.push([0, v]);
      }
    }
    return out;
  });

  let svg = `<svg class="recharts-surface" width="${fmtF(W)}" height="${fmtF(H)}" viewBox="0 0 ${fmtF(W)} ${fmtF(H)}">`;

  const polar = m.polar || {};
  if (polar.hasGrid) {
    // getTicksOfAxis for the grid: a band scale puts its ticks in the
    // middle of the band, the angle axis has no tick count of its own.
    const radii = polar.polarRadius && polar.polarRadius.length ? polar.polarRadius : Array.from({ length: n }, (_, i) => innerRadius + i * bandSize + bandSize / 2);
    const angles = d3Ticks(domainMin, domainMax, 10).map(angleOf);
    svg += polarGridSVG(polar, cx, cy, innerRadius, outerRadius, radii, angles);
  }

  const sectors = [];
  m.series.forEach((s, si) => {
    const barOffset = pos.offset + (pos.size + pos.gap) * groupOf[si];
    let background = "";
    let shapes = "";
    let labels = "";
    const bar = [];
    for (let i = 0; i < n; i++) {
      const inner = innerRadius + i * bandSize + barOffset;
      const outer = inner + pos.size;
      const from = angleOf(ranges[si][i][0]);
      const to = angleOf(ranges[si][i][1]);
      // The mount animation interpolates the end angle out of the start
      // angle, so a sector opens up.
      const end = alpha < 1 ? from + (to - from) * alpha : to;
      if (s.background) {
        background +=
          `<g class="recharts-layer recharts-shape">` +
          `<path class="recharts-sector recharts-radial-bar-background-sector" fill="#eee" d="${sector(cx, cy, inner, outer, startAngle, endAngle, s.cornerRadius)}"/>` +
          `</g>`;
      }
      // The entry's own fill wins over the bar's, like Recharts spreading
      // the data row over the sector props.
      const fill = (s.cells && s.cells[i]) || s.fill || s.color;
      shapes +=
        `<g class="recharts-layer recharts-shape">` +
        `<path class="recharts-sector recharts-radial-bar-sector" fill="${fill}" d="${sector(cx, cy, inner, outer, from, end, s.cornerRadius)}"/>` +
        `</g>`;
      bar.push({ inner, outer, start: from, end });
      // The label list only shows once the animation is done, Recharts'
      // showLabels={!isAnimating}.
      if (s.labelList && alpha >= 1) {
        labels += radialLabelSVG(`${state.uid}-${si}-${i}`, s.labelList.labels[i], s.labelList, fill, cx, cy, { inner, outer, start: from, end });
      }
    }
    sectors.push(bar);
    svg +=
      `<g class="recharts-layer recharts-area${s.class ? " " + s.class : ""}">` +
      (s.background ? `<g class="recharts-layer recharts-radial-bar-background">${background}</g>` : "") +
      `<g class="recharts-layer recharts-radial-bar-sectors">${shapes}${labels}</g>` +
      `</g>`;
  });

  if (rad.center) {
    svg += centerLabelSVG(cx, cy, rad.center);
  }

  svg += "</svg>";
  swapSVG(panel, svg);
  // The tooltip picks its row by the radius, so it needs the band centers.
  const tickCoords = Array.from({ length: n }, (_, i) => innerRadius + i * bandSize + bandSize / 2);
  state.geom = { W, H, cx, cy, innerRadius, outerRadius, startAngle, endAngle, tickCoords, sectors };
}

/* ---------------------------------------------------------------- */
/* Tooltip + cursor                                                 */
/* ---------------------------------------------------------------- */

function tooltipWrapper(container) {
  let wrapper = container.querySelector(":scope > .recharts-tooltip-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "recharts-tooltip-wrapper";
    wrapper.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;visibility:hidden;z-index:30;transition:transform 400ms ease";
    container.style.position = "relative";
    container.appendChild(wrapper);
  }
  return wrapper;
}

function indicatorHTML(indicator, color, nestLabel) {
  let cls = "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)";
  if (indicator === "line") cls += " w-1";
  else if (indicator === "dashed") cls += ` w-0 border-[1.5px] border-dashed bg-transparent${nestLabel ? " my-0.5" : ""}`;
  else cls += " h-2.5 w-2.5";
  return `<div class="${cls}" style="--color-bg:${color};--color-border:${color}"></div>`;
}

function tooltipHTML(m, i, pieIndex = 0) {
  const t = m.tooltip || {};
  // labelKey resolves the label through the config; a pie falls back to
  // the config label of its own data key, like getPayloadConfigFromPayload
  // reading item.dataKey.
  const pie = m.kind === "pie" ? m.pies[pieIndex] : null;
  const payloadCount = pie ? 1 : m.series.filter(s => !isGap(s, i) && !s.hidden).length;
  if (!payloadCount) return "";
  const label = pie ? pie.seriesLabel || t.label : t.label || (m.tooltipLabels && m.tooltipLabels[i]) || m.labels[i];
  // Like ChartTooltipContent: a single non-dot payload nests the label
  // inside the row, so the line indicator spans the full row height. A pie
  // always carries a single payload item.
  const nestLabel = (payloadCount === 1) && t.indicator && t.indicator !== "dot";
  const labelCls = `font-medium${t.labelClass ? " " + t.labelClass : ""}`;
  let html = `<div class="${TOOLTIP_CLASS}${t.width ? " " + t.width : ""}">`;
  if (!t.hideLabel && !nestLabel) {
    html += `<div class="${labelCls}">${label}</div>`;
  }
  html += `<div class="grid gap-1.5">`;
  if (pie) {
    const color = t.color || pie.colors[i];
    const rowCls =
      "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground" +
      (t.indicator !== "line" && t.indicator !== "dashed" ? " items-center" : "");
    const nested = nestLabel && !t.hideLabel ? `<div class="${labelCls}">${label}</div>` : "";
    html +=
      `<div class="${rowCls}">` +
      (t.hideIndicator ? "" : indicatorHTML(t.indicator, color, nestLabel)) +
      `<div class="flex flex-1 justify-between leading-none ${nestLabel ? "items-end" : "items-center"}">` +
      `<div class="grid gap-1.5">${nested}<span class="text-muted-foreground">${(pie.tooltipNames && pie.tooltipNames[i]) || pie.labels[i]}</span></div>` +
      `<span class="font-mono font-medium text-foreground tabular-nums">${pie.values[i].toLocaleString("en-US")}</span>` +
      `</div></div></div></div>`;
    return html;
  }
  m.series.forEach((s, si) => {
    if (isGap(s, i) || s.hidden) return;
    const rowCls =
      "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground" +
      (t.indicator !== "line" && t.indicator !== "dashed" ? " items-center" : "");
    // The formatter markup replaces the row's default indicator, name and
    // value, like ChartTooltipContent calling the formatter render prop.
    if (t.rows && t.rows[si]) {
      html += `<div class="${rowCls}">${t.rows[si][i]}</div>`;
      return;
    }
    const nested = nestLabel && !t.hideLabel ? `<div class="${labelCls}">${label}</div>` : "";
    // ChartTooltipContent's indicatorColor: the color prop wins, then the
    // row's own fill, then the series color, so per row colored bars keep
    // their swatch.
    const indicatorColor = t.color || (s.cells && s.cells[i]) || s.color;
    // getPayloadConfigFromPayload: a name key that the rows answer names
    // every row on its own, otherwise the series carries the name.
    const name = (s.tooltipNames && s.tooltipNames[i]) || s.label;
    html +=
      `<div class="${rowCls}">` +
      (s.icon || (t.hideIndicator ? "" : indicatorHTML(t.indicator, indicatorColor, nestLabel))) +
      `<div class="flex flex-1 justify-between leading-none ${nestLabel ? "items-end" : "items-center"}">` +
      `<div class="grid gap-1.5">${nested}<span class="text-muted-foreground">${name}</span></div>` +
      `<span class="font-mono font-medium text-foreground tabular-nums">${s.values[i].toLocaleString("en-US")}</span>` +
      `</div></div>`;
  });
  html += "</div></div>";
  return html;
}

function showCursor(panel, m, state, i) {
  const svg = panel.querySelector("svg.recharts-surface");
  if (!svg || m.cursor === false) return;
  let cursor = svg.querySelector(".recharts-tooltip-cursor");
  const g = state.geom;
  // Recharts draws the cursor between the grid and the series, so bars
  // and areas render on top of the hover band.
  const seriesLayer = svg.querySelector(".recharts-bar, .recharts-area, .recharts-line, .recharts-radar");
  if (m.kind === "radial") {
    // getRadialCursorPoints: the cursor is a sector of zero width, an arc
    // at the radius the pointer sits on.
    const d = sector(g.cx, g.cy, state.cursorRadius, state.cursorRadius, g.startAngle, g.endAngle, 0);
    if (!cursor) {
      seriesLayer.insertAdjacentHTML("beforebegin", `<g class="recharts-layer"><path class="recharts-sector recharts-tooltip-cursor" stroke="#ccc" fill="none" d="${d}"/></g>`);
    } else {
      cursor.setAttribute("d", d);
    }
    return;
  }
  if (m.kind === "radar") {
    const end = polarToCartesian(g.cx, g.cy, g.outerRadius, g.angles[i]);
    const d = `M${fmtF(g.cx)},${fmtF(g.cy)}L${fmtF(end.x)},${fmtF(end.y)}`;
    if (!cursor) {
      seriesLayer.insertAdjacentHTML("beforebegin", `<g class="recharts-layer"><path class="recharts-curve recharts-tooltip-cursor" stroke="#ccc" fill="none" d="${d}"/></g>`);
    } else {
      cursor.setAttribute("d", d);
    }
    return;
  }
  if (m.kind === "bar") {
    const d = g.vertical
      ? `M ${fmtF(g.plotX)},${fmtF(g.plotY + i * g.band)} h ${fmtF(g.plotW)} v ${fmtF(g.band)} h ${fmtF(-g.plotW)} Z`
      : `M ${fmtF(g.plotX + i * g.band)},${fmtF(g.plotY)} h ${fmtF(g.band)} v ${fmtF(g.plotH)} h ${fmtF(-g.band)} Z`;
    if (!cursor) {
      seriesLayer.insertAdjacentHTML(
        "beforebegin",
        `<g class="recharts-layer"><path class="recharts-rectangle recharts-tooltip-cursor" fill="#ccc" d="${d}"/></g>`
      );
    } else {
      cursor.setAttribute("d", d);
    }
  } else {
    const x = g.xs[i];
    const d = `M${fmtF(x)},${fmtF(g.plotY)}L${fmtF(x)},${fmtF(g.plotBottom)}`;
    if (!cursor) {
      seriesLayer.insertAdjacentHTML(
        "beforebegin",
        `<g class="recharts-layer"><path class="recharts-curve recharts-tooltip-cursor" stroke="#ccc" fill="none" stroke-width="1" d="${d}"/></g>`
      );
    } else {
      cursor.setAttribute("d", d);
    }
  }
}

function hideCursor(panel) {
  const cursor = panel.querySelector(".recharts-tooltip-cursor");
  if (cursor) cursor.parentElement.remove();
  hideActiveDots(panel);
}

// showActiveDots is Recharts' Area/Line activeDot: a dot per series on the
// active data point while the tooltip is up.
function showActiveDots(panel, m, state, i) {
  const svg = panel.querySelector("svg.recharts-surface");
  if (!svg || (m.kind !== "area" && m.kind !== "line" && m.kind !== "radar") || !state.tops) return;
  let layer = svg.querySelector(".recharts-active-dots");
  if (!layer) {
    svg.insertAdjacentHTML("beforeend", `<g class="recharts-layer recharts-active-dots"></g>`);
    layer = svg.querySelector(".recharts-active-dots");
  }
  let html = "";
  for (let s = 0; s < m.series.length; s++) {
    // renderActivePoint's defaults: r 4, white stroke of 2, filled with the
    // item's main color. getLegendItemColor prefers the stroke over the fill.
    const series = m.series[s];
    if (isGap(series, i) || series.hidden) continue;
    const r = series.activeDotR || 4;
    const mainColor = series.stroke && series.stroke !== "none" ? series.stroke : series.fill || series.color || "none";
    // A radar point carries its own x, the cartesian charts share the
    // category positions.
    const point = m.kind === "radar" ? state.points.radar[s][i] : { x: state.geom.xs[i], y: state.tops[s][i] };
    html += `<circle class="recharts-dot" r="${fmtF(r)}" stroke="#fff" stroke-width="2" fill="${mainColor}" cx="${fmtF(point.x)}" cy="${fmtF(point.y)}"/>`;
  }
  layer.innerHTML = html;
}

function hideActiveDots(panel) {
  const layer = panel.querySelector(".recharts-active-dots");
  if (layer) layer.remove();
}

/* ---------------------------------------------------------------- */
/* Wiring                                                           */
/* ---------------------------------------------------------------- */

const OFFSET = 10;

/* getTooltipTranslateXY: the tooltip sits after the coordinate, and flips
 * before it once it would leave the view box, clamped to the view box. */
function tooltipTranslate(coordinate, tooltipDimension, viewBoxKey, viewBoxDimension) {
  const negative = coordinate - tooltipDimension - (OFFSET > 0 ? OFFSET : 0);
  const positive = coordinate + OFFSET;
  const tooltipBoundary = positive + tooltipDimension;
  const viewBoxBoundary = viewBoxKey + viewBoxDimension;
  if (tooltipBoundary > viewBoxBoundary) {
    return Math.max(negative, viewBoxKey);
  }
  return Math.max(positive, viewBoxKey);
}

function initPanel(script) {
  if (script._templInit) return;
  script._templInit = true;

  const panel = script.parentElement;
  const container = panel.closest('[data-slot="chart"]');
  const m = JSON.parse(script.textContent);
  const state = { uid: "templ-chart-" + uid++ };

  const render = (alpha = 1) => {
    if (m.kind === "pie") renderPie(panel, m, state, alpha);
    else if (m.kind === "radar") renderRadar(panel, m, state, alpha);
    else if (m.kind === "radial") renderRadial(panel, m, state, alpha);
    else renderCartesian(panel, m, state, alpha);
    // The points this panel drew are what the next visible panel morphs
    // from, Recharts' previousPointsRef.
    if (state.points) container._templActivePoints = state.points;
    // Recharts renders the cursor and the active dots from the tooltip
    // state on every pass, so a hover keeps its overlays through the
    // entrance animation even though each frame rebuilds the surface.
    if (state.activeIndex != null) {
      showCursor(panel, m, state, state.activeIndex);
      showActiveDots(panel, m, state, state.activeIndex);
    }
    // The default tooltip waits for the first real layout of a panel that
    // mounted hidden.
    if (state.onFirstRender && state.geom) {
      const f = state.onFirstRender;
      state.onFirstRender = null;
      f();
    }
  };

  // On mount the entrance animation plays. When a hidden panel becomes
  // visible (range/series/month switches) Recharts morphs from the old
  // to the new values instead, so we interpolate from the previously
  // visible panel's model when the shapes line up. Plain resizes
  // re-render without animating.
  const enter = () => {
    const prev = container._templActive;
    const prevPoints = container._templActivePoints;
    container._templActive = m;
    const sameShape =
      m.kind === "pie"
        ? prev && prev.pies && m.pies && prev.pies.length === m.pies.length
        : prev && prev.series && m.series && prev.series.length === m.series.length;
    if (prev && prev !== m && prevPoints && prev.kind === m.kind && sameShape) {
      morphChart(panel, m, state, render, prevPoints);
    } else {
      animateChart(panel, m, state, render);
    }
  };
  if (panel.clientWidth) {
    state.mounted = true;
    enter();
  }
  const ro = new ResizeObserver(() => {
    const w = panel.clientWidth;
    if (!w) {
      state.mounted = false;
      return;
    }
    if (!state.mounted) {
      state.mounted = true;
      enter();
    } else if (!state.geom || w !== state.geom.W) {
      // Real container resizes re-render statically. state.geom.W is
      // updated on every animation frame, so a late observer callback
      // never stomps into a running animation.
      render(1);
    }
  });
  ro.observe(panel);

  // Without a declared Tooltip child Recharts renders no tooltip, no
  // active dots and no cursor, so none of the hover wiring applies.
  if (!m.hasTooltip) return;

  const wrapper = tooltipWrapper(container);

  // TooltipBoundingBox: Escape dismisses the tooltip box at its current
  // coordinate; the cursor and the active dots stay up, and the box comes
  // back as soon as the coordinate changes.
  state.dismissed = false;
  state.dismissedAt = { x: 0, y: 0 };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    state.dismissed = true;
    state.dismissedAt = state.tooltipCoord || { x: 0, y: 0 };
    wrapper.style.visibility = "hidden";
  });

  // Like Recharts' inRange: the tooltip only activates while the pointer
  // is inside the plot rectangle, not over the axis labels below.
  const activeIndexAt = (chartX, chartY) => {
    const g = state.geom;
    if (!g) return -1;
    if (m.kind === "radar") {
      // inRangeOfSector: only inside the outer radius, then the angle
      // decides which tick is active.
      const p = angleOfPoint(chartX, chartY, g.cx, g.cy);
      if (p.radius > g.outerRadius) return -1;
      // The angles run from 90 downwards, the point angle from 0 to 360.
      const angle = p.angle > 90 ? p.angle - 360 : p.angle;
      return activeAngleIndex(angle, g.angles);
    }
    if (m.kind === "radial") {
      // inRangeOfSector, then calculateTooltipPos: in a radial layout the
      // radius picks the row.
      const p = angleOfPoint(chartX, chartY, g.cx, g.cy);
      if (p.radius < g.innerRadius || p.radius > g.outerRadius || p.radius === 0) return -1;
      if (!inAngleRangeOfSector(p.angle, g.startAngle, g.endAngle)) return -1;
      state.cursorRadius = p.radius;
      return activeTickIndex(p.radius, g.tickCoords);
    }
    if (chartX < g.plotX || chartX > g.plotX + g.plotW) return -1;
    if (chartY < g.plotY || chartY > g.plotBottom) return -1;
    if (m.kind === "bar") {
      // The category runs down the y axis in a vertical layout.
      const along = g.vertical ? chartY - g.plotY : chartX - g.plotX;
      return Math.max(0, Math.min(g.n - 1, Math.floor(along / g.band)));
    }
    const step = g.plotW / (g.n - 1);
    return Math.max(0, Math.min(g.n - 1, Math.round((chartX - g.plotX) / step)));
  };

  // parseEventsOfWrapper: the tooltip listens to mouse events, and an axis
  // tooltip additionally to touchmove, whose handleTouchMove feeds the
  // changed touch into the mouse handler. A touch tap shows the tooltip
  // through the browser's compatibility mousemove and it stays until a tap
  // elsewhere fires mouseleave; a finger dragged across the plot keeps
  // scrubbing through touchmove even while the page scrolls. An item
  // tooltip (pie) attaches no wrapper touch events.
  const handleMouseMove = (e) => {
    if (m.kind === "pie") {
      const sector = e.target.closest(".recharts-sector");
      const idx = sector ? parseInt(sector.getAttribute("data-templ-chart-sector") || "-1", 10) : -1;
      if (idx < 0) {
        wrapper.style.visibility = "hidden";
        return;
      }
      positionTooltip(e, null, null, idx, parseInt(sector.getAttribute("data-templ-chart-pie") || "0", 10));
      return;
    }
    const rect = panel.getBoundingClientRect();
    const chartX = e.clientX - rect.left;
    const chartY = e.clientY - rect.top;
    const i = activeIndexAt(chartX, chartY);
    state.hoverActive = i >= 0;
    if (i < 0) {
      resolveTooltip();
      return;
    }
    state.activeIndex = i;
    showCursor(panel, m, state, i);
    showActiveDots(panel, m, state, i);
    // getActiveCoordinate: the category axis snaps to its tick and the
    // other one follows the pointer, so a vertical layout snaps y.
    const g = state.geom;
    if (m.kind === "radar" || m.kind === "radial") {
      positionTooltip(e, null, null, i);
      return;
    }
    const snap = g ? g.cats[i] : null;
    positionTooltip(e, g && g.vertical ? null : snap, g && g.vertical ? snap : null, i);
  };
  panel.addEventListener("mousemove", handleMouseMove);
  if (m.kind !== "pie") {
    panel.addEventListener("touchmove", (e) => {
      if (e.changedTouches != null && e.changedTouches.length > 0) {
        handleMouseMove(e.changedTouches[0]);
      }
    });
  }

  function positionTooltip(e, snapX, snapY, i, pieIndex = 0) {
    const wasHidden = wrapper.style.visibility !== "visible";
    wrapper.innerHTML = tooltipHTML(m, i, pieIndex);
    wrapper.style.visibility = wrapper.innerHTML ? "visible" : "hidden";
    const crect = container.getBoundingClientRect();
    const tw = wrapper.offsetWidth;
    const th = wrapper.offsetHeight;
    const prect = panel.getBoundingClientRect();
    const px = snapX != null ? snapX + (prect.left - crect.left) : e.clientX - crect.left;
    const py = snapY != null ? snapY + (prect.top - crect.top) : e.clientY - crect.top;
    // A dismissed tooltip stays hidden until its coordinate changes.
    if (state.dismissed) {
      if (px === state.dismissedAt.x && py === state.dismissedAt.y) {
        wrapper.style.visibility = "hidden";
      } else {
        state.dismissed = false;
      }
    }
    state.tooltipCoord = { x: px, y: py };
    const tx = tooltipTranslate(px, tw, 0, crect.width);
    const ty = tooltipTranslate(py, th, 0, crect.height);
    if (wasHidden) {
      // Appear in place like Recharts, the transition only trails while
      // the tooltip is already visible.
      wrapper.style.transition = "none";
      wrapper.style.transform = `translate(${tx}px, ${ty}px)`;
      void wrapper.offsetHeight;
      wrapper.style.transition = "transform 400ms ease";
      return;
    }
    wrapper.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  panel.addEventListener("mouseleave", () => {
    state.hoverActive = false;
    resolveTooltip();
  });

  // displayDefaultTooltip: a Tooltip with a defaultIndex shows once on
  // mount, at the category's tick coordinate and halfway between the plot
  // top and the chart height, Recharts' (offset.top + height) / 2.
  const di = m.tooltip && m.tooltip.defaultIndex;
  if (typeof di === "number") {
    const show = () => {
      const g = state.geom;
      if (!g || !g.cats || di < 0 || di > g.cats.length - 1) return;
      const dep = (g.plotY + g.H) / 2;
      state.activeIndex = di;
      showCursor(panel, m, state, di);
      showActiveDots(panel, m, state, di);
      positionTooltip(null, g.vertical ? dep : g.cats[di], g.vertical ? g.cats[di] : dep, di);
    };
    if (state.geom) show();
    else state.onFirstRender = show;
  }

  // The keyboard interaction of Recharts' keyboardEventsMiddleware: the
  // first focus activates index 0, the arrow keys walk the categories and
  // stop at the ends, Enter toggles the interaction at the current index
  // and blur deactivates it but keeps the index.
  state.keyboard = { active: false, index: null };

  // spoofKeyboard shows the keyboard tooltip like Recharts spoofs a mouse
  // move: at the tick coordinate and offset.top plus half the height, and
  // only in the horizontal layout.
  const spoofKeyboard = () => {
    const g = state.geom;
    if (!g || !g.cats || g.vertical) return;
    const i = Math.min(Math.max(state.keyboard.index, 0), g.cats.length - 1);
    const rect = panel.getBoundingClientRect();
    const e = { clientX: rect.left + g.cats[i], clientY: rect.top + g.plotY + g.H / 2 };
    state.activeIndex = i;
    showCursor(panel, m, state, i);
    showActiveDots(panel, m, state, i);
    positionTooltip(e, g.cats[i], null, i);
  };

  // combineTooltipInteractionState: an active hover always wins, then the
  // active keyboard interaction, otherwise the tooltip hides. This is why
  // a touch tap stays where the finger is even though the tap also
  // focuses the surface.
  function resolveTooltip() {
    if (state.hoverActive) return;
    if (state.keyboard.active) {
      spoofKeyboard();
      return;
    }
    state.activeIndex = null;
    wrapper.style.visibility = "hidden";
    hideCursor(panel);
  }

  if (m.accessibilityLayer !== false) {
    // focusAction: only the first focus activates the keyboard
    // interaction, at index 0; a refocus after blur keeps the tooltip
    // hidden until the arrow keys move it again.
    panel.addEventListener("focusin", () => {
      if (state.keyboard.active) return;
      if (state.keyboard.index == null) {
        state.keyboard = { active: true, index: 0 };
        resolveTooltip();
      }
    });
    // blurAction deactivates the interaction but keeps the index.
    panel.addEventListener("focusout", () => {
      if (state.keyboard.active) {
        state.keyboard.active = false;
        resolveTooltip();
      }
    });
    panel.addEventListener("keydown", (e) => {
      const g = state.geom;
      if (!g || !g.cats || g.vertical) return;
      if (e.key === "Enter") {
        if (state.keyboard.index == null) return;
        state.keyboard.active = !state.keyboard.active;
        resolveTooltip();
        return;
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const movement = e.key === "ArrowRight" ? 1 : -1;
      const next = state.keyboard.index == null ? (movement > 0 ? 0 : g.cats.length - 1) : state.keyboard.index + movement;
      if (next < 0 || next > g.cats.length - 1) return;
      state.keyboard = { active: true, index: next };
      resolveTooltip();
    });
  }
}

function init() {
  document.querySelectorAll("script[data-templ-chart-model]").forEach(initPanel);
}

/* Interactive demo wiring: selects and header buttons toggle the SSR
 * rendered variants of a chart. */
document.addEventListener("select-change", (e) => {
  const trigger = e.target instanceof Element && e.target.closest("[data-templ-chart-range-select], [data-templ-chart-month-select]");
  if (!trigger) return;
  const value = e.detail && e.detail.value;
  if (!value) return;
  const chart = trigger.closest("[data-slot=card]");
  if (!chart) return;
  const attr = trigger.hasAttribute("data-templ-chart-range-select") ? "data-templ-chart-range" : "data-templ-chart-month";
  chart.querySelectorAll(`[${attr}]`).forEach((el) => {
    el.hidden = el.getAttribute(attr) !== value;
  });
});

document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element)) return;
  const btn = e.target.closest("[data-templ-chart-series]");
  if (!btn) return;
  const chart = btn.closest("[data-slot=card]");
  if (!chart) return;
  const series = btn.getAttribute("data-templ-chart-series");
  chart.querySelectorAll("[data-templ-chart-series]").forEach((b) => {
    b.setAttribute("data-active", b === btn ? "true" : "false");
  });
  chart.querySelectorAll("[data-templ-chart-series-panel]").forEach((el) => {
    el.hidden = el.getAttribute("data-templ-chart-series-panel") !== series;
  });
});

// Setup on load and on mutations, the shadcn-templ convention: init is
// idempotent (every panel carries its own init flag), so any inserted
// node just re-runs the full scan, no matter what put it into the DOM.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
// Re-init on any childList mutation, directly (never rAF-deferred: rAF
// does not fire in hidden tabs or throttled iframes): swapped-in markup
// wires itself.
new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
