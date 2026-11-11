/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CalculatedBodyDimensions, DimensionMetric, DimensionSource, ModelMeshMeasurements } from '../types/body';
import { AlertTriangle, CheckCircle2, Info, Ruler, Scale } from 'lucide-react';

interface VerificationPanelProps {
  dimensions: CalculatedBodyDimensions;
  modelMeasurements: Partial<ModelMeshMeasurements> | null;
}

interface ComparisonMetric {
  key: keyof CalculatedBodyDimensions;
  modelKey: keyof ModelMeshMeasurements;
  name: string;
  allowZero?: boolean;
}

const comparisonMetrics: ComparisonMetric[] = [
  { key: 'height', modelKey: 'measuredHeight', name: '전신 높이' },
  { key: 'headHeight', modelKey: 'measuredHeadHeight', name: '머리 세로 길이' },
  { key: 'neckLength', modelKey: 'measuredNeckLength', name: '목 길이' },
  { key: 'neckCircumference', modelKey: 'measuredNeckGirth', name: '목 둘레' },
  { key: 'shoulderWidth', modelKey: 'measuredShoulderWidth', name: '어깨너비' },
  { key: 'torsoLength', modelKey: 'measuredTorsoLength', name: '몸통 길이' },
  { key: 'chestCircumference', modelKey: 'measuredChestCircumference', name: '가슴둘레' },
  { key: 'waistCircumference', modelKey: 'measuredWaistCircumference', name: '허리둘레' },
  { key: 'hipCircumference', modelKey: 'measuredHipCircumference', name: '엉덩이둘레' },
  { key: 'bellyProtrusion', modelKey: 'measuredBellyProtrusion', name: '복부 앞쪽 돌출량', allowZero: true },
  { key: 'upperArmGirth', modelKey: 'measuredUpperArmGirth', name: '위팔 둘레' },
  { key: 'forearmGirth', modelKey: 'measuredForearmGirth', name: '아래팔 둘레' },
  { key: 'thighCircumference', modelKey: 'measuredThighGirth', name: '허벅지 둘레' },
  { key: 'calfCircumference', modelKey: 'measuredCalfGirth', name: '종아리 둘레' },
  { key: 'inseam', modelKey: 'measuredInseam', name: '다리 안쪽길이' },
  { key: 'armLength', modelKey: 'measuredArmLength', name: '어깨부터 손목까지 길이' },
];

const sourceLabels: Record<DimensionSource, string> = {
  manual: '입력한 실측',
  photo_extracted: '사진 관측·환산',
  photo_ramanujan: '사진 폭·깊이 추정',
  anatomical_derived: '비례 가정',
};
const asNumber = (value: unknown, allowZero = false): number | null =>
  typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : null;
const text = (value: number | null) => value === null ? '미측정' : value.toFixed(1);

