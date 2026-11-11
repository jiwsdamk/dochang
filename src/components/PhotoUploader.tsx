/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BodyInputData, CalibrationReferencePart } from '../types/body';
import { PRESET_PROFILES, BodyPreset } from '../utils/photoAnalyzer';
import { Camera, HelpCircle, Check, Sparkles, Sliders, ShieldCheck } from 'lucide-react';

interface PhotoUploaderProps {
  inputData: BodyInputData;
  onChangeInputData: (data: BodyInputData) => void;
  onRunAnalysis: () => void;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  inputData,
  onChangeInputData,
  onRunAnalysis,
}) => {
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('male-standard-athletic');

  const handleApplyPreset = (preset: BodyPreset) => {
    setSelectedPresetId(preset.id);
    onChangeInputData({
      ...inputData,
      calibrationPart: preset.calibrationPart,
      calibrationValue: preset.calibrationValue,
      height: preset.height,
      weight: preset.weight,
      gender: preset.gender,
      shoulderWidth: preset.shoulderWidth,
      waistCircumference: preset.waistCircumference,
      headHeight: preset.headHeight,
      neckLength: preset.neckLength,
      bellyProtrusion: preset.bellyProtrusion,
      frontImage: preset.frontImage,
      sideImage: preset.sideImage,
      isSamplePhoto: true,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'side') => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onChangeInputData({
        ...inputData,
        [type === 'front' ? 'frontImage' : 'sideImage']: url,
        isSamplePhoto: false,
      });
    }
  };

  const calibrationOptions: Array<{ id: CalibrationReferencePart; label: string; desc: string }> = [
    { id: 'height', label: '전신 신장(키)', desc: '정수리~발바닥 기준' },
    { id: 'inseam', label: '다리 안쪽길이(인심)', desc: '가랑이~발바닥 기준' },
    { id: 'head', label: '머리 세로 길이', desc: '정수리~턱 끝 기준' },
    { id: 'shoulder', label: '어깨너비', desc: '좌우 견봉점 기준' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-cyan-400">사진 기반 전신 역산 캘리브레이션</span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-400">실측값 1개만 있어도 신체 모든 부위를 사진 비율로 정밀 환산</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            사진 및 기준 실측값 입력 (목길이, 뱃살, 팔다리 1:1 일치)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            "사진 속 이 사이즈면 실제로는 이 사이즈다" 원리로, 제공된 기준 실측(키 or 다리길이 or 머리크기)을 통해 사진 속 복부 튀어나옴(뱃살), 목 길이, 머리 크기까지 3D 모델에 정확히 일치시킵니다.
          </p>
        </div>

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-semibold text-slate-200 transition-colors shrink-0"
        >
          <Camera className="w-4 h-4 text-cyan-400" />
          <span>{showGuide ? '촬영 가이드 닫기' : '정확한 촬영 가이드 보기'}</span>
        </button>
      </div>

      {/* Guide Card */}
      {showGuide && (
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-5">
          <h3 className="text-sm font-bold text-cyan-300 mb-2 flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            정확한 신체 치수 계산을 위한 전신 촬영 가이드
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-3 text-xs text-slate-300">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">01. 바른 차렷 A-포즈</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                양팔을 옆구리에서 15~20도 살짝 벌려 겨드랑이와 팔의 윤곽선을 명확히 분리해주세요.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">02. 정확한 90° 측면(복부 굴곡)</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                측면 사진은 복부 돌출도(뱃살)와 가슴/엉덩이 깊이를 측정합니다. 팔을 살짝 앞으로 두어 허리선이 가려지지 않게 하세요.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">03. 배꼽 높이 수평 앵글</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                카메라를 바닥에서 약 1m(배꼽 높이)에 두고 2.5m 거리에서 수평으로 촬영해야 원근 왜곡이 없습니다.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">04. 밀착 의류 권장</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                목 길이와 복부 실루엣이 분명하게 보이도록 이너웨어 또는 피트니스웨어를 착용해주세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preset Fast Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            체형별 샘플 프리셋 (복부 돌출 뱃살형 / 긴 목 슬림형 등 즉시 테스트)
          </span>
          <span className="text-[11px] text-slate-400">
            원하는 체형을 누르면 사진과 3D 아바타가 즉시 갱신됩니다
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {PRESET_PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => handleApplyPreset(p)}
              className={`p-3.5 rounded-lg text-left border transition-all ${
                selectedPresetId === p.id
                  ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{p.label}</span>
                {selectedPresetId === p.id && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Universal Calibration Reference Picker */}
      <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            스케일 환산의 기준이 될 실측 부위 선택 (Calibration Base)
          </span>
          <span className="text-[11px] text-slate-400">
            실측한 부위 1개를 고르면, 나머지 모든 부위는 사진에서 1:1 역산됩니다
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
          {calibrationOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onChangeInputData({ ...inputData, calibrationPart: opt.id })}
              className={`p-3 rounded-lg text-left border transition-all ${
                inputData.calibrationPart === opt.id
                  ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-slate-200">{opt.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Selected Reference Value Input */}
        <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-300 font-semibold">
            선택된 기준 실측값 (
            {inputData.calibrationPart === 'height'
              ? '전신 신장'
              : inputData.calibrationPart === 'inseam'
              ? '다리 길이(인심)'
              : inputData.calibrationPart === 'head'
              ? '머리 크기'
              : '어깨너비'}
            ):
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={
                inputData.calibrationPart === 'height'
                  ? inputData.height
                  : inputData.calibrationPart === 'inseam'
                  ? inputData.inseam || 82
                  : inputData.calibrationPart === 'head'
                  ? inputData.headHeight || 24
                  : inputData.shoulderWidth || 46
              }
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                if (inputData.calibrationPart === 'height') {
                  onChangeInputData({ ...inputData, height: val, calibrationValue: val });
                } else if (inputData.calibrationPart === 'inseam') {
                  onChangeInputData({ ...inputData, inseam: val, calibrationValue: val });
                } else if (inputData.calibrationPart === 'head') {
                  onChangeInputData({ ...inputData, headHeight: val, calibrationValue: val });
                } else if (inputData.calibrationPart === 'shoulder') {
                  onChangeInputData({ ...inputData, shoulderWidth: val, calibrationValue: val });
                }
              }}
              className="w-24 bg-slate-900 border border-cyan-500/50 text-cyan-300 font-mono text-center text-sm font-bold rounded px-2 py-1 focus:outline-none"
            />
            <span className="text-xs text-slate-400 font-mono">cm</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Photos Upload (6 cols), Right Anatomical Tuning Sliders (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Photos Column */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-3 block">
              정면 & 측면 전신 사진 (2장)
            </span>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">정면 사진 (너비·목·머리)</span>
                  <label className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer font-medium">
                    사진 교체
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'front')} />
                  </label>
                </div>
                <div className="aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 relative group flex items-center justify-center">
                  <img src={inputData.frontImage} alt="정면 사진" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <label className="px-3 py-1.5 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 cursor-pointer">
                      직접 업로드
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'front')} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">측면 사진 (복부 돌출·깊이)</span>
                  <label className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer font-medium">
                    사진 교체
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'side')} />
                  </label>
                </div>
                <div className="aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 relative group flex items-center justify-center">
                  <img src={inputData.sideImage} alt="측면 사진" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <label className="px-3 py-1.5 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 cursor-pointer">
                      직접 업로드
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'side')} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg text-[11px] text-slate-400">
            정면에서는 머리 크기, 목 길이, 어깨, 골반 너비를 감지하고, 측면에서는 복부 전방 튀어나옴(뱃살)과 흉곽/둔부 깊이를 감지합니다.
          </div>
        </div>

        {/* Anatomical Parameters Column */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-3 block">
              신체 세부 체형 정밀 조정 (뱃살, 목길이, 머리크기 등)
            </span>

            <div className="space-y-4">
              {/* 1. Belly Protrusion Slider (복부 돌출 / 뱃살) */}
              <div className="p-3 bg-slate-950/80 border border-amber-500/40 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-amber-300">복부 전방 돌출도 (뱃살 튀어나옴)</span>
                  <span className="font-mono text-amber-400 font-bold">
                    +{inputData.bellyProtrusion} cm (
                    {inputData.bellyProtrusion <= 0.8
                      ? '평평한 복부'
                      : inputData.bellyProtrusion <= 2.5
                      ? '약간의 아랫배'
                      : '확연한 복부 돌출'}
                    )
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6.0"
                  step="0.2"
                  value={inputData.bellyProtrusion}
                  onChange={(e) =>
                    onChangeInputData({ ...inputData, bellyProtrusion: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>0cm (플랫)</span>
                  <span>+3cm (중간 뱃살)</span>
                  <span>+6cm (볼록한 배)</span>
                </div>
              </div>

              {/* 2. Neck Length Slider (목 길이) */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-200">목 길이 (턱 끝~쇄골선)</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {inputData.neckLength ?? 9.8} cm
                  </span>
                </div>
                <input
                  type="range"
                  min="7.0"
                  max="14.0"
                  step="0.2"
                  value={inputData.neckLength ?? 9.8}
                  onChange={(e) =>
                    onChangeInputData({ ...inputData, neckLength: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>7cm (짧고 굵은 목)</span>
                  <span>10cm (표준)</span>
                  <span>14cm (긴 사슴목)</span>
                </div>
              </div>

              {/* 3. Head Height Slider (머리 세로 크기) */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-200">머리 세로 크기 (정수리~턱 끝)</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {inputData.headHeight ?? 23.8} cm
                  </span>
                </div>
                <input
                  type="range"
                  min="20.0"
                  max="28.0"
                  step="0.2"
                  value={inputData.headHeight ?? 23.8}
                  onChange={(e) =>
                    onChangeInputData({ ...inputData, headHeight: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>20cm (소두/8등신 이상)</span>
                  <span>24cm (표준 7.5등신)</span>
                  <span>28cm (대두)</span>
                </div>
              </div>

              {/* 4. Shoulder & Waist inputs */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400 font-medium">어깨너비 (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="사진 자동 계산"
                    value={inputData.shoulderWidth ?? ''}
                    onChange={(e) =>
                      onChangeInputData({
                        ...inputData,
                        shoulderWidth: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full mt-1 bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-medium">허리둘레 (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="사진 자동 계산"
                    value={inputData.waistCircumference ?? ''}
                    onChange={(e) =>
                      onChangeInputData({
                        ...inputData,
                        waistCircumference: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full mt-1 bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1.5 text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              * 조정 시 3D 피팅룸의 뱃살과 목길이가 실시간 반영됩니다
            </span>
            <button
              onClick={onRunAnalysis}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              <span>전신 1:1 체형 계산 & 3D 아바타 적용</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
