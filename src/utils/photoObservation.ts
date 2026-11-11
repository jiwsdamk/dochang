/**
 * Actual image inference and silhouette observations.
 * Pose points locate anatomical regions; mask boundaries provide visible outer widths.
 * These are photographic estimates, not a validated body scanner.
 */
export interface Landmark {
  x: number; y: number; z?: number; visibility?: number; presence?: number;
}
export interface Point { x: number; y: number }
export interface Span { left: number; right: number; y: number; derived: boolean }
export interface LimbObservation {
  lengthPx: number;
  widthPx: number;
  source: 'photo_extracted' | 'anatomical_derived';
  start: Point;
  end: Point;
}
export interface PhotoViewObservation {
  width: number;
  height: number;
  landmarks: Landmark[];
  bounds: { left: number; right: number; top: number; bottom: number };
  contour: Point[];
  headTop: Point;
  chin: Point;
  shoulder: Point;
  shoulderSurface: [Point, Point];
  shoulderSpanPx: number;
  shoulderTiltDeg: number;
  shoulderSlopeDeg: number;
  neck: Span;
  head: Span;
  crotch: Point;
  crotchDerived: boolean;
  ankleY: number;
  chest: Span;
  waist: Span;
  hip: Span;
  navel: Span;
  upperArm: LimbObservation;
  forearm: LimbObservation;
  thigh: LimbObservation;
  calf: LimbObservation;
  footHeightPx: number;
  facing: -1 | 1;
  foregroundFraction: number;
  symmetry: number;
  fingerprint: string;
  meanLuminance?: number;
  chinSource: 'face_landmark' | 'pose_ratio_assumption';
}
export interface PhotoPairObservation {
  front: PhotoViewObservation;
  side: PhotoViewObservation;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const median = (values: number[]) => {
  const a = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Exported for deterministic mask-fixture tests; no DOM or AI calls are used here. */
export function observePhotoMask(
  probabilities: Float32Array,
  maskWidth: number,
  maskHeight: number,
  landmarks: Landmark[],
  imageWidth: number,
  imageHeight: number,
  fingerprint = 'mask-fixture',
): PhotoViewObservation {
  if (landmarks.length < 33 || probabilities.length !== maskWidth * maskHeight) {
    throw new Error('사진 분석 결과가 불완전해요. 전신이 보이는 사진으로 다시 시도해주세요.');
  }
  const binary = new Uint8Array(probabilities.length);
  for (let i = 0; i < binary.length; i++) binary[i] = probabilities[i] >= 0.5 ? 1 : 0;

  // Keep the largest connected foreground component to exclude detached background pixels.
  const seen = new Uint8Array(binary.length);
  const queue = new Int32Array(binary.length);
  let largest: number[] = [];
  for (let seed = 0; seed < binary.length; seed++) {
    if (!binary[seed] || seen[seed]) continue;
    let read = 0, write = 0;
    queue[write++] = seed;
    seen[seed] = 1;
    const component: number[] = [];
    while (read < write) {
      const p = queue[read++];
      component.push(p);
      const x = p % maskWidth, y = Math.floor(p / maskWidth);
      for (const n of [
        x > 0 ? p - 1 : -1, x < maskWidth - 1 ? p + 1 : -1,
        y > 0 ? p - maskWidth : -1, y < maskHeight - 1 ? p + maskWidth : -1,
      ]) {
        if (n >= 0 && binary[n] && !seen[n]) { seen[n] = 1; queue[write++] = n; }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  if (largest.length < binary.length * 0.025) {
    throw new Error('사진에서 전신 윤곽을 충분히 찾지 못했어요. 배경과 몸이 구분되는 전신 사진을 사용해주세요.');
  }
  binary.fill(0);
  for (const p of largest) binary[p] = 1;

  const sx = imageWidth / maskWidth, sy = imageHeight / maskHeight;
  let left = maskWidth, right = 0, top = maskHeight, bottom = 0;
  for (const p of largest) {
    const x = p % maskWidth, y = Math.floor(p / maskWidth);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const bounds = {
    left: left * sx, right: (right + 1) * sx,
    top: top * sy, bottom: (bottom + 1) * sy,
  };
  const bodyH = bounds.bottom - bounds.top;
  if (bodyH < imageHeight * 0.35) {
    throw new Error('사람이 너무 작게 보여요. 정수리부터 발끝까지 크게 보이도록 다시 촬영해주세요.');
  }
  const point = (i: number): Point => ({ x: landmarks[i].x * imageWidth, y: landmarks[i].y * imageHeight });
  const visibility = (i: number) => Math.min(landmarks[i].visibility ?? 0, landmarks[i].presence ?? 1);
  let shoulder = mid(point(11), point(12));
  let shoulderSurface: [Point, Point] = [point(11), point(12)];
  const hipJoint = mid(point(23), point(24));
  const centerAt = (y: number) => {
    const t = clamp((y - shoulder.y) / Math.max(hipJoint.y - shoulder.y, 1), 0, 1);
    return shoulder.x * (1 - t) + hipJoint.x * t;
  };
  const rows = (y: number): Array<{ left: number; right: number }> => {
    const yy = clamp(Math.round(y / sy), 0, maskHeight - 1);
    const result: Array<{ left: number; right: number }> = [];
    let start = -1;
    for (let x = 0; x <= maskWidth; x++) {
      const inside = x < maskWidth && binary[yy * maskWidth + x];
      if (inside && start < 0) start = x;
      if (!inside && start >= 0) {
        if (x - start >= 2) result.push({ left: start * sx, right: x * sx });
        start = -1;
      }
    }
    return result;
  };
  const at = (p: Point) => {
    const x = Math.round(p.x / sx), y = Math.round(p.y / sy);
    return x >= 0 && x < maskWidth && y >= 0 && y < maskHeight
      ? binary[y * maskWidth + x] === 1 : false;
  };
  const centralSpan = (y: number, expectedX: number): Span => {
    let candidates = rows(y);
    if (!candidates.length) {
      for (let k = 1; k <= 5 && !candidates.length; k++) candidates = rows(y + k * sy);
    }
    if (!candidates.length) throw new Error('신체 윤곽이 끊겨 있어 치수를 계산할 수 없어요.');
    const match = candidates.find(s => s.left <= expectedX && s.right >= expectedX)
      ?? candidates.reduce((a, b) =>
        Math.abs((a.left + a.right) / 2 - expectedX) < Math.abs((b.left + b.right) / 2 - expectedX) ? a : b);
    return { ...match, y, derived: false };
  };
  const torsoSpan = (y: number, capArms = false): Span => {
    const centerX = centerAt(y);
    const candidates: Span[] = [];
    for (let offset = -2; offset <= 2; offset++) candidates.push(centralSpan(y + offset * sy, centerX));
    candidates.sort((a, b) => (a.right - a.left) - (b.right - b.left));
    const result = { ...candidates[2], y };
    // A single connected mask cannot distinguish an arm touching the torso.
    // If its span extends beyond the pose shoulders, retain an explicitly marked
    // shoulder-constrained estimate instead of labelling the arm-inclusive width as measured.
    const jointWidth = Math.abs(point(12).x - point(11).x);
    if (capArms && jointWidth > bodyH * 0.12 && result.right - result.left > jointWidth * 1.12) {
      const width = jointWidth * 1.02;
      return { left: centerX - width / 2, right: centerX + width / 2, y, derived: true };
    }
    return result;
  };

  const earY = median([point(7).y, point(8).y, point(9).y, point(10).y]);
  const mouthY = median([point(9).y, point(10).y]);
  const headX = median([point(0).x, point(7).x, point(8).x]);
  // The pose shoulder joint centre lies inside the upper arm, below the visible
  // shoulder surface. Find the upper foreground boundary at each shoulder x
  // in a front view instead of counting that shoulder cap as a long neck.
  if (Math.abs(point(12).x - point(11).x) > bodyH * 0.12) {
    shoulderSurface = [11, 12].map(index => {
      const p = point(index), candidates: number[] = [];
      for (const dx of [-sx * 2, 0, sx * 2]) {
        for (let y = mouthY + bodyH * 0.025; y <= p.y; y += sy) {
          if (at({ x:p.x + dx, y })) { candidates.push(y); break; }
        }
      }
      return { x:p.x, y:candidates.length ? median(candidates) : p.y };
    }) as [Point, Point];
    shoulder = mid(shoulderSurface[0], shoulderSurface[1]);
  }
  const head = centralSpan(earY, headX);
  // Find the narrow neck segment between the mouth and shoulder, using actual mask rows.
  const neckRows: Span[] = [];
  const neckStart = Math.max(mouthY + bodyH * 0.006, bounds.top + bodyH * 0.075);
  const neckEnd = shoulder.y - bodyH * 0.009;
  for (let y = neckStart; y <= neckEnd; y += sy) neckRows.push(centralSpan(y, headX));
  if (!neckRows.length) throw new Error('목과 어깨 위치를 구분하기 어려워요. 얼굴과 어깨가 가려지지 않은 사진을 사용해주세요.');
  neckRows.sort((a, b) => (a.right - a.left) - (b.right - b.left));
  const neck = neckRows[Math.floor(neckRows.length * 0.22)];
  const neckWidth = neck.right - neck.left;
  // Without a face model the chin is a pose-derived assumption, not an observed
  // jaw landmark. An actual face-landmarker observation replaces it below.
  const jawRows = [...neckRows].sort((a, b) => a.y - b.y);
  const eyeY = median([point(2).y, point(5).y]);
  const chin = { x: headX, y: Math.min(shoulder.y - sy * 2, mouthY + Math.max(0,mouthY - eyeY) * 0.75) };
  const neckBase = jawRows.filter(row => row.right-row.left <= neckWidth * 1.25).at(-1)?.y ?? neck.y;
  const shoulderRun = Math.max((Math.abs(point(12).x-point(11).x)-neckWidth)/2,sy);
  const shoulderSlopeDeg = Math.atan2(Math.max(0,shoulder.y-neckBase),shoulderRun)*180/Math.PI;
  const headTop = { x: (centralSpan(bounds.top + sy, headX).left + centralSpan(bounds.top + sy, headX).right) / 2, y: bounds.top };

  // Locate the actual split between the two legs below the hip pose joints.
  const kneeY = median([point(25).y, point(26).y]);
  let crotchY: number | null = null;
  const legCenter = mid(point(25), point(26)).x;
  const maxGap = Math.abs(point(25).x - point(26).x) + bodyH * 0.08;
  for (let y = hipJoint.y; y < hipJoint.y + (kneeY - hipJoint.y) * 0.70; y += sy) {
    const segments = rows(y);
    for (let j = 0; j + 1 < segments.length; j++) {
      const gapL = segments[j].right, gapR = segments[j + 1].left;
      if (gapL <= legCenter && gapR >= legCenter && gapR - gapL > sx && gapR - gapL < maxGap) {
        crotchY = y; break;
      }
    }
    if (crotchY !== null) break;
  }
  const crotch = { x: legCenter, y: crotchY ?? hipJoint.y + (kneeY - hipJoint.y) * 0.14 };

  const sampleLimb = (a: Point, b: Point): LimbObservation => {
    const length = distance(a, b);
    const nx = -(b.y - a.y) / Math.max(length, 1), ny = (b.x - a.x) / Math.max(length, 1);
    const values: number[] = [];
    const partial: number[] = [];
    const step = Math.min(sx, sy) * 0.65;
    const maxRadius = Math.min(length * 0.50, bodyH * 0.095);
    for (const t of [0.32, 0.42, 0.52, 0.62, 0.72]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (!at(p)) continue;
      const sides = [-1, 1].map(sign => {
        let r = 0;
        for (; r <= maxRadius; r += step) if (!at({ x: p.x + nx * r * sign, y: p.y + ny * r * sign })) break;
        return r;
      });
      const bothVisible = sides.every(r => r <= maxRadius);
      if (bothVisible && Math.max(...sides) < Math.min(...sides) * 2.6) values.push(sides[0] + sides[1]);
      else if (Math.min(...sides) <= maxRadius) partial.push(Math.min(...sides) * 2);
    }
    if (!values.length && !partial.length) {
      throw new Error('팔다리 윤곽이 몸통이나 배경에 가려져 있어요. 몸에 붙는 옷을 입고 팔을 약간 벌려 촬영해주세요.');
    }
    return {
      lengthPx: length,
      widthPx: median(values.length ? values : partial),
      source: values.length ? 'photo_extracted' : 'anatomical_derived',
      start: a, end: b,
    };
  };
  const chooseLimb = (pairs: [number, number][]) => {
    const scores = pairs.map(([a, b]) => ({ a, b, score: Math.min(visibility(a), visibility(b)) }));
    scores.sort((a, b) => b.score - a.score);
    const candidates: LimbObservation[] = [];
    for (const p of scores) {
      if (p.score < 0.35 && candidates.length) continue;
      const start = p.a === 11 ? shoulderSurface[0] : p.a === 12 ? shoulderSurface[1] : point(p.a);
      try { candidates.push(sampleLimb(start, point(p.b))); } catch { /* Try the visible opposite limb. */ }
    }
    if (!candidates.length) return sampleLimb(point(scores[0].a), point(scores[0].b));
    const direct = candidates.filter(c => c.source === 'photo_extracted');
    return (direct.length ? direct : candidates).sort((a, b) => a.widthPx - b.widthPx)[Math.floor((direct.length ? direct : candidates).length / 2)];
  };

  const chestY = shoulder.y + (crotch.y - shoulder.y) * 0.25;
  const waistY = shoulder.y + (crotch.y - shoulder.y) * 0.62;
  const hipY = shoulder.y + (crotch.y - shoulder.y) * 0.83;
  const chest = torsoSpan(chestY, true);
  const waist = torsoSpan(waistY, true);
  const hip = torsoSpan(hipY, true);
  const navel = torsoSpan(shoulder.y + (crotch.y - shoulder.y) * 0.52, true);

  const contourLeft: Point[] = [], contourRight: Point[] = [];
  for (let y = top; y <= bottom; y += Math.max(1, Math.floor(maskHeight / 250))) {
    const row = rows(y * sy);
    if (row.length) {
      contourLeft.push({ x: row[0].left / imageWidth, y: y * sy / imageHeight });
      contourRight.push({ x: row[row.length - 1].right / imageWidth, y: y * sy / imageHeight });
    }
  }
  const headAxis = headTop.x;
  const leftExtent = shoulder.x - chest.left, rightExtent = chest.right - shoulder.x;
  const symmetry = 100 * (1 - Math.min(1, Math.abs(leftExtent - rightExtent) / Math.max(leftExtent + rightExtent, 1)));
  const hipX = hipJoint.x;
  const facing: -1 | 1 = point(0).x < hipX ? -1 : 1;
  const ankleY = median([point(27).y, point(28).y]);
  const footHeightPx = bounds.bottom - ankleY;
  return {
    width: imageWidth, height: imageHeight, landmarks, bounds,
    contour: [...contourLeft, ...contourRight.reverse()],
    headTop, chin, shoulder, shoulderSurface,
    shoulderSpanPx: Math.abs(point(12).x - point(11).x),
    shoulderTiltDeg: Math.atan2(Math.abs(point(12).y - point(11).y), Math.abs(point(12).x - point(11).x)) * 180 / Math.PI,
    shoulderSlopeDeg,
    neck, head, crotch, crotchDerived: crotchY === null, ankleY, chest, waist, hip, navel,
    upperArm: chooseLimb([[11, 13], [12, 14]]),
    forearm: chooseLimb([[13, 15], [14, 16]]),
    thigh: chooseLimb([[23, 25], [24, 26]]),
    calf: chooseLimb([[25, 27], [26, 28]]),
    footHeightPx, facing,
    foregroundFraction: largest.length / binary.length,
    symmetry, fingerprint: fingerprint + ':' + Math.round(headAxis), chinSource:'pose_ratio_assumption',
  };
}

type PoseResult = {
  landmarks: Landmark[][];
  segmentationMasks?: Array<{ width: number; height: number; getAsFloat32Array: () => Float32Array; close: () => void }>;
};
type PoseDetector = { detect: (image: HTMLCanvasElement, callback: (result: PoseResult) => void) => void };
let detectorPromise: Promise<PoseDetector> | null = null;
async function getDetector(): Promise<PoseDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const base = import.meta.env.BASE_URL || '/';
      const wasmPath = import.meta.env.VITE_MEDIAPIPE_WASM_URL || base + 'mediapipe/wasm';
      const modelPath = import.meta.env.VITE_POSE_MODEL_URL || base + 'models/pose_landmarker_full.task';
      const files = await FilesetResolver.forVisionTasks(wasmPath);
      return await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
        runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: true,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5,
      }) as unknown as PoseDetector;
    })().catch(error => {
      detectorPromise = null;
      console.error('Pose model initialization failed:', error);
      throw new Error('실제 사진 분석 모델을 불러오지 못했어요. public/models와 public/mediapipe/wasm 파일 또는 네트워크 설정을 확인한 뒤 다시 시도해주세요. 기본 체형으로 대체하지 않았습니다.');
    });
  }
  return detectorPromise;
}

