/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * A dimension-driven, neutral fitting mannequin.
 * This renderer does not infer body shape from a photograph. It consumes the
 * explicit measurements/estimates supplied by the image-analysis pipeline.
 * Its mesh measurements check construction consistency, not real-body accuracy.
 */
import * as THREE from 'three';
import { CalculatedBodyDimensions, ClothingOptions, ModelMeshMeasurements } from '../types/body';

export interface AvatarBuildResult {
  group: THREE.Group;
  measurements: ModelMeshMeasurements;
  tapeRingsGroup: THREE.Group;
  clothesGroup: THREE.Group;
  updateBiometrics: (dims: CalculatedBodyDimensions, clothes: ClothingOptions, showTapes: boolean) => ModelMeshMeasurements;
}

type Section = { y: number; rx: number; rz: number; cx?: number; cz?: number; bulge?: number };
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const cm = (metres: number) => Math.round(metres * 1000) / 10;
const safe = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value / 100 : fallback;

/** Interpolate radii, not a single global avatar scale. Sections are in metres. */
function sectionAt(sections: Section[], y: number): Section {
  if (y <= sections[0].y) return { ...sections[0], y };
  if (y >= sections[sections.length - 1].y) return { ...sections[sections.length - 1], y };
  let i = 1;
  while (sections[i].y < y) i++;
  const a = sections[i - 1], b = sections[i];
  const t = (y - a.y) / (b.y - a.y);
  // Shape-preserving cubic interpolation avoids the horizontal terraces made by
  // applying smoothstep independently to every pair of section rings.
  const interpolate = (key: 'rx' | 'rz' | 'cx' | 'cz' | 'bulge') => {
    const value = (j: number) => sections[j][key] || 0;
    const slope = (j: number) => (value(j + 1) - value(j)) / (sections[j + 1].y - sections[j].y);
    const tangent = (j: number) => {
      if (j === 0) return slope(0);
      if (j === sections.length - 1) return slope(j - 1);
      const before = slope(j - 1), after = slope(j);
      if (before * after <= 0) return 0;
      const h0 = sections[j].y - sections[j - 1].y, h1 = sections[j + 1].y - sections[j].y;
      const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
      return (w0 + w1) / (w0 / before + w1 / after);
    };
    const h = b.y - a.y;
    return (2*t*t*t - 3*t*t + 1)*value(i-1) + (t*t*t - 2*t*t + t)*h*tangent(i-1)
      + (-2*t*t*t + 3*t*t)*value(i) + (t*t*t - t*t)*h*tangent(i);
  };
  return {
    y, rx: interpolate('rx'), rz: interpolate('rz'),
    cx: interpolate('cx'), cz: interpolate('cz'), bulge: interpolate('bulge'),
  };
}

function pointOnSection(s: Section, angle: number): THREE.Vector3 {
  const forward = Math.max(0, Math.cos(angle));
  return new THREE.Vector3(
    (s.cx || 0) + Math.sin(angle) * s.rx,
    s.y,
    (s.cz || 0) + Math.cos(angle) * s.rz + (s.bulge || 0) * forward * forward,
  );
}

