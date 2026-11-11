/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ramanujan's Second Approximation for the perimeter of an ellipse:
 * a = semi-major axis (width / 2)
 * b = semi-minor axis (depth / 2)
 * h = (a - b)^2 / (a + b)^2
 * P ≈ π (a + b) * [ 1 + (3h) / (10 + sqrt(4 - 3h)) ]
 */
export function calculateRamanujanPerimeter(widthCm: number, depthCm: number, anatomicalFactor = 1.0): number {
  if (widthCm <= 0 || depthCm <= 0) return 0;

  const a = Math.max(widthCm, depthCm) / 2;
  const b = Math.min(widthCm, depthCm) / 2;

  if (a === b) {
    return Number((2 * Math.PI * a * anatomicalFactor).toFixed(1));
  }

  const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
  const approximation = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

  return Number((approximation * anatomicalFactor).toFixed(1));
}

/**
 * Calculates pixel-to-metric ratio based on full body height
 * scale = actualHeightCm / pixelHeight
 */
export function calculatePixelScale(actualHeightCm: number, pixelHeight: number): number {
  if (pixelHeight <= 0) return 0.25;
  return actualHeightCm / pixelHeight;
}

/**
 * Classifies body shape based on shoulder, waist, and hip proportions
 */
export function classifyBodyType(
  shoulderWidth: number,
  chestCircumference: number,
  waistCircumference: number,
  hipCircumference: number,
  gender: 'male' | 'female' | 'unisex'
): '역삼각형(Athletic V)' | '모래시계형(Hourglass)' | '직사각형(Rectangle)' | '타원형(Oval)' | '사다리꼴(Trapezoid)' {
  const waistToHipRatio = waistCircumference / Math.max(hipCircumference, 1);
  const shoulderToWaistRatio = (shoulderWidth * 2.2) / Math.max(waistCircumference, 1);

  if (gender === 'female') {
    if (waistToHipRatio < 0.75 && Math.abs(chestCircumference - hipCircumference) < 6) {
      return '모래시계형(Hourglass)';
    }
    if (waistToHipRatio < 0.8 && hipCircumference > chestCircumference + 5) {
      return '사다리꼴(Trapezoid)';
    }
  }

  if (shoulderToWaistRatio > 1.25 || chestCircumference > waistCircumference + 14) {
    return '역삼각형(Athletic V)';
  }

  if (waistCircumference > chestCircumference && waistCircumference > hipCircumference) {
    return '타원형(Oval)';
  }

  return '직사각형(Rectangle)';
}

/**
 * Calculate similarity score between two body profiles
 */
export function calculateBodySimilarity(
  target: { height: number; waist: number; shoulder: number },
  candidate: { height: number; waist: number; shoulder: number }
): number {
  const deltaHeight = Math.abs(target.height - candidate.height);
  const deltaWaist = Math.abs(target.waist - candidate.waist);
  const deltaShoulder = Math.abs(target.shoulder - candidate.shoulder);

  const penalty = deltaHeight * 1.8 + deltaWaist * 2.5 + deltaShoulder * 2.2;
  const score = Math.max(50, Math.min(99, 100 - penalty));
  return Number(score.toFixed(0));
}
