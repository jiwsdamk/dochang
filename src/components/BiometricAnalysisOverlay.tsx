/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BodyInputData, CalculatedBodyDimensions, DimensionMetric, DimensionSource, Keypoint2D, PhotoAnalysisResult } from '../types/body';
import { AlertTriangle, Camera, Eye, Ruler } from 'lucide-react';

interface BiometricAnalysisOverlayProps {
  inputData: BodyInputData;
  analysis: PhotoAnalysisResult;
  dimensions: CalculatedBodyDimensions;
  onModifyDimension?: (key: string, newValue: number) => void;
}

const sourceLabels: Record<DimensionSource, string> = {
  manual: '입력한 실측',
  photo_extracted: '사진 관측·환산',
  photo_ramanujan: '사진 폭·깊이로 추정',
  anatomical_derived: '비례 가정으로 추정',
};

const numberText = (value: number | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

function validPoint(point: Keypoint2D): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export const BiometricAnalysisOverlay: React.FC<BiometricAnalysisOverlayProps> = ({ inputData, analysis, dimensions }) => {
  const [showKeypoints, setShowKeypoints] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [photoSizes, setPhotoSizes] = useState<Record<string, { width: number; height: number }>>({});
  const metrics = Object.values(dimensions).filter((value): value is DimensionMetric =>
    Boolean(value && typeof value === 'object' && 'value' in value && 'source' in value && 'key' in value),
  );
  const counts = metrics.reduce((result, metric) => {
    result[metric.source] += 1;
    return result;
  }, { manual: 0, photo_extracted: 0, photo_ramanujan: 0, anatomical_derived: 0 } as Record<DimensionSource, number>);
  const imageMetadata = analysis as PhotoAnalysisResult & {
    frontImageWidth?: number; frontImageHeight?: number; sideImageWidth?: number; sideImageHeight?: number;
    method?: string;
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-300"><Camera className="h-4 w-4" />사진 분석 결과</div>
            <h2 className="text-lg font-bold text-white">사진에서 찾은 윤곽과 신체 지점</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">사진 위의 선과 점은 분석 결과입니다. 관절 위치와 옷을 포함한 외곽을 이용한 추정이며, 보이지 않는 피부 표면이나 실제 신체 치수를 정확히 측정했다는 의미는 아닙니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={showKeypoints} onClick={() => setShowKeypoints(!showKeypoints)} className={`rounded-lg border px-3 py-2 text-xs ${showKeypoints ? 'border-cyan-600 bg-cyan-950 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>관측 지점 {showKeypoints ? '표시' : '숨김'}</button>
            <button type="button" aria-pressed={showContours} onClick={() => setShowContours(!showContours)} className={`rounded-lg border px-3 py-2 text-xs ${showContours ? 'border-amber-600 bg-amber-950/40 text-amber-200' : 'border-slate-700 text-slate-400'}`}>윤곽 {showContours ? '표시' : '숨김'}</button>
          </div>
        </div>
        {inputData.isSamplePhoto && <p className="mt-3 text-xs text-amber-300">내장 예시 사진을 분석한 결과입니다. 예시 인물의 실제 신체 치수는 검증되지 않았습니다.</p>}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {(['front', 'side'] as const).map(view => {
          const src = view === 'front' ? inputData.frontImage : inputData.sideImage;
          const points = view === 'front' ? analysis.frontKeypoints : analysis.sideKeypoints;
          const contour = view === 'front' ? analysis.frontSilhouetteContour : analysis.sideSilhouetteContour;
          const size = photoSizes[src];
          const pixelBodyHeight = view === 'front' ? analysis.frontPixelHeight : analysis.sidePixelHeight;
          const scale = view === 'front' ? analysis.frontScaleCmPerPx : analysis.sideScaleCmPerPx;
          const canvasWidth = view === 'front' ? imageMetadata.frontImageWidth : imageMetadata.sideImageWidth;
          const canvasHeight = view === 'front' ? imageMetadata.frontImageHeight : imageMetadata.sideImageHeight;
          const visiblePoints = Object.entries(points || {}).filter(([, point]) => validPoint(point));
          const visibleContour = (contour || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
          return (
            <section key={view} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-100">{view === 'front' ? '정면 사진' : '측면 사진'}</h3>
                <span className="text-xs text-slate-400">{visiblePoints.length}개 지점 · {visibleContour.length}개 윤곽 좌표</span>
              </div>
              <div className="bg-slate-950 p-3">
                <div className="relative mx-auto w-full max-w-[540px]" style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
                  <img key={src} src={src} alt={view === 'front' ? '분석한 정면 전신 사진' : '분석한 측면 전신 사진'} className="block h-auto w-full rounded-lg" onLoad={event => {
                    const image = event.currentTarget;
                    setPhotoSizes(previous => ({ ...previous, [src]: { width: image.naturalWidth, height: image.naturalHeight } }));
                  }} />
                  {size && <svg aria-label="사진에서 추출한 신체 지점과 윤곽" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet">
                    {showContours && visibleContour.length > 1 && <polyline points={visibleContour.map(point => `${point.x * size.width},${point.y * size.height}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                    {showKeypoints && visiblePoints.map(([name, point]) => <g key={name}>
                      <circle cx={point.x * size.width} cy={point.y * size.height} r={Math.max(size.width / 150, 2)} fill="#22d3ee" stroke="#0f172a" strokeWidth="1" vectorEffect="non-scaling-stroke"><title>{point.label || point.name || name}</title></circle>
                    </g>)}
                  </svg>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-800 p-4 text-xs">
                <div><span className="text-slate-400">분석 이미지 크기</span><div className="mt-1 font-mono text-slate-200">{canvasWidth && canvasHeight ? `${canvasWidth} × ${canvasHeight} px` : '크기 정보 없음'}</div></div>
                <div><span className="text-slate-400">관측된 전신 높이</span><div className="mt-1 font-mono text-slate-200">{numberText(pixelBodyHeight, 0)} px</div></div>
                <div className="col-span-2"><span className="text-slate-400">기준 실측으로 길이 환산</span><div className="mt-1 font-mono text-cyan-300">1 px ≈ {numberText(scale, 4)} cm</div></div>
              </div>
            </section>
          );
        })}
      </div>

      {(analysis.quality.notes?.length > 0 || analysis.quality.occlusionWarnings?.length > 0) && <section className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200"><AlertTriangle className="h-4 w-4" />관측 조건과 추정 한계</h3>
        <ul className="space-y-2 text-xs leading-relaxed text-slate-300">
          {(analysis.quality.notes || []).map((note, index) => <li key={`note-${index}`}>• {note}</li>)}
          {(analysis.quality.occlusionWarnings || []).map((warning, index) => <li key={`warning-${index}`}><strong>{warning.part}</strong>: {warning.reason} {warning.recommendation}</li>)}
        </ul>
      </section>}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Ruler className="h-4 w-4 text-cyan-400" />치수별 근거</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">실측 입력 {counts.manual}개 · 사진 관측·환산 {counts.photo_extracted}개 · 사진 폭·깊이 추정 {counts.photo_ramanujan}개 · 비례 가정 {counts.anatomical_derived}개. 사진 기반 추정값의 실제 오차는 별도 실측으로 확인해 주세요.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[690px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-400"><tr>{['부위', '계산값', '값의 출처', '관측 픽셀', '계산 근거'].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{metrics.map(metric => <tr key={metric.key} className="border-b border-slate-800 last:border-0">
              <td className="px-3 py-3 font-medium text-slate-200">{metric.nameKo || metric.name || metric.key}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-cyan-300">{numberText(metric.value)} {metric === dimensions.shoulderSlopeDeg ? '°' : 'cm'}</td>
              <td className={`whitespace-nowrap px-3 py-3 ${metric.source === 'manual' ? 'text-blue-300' : metric.source === 'anatomical_derived' ? 'text-amber-300' : 'text-slate-300'}`}>{sourceLabels[metric.source] || '출처 없음'}</td>
              <td className="px-3 py-3 font-mono text-slate-300">{numberText(metric.photoPixelObserved)}{typeof metric.photoPixelObserved === 'number' ? ' px' : ''}</td>
              <td className="max-w-md px-3 py-3 leading-relaxed text-slate-400">{metric.formula || metric.description || '세부 계산식이 제공되지 않았습니다.'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-400"><Eye className="mt-0.5 h-4 w-4 shrink-0" />사진에 그린 윤곽과 지점은 관측 내용을 확인하기 위한 표시입니다. 이 화면 자체가 3D 모델과 사진의 정합이나 실제 신체 재현 정확도를 입증하지는 않습니다.</p>
    </div>
  );
};