type FaceDetector = { detect: (image: HTMLCanvasElement) => { faceLandmarks: Landmark[][] } };
let faceDetectorPromise: Promise<FaceDetector> | null = null;
async function getFaceDetector(): Promise<FaceDetector> {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const base = import.meta.env.BASE_URL || '/';
      const files = await FilesetResolver.forVisionTasks(import.meta.env.VITE_MEDIAPIPE_WASM_URL || base+'mediapipe/wasm');
      return await FaceLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath:import.meta.env.VITE_FACE_MODEL_URL || base+'models/face_landmarker.task',delegate:'CPU'},
        runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:0.5,minFacePresenceConfidence:0.5,
        outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false,
      }) as unknown as FaceDetector;
    })().catch(error => { faceDetectorPromise=null; throw error; });
  }
  return faceDetectorPromise;
}
/** Detect the actual jaw landmark in a pose-guided crop; never use it for identity recognition. */
async function refineFrontChin(canvas: HTMLCanvasElement, observation: PhotoViewObservation): Promise<void> {
  try {
    const detector=await getFaceDetector();
    const headCenterX=observation.headTop.x;
    const margin=Math.max(observation.head.right-observation.head.left,observation.shoulderSpanPx*0.40);
    const cropX=Math.max(0,headCenterX-margin);
    const cropY=Math.max(0,observation.bounds.top-margin*0.18);
    const cropW=Math.min(canvas.width-cropX,margin*2);
    const cropH=Math.min(canvas.height-cropY,observation.shoulder.y-cropY+margin*0.18);
    const crop=document.createElement('canvas');
    crop.width=512;crop.height=Math.max(4,Math.round((cropH/cropW*512)/4)*4);
    crop.getContext('2d')!.drawImage(canvas,cropX,cropY,cropW,cropH,0,0,crop.width,crop.height);
    const face=detector.detect(crop).faceLandmarks[0];
    if (!face?.[152]) return;
    const chin={x:cropX+face[152].x*cropW,y:cropY+face[152].y*cropH};
    if(chin.y>observation.bounds.top&&chin.y<observation.shoulder.y){
      observation.chin=chin;
      observation.chinSource='face_landmark';
    }
  } catch(error) {
    // The body inference remains usable, but a missing face model must stay an
    // explicitly marked pose-ratio assumption rather than a claimed jaw detection.
    console.warn('Face jaw detection unavailable; chin remains a marked assumption.',error);
  }
}

