/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Photographic estimation, not a validated body scanner.
 * Every automatic result below is calculated from a real MediaPipe observation.
 * Unobserved depth / occluded regions are explicitly marked as assumptions.
 */
import type {
  BodyInputData, CalculatedBodyDimensions, DimensionMetric, PhotoAnalysisResult,
  Keypoint2D, CalibrationReferencePart, DimensionSource,
} from '../types/body';
import { calculateRamanujanPerimeter, classifyBodyType } from './mathRamanujan';
import { inspectPhotoPair, type PhotoPairObservation, type PhotoViewObservation, type Span } from './photoObservation';
import { buildPhotoShape } from './photoShapeProfile';
import { frontSample, sideSample } from '../assets/samplePhotos';

export { inspectPhotoPair } from './photoObservation';
export type { PhotoPairObservation } from './photoObservation';

export const SAMPLE_IMAGES = { maleAthleticFront: frontSample, maleAthleticSide: sideSample };

export interface BodyPreset {
  id: string; label: string; gender: 'male' | 'female' | 'unisex';
  calibrationPart: CalibrationReferencePart; calibrationValue: number;
  height: number; weight: number | null; shoulderWidth: number | null;
  waistCircumference: number | null; headHeight: number | null; neckLength: number | null;
  upperArmGirth: number | null; thighCircumference: number | null;
  bellyProtrusion: number; inseam: number | null; frontImage: string; sideImage: string;
  description: string;
}

/** One photograph pair is one photographic example. No invented people/preset shapes. */
export const PRESET_PROFILES: BodyPreset[] = [{
  id: 'photo-example',
  label: '내장 사진 예시 · 키 178cm 가정',
  gender: 'unisex',
  calibrationPart: 'height', calibrationValue: 178, height: 178, weight: null,
  shoulderWidth: null, waistCircumference: null, headHeight: null, neckLength: null,
  upperArmGirth: null, thighCircumference: null, bellyProtrusion: 0, inseam: null,
  frontImage: frontSample, sideImage: sideSample,
  description: '첨부된 같은 정면·측면 사진을 실제 분석합니다. 178cm는 시연을 위한 기준값이며 인물의 검증된 실측이 아닙니다.',
}];

const round = (value: number) => Math.round(value * 10) / 10;
const validManual = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0;
const spanWidth = (span: Span) => span.right - span.left;
const pointAverage = (view: PhotoViewObservation, a: number, b: number) => ({
  x: (view.landmarks[a].x + view.landmarks[b].x) / 2,
  y: (view.landmarks[a].y + view.landmarks[b].y) / 2,
});
const context = '사진의 보이는 외곽을 이용한 추정입니다. 옷 아래 실제 신체 치수나 계측 정확도를 보장하지 않습니다.';

