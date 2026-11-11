import type { BodyPhotoProfile, BodyProfileRow, CalculatedBodyDimensions } from '../types/body';
import type { HorizontalSpan, PhotoPairObservation, PhotoViewObservation, Point } from './photoObservation';

const width = (span: HorizontalSpan) => span.right - span.left;
const center = (span: HorizontalSpan) => (span.left + span.right) / 2;
const between = (a: number, b: number, t: number) => a + (b - a) * t;
const limit = (value: number) => Math.max(0, Math.min(1, value));

function rowAt(view: PhotoViewObservation, y: number) {
  const rows = view.maskRows;
  if (!rows?.length) return [];
  const step = (rows[rows.length - 1].y - rows[0].y) / Math.max(1, rows.length - 1);
  const index = step ? Math.round((y - rows[0].y) / step) : 0;
  return rows[index]?.spans ?? [];
}

function axisAt(points: Point[], y: number) {
  const next = points.findIndex(point => point.y >= y);
  if (next < 0) return points[points.length - 1].x;
  if (next === 0) return points[0].x;
  const a = points[next - 1], b = points[next];
  return between(a.x, b.x, limit((y - a.y) / Math.max(b.y - a.y, 1)));
}

function axisVisibility(view: PhotoViewObservation, points: Point[], indices: number[], y: number) {
  const next = points.findIndex(point => point.y >= y);
  const last = next < 0 ? points.length - 1 : Math.max(next, 1);
  return Math.min(...indices.slice(last - 1, last + 1).map(index => {
    const landmark = view.landmarks[index];
    return Math.min(landmark.visibility ?? 0, landmark.presence ?? 1);
  }));
}

function matchingRun(spans: HorizontalSpan[], x: number, tolerance: number) {
  return spans.find(span => span.left <= x && span.right >= x)
    ?? spans.filter(span => Math.min(Math.abs(span.left - x), Math.abs(span.right - x)) <= tolerance)
      .sort((a, b) => Math.abs(center(a) - x) - Math.abs(center(b) - x))[0];
}

function nearbyMedian(y: number, dy: number, read: (sampleY: number) => HorizontalSpan | undefined) {
  const spans = [read(y - dy), read(y), read(y + dy)].filter((span): span is HorizontalSpan => !!span);
  return spans.sort((a, b) => width(a) - width(b))[Math.floor(spans.length / 2)];
}

function imageAxes(view: PhotoViewObservation) {
  const pose = (index: number) => ({ x: view.landmarks[index].x * view.width, y: view.landmarks[index].y * view.height });
  const arms = [[11, 13, 15], [12, 14, 16]].map((points, index) =>
    points.map((point, j) => j === 0 ? view.shoulderSurface[index] : pose(point)));
  const armAndHand = arms.map((points, index) => {
    const pinky = pose(17 + index), finger = pose(19 + index);
    const hand = { x: (pinky.x + finger.x) / 2, y: Math.max(pinky.y, finger.y) };
    return hand.y > points[2].y ? [...points, hand] : points;
  });
  const legs = [[23, 25, 27], [24, 26, 28]].map(points => points.map(pose));
  const byImageX = (a: Point[], b: Point[]) => a[0].x - b[0].x;
  return { arms, armAndHand, legs, frontArms: [...arms].sort(byImageX), frontLegs: [...legs].sort(byImageX) };
}

function armAtRow(points: Point[], y: number, bodyHeight: number) {
  const fingerMargin = (points.length === 4 ? 0.046 : 0.078) * bodyHeight;
  return y <= points[points.length - 1].y + fingerMargin ? axisAt(points, y) : undefined;
}

function sectionAxis(view: PhotoViewObservation, kind: 'torso' | 'neck' | 'head', y: number) {
  if (kind === 'head') return axisAt([view.headTop, {x:center(view.head), y:view.head.y}, view.chin], y);
  if (kind === 'neck') return center(view.neck);
  return axisAt([view.shoulder, { x: center(view.hip), y: view.hip.y }, view.crotch], y);
}

const fractions = (count: number, extra: number[] = []) => [...new Set([
  ...Array.from({ length: count + 1 }, (_, i) => i / count), ...extra,
])].sort((a, b) => a - b);