export const VerificationPanel: React.FC<VerificationPanelProps> = ({ dimensions, modelMeasurements }) => {
  const [blindMetricKey, setBlindMetricKey] = useState<keyof CalculatedBodyDimensions>('neckLength');
  const [blindValue, setBlindValue] = useState('');
  const [blindError, setBlindError] = useState('');
  const [blindResult, setBlindResult] = useState<{ name: string; predicted: number; observed: number; difference: number; source: DimensionSource } | null>(null);
  useEffect(() => {
    setBlindResult(null);
    setBlindError('');
  }, [dimensions]);

  const rows = comparisonMetrics.map(metric => {
    const dimension = dimensions[metric.key] as DimensionMetric;
    const target = asNumber(dimension?.value, metric.allowZero);
    const model = asNumber(modelMeasurements?.[metric.modelKey], metric.allowZero);
    return { ...metric, dimension, target, model, difference: target === null || model === null ? null : Math.abs(target - model) };
  });
  const measuredRows = rows.filter(row => row.difference !== null);
  const maxDifference = measuredRows.length ? Math.max(...measuredRows.map(row => row.difference!)) : null;
  const selectedMetric = comparisonMetrics.find(metric => metric.key === blindMetricKey)!;
  const selectedDimension = dimensions[blindMetricKey] as DimensionMetric;
  const usesInput = selectedDimension?.source === 'manual';

  function runIndependentComparison() {
    setBlindResult(null);
    setBlindError('');
    if (usesInput) {
      setBlindError('이 항목은 이미 모델 계산에 사용한 실측입니다. 계산에 넣지 않은 항목을 선택해 주세요.');
      return;
    }
    const observed = Number(blindValue);
    const predicted = asNumber(selectedDimension?.value, selectedMetric.allowZero);
    if (!blindValue.trim() || !Number.isFinite(observed) || observed < 0 || (!selectedMetric.allowZero && observed === 0)) {
      setBlindError('줄자로 측정한 값을 cm 단위의 유효한 숫자로 입력해 주세요.');
      return;
    }
    if (predicted === null) {
      setBlindError('이 부위의 추정값이 없어 비교할 수 없습니다.');
      return;
    }
    setBlindResult({ name: selectedMetric.name, predicted, observed, difference: Math.abs(predicted - observed), source: selectedDimension.source });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-300"><Ruler className="h-4 w-4" />계산과 3D 모델의 연결 점검</div>
            <h2 className="text-lg font-bold text-white">계산한 치수와 모델에서 반환한 치수 비교</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">이 표는 생성한 모델에 치수가 어떻게 반영됐는지 확인합니다. 두 값이 같아도 사진 속 실제 신체를 정확히 복원했다는 뜻은 아닙니다. 실제 재현 오차는 계산에 사용하지 않은 별도 실측과 비교해야 합니다.</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-xs">
            <div className="text-slate-300">측정값 반환 {measuredRows.length} / {rows.length}개</div>
            <div className="mt-1 font-mono text-cyan-300">최대 구성 차이 {maxDifference === null ? '미측정' : `${maxDifference.toFixed(1)} cm`}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">부위별 모델 구성 비교</h3>
        <p className="text-xs leading-relaxed text-slate-400">‘미측정’ 부위는 현재 모델의 치수를 확인할 수 없는 항목입니다. 이 비교는 정밀한 인체 스캔·원단 시뮬레이션 검증 결과가 아닙니다.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-400"><tr>{['부위', '기준 치수 (cm)', '기준의 출처', '모델 치수 (cm)', '절대 차이 (cm)'].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={String(row.key)} className="border-b border-slate-800 last:border-0">
              <td className="px-3 py-3 font-medium text-slate-200">{row.name}</td>
              <td className="px-3 py-3 font-mono text-slate-200">{text(row.target)}</td>
              <td className={`px-3 py-3 ${row.dimension?.source === 'manual' ? 'text-blue-300' : row.dimension?.source === 'anatomical_derived' ? 'text-amber-300' : 'text-slate-400'}`}>{sourceLabels[row.dimension?.source] || '출처 없음'}</td>
              <td className="px-3 py-3 font-mono text-cyan-300">{text(row.model)}</td>
              <td className="px-3 py-3 font-mono text-slate-300">{row.difference === null ? '비교 불가' : row.difference.toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Scale className="h-4 w-4 text-cyan-400" />계산에 넣지 않은 실측값으로 비교</h3>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">사진으로 추정한 부위를 줄자로 재어 비교해 주세요. 여기 입력한 값은 아바타 생성에 전달하지 않습니다. 한 사람·한 부위의 비교이며 전체 서비스의 정확도 백분율로 해석할 수 없습니다.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2 text-xs text-slate-300">비교할 부위
            <select value={String(blindMetricKey)} onChange={event => { setBlindMetricKey(event.target.value as keyof CalculatedBodyDimensions); setBlindResult(null); setBlindError(''); }} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100">
              {comparisonMetrics.map(metric => <option key={String(metric.key)} value={String(metric.key)}>{metric.name}{(dimensions[metric.key] as DimensionMetric).source === 'manual' ? ' (입력에 사용됨)' : ''}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs text-slate-300">별도로 측정한 값 (cm)
            <input type="number" min="0" step="0.1" value={blindValue} placeholder="측정한 값 입력" onChange={event => { setBlindValue(event.target.value); setBlindResult(null); setBlindError(''); }} className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" />
          </label>
          <button type="button" onClick={runIndependentComparison} disabled={usesInput} className="rounded-lg border border-cyan-600 bg-cyan-700 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500">별도 실측과 비교</button>
        </div>
        {usesInput && <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />선택한 부위는 이미 입력 실측을 사용했습니다. 같은 값을 다시 비교하면 독립적인 검증이 되지 않으므로 다른 부위를 선택해 주세요.</p>}
        {blindError && <p role="alert" className="mt-3 text-xs text-amber-300">{blindError}</p>}
        {!blindResult && !blindError && !usesInput && <p className="mt-4 text-xs text-slate-500">아직 비교를 실행하지 않았습니다.</p>}
        {blindResult && <div aria-live="polite" className="mt-5 rounded-lg border border-slate-700 bg-slate-950 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100"><CheckCircle2 className="h-4 w-4 text-cyan-400" />{blindResult.name} 비교 결과</p>
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            <div><span className="text-slate-400">현재 추정값</span><div className="mt-1 font-mono text-slate-100">{blindResult.predicted.toFixed(1)} cm</div></div>
            <div><span className="text-slate-400">별도로 입력한 실측</span><div className="mt-1 font-mono text-slate-100">{blindResult.observed.toFixed(1)} cm</div></div>
            <div><span className="text-slate-400">절대 차이</span><div className="mt-1 font-mono text-cyan-300">{blindResult.difference.toFixed(1)} cm</div></div>
          </div>
          {blindResult.source === 'anatomical_derived' && <p className="mt-3 text-xs text-amber-300">이 부위는 직접 관측이 어려워 비례 가정이 포함된 추정값입니다.</p>}
        </div>}
      </section>
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-400"><Info className="mt-0.5 h-4 w-4 shrink-0" />정확한 검증에는 동일한 부위와 측정 방법을 사용한 별도 실측 자료가 필요합니다. 원단에 따른 실제 착용감은 이 표에서 검증하지 않습니다.</p>
    </div>
  );
};