/** Closed, smoothly shaded elliptical loft with a single continuous limb surface. */
function loft(sectionsInput: Section[], rows = 100, radial = 48, cap = true): THREE.BufferGeometry {
  const sections = [...sectionsInput].sort((a, b) => a.y - b.y);
  const positions: number[] = [], indices: number[] = [];
  const lo = sections[0].y, hi = sections[sections.length - 1].y;
  const ys = Array.from(new Set([
    ...Array.from({ length: rows + 1 }, (_, i) => lerp(lo, hi, i / rows)),
    ...sections.map(s => s.y),
  ])).sort((a, b) => a - b);
  for (const y of ys) {
    const s = sectionAt(sections, y);
    for (let j = 0; j <= radial; j++) {
      const p = pointOnSection(s, j / radial * Math.PI * 2);
      positions.push(p.x, p.y, p.z);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * stride + j, b = a + stride;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  if (cap) {
    for (const top of [false, true]) {
      const row = top ? ys.length - 1 : 0;
      const s = sectionAt(sections, ys[row]);
      const center = positions.length / 3;
      positions.push(s.cx || 0, s.y, s.cz || 0);
      for (let j = 0; j < radial; j++) {
        const a = row * stride + j;
        if (top) indices.push(center, a, a + 1);
        else indices.push(center, a + 1, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // The duplicated 0/2pi vertices share the same normal (no longitudinal seam).
  const n = g.getAttribute('normal');
  for (let i = 0; i < ys.length; i++) {
    const a = i * stride, b = a + radial;
    const v = new THREE.Vector3().fromBufferAttribute(n, a)
      .add(new THREE.Vector3().fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  g.computeBoundingBox();
  return g;
}

/** Actual triangle/plane intersections. Does not return the requested circumference. */
function crossSection(g: THREE.BufferGeometry, requestedY: number): THREE.Vector3[][] {
  const p = g.getAttribute('position'), index = g.getIndex();
  const result: THREE.Vector3[][] = [];
  // Avoid counting an edge twice when the requested plane lies on a ring.
  const y = requestedY + 1e-7;
  const count = index ? index.count : p.count;
  for (let i = 0; i < count; i += 3) {
    const points = [0, 1, 2].map(j =>
      new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j));
    const hits: THREE.Vector3[] = [];
    for (let j = 0; j < 3; j++) {
      const a = points[j], b = points[(j + 1) % 3];
      if ((a.y < y && b.y > y) || (a.y > y && b.y < y)) {
        const t = (y - a.y) / (b.y - a.y);
        hits.push(a.clone().lerp(b, t));
      }
    }
    if (hits.length === 2) result.push(hits);
  }
  return result;
}

function perimeter(g: THREE.BufferGeometry, y: number): number {
  return cm(crossSection(g, y).reduce((sum, segment) => sum + segment[0].distanceTo(segment[1]), 0));
}
function sectionExtent(g: THREE.BufferGeometry, y: number) {
  const points = crossSection(g, y).flat();
  return new THREE.Box3().setFromPoints(points);
}
function bounds(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}
/** Measure in avatar metres, independent of a turntable's world translation. */
function modelBounds(object: THREE.Object3D, reference: THREE.Object3D): THREE.Box3 {
  reference.updateWorldMatrix(true, true);
  const inverseReference = reference.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const transform = new THREE.Matrix4().multiplyMatrices(inverseReference, child.matrixWorld);
    box.union(bounds(child.geometry).clone().applyMatrix4(transform));
  });
  return box;
}
function tapeFromMesh(g: THREE.BufferGeometry, y: number, material: THREE.Material): THREE.Mesh | null {
  const points = crossSection(g, y).flat();
  if (points.length < 8) return null;
  const unique = new Map<string, THREE.Vector3>();
  for (const p of points) unique.set(p.x.toFixed(6) + ',' + p.z.toFixed(6), p);
  const contour = [...unique.values()];
  const center = contour.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(contour.length);
  contour.sort((a, b) => Math.atan2(a.x - center.x, a.z - center.z) - Math.atan2(b.x - center.x, b.z - center.z));
  const path = new THREE.CatmullRomCurve3(contour.map(p => p.clone().sub(center).multiplyScalar(1.018).add(center)), true);
  return new THREE.Mesh(new THREE.TubeGeometry(path, 100, 0.0024, 6, true), material);
}

export function createParametricAvatar(
  dims: CalculatedBodyDimensions,
  clothes: ClothingOptions,
  showTapes = true,
): AvatarBuildResult {
  const root = new THREE.Group(); root.name = 'AvatarRoot';
  const body = new THREE.Group(); body.name = 'AnatomicalBody';
  const garments = new THREE.Group(); garments.name = 'Clothes';
  const tapes = new THREE.Group(); tapes.name = 'VirtualTapes';
  root.add(body, garments, tapes);
  // A neutral mannequin: facial identity is not reconstructed by this renderer.
  const skin = new THREE.MeshStandardMaterial({ color: 0xc5beb3, roughness: 0.77, metalness: 0 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x596775, roughness: 0.83, metalness: 0 });
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.82 });
  const waistTapeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: clothes.topColor, roughness: 0.9, side: THREE.DoubleSide });
  const pantsMat = new THREE.MeshStandardMaterial({ color: clothes.bottomColor, roughness: 0.9, side: THREE.DoubleSide });
  let result: AvatarBuildResult;

  function add(g: THREE.BufferGeometry, material: THREE.Material, name: string, parent = body) {
    const m = new THREE.Mesh(g, material);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }
  function clear(group: THREE.Group) {
    for (const child of [...group.children]) {
      child.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      group.remove(child);
    }
  }

  function rebuild(d: CalculatedBodyDimensions, c: ClothingOptions, show: boolean): ModelMeshMeasurements {
    clear(body); clear(garments); clear(tapes);
    const H = safe(d.height.value, 1.7);
    const headH = safe(d.headHeight.value, H * 0.13);
    const headW = safe(d.headWidth.value, headH * 0.66);
    const neckH = safe(d.neckLength.value, H * 0.05);
    const neckW = safe(d.neckWidth.value, headW * 0.7);
    const neckD = safe(d.neckDepth.value, neckW);
    const shoulderW = safe(d.shoulderWidth.value, H * 0.25);
    const I = safe(d.inseam.value, H * 0.45);
    // The crown, chin, shoulder and crotch share one consistent vertical frame.
    const S = H - headH - neckH;
    const T = Math.max(H * 0.10, S - I);
    const chinY = S + neckH;
    const chestW = safe(d.chestWidth.value, shoulderW * 0.8);
    const chestD = safe(d.chestDepth.value, chestW * 0.65);
    const waistW = safe(d.waistWidth.value, chestW * 0.85);
    const waistD = safe(d.waistDepth.value, chestD * 0.9);
    const hipW = safe(d.hipWidth.value, waistW * 1.1);
    const hipD = safe(d.hipDepth.value, hipW * 0.72);
    const belly = Number.isFinite(d.bellyProtrusion.value) ? Math.max(0, d.bellyProtrusion.value / 100) : 0;
    const rise = clamp(Math.tan(clamp(d.shoulderSlopeDeg.value || 10, 0, 30) * Math.PI / 180)
      * Math.max(0, (shoulderW - neckW) / 2), neckH * 0.12, neckH * 0.68);
    // Match photoObservation.ts sampling levels exactly. Its image Y runs
    // shoulder->crotch: chest=.25, waist=.62, hip=.83, navel=.52.
    // Model Y runs upward from the crotch, so use 1 minus those fractions.
    const hipY = I + T * 0.17, waistY = I + T * 0.38;
    const chestY = I + T * 0.75, bellyY = I + T * 0.48;
    const shoulderY = I + T;
    const bellyFraction = (bellyY - waistY) / (chestY - waistY);

    const torsoSections: Section[] = [
      { y: I, rx: hipW * 0.37, rz: hipD * 0.37 },
      { y: hipY, rx: hipW / 2, rz: hipD / 2, cz: -hipD * 0.035 },
      // The measured waist depth already includes the abdomen. Do not add it twice.
      { y: waistY, rx: waistW / 2, rz: waistD / 2 },
      { y: bellyY, rx: lerp(waistW, chestW, bellyFraction) / 2, rz: lerp(waistD, chestD, bellyFraction) / 2, bulge: belly },
      { y: chestY, rx: chestW / 2, rz: chestD / 2 },
      { y: I + T * 0.91, rx: shoulderW * 0.47, rz: chestD * 0.43 },
      { y: shoulderY, rx: shoulderW / 2, rz: chestD * 0.34 },
      { y: shoulderY + rise, rx: neckW * 0.55, rz: neckD * 0.54, cz: -0.008 },
      { y: lerp(shoulderY + rise, chinY, 0.50), rx: neckW / 2, rz: neckD / 2, cz: -0.008 },
      { y: chinY + headH * 0.18, rx: neckW * 0.43, rz: neckD * 0.42, cz: -headH * 0.12 },
    ];
    const torso = add(loft(torsoSections, 130, 56), suit, 'TorsoNeckSurface');
    torso.userData.sections = torsoSections;
    const headGeo = new THREE.SphereGeometry(1, 48, 40);
    const hp = headGeo.getAttribute('position');
    for (let k = 0; k < hp.count; k++) {
      const y = hp.getY(k);
      const jaw = y < -0.15 ? lerp(0.72, 1, clamp((y + 1) / 0.85, 0, 1)) : 1;
      hp.setXYZ(k, hp.getX(k) * headW * 0.5 * jaw,
        chinY + headH * (y + 1) * 0.5,
        hp.getZ(k) * headH * 0.43 + (y < 0 ? 0.007 * -y : -0.004 * y));
    }
    headGeo.computeVertexNormals(); headGeo.computeBoundingBox();
    const head = add(headGeo, skin, 'NeutralHead');
    const face = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), skin);
    face.geometry.scale(headW * 0.045, headH * 0.055, headH * 0.065);
    face.position.set(0, chinY + headH * 0.36, headH * 0.38);
    face.name = 'NeutralNose'; body.add(face);

    const upperL = safe(d.upperArmLength.value, H * 0.18);
    const foreL = safe(d.forearmLength.value, H * 0.15);
    const upperW = safe(d.upperArmWidth.value, shoulderW * 0.22);
    const upperD = safe(d.upperArmDepth.value, upperW);
    const foreW = safe(d.forearmWidth.value, upperW * 0.78);
    const foreD = safe(d.forearmDepth.value, foreW * 0.94);
    const thighW = safe(d.thighWidth.value, hipW * 0.48);
    const thighD = safe(d.thighDepth.value, thighW * 1.08);
    const calfW = safe(d.calfWidth.value, thighW * 0.70);
    const calfD = safe(d.calfDepth.value, calfW * 1.06);
    const thighRaw = safe(d.thighLength.value, I * 0.50);
    const calfRaw = safe(d.calfLength.value, I * 0.50);
    // The photo pipeline measures crotch->knee and knee->ankle separately.
    // Preserve those observed lengths and derive the ankle's ground height.
    // Older data that includes the foot in calfLength needs a stated neutral fallback.
    const observedAnkleY = I - thighRaw - calfRaw;
    const hasFootObservation = observedAnkleY > H * 0.009 && observedAnkleY < H * 0.075;
    const ankleY = hasFootObservation ? observedAnkleY : H * 0.036 * 0.83;
    const footH = clamp(ankleY * 1.12, H * 0.025, H * 0.055);
    const kneeY = hasFootObservation
      ? ankleY + calfRaw
      : ankleY + (I - ankleY) * calfRaw / (thighRaw + calfRaw);
    const calfPeakY = ankleY + (kneeY - ankleY) * 0.56;
    const thighPeakY = kneeY + (I - kneeY) * 0.68;
    const kneeW = Math.min(thighW * 0.64, calfW * 0.86);
    const kneeD = Math.min(thighD * 0.64, calfD * 0.86);
    const legX = Math.max(thighW * 0.44, hipW / 2 - thighW * 0.46);
    const armAngle = 0.065;
    const armL = upperL + foreL;
    const armSectionsBySide: Section[][] = [];
    const armMeshes: THREE.Mesh[] = [], legMeshes: THREE.Mesh[] = [];
    const armFrames: { shoulder: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3 }[] = [];
    const sleeveShorten = c.alterations.enabled ? c.alterations.sleeveShorten / 100 : 0;
    const hemShorten = c.alterations.enabled ? c.alterations.hemShorten / 100 : 0;
    const waistAdjust = c.alterations.enabled ? c.alterations.waistAdjustment / 100 : 0;

    for (const side of [-1, 1]) {
      const sx = side * (shoulderW / 2 - upperW * 0.28);
      const armAt = (distance: number, rx: number, rz: number): Section => ({
        y: shoulderY - distance * Math.cos(armAngle),
        cx: sx + side * distance * Math.sin(armAngle), cz: 0.003,
        rx, rz,
      });
      const armSections: Section[] = [
        armAt(-0.012, upperW * 0.17, upperD * 0.17),
        armAt(upperL * 0.09, upperW * 0.46, upperD * 0.46),
        armAt(upperL * 0.34, upperW / 2, upperD / 2),
        armAt(upperL * 0.80, upperW * 0.36, upperD * 0.37),
        armAt(upperL, Math.min(upperW, foreW) * 0.35, Math.min(upperD, foreD) * 0.36),
        armAt(upperL + foreL * 0.28, foreW / 2, foreD / 2),
        armAt(upperL + foreL * 0.68, foreW * 0.39, foreD * 0.39),
        armAt(armL, foreW * 0.27, foreD * 0.28),
      ].sort((a, b) => a.y - b.y);
      const arm = add(loft(armSections, 92, 40), suit, side < 0 ? 'LeftArmSurface' : 'RightArmSurface');
      armSectionsBySide.push(armSections); armMeshes.push(arm);
      const positionAt = (distance: number) => {
        const p = armAt(distance, 0, 0);
        return new THREE.Vector3(p.cx, p.y, p.cz);
      };
      const frame = { shoulder: positionAt(0), elbow: positionAt(upperL), wrist: positionAt(armL) };
      armFrames.push(frame);
      const handH = headH * 0.72, wrist = frame.wrist;
      const palmW = Math.max(foreW * 0.72, headW * 0.39);
      const handRows: Section[] = [
        { y: wrist.y + 0.008, rx: foreW * 0.27, rz: foreD * 0.28, cx: wrist.x, cz: wrist.z },
        { y: wrist.y - handH * 0.28, rx: palmW / 2, rz: palmW * 0.23, cx: wrist.x + side * 0.006, cz: wrist.z },
        { y: wrist.y - handH * 0.70, rx: palmW * 0.43, rz: palmW * 0.20, cx: wrist.x + side * 0.008, cz: wrist.z },
        { y: wrist.y - handH, rx: palmW * 0.13, rz: palmW * 0.10, cx: wrist.x + side * 0.008, cz: wrist.z },
      ];
      add(loft(handRows, 32, 28), skin, side < 0 ? 'LeftHand' : 'RightHand');
      const thumbGeo = new THREE.CapsuleGeometry(palmW * 0.13, handH * 0.23, 8, 12);
      const thumb = add(thumbGeo, skin, 'Thumb');
      thumb.position.set(wrist.x - side * palmW * 0.40, wrist.y - handH * 0.35, wrist.z + palmW * 0.16);
      thumb.rotation.z = side * 0.45;

      const lx = side * legX;
      const legRows: Section[] = [
        { y: ankleY, rx: calfW * 0.25, rz: calfD * 0.27, cx: lx, cz: -0.005 },
        { y: ankleY + (kneeY - ankleY) * 0.22, rx: calfW * 0.31, rz: calfD * 0.32, cx: lx, cz: -0.010 },
        { y: calfPeakY, rx: calfW / 2, rz: calfD / 2, cx: lx, cz: -0.012 },
        { y: kneeY, rx: kneeW / 2, rz: kneeD / 2, cx: lx, cz: 0.007 },
        { y: kneeY + (I - kneeY) * 0.28, rx: thighW * 0.39, rz: thighD * 0.40, cx: lx, cz: 0.002 },
        { y: thighPeakY, rx: thighW / 2, rz: thighD / 2, cx: lx, cz: 0 },
        { y: I + T * 0.06, rx: thighW * 0.45, rz: thighD * 0.47, cx: lx * 0.96, cz: -0.002 },
        // Bury the terminal cap inside the pelvis, rather than expose a flat
        // horizontal thigh cut outside the trunk silhouette.
        { y: I + T * 0.25, rx: thighW * 0.10, rz: thighD * 0.12, cx: lx * 0.72, cz: -0.002 },
      ];
      const leg = add(loft(legRows, 106, 44), suit, side < 0 ? 'LeftLegSurface' : 'RightLegSurface');
      legMeshes.push(leg);
      const footGeo = new THREE.SphereGeometry(1, 28, 22);
      footGeo.scale(Math.max(calfW * 0.35, H * 0.025), footH / 2, H * 0.069);
      const foot = add(footGeo, suit, side < 0 ? 'LeftFoot' : 'RightFoot');
      foot.position.set(lx, footH / 2, H * 0.022);

      if (c.bottomType !== 'none') {
        const fit = c.fit === 'oversized' ? 1.19 : c.fit === 'slim' ? 1.045 : 1.09;
        const hemY = Math.max(ankleY + 0.008, ankleY - hemShorten);
        const topY = I + T * 0.12;
        const ys = Array.from(new Set([hemY, ...legRows.filter(s => s.y > hemY && s.y < topY).map(s => s.y), topY])).sort((a, b) => a - b);
        const pantsRows = ys.map(y => {
          const s = sectionAt(legRows, y);
          const wide = c.bottomType === 'wide_chinos' ? thighW * 0.41 : 0;
          const straight = c.bottomType === 'straight_denim' ? calfW * 0.43 : 0;
          return { ...s, rx: Math.max(s.rx * fit + 0.003, wide, straight), rz: s.rz * fit + 0.004 };
        });
        add(loft(pantsRows, 82, 40), pantsMat, 'TrouserLeg', garments);
      }
    }

    shirtMat.color.set(c.topColor || '#2563eb');
    pantsMat.color.set(c.bottomColor || '#1e293b');
    if (c.topType !== 'none') {
      const fit = c.fit === 'oversized' ? 1.14 : c.fit === 'slim' ? 1.025 : 1.065;
      const hemY = Math.max(I + 0.025, hipY - hemShorten);
      const neckBase = shoulderY + rise * 0.85;
      const ys = Array.from(new Set([hemY, ...torsoSections.filter(s => s.y > hemY && s.y < neckBase).map(s => s.y), neckBase])).sort((a, b) => a - b);
      const rows = ys.map(y => {
        const s = sectionAt(torsoSections, y);
        const waistInfluence = Math.max(0, 1 - Math.abs(y - waistY) / Math.max(0.03, T * 0.4));
        const adjust = waistAdjust / (Math.PI * 2) * waistInfluence;
        const pantsFit = c.fit === 'oversized' ? 1.12 : c.fit === 'slim' ? 1.035 : 1.07;
        const overPants = c.bottomType !== 'none' && y <= waistY + 0.01;
        return { ...s,
          rx: Math.max(s.rx * fit + 0.009 + adjust, overPants ? s.rx * pantsFit + 0.014 + waistAdjust / (Math.PI*2) : 0.025),
          rz: Math.max(s.rz * fit + 0.010 + adjust, overPants ? s.rz * pantsFit + 0.015 + waistAdjust / (Math.PI*2) : 0.025),
        };
      });
      add(loft(rows, 100, 48, false), shirtMat, 'GarmentTorso', garments);
      for (const armRows of armSectionsBySide) {
        const length = c.topType === 'tshirt' ? upperL * 0.57 : armL * 0.97;
        const sleeveDrop = Math.max(0.04, length + sleeveShorten);
        const topY = shoulderY + 0.009, endY = Math.max(armRows[0].y, shoulderY - sleeveDrop * Math.cos(armAngle));
        const ys = Array.from(new Set([endY, ...armRows.filter(s => s.y > endY && s.y < topY).map(s => s.y), topY])).sort((a, b) => a - b);
        add(loft(ys.map(y => {
          const s = sectionAt(armRows, y);
          return { ...s, rx: s.rx * fit + 0.005, rz: s.rz * fit + 0.005 };
        }), 60, 36, false), shirtMat, 'GarmentSleeve', garments);
      }
    }
    if (c.bottomType !== 'none') {
      const fit = c.fit === 'oversized' ? 1.12 : c.fit === 'slim' ? 1.035 : 1.07;
      const pelvisRows = [I, hipY, waistY].map(y => {
        const s = sectionAt(torsoSections, y);
        return { ...s, rx: Math.max(s.rx * fit + 0.005 + waistAdjust / (Math.PI * 2), 0.04), rz: Math.max(s.rz * fit + 0.006 + waistAdjust / (Math.PI * 2), 0.04) };
      });
      add(loft(pelvisRows, 60, 48), pantsMat, 'GarmentPelvis', garments);
    }

    // Measurements below come from the rendered body surface, excluding clothes.
    body.updateMatrixWorld(true);
    const bodyBox = modelBounds(body, root);
    const headBox = bounds(head.geometry);
    const shoulderSection = sectionExtent(torso.geometry, shoulderY);
    const bellyBaseline = sectionAt(torsoSections, bellyY).rz + (sectionAt(torsoSections, bellyY).cz || 0);
    const bellyFront = sectionExtent(torso.geometry, bellyY).max.z;
    const arm = armFrames[0];
    const measurements: ModelMeshMeasurements = {
      measuredHeight: cm(bodyBox.max.y - bodyBox.min.y),
      measuredHeadHeight: cm(headBox.max.y - headBox.min.y),
      measuredNeckLength: cm(headBox.min.y - shoulderY),
      measuredNeckGirth: perimeter(torso.geometry, lerp(shoulderY + rise, chinY, 0.50)),
      measuredShoulderWidth: cm(shoulderSection.max.x - shoulderSection.min.x),
      measuredTorsoLength: cm(shoulderY - bounds(torso.geometry).min.y),
      measuredInseam: cm(bounds(torso.geometry).min.y - bodyBox.min.y),
      measuredChestCircumference: perimeter(torso.geometry, chestY),
      measuredWaistCircumference: perimeter(torso.geometry, waistY),
      measuredBellyProtrusion: cm(Math.max(0, bellyFront - bellyBaseline)),
      measuredHipCircumference: perimeter(torso.geometry, hipY),
      measuredUpperArmGirth: perimeter(armMeshes[0].geometry, shoulderY - upperL * 0.34 * Math.cos(armAngle)),
      measuredForearmGirth: perimeter(armMeshes[0].geometry, shoulderY - (upperL + foreL * 0.28) * Math.cos(armAngle)),
      measuredThighGirth: perimeter(legMeshes[0].geometry, thighPeakY),
      measuredCalfGirth: perimeter(legMeshes[0].geometry, calfPeakY),
      measuredArmLength: cm(arm.shoulder.distanceTo(arm.elbow) + arm.elbow.distanceTo(arm.wrist)),
    };
    root.userData.measurementMethod = 'Triangle-plane cross sections in model metres; reference-axis lengths. Construction consistency only, not body-reconstruction accuracy.';
    root.userData.anatomicalReferences = { shoulderY, crotchY: I, chinY, kneeY, ankleY, chestY, waistY, hipY, bellyY, hasFootObservation };
    root.userData.measurements = measurements;
    if (show) {
      for (const [y, mat] of [[chestY, tapeMat], [waistY, waistTapeMat], [hipY, tapeMat]] as const) {
        const ring = tapeFromMesh(torso.geometry, y, mat); if (ring) tapes.add(ring);
      }
      const line = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(shoulderSection.min.x, shoulderY, 0.015),
        new THREE.Vector3(shoulderSection.max.x, shoulderY, 0.015),
      ]);
      const shoulderTape = new THREE.Line(line, tapeMat); tapes.add(shoulderTape);
    }
    if (result) result.measurements = measurements;
    return measurements;
  }
  const measurements = rebuild(dims, clothes, showTapes);
  result = { group: root, measurements, tapeRingsGroup: tapes, clothesGroup: garments, updateBiometrics: rebuild };
  return result;
}