async function loadCanvas(source: string): Promise<HTMLCanvasElement> {
  if (!source) throw new Error('정면과 측면 사진을 모두 선택해주세요.');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => reject(new Error('사진을 불러오는 시간이 초과됐어요. 파일을 다시 선택해주세요.')), 15000);
    img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timeout); resolve(img); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('사진을 읽을 수 없어요. JPG 또는 PNG 파일을 다시 선택해주세요.')); };
    img.src = source;
  });
  const factor = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
  // Float segmentation rows must be 16-byte aligned in affected MediaPipe WASM
  // builds (four float pixels). Search nearby multiples of four to preserve the
  // image aspect ratio rather than stretching a 717px-wide portrait to 720x960.
  const idealW = image.naturalWidth * factor, idealH = image.naturalHeight * factor;
  const ratio = image.naturalWidth / image.naturalHeight;
  let selectedW = Math.max(4, Math.round(idealW / 4) * 4);
  let selectedH = Math.max(4, Math.round(idealH / 4) * 4);
  let bestScore = Infinity;
  for (let w = Math.max(4, Math.floor((idealW - 16) / 4) * 4); w <= idealW + 16; w += 4) {
    const h = Math.max(4, Math.round(w / ratio / 4) * 4);
    const score = Math.abs(w / h / ratio - 1) * 1000
      + (Math.abs(w - idealW) + Math.abs(h - idealH)) / Math.max(idealW, idealH) * 0.01;
    if (score < bestScore) { bestScore = score; selectedW = w; selectedH = h; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = selectedW;
  canvas.height = selectedH;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('이 브라우저에서 사진을 분석할 수 없어요.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function observeImage(source: string, name: string): Promise<PhotoViewObservation> {
  const canvas = await loadCanvas(source);
  const detector = await getDetector();
  let observation: PhotoViewObservation | undefined;
  // Use the borrowed-result callback overload. Returning a PoseLandmarkerResult
  // forces the SDK to clone float masks; some WASM builds mishandle padded
  // float-mask rows in that clone path. Copy data inside the valid callback lifetime.
  detector.detect(canvas, result => {
    const landmarks = result.landmarks[0];
    const mask = result.segmentationMasks?.[0];
    if (!landmarks || !mask) throw new Error(name + ' 사진에서 전신을 찾지 못했어요. 정수리부터 발끝까지 보이게 다시 촬영해주세요.');
    const visible = [11, 12, 23, 24, 25, 26, 27, 28].map(i => landmarks[i].visibility ?? 0);
    if (median(visible) < 0.45) throw new Error(name + ' 사진에서 신체 지점을 충분히 찾지 못했어요. 가려지지 않은 전신 사진을 사용해주세요.');
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 31) hash = Math.imul(hash ^ pixels[i], 16777619);
    observation = observePhotoMask(new Float32Array(mask.getAsFloat32Array()), mask.width, mask.height,
      landmarks.map(l => ({ ...l })), canvas.width, canvas.height, (hash >>> 0).toString(16));
    let totalLuminance = 0, sampledPixels = 0;
    for (let i = 0; i < pixels.length; i += 128) {
      totalLuminance += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      sampledPixels++;
    }
    observation.meanLuminance = totalLuminance / Math.max(sampledPixels, 1);
  });
  if (!observation) throw new Error(name + ' 사진의 분석 결과를 받지 못했어요. 다시 시도해주세요.');
  if(name==='정면') await refineFrontChin(canvas,observation);
  return observation;
}
let observationCache: { front: string; side: string; promise: Promise<PhotoPairObservation> } | null = null;
export function inspectPhotoPair(input: { frontImage: string; sideImage: string }): Promise<PhotoPairObservation> {
  if (observationCache?.front === input.frontImage && observationCache.side === input.sideImage) return observationCache.promise;
  // detect() is synchronous; process sequentially because the detector owns reusable WASM buffers.
  const promise = (async () => ({
    front: await observeImage(input.frontImage, '정면'),
    side: await observeImage(input.sideImage, '측면'),
  }))().catch(error => { observationCache = null; throw error; });
  observationCache = { front: input.frontImage, side: input.sideImage, promise };
  return promise;
}