export function calculateBodyDimensions(input: BodyInputData, observations: PhotoPairObservation): {
  analysis: PhotoAnalysisResult; dimensions: CalculatedBodyDimensions;
} {
  if (!Number.isFinite(input.height) || input.height < 80 || input.height > 240) {
    throw new Error('실제 키를 cm 단위로 입력해주세요. 지원 범위는 80~240cm입니다.');
  }
  for (const name of ['shoulderWidth','chestCircumference','waistCircumference','hipCircumference','inseam','armLength','headHeight','neckLength','upperArmGirth','thighCircumference'] as const) {
    const value = input[name];
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      throw new Error('실측값은 양수로 입력하거나, 모르는 항목은 비워주세요.');
    }
  }
  const { front: f, side: s } = observations;
  const fHeightPx = f.bounds.bottom - f.bounds.top, sHeightPx = s.bounds.bottom - s.bounds.top;
  if (f.shoulderSpanPx / fHeightPx < 0.12) {
    throw new Error('정면 사진에서 양 어깨가 충분히 보이지 않아요. 카메라를 정면으로 바라본 전신 사진을 선택해주세요.');
  }
  if (Math.abs(s.landmarks[11].x - s.landmarks[12].x) * s.width / sHeightPx > 0.15) {
    throw new Error('측면 사진이 정면에 가까워 몸의 깊이를 계산할 수 없어요. 몸을 90도 돌린 옆모습 사진을 선택해주세요.');
  }
  const fs = input.height / fHeightPx, ss = input.height / sHeightPx;
  const warnings: PhotoAnalysisResult['quality']['occlusionWarnings'] = [];
  const caveats = [
    '사진의 관절·인물 분할은 실제 MediaPipe 모델이 수행합니다. 3D 신체 스캔 또는 학습된 개인별 신체 표면 복원 모델은 아닙니다.',
    '너비·길이는 사진 외곽과 투영 좌표의 추정이고, 둘레는 타원 단면 가정입니다. 원근·자세·옷·머리카락·신발로 오차가 생깁니다.',
    '사진이나 모델에서 표시하는 좌표 검출 신뢰도는 실제 신체 치수의 정확도가 아닙니다. 치수 정확도는 아직 검증되지 않았습니다.',
  ];
  warnings.push({
    part: '가슴·허리·골반 및 팔다리',
    reason: '사진에서 보이는 것은 옷을 포함한 바깥 윤곽입니다.',
    recommendation: '몸에 가까운 복장으로 촬영하고 계산에 사용하지 않은 추가 실측값과 비교해주세요.',
  });
  if (f.crotchDerived) warnings.push({
    part: '인심·상하체 비율',
    reason: '정면 윤곽에서 두 다리 사이 분기점을 분리하지 못해 골반·무릎 지점으로 위치를 추정했습니다.',
    recommendation: '다리 사이 배경이 보이도록 발을 조금 벌리거나 인심을 실측해 입력해주세요.',
  });
  if (f.chinSource !== 'face_landmark') warnings.push({
    part:'턱·머리·목 길이',
    reason:'얼굴 모델의 턱 지점을 얻지 못해 눈·입 위치 비례로 턱을 추정했습니다.',
    recommendation:'얼굴이 가려지지 않은 정면 사진 또는 머리·목 실측값으로 보완해주세요.',
  });
  const metrics: Record<string, DimensionMetric> = {};
  const add = (key: string, nameKo: string, value: number, source: DimensionSource, formula = '', pixels?: number, description = context) => {
    if (!Number.isFinite(value) || value <= 0 && key !== 'bellyProtrusion' && key !== 'shoulderSlopeDeg') {
      throw new Error(nameKo + '를 계산할 관측 정보가 부족합니다. 사진 자세와 추가 실측값을 확인해주세요.');
    }
    metrics[key] = {
      key, name: key, nameKo, value: round(value), source,
      // No validation dataset has established an anthropometric accuracy percentage.
      confidence: 0, formula, photoPixelObserved: pixels == null ? undefined : round(pixels), description,
    };
    return value;
  };
  const photo = (key: string, label: string, px: number, scale: number, source: DimensionSource = 'photo_extracted') =>
    add(key, label, px * scale, source, round(px) + 'px × ' + scale.toFixed(5) + 'cm/px', px);
  const manualOrPhoto = (key: string, label: string, inputValue: number | null, px: number, scale: number, source: DimensionSource = 'photo_extracted') =>
    validManual(inputValue)
      ? add(key, label, inputValue!, 'manual', '사용자가 입력한 기준 실측값', undefined, '사용자 입력값입니다. 앱이 측정 정확도를 검증하지는 않았습니다.')
      : photo(key, label, px, scale, source);

  add('height', '키', input.height, 'manual', input.height + 'cm ÷ ' + round(fHeightPx) + 'px = ' + fs.toFixed(5) + 'cm/px', fHeightPx);
  const headHeight = manualOrPhoto('headHeight', '머리 세로 길이', input.headHeight, f.chin.y - f.headTop.y, fs,
    f.chinSource==='face_landmark'?'photo_extracted':'anatomical_derived');
  const neckLength = manualOrPhoto('neckLength', '목 길이(턱~어깨 표면 기준)', input.neckLength, f.shoulder.y - f.chin.y, fs,
    f.chinSource==='face_landmark'?'photo_extracted':'anatomical_derived');
  const inseam = manualOrPhoto('inseam', '안쪽 다리 길이(접지면 기준)', input.inseam, f.bounds.bottom - f.crotch.y, fs,
    f.crotchDerived ? 'anatomical_derived' : 'photo_extracted');
  const torsoLength = input.height - headHeight - neckLength - inseam;
  if (torsoLength < input.height * 0.20 || torsoLength > input.height * 0.47 || neckLength > input.height * 0.10) {
    throw new Error('머리·목·몸통·다리 길이가 서로 맞지 않습니다. 사진의 자세와 입력한 키·인심·목 길이를 확인해주세요.');
  }
  add('torsoLength', '어깨~가랑이 몸통 길이', torsoLength,
    validManual(input.headHeight) || validManual(input.neckLength) || validManual(input.inseam) ? 'anatomical_derived' : 'photo_extracted',
    input.height + ' − 머리 ' + round(headHeight) + ' − 목 ' + round(neckLength) + ' − 인심 ' + round(inseam),
    f.crotch.y - f.shoulder.y);
  photo('headWidth', '머리 정면 너비', spanWidth(f.head), fs);
  manualOrPhoto('shoulderWidth', '어깨너비(관절점 기준)', input.shoulderWidth, f.shoulderSpanPx, fs);
  add('shoulderSlopeDeg', '목밑~어깨 표면 경사 추정', f.shoulderSlopeDeg, 'photo_extracted', '목의 좁은 윤곽 종료 높이와 어깨 위치의 상단 윤곽으로 계산', undefined,
    '사진상 목밑과 어깨 표면의 경사를 추정했습니다. 옷과 자세에 따라 달라질 수 있습니다.');

  const dimensionsPair = (
    key: string, ko: string, frontPx: number, sidePx: number,
    manualCircumference: number | null, fSource: DimensionSource = 'photo_extracted', sSource: DimensionSource = 'photo_extracted',
  ) => {
    let w = frontPx * fs, d = sidePx * ss;
    let perimeter = calculateRamanujanPerimeter(w, d);
    if (validManual(manualCircumference)) {
      const factor = manualCircumference! / perimeter;
      if (factor < 0.55 || factor > 1.7) {
        throw new Error(ko + ' 실측값과 사진 외곽의 차이가 너무 큽니다. cm 단위와 정면·측면 사진을 확인해주세요.');
      }
      w *= factor; d *= factor; perimeter = manualCircumference!;
    }
    const corrected = validManual(manualCircumference);
    const shapeSource: DimensionSource = corrected ? 'anatomical_derived' : fSource;
    const depthSource: DimensionSource = corrected ? 'anatomical_derived' : sSource;
    add(key + 'Width', ko + ' 정면 너비', w, shapeSource,
      corrected ? '사진 너비:깊이 비율을 유지하며 입력 둘레에 맞춰 보정' : round(frontPx) + 'px × ' + fs.toFixed(5),
      frontPx);
    add(key + 'Depth', ko + ' 측면 깊이', d, depthSource,
      corrected ? '사진 너비:깊이 비율을 유지하며 입력 둘레에 맞춰 보정' : round(sidePx) + 'px × ' + ss.toFixed(5),
      sidePx);
    const girthKey = key === 'neck' ? 'neckCircumference'
      : key === 'upperArm' ? 'upperArmGirth' : key === 'forearm' ? 'forearmGirth'
      : key === 'thigh' ? 'thighCircumference' : key === 'calf' ? 'calfCircumference'
      : key + 'Circumference';
    const girthSource: DimensionSource = corrected ? 'manual'
      : fSource === 'anatomical_derived' || sSource === 'anatomical_derived' ? 'anatomical_derived' : 'photo_ramanujan';
    add(girthKey, ko + '둘레', perimeter, girthSource,
      corrected ? '직접 입력한 둘레를 3D 단면의 기준으로 사용'
        : '사진 너비 ' + round(w) + 'cm와 깊이 ' + round(d) + 'cm를 타원 단면으로 가정해 계산');
    return { w, d, perimeter };
  };
  dimensionsPair('neck', '목', spanWidth(f.neck), spanWidth(s.neck), null);
  dimensionsPair('chest', '가슴', spanWidth(f.chest), spanWidth(s.chest), input.chestCircumference,
    f.chest.derived ? 'anatomical_derived' : 'photo_extracted', s.chest.derived ? 'anatomical_derived' : 'photo_extracted');
  dimensionsPair('waist', '허리', spanWidth(f.waist), spanWidth(s.waist), input.waistCircumference,
    f.waist.derived ? 'anatomical_derived' : 'photo_extracted', s.waist.derived ? 'anatomical_derived' : 'photo_extracted');
  dimensionsPair('hip', '엉덩이', spanWidth(f.hip), spanWidth(s.hip), input.hipCircumference,
    f.hip.derived ? 'anatomical_derived' : 'photo_extracted', s.hip.derived ? 'anatomical_derived' : 'photo_extracted');

  const limbPair = (key: 'upperArm' | 'forearm' | 'thigh' | 'calf', label: string, inputGirth: number | null) => {
    const front = f[key], side = s[key];
    // A profile arm lying on the torso cannot yield an independent arm depth.
    // Use a circular-section assumption from the visible front width and label it as derived.
    const missingSideDepth = side.source === 'anatomical_derived' || (key === 'upperArm' || key === 'forearm') && side.widthPx * ss > front.widthPx * fs * 1.45;
    const depthPx = missingSideDepth ? front.widthPx * fs / ss : side.widthPx;
    if (front.source === 'anatomical_derived' || missingSideDepth) warnings.push({
      part: label, reason: '몸통 또는 반대쪽 팔다리와 겹쳐 독립적인 단면 경계를 모두 확인할 수 없습니다.',
      recommendation: '보이는 외곽과 대칭/원형 단면 가정을 사용했습니다. 추가 실측 또는 팔을 벌린 사진으로 보완해주세요.',
    });
    return dimensionsPair(key, label, front.widthPx, depthPx, inputGirth, front.source, missingSideDepth ? 'anatomical_derived' : side.source);
  };
  limbPair('upperArm', '위팔', input.upperArmGirth);
  limbPair('forearm', '아래팔', null);
  limbPair('thigh', '허벅지', input.thighCircumference);
  limbPair('calf', '종아리', null);

  let upperArmLength = f.upperArm.lengthPx * fs, forearmLength = f.forearm.lengthPx * fs;
  if (validManual(input.armLength)) {
    const factor = input.armLength! / (upperArmLength + forearmLength);
    upperArmLength *= factor; forearmLength *= factor;
  }
  add('upperArmLength', '위팔 길이', upperArmLength, validManual(input.armLength) ? 'anatomical_derived' : 'photo_extracted',
    '어깨~팔꿈치 사진 거리' + (validManual(input.armLength) ? '를 전체 팔길이 실측으로 보정' : ' × 키 기준 스케일'), f.upperArm.lengthPx);
  add('forearmLength', '아래팔 길이', forearmLength, validManual(input.armLength) ? 'anatomical_derived' : 'photo_extracted',
    '팔꿈치~손목 사진 거리' + (validManual(input.armLength) ? '를 전체 팔길이 실측으로 보정' : ' × 키 기준 스케일'), f.forearm.lengthPx);
  add('armLength', '팔 길이(어깨~손목)', upperArmLength + forearmLength, validManual(input.armLength) ? 'manual' : 'photo_extracted',
    '위팔 길이 + 아래팔 길이');
  const kneeY = pointAverage(f, 25, 26).y * f.height;
  const legScale = inseam / Math.max(f.bounds.bottom - f.crotch.y, 1);
  photo('thighLength', '가랑이~무릎 길이', kneeY - f.crotch.y, legScale,
    validManual(input.inseam) || f.crotchDerived ? 'anatomical_derived' : 'photo_extracted');
  photo('calfLength', '무릎~발목 길이', f.ankleY - kneeY, legScale,
    validManual(input.inseam) ? 'anatomical_derived' : 'photo_extracted');

  const sideFront = (span: Span) => s.facing < 0 ? span.left : span.right;
  const tNavel = (s.navel.y - s.chest.y) / Math.max(s.hip.y - s.chest.y, 1);
  const baselineFront = sideFront(s.chest) * (1 - tNavel) + sideFront(s.hip) * tNavel;
  const bellyPhoto = Math.max(0, s.facing * (sideFront(s.navel) - baselineFront) * ss);
  add('bellyProtrusion', '사진상 복부 전방 곡률', input.bellyProtrusion > 0 ? input.bellyProtrusion : bellyPhoto,
    input.bellyProtrusion > 0 ? 'manual' : 'anatomical_derived',
    input.bellyProtrusion > 0 ? '직접 입력한 화면 보정값' : '측면 가슴~골반 전면 기준선 대비 복부 전면의 차이',
    Math.abs(sideFront(s.navel) - baselineFront),
    '옷과 팔의 가림이 포함될 수 있는 측면 윤곽 추정입니다. 복부의 실제 지방량이나 신체 상태를 판정하지 않습니다.');

  const fPoint = (name: string, label: string, point: {x:number;y:number}, visibility = 0): Keypoint2D => ({
    name, label, x: point.x / f.width, y: point.y / f.height, confidence: visibility,
  });
  const posePoint = (index: number, name: string, label: string): Keypoint2D => ({
    name, label, x: f.landmarks[index].x, y: f.landmarks[index].y,
    confidence: f.landmarks[index].visibility ?? 0,
  });
  const frontKeypoints: Record<string, Keypoint2D> = {
    headTop: fPoint('headTop','분할 윤곽 상단',f.headTop),
    chin: fPoint('chin',f.chinSource==='face_landmark'?'얼굴 모델 턱 지점':'눈·입 비례 턱 추정',f.chin),
    neck: fPoint('neck','목 윤곽 중심',{x:(f.neck.left+f.neck.right)/2,y:f.neck.y}),
    // Keep display left/right consistently ordered in image coordinates.
    leftShoulder: fPoint('leftShoulder','사진 왼쪽 어깨 표면 기준점',f.shoulderSurface[0].x<f.shoulderSurface[1].x?f.shoulderSurface[0]:f.shoulderSurface[1]),
    rightShoulder: fPoint('rightShoulder','사진 오른쪽 어깨 표면 기준점',f.shoulderSurface[0].x<f.shoulderSurface[1].x?f.shoulderSurface[1]:f.shoulderSurface[0]),
    leftElbow: posePoint(f.landmarks[13].x < f.landmarks[14].x ? 13 : 14,'leftElbow','사진 왼쪽 팔꿈치'),
    rightElbow: posePoint(f.landmarks[13].x < f.landmarks[14].x ? 14 : 13,'rightElbow','사진 오른쪽 팔꿈치'),
    leftWrist: posePoint(f.landmarks[15].x < f.landmarks[16].x ? 15 : 16,'leftWrist','사진 왼쪽 손목'),
    rightWrist: posePoint(f.landmarks[15].x < f.landmarks[16].x ? 16 : 15,'rightWrist','사진 오른쪽 손목'),
    leftHip: posePoint(f.landmarks[23].x < f.landmarks[24].x ? 23 : 24,'leftHip','사진 왼쪽 고관절'),
    rightHip: posePoint(f.landmarks[23].x < f.landmarks[24].x ? 24 : 23,'rightHip','사진 오른쪽 고관절'),
    leftKnee: posePoint(f.landmarks[25].x < f.landmarks[26].x ? 25 : 26,'leftKnee','사진 왼쪽 무릎'),
    rightKnee: posePoint(f.landmarks[25].x < f.landmarks[26].x ? 26 : 25,'rightKnee','사진 오른쪽 무릎'),
    leftAnkle: posePoint(f.landmarks[27].x < f.landmarks[28].x ? 27 : 28,'leftAnkle','사진 왼쪽 발목'),
    rightAnkle: posePoint(f.landmarks[27].x < f.landmarks[28].x ? 28 : 27,'rightAnkle','사진 오른쪽 발목'),
    crotch: fPoint('crotch',f.crotchDerived ? '다리 분기점 위치 추정'
      : f.crotchRefinedByPixels ? '정면 분할과 배경 색으로 확인한 다리 분기점' : '정면 윤곽에서 다리 사이가 갈라지는 지점',f.crotch),
    groundFoot: fPoint('groundFoot','분할 윤곽 접지면',{x:(f.bounds.left+f.bounds.right)/2,y:f.bounds.bottom}),
    navel: fPoint('navel','복부 관측 높이',{x:(f.navel.left+f.navel.right)/2,y:f.navel.y}),
  };
  for (const [name, span] of [['chest',f.chest],['waist',f.waist],['hip',f.hip]] as const) {
    frontKeypoints[name+'Left']=fPoint(name+'Left',name+' 왼쪽 관측 경계',{x:span.left,y:span.y});
    frontKeypoints[name+'Right']=fPoint(name+'Right',name+' 오른쪽 관측 경계',{x:span.right,y:span.y});
  }
  const sp = (name: string, label: string, x:number,y:number): Keypoint2D => ({
    name,label,x:x/s.width,y:y/s.height,confidence:0,
  });
  const sideBack = (span:Span) => s.facing < 0 ? span.right : span.left;
  const sideKeypoints: Record<string, Keypoint2D> = {
    headTop: sp('headTop','측면 윤곽 상단',s.headTop.x,s.headTop.y),
    chin: sp('chin','측면 턱~목 전환 추정',s.chin.x,s.chin.y),
    neckBack:sp('neckBack','측면 목 경계',sideBack(s.neck),s.neck.y),
    chestFront:sp('chestFront','측면 가슴 전면',sideFront(s.chest),s.chest.y),
    chestBack:sp('chestBack','측면 가슴 후면',sideBack(s.chest),s.chest.y),
    bellyFront:sp('bellyFront','측면 복부 전면',sideFront(s.navel),s.navel.y),
    waistBack:sp('waistBack','측면 허리 후면',sideBack(s.waist),s.waist.y),
    buttockBack:sp('buttockBack','측면 골반 후면',sideBack(s.hip),s.hip.y),
    hipFront:sp('hipFront','측면 골반 전면',sideFront(s.hip),s.hip.y),
    kneeSide:sp('kneeSide','측면 무릎',pointAverage(s,25,26).x*s.width,pointAverage(s,25,26).y*s.height),
    ankleSide:sp('ankleSide','측면 발목',pointAverage(s,27,28).x*s.width,s.ankleY),
    groundFoot:sp('groundFoot','측면 접지면',(s.bounds.left+s.bounds.right)/2,s.bounds.bottom),
  };

  const selectedRef = input.calibrationPart ?? 'height';
  const refLabels = {height:'키',inseam:'안쪽 다리 길이',head:'머리 세로 길이',shoulder:'어깨너비'};
  if (selectedRef !== 'height') warnings.push({
    part:'사진 스케일 기준',
    reason:'이 버전은 두 사진을 각각 입력한 키로 정규화합니다. 선택한 다른 실측 항목은 해당 부위 보정값으로 사용합니다.',
    recommendation:'다른 항목만으로 전신 키를 역산하는 기능으로 해석하지 마세요.',
  });
  const analysis: PhotoAnalysisResult = {
    frontImageWidth:f.width, frontImageHeight:f.height, sideImageWidth:s.width, sideImageHeight:s.height,
    method:'mediapipe_pose_silhouette', methodLabel:'MediaPipe 관절·인물 분할 + 사진 외곽 기반 추정',
    modelVersion:'pose_landmarker_full/float16/1 + face_landmarker/float16/1',
    observationId:f.fingerprint+':'+s.fingerprint,
    measurementCaveats:caveats,
    frontKeypoints,sideKeypoints,
    frontSilhouetteContour:f.contour, sideSilhouetteContour:s.contour,
    frontSlices:[['가슴',f.chest,s.chest],['허리',f.waist,s.waist],['골반',f.hip,s.hip]].map(([label,front,side]) => {
      const a=front as Span,b=side as Span;
      return {label:label as string,yNorm:a.y/f.height,widthNorm:spanWidth(a)/f.width,centerXNorm:(a.left+a.right)/2/f.width,depthNorm:spanWidth(b)/s.width,centerZNorm:(b.left+b.right)/2/s.width};
    }),
    frontPixelHeight:fHeightPx,sidePixelHeight:sHeightPx,frontScaleCmPerPx:fs,sideScaleCmPerPx:ss,
    calibrationSource:{part:'height',partNameKo:'키(각 사진 독립 스케일)',valueCm:input.height,pixelSpan:fHeightPx,formula:input.height+'cm ÷ 정면 몸높이 '+round(fHeightPx)+'px; 측면은 '+round(sHeightPx)+'px로 별도 계산'},
    quality:{
      frontTiltDeg:round(f.shoulderTiltDeg),sideTiltDeg:round(s.shoulderTiltDeg),
      symmetryScore:round(f.symmetry),lightingLevel:(f.meanLuminance??100)<55?'low':'acceptable',
      isPostureValid:f.shoulderTiltDeg<12,
      occlusionWarnings:warnings,
      notes:[
        '실제 사진 관절·분할 모델 추론 후 픽셀 관측값으로 계산했습니다. 체중이나 성별로 고정 신체를 생성하지 않습니다.',
        '목/가랑이 및 가슴·허리·골반 높이는 관절과 윤곽에 기반한 위치 추정입니다. 전문 계측 지점과 다를 수 있습니다.',
        ...caveats,
      ],
    },
  };
  const bodyType=classifyBodyType(metrics.shoulderWidth.value,metrics.chestCircumference.value,metrics.waistCircumference.value,metrics.hipCircumference.value,input.gender);
  const dimensions={
    ...metrics,
    torsoToLegRatio:round(torsoLength/inseam),headRatio:round(input.height/headHeight),bodyType,
    calculationSteps:Object.values(metrics).map(metric=>({
      target:metric.key,targetKo:metric.nameKo,
      type:metric.source==='manual'?'direct_input':metric.source==='photo_ramanujan'?'ramanujan_perimeter':metric.source==='anatomical_derived'?'anatomical_ratio':'calibrated_width',
      frontPxWidth:metric.photoPixelObserved,calculatedCm:metric.value,formulaUsed:metric.formula??'',sourceCategory:metric.source,
    })),
  } as CalculatedBodyDimensions;
  const photoShape = buildPhotoShape(observations, dimensions);
  if (photoShape) {
    dimensions.photoShape = photoShape;
    if ([...photoShape.arms, ...photoShape.legs].some(rows => rows.some(row => row.centerZCm !== undefined && row.depthCm === undefined))) {
      analysis.quality.notes.push('측면에서 겹친 팔다리는 깊이를 직접 관측할 수 없습니다. 앞뒤 위치는 보이는 쪽 관절을 기준으로 근사합니다.');
    }
  }
  return {analysis,dimensions};
}

export async function analyzeBodyPhotos(input: BodyInputData): Promise<{
  analysis: PhotoAnalysisResult; dimensions: CalculatedBodyDimensions;
}> {
  const observations=await inspectPhotoPair(input);
  return calculateBodyDimensions(input,observations);
}
