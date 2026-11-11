/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CalibrationReferencePart = 'height' | 'inseam' | 'head' | 'shoulder';

export type DimensionSource =
  | 'manual' // 사용자가 줄자로 직접 측정한 값
  | 'photo_extracted' // 사진 윤곽/지점에서 직접 계측한 값
  | 'photo_ramanujan' // 사진 너비·깊이 적분 둘레값
  | 'anatomical_derived'; // 가려짐 등으로 해부학적 비례로 보정한 값

export interface DimensionMetric {
  key: string;
  name: string;
  nameKo: string;
  value: number; // in cm (or degrees for angles)
  source: DimensionSource;
  confidence: number; // 0 to 100%
  description?: string;
  formula?: string;
  photoPixelObserved?: number; // 관측된 픽셀 수치
}

export interface BodyInputData {
  calibrationPart: CalibrationReferencePart;
  calibrationValue: number; // in cm

  // Direct user measurements (실측값 - null이면 사진에서 전면 추정)
  height: number; // 키 (cm)
  shoulderWidth: number | null; // 어깨너비 (cm)
  chestCircumference: number | null; // 가슴둘레 (cm)
  waistCircumference: number | null; // 허리둘레 (cm)
  hipCircumference: number | null; // 엉덩이둘레 (cm)
  inseam: number | null; // 안쪽 다리길이 (cm)
  armLength: number | null; // 팔길이 (cm)
  headHeight: number | null; // 머리 세로 길이 (cm)
  neckLength: number | null; // 목 길이 (cm)
  upperArmGirth: number | null; // 위팔 둘레 (cm)
  thighCircumference: number | null; // 허벅지 둘레 (cm)
  bellyProtrusion: number; // 복부 전방 돌출도 (cm, 0 = 평평, +2~+6 = 뱃살 돌출)
  weight: number | null; // 체중 (kg)
  gender: 'male' | 'female' | 'unisex';

  // Photos
  frontImage: string;
  sideImage: string;
  isSamplePhoto: boolean;
}

export interface Keypoint2D {
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
  name: string;
  label: string;
  confidence: number;
}

export interface SilhouetteSlice {
  yNorm: number;
  widthNorm: number;
  centerXNorm: number;
  depthNorm?: number;
  centerZNorm?: number;
  label: string;
}

export interface PhotoAnalysisResult {
  /** Actual analysis-canvas dimensions; landmark coordinates are normalized to these. */
  frontImageWidth?: number;
  frontImageHeight?: number;
  sideImageWidth?: number;
  sideImageHeight?: number;
  method?: 'mediapipe_pose_silhouette';
  methodLabel?: string;
  modelVersion?: string;
  observationId?: string;
  measurementCaveats?: string[];
  frontKeypoints: Record<string, Keypoint2D>;
  sideKeypoints: Record<string, Keypoint2D>;
  frontSilhouetteContour: Array<{ x: number; y: number }>;
  sideSilhouetteContour: Array<{ x: number; y: number }>;
  frontSlices: SilhouetteSlice[];
  frontPixelHeight: number;
  sidePixelHeight: number;
  frontScaleCmPerPx: number;
  sideScaleCmPerPx: number;
  calibrationSource: {
    part: CalibrationReferencePart;
    partNameKo: string;
    valueCm: number;
    pixelSpan: number;
    formula: string;
  };
  quality: {
    frontTiltDeg: number;
    sideTiltDeg: number;
    symmetryScore: number;
    lightingLevel: 'optimal' | 'acceptable' | 'low';
    isPostureValid: boolean;
    occlusionWarnings: Array<{
      part: string;
      reason: string;
      recommendation: string;
    }>;
    notes: string[];
  };
}

export interface CalculatedBodyDimensions {
  height: DimensionMetric;
  headHeight: DimensionMetric;
  headWidth: DimensionMetric;
  neckLength: DimensionMetric;
  neckCircumference: DimensionMetric;
  neckWidth: DimensionMetric;
  neckDepth: DimensionMetric;
  shoulderWidth: DimensionMetric;
  shoulderSlopeDeg: DimensionMetric; // 어깨 경사각 (도)
  torsoLength: DimensionMetric;
  torsoToLegRatio: number; // 몸통 대비 다리 비율
  chestWidth: DimensionMetric;
  chestDepth: DimensionMetric;
  chestCircumference: DimensionMetric;
  waistWidth: DimensionMetric;
  waistDepth: DimensionMetric;
  waistCircumference: DimensionMetric;
  bellyProtrusion: DimensionMetric; // 복부 전방 돌출도 (뱃살)
  hipWidth: DimensionMetric;
  hipDepth: DimensionMetric;
  hipCircumference: DimensionMetric;
  upperArmLength: DimensionMetric;
  upperArmWidth: DimensionMetric;
  upperArmDepth: DimensionMetric;
  upperArmGirth: DimensionMetric; // 위팔 둘레
  forearmLength: DimensionMetric;
  forearmWidth: DimensionMetric;
  forearmDepth: DimensionMetric;
  forearmGirth: DimensionMetric; // 아래팔 둘레
  thighLength: DimensionMetric;
  thighWidth: DimensionMetric;
  thighDepth: DimensionMetric;
  thighCircumference: DimensionMetric; // 허벅지 둘레
  calfLength: DimensionMetric;
  calfWidth: DimensionMetric;
  calfDepth: DimensionMetric;
  calfCircumference: DimensionMetric; // 종아리 둘레
  armLength: DimensionMetric;
  inseam: DimensionMetric;
  headRatio: number; // 등신비
  bodyType: '역삼각형(Athletic V)' | '모래시계형(Hourglass)' | '직사각형(Rectangle)' | '타원형(Oval)' | '사다리꼴(Trapezoid)' | '복부돌출형(Belly-prominent)';
  calculationSteps: Array<{
    target: string;
    targetKo: string;
    type: 'direct_input' | 'calibrated_width' | 'ramanujan_perimeter' | 'anatomical_ratio';
    frontPxWidth?: number;
    sidePxDepth?: number;
    calculatedCm: number;
    formulaUsed: string;
    sourceCategory: DimensionSource;
  }>;
}

export interface ModelMeshMeasurements {
  measuredHeight: number;
  measuredHeadHeight: number;
  measuredNeckLength: number;
  measuredNeckGirth: number;
  measuredShoulderWidth: number;
  measuredTorsoLength: number;
  measuredInseam: number;
  measuredChestCircumference: number;
  measuredWaistCircumference: number;
  measuredBellyProtrusion: number;
  measuredHipCircumference: number;
  measuredUpperArmGirth: number;
  measuredForearmGirth: number;
  measuredThighGirth: number;
  measuredCalfGirth: number;
  measuredArmLength: number;
}

export interface ClothingOptions {
  topType: 'none' | 'tshirt' | 'oxford_shirt' | 'blazer';
  bottomType: 'none' | 'tapered_slacks' | 'straight_denim' | 'wide_chinos';
  fit: 'slim' | 'regular' | 'oversized';
  topColor: string;
  bottomColor: string;
  alterations: {
    enabled: boolean;
    waistAdjustment: number;
    hemShorten: number;
    sleeveShorten: number;
    shoulderSlim: number;
  };
}

export interface SimilarReviewer {
  id: string;
  userName: string;
  height: number;
  weight: number;
  waist: number;
  shoulder: number;
  bodyType: string;
  purchasedItem: string;
  sizePurchased: string;
  rating: number;
  fitAssessment: '작게 나옴' | '정사이즈' | '여유있음';
  reviewText: string;
  photoUrl?: string;
  tags: string[];
}