export function buildPhotoShape(
  { front, side }: PhotoPairObservation,
  dimensions: CalculatedBodyDimensions,
): BodyPhotoProfile | undefined {
  if (!front.maskRows?.length || !side.maskRows?.length) return;
  const frontHeight = front.bounds.bottom - front.bounds.top;
  const sideHeight = side.bounds.bottom - side.bounds.top;
  const frontScale = dimensions.height.value / frontHeight;
  const sideScale = dimensions.height.value / sideHeight;
  const frontOrigin = center(front.hip), sideOrigin = center(side.hip);
  const fAxes = imageAxes(front), sAxes = imageAxes(side);
  const sideY = (y: number) => side.bounds.top + (y - front.bounds.top) / frontHeight * sideHeight;
  const frontDy = frontHeight * 0.0015, sideDy = sideHeight * 0.0015;
  const section = (t: number, f: HorizontalSpan, s?: HorizontalSpan): BodyProfileRow => ({
    t, widthCm: width(f) * frontScale, centerXCm: (center(f) - frontOrigin) * frontScale,
    ...(s ? { depthCm: width(s) * sideScale, centerZCm: (center(s) - sideOrigin) * sideScale * side.facing } : {}),
  });

  function bodySection(kind: 'torso' | 'neck' | 'head', view: PhotoViewObservation, y: number, t: number) {
    const bodyHeight = view.bounds.bottom - view.bounds.top;
    const spans = rowAt(view, y);
    const span = matchingRun(spans, sectionAxis(view, kind, y), bodyHeight * 0.025);
    if (!span) return;
    // The base of the neck shares rows with the shoulder. Those wide rows
    // describe the shoulder profile rather than an independent neck section.
    if (kind === 'neck' && width(span) > width(view.neck) * 1.85) return;
    if (kind === 'torso' && view === front && t < 0.91) {
      const includesArm = fAxes.armAndHand.some(points => {
        const x = armAtRow(points, y, bodyHeight);
        return x !== undefined && x > span.left && x < span.right && Math.abs(x - sectionAxis(view, kind, y)) > bodyHeight * 0.075;
      });
      if (includesArm) return;
    }
    return span;
  }

  function centralProfile(kind: 'torso' | 'neck' | 'head', start: number, end: number, steps: number, extra?: number[]) {
    const rows: BodyProfileRow[] = [];
    for (const t of fractions(steps, extra)) {
      const y = between(start, end, t);
      const frontY = kind === 'torso' && t === 0 ? y - frontDy * 2 : y;
      const f = nearbyMedian(frontY, frontDy, sampleY => bodySection(kind, front, sampleY, t));
      if (!f) continue;
      const s = nearbyMedian(sideY(frontY), sideDy, sampleY => bodySection(kind, side, sampleY, t));
      rows.push(section(t, f, s));
    }
    return rows;
  }

  const torso = centralProfile('torso', front.crotch.y, front.shoulder.y, 44, [0.17, 0.38, 0.75]);
  const neck = centralProfile('neck', front.shoulder.y, front.chin.y, 14);
  const head = centralProfile('head', front.chin.y, front.headTop.y, 23);

  const torsoAnchors = ([
    [0.17, 'hipCircumference', 'hipWidth', 'hipDepth', front.hip, side.hip],
    [0.38, 'waistCircumference', 'waistWidth', 'waistDepth', front.waist, side.waist],
    [0.75, 'chestCircumference', 'chestWidth', 'chestDepth', front.chest, side.chest],
  ] as const).filter(([, key]) => dimensions[key].source === 'manual').map(([t, , widthKey, depthKey, f, s]) => {
    const raw = torso.find(row => row.t === t) ?? section(t, f, s);
    const targetWidth = dimensions[widthKey].value, targetDepth = dimensions[depthKey].value;
    return { t, raw, targetWidth, targetDepth,
      widthFactor: targetWidth / raw.widthCm, depthFactor: targetDepth / (raw.depthCm ?? width(s) * sideScale) };
  });
  for (const row of torso) {
    const anchor = torsoAnchors.find(anchor => anchor.t === row.t);
    if (anchor) {
      row.widthCm = anchor.targetWidth;
      row.depthCm = anchor.targetDepth;
      continue;
    }
    // Apply the exact user-entered cross-section locally, preserving measured
    // changes in the outline between the anchored section heights.
    const influence = torsoAnchors.map(anchor => Math.max(0, 1 - Math.abs(row.t - anchor.t) / 0.16));
    const widthFactor = 1 + torsoAnchors.reduce((sum, anchor, i) => sum + (anchor.widthFactor - 1) * influence[i], 0);
    const depthFactor = 1 + torsoAnchors.reduce((sum, anchor, i) => sum + (anchor.depthFactor - 1) * influence[i], 0);
    row.widthCm *= widthFactor;
    if (row.depthCm !== undefined) row.depthCm *= depthFactor;
  }
  for (const anchor of torsoAnchors) {
    if (!torso.some(row => row.t === anchor.t)) torso.push({ ...anchor.raw, widthCm: anchor.targetWidth, depthCm: anchor.targetDepth });
  }
  torso.sort((a, b) => a.t - b.t);

  function limbRun(view: PhotoViewObservation, kind: 'arm' | 'leg', points: Point[], other: Point[], y: number) {
    const bodyHeight = view.bounds.bottom - view.bounds.top;
    const x = axisAt(points, y), otherX = axisAt(other, y);
    const spans = rowAt(view, y);
    const run = matchingRun(spans, x, bodyHeight * 0.009);
    const opposite = matchingRun(spans, otherX, 0);
    if (!run || opposite === run || view === side && !opposite) return;
    if (kind === 'arm' && matchingRun(spans, sectionAxis(view, 'torso', y), 0) === run) return;
    if (kind === 'leg' && (view === front ? fAxes : sAxes).armAndHand.some(arm => {
      const x = armAtRow(arm, y, bodyHeight);
      return x !== undefined && matchingRun(spans, x, bodyHeight * 0.014) === run;
    })) return;
    const maxWidth = bodyHeight * (kind === 'arm' ? 0.105 : 0.17);
    return width(run) <= maxWidth ? run : undefined;
  }

  function limbProfiles(kind: 'arm' | 'leg'): [BodyProfileRow[], BodyProfileRow[]] {
    const fLimbs = kind === 'arm' ? fAxes.frontArms : fAxes.frontLegs;
    const sideLimbs = kind === 'arm' ? sAxes.arms : sAxes.legs;
    const anatomicalFront = kind === 'arm' ? fAxes.arms : fAxes.legs;
    const sideIndices = kind === 'arm' ? [[11, 13, 15], [12, 14, 16]] : [[23, 25, 27], [24, 26, 28]];
    return [0, 1].map(index => {
      const points = fLimbs[index], opposite = fLimbs[1 - index];
      const poseIndex = anatomicalFront.indexOf(points);
      const sPoints = sideLimbs[poseIndex], sOpposite = sideLimbs[1 - poseIndex];
      const start = kind === 'arm' ? points[2].y : front.ankleY;
      const end = kind === 'arm' ? points[0].y : front.crotch.y;
      const profile: BodyProfileRow[] = [];
      for (const t of fractions(38)) {
        const y = between(start, end, t);
        const f = nearbyMedian(y, frontDy, sampleY => limbRun(front, kind, points, opposite, sampleY));
        if (!f) continue;
        // Both side-view limbs must have separately identifiable runs. A shared
        // run cannot provide separate widths or centerlines for either limb.
        const projectedY = sideY(y);
        const s = nearbyMedian(projectedY, sideDy, sampleY => limbRun(side, kind, sPoints, sOpposite, sampleY));
        const row = section(t, f, s);
        if (!s) {
          const own = axisVisibility(side, sPoints, sideIndices[poseIndex], projectedY);
          const other = axisVisibility(side, sOpposite, sideIndices[1 - poseIndex], projectedY);
          const reliable = own >= 0.55 && own >= other * 0.72 ? sPoints : other >= 0.55 ? sOpposite : undefined;
          if (reliable && projectedY >= reliable[0].y - sideHeight * 0.035 && projectedY <= reliable[2].y + sideHeight * 0.035) {
            const x = axisAt(reliable, projectedY);
            if (matchingRun(rowAt(side, projectedY), x, sideHeight * 0.01)) row.centerZCm = (x - sideOrigin) * sideScale * side.facing;
          }
        }
        profile.push(row);
      }
      return profile;
    }) as [BodyProfileRow[], BodyProfileRow[]];
  }

  const wristHeight = (points: Point[]) => (front.bounds.bottom - points[2].y) * frontScale;
  return {
    torso, neck, head, arms: limbProfiles('arm'), legs: limbProfiles('leg'),
    armWristHeightCm: [wristHeight(fAxes.frontArms[0]), wristHeight(fAxes.frontArms[1])],
  };
}
