/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClothingOptions, CalculatedBodyDimensions } from '../types/body';
import { Scissors, Sparkles, SlidersHorizontal, Check, Shirt } from 'lucide-react';

interface ClothingFittingModuleProps {
  clothingOptions: ClothingOptions;
  onChangeOptions: (newOptions: ClothingOptions) => void;
  dimensions: CalculatedBodyDimensions;
}

export const ClothingFittingModule: React.FC<ClothingFittingModuleProps> = ({
  clothingOptions,
  onChangeOptions,
  dimensions,
}) => {
  const topItems = [
    { id: 'tshirt', name: '에센셜 크루넥 티셔츠', sub: '20수 코마사 코튼' },
    { id: 'oxford_shirt', name: '옥스포드 셔츠', sub: '릴랙스 버튼다운' },
    { id: 'blazer', name: '클래식 테일러드 블레이저', sub: '울 블렌드 싱글' },
    { id: 'none', name: '상의 미착용', sub: '신체 랜드마크 확인' },
  ];

  const bottomItems = [
    { id: 'tapered_slacks', name: '테이퍼드 슬랙스', sub: '스판 블렌드 원단' },
    { id: 'straight_denim', name: '스트레이트 린스 데님', sub: '13oz 셀비지' },
    { id: 'wide_chinos', name: '원턱 와이드 치노', sub: '헤비 코튼 트윌' },
    { id: 'none', name: '하의 미착용', sub: '하체 랜드마크 확인' },
  ];

  const colorSwatches = [
    { label: '네이비', value: '#1e3a8a' },
    { label: '차콜', value: '#334155' },
    { label: '블랙', value: '#0f172a' },
    { label: '화이트', value: '#f8fafc' },
    { label: '스카이블루', value: '#38bdf8' },
    { label: '올리브', value: '#365314' },
    { label: '샌드베이지', value: '#d97706' },
  ];

  const handleUpdate = (partial: Partial<ClothingOptions>) => {
    onChangeOptions({
      ...clothingOptions,
      ...partial,
    });
  };

  const handleAlterationUpdate = (key: string, value: number | boolean) => {
    onChangeOptions({
      ...clothingOptions,
      alterations: {
        ...clothingOptions.alterations,
        [key]: value,
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-cyan-400">의류 피팅 & 상하의 조합</span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-400">3D 아바타 위 의류 형태 예시</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            가상 착용 및 수선(기장·품) 전후 비교
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            추정 치수(어깨 {dimensions.shoulderWidth.value}cm / 허리 {dimensions.waistCircumference.value}cm / 인심 {dimensions.inseam.value}cm)를 기준으로 간단한 의류 형태를 표시합니다. 선택한 조합은 3D 피팅룸 탭에서 확인하세요.
          </p>
        </div>

        {/* Fit Mode Toggle Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 shrink-0">
          {(['slim', 'regular', 'oversized'] as const).map((fitMode) => (
            <button
              key={fitMode}
              onClick={() => handleUpdate({ fit: fitMode })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                clothingOptions.fit === fitMode
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {fitMode === 'slim' ? '슬림핏' : fitMode === 'regular' ? '레귤러핏' : '오버핏'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Tops & Bottoms Selector (Left 6 cols), Alteration Studio (Right 6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Clothing Selector (6 cols) */}
        <div className="lg:col-span-6 flex flex-col gap-5 bg-slate-900 border border-slate-800 rounded-xl p-5">
          {/* Tops Section */}
          <div>
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              상의 선택 (Top)
            </span>
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              {topItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleUpdate({ topType: item.id as any })}
                  className={`p-3 rounded-lg text-left border transition-all ${
                    clothingOptions.topType === item.id
                      ? 'bg-cyan-950/40 border-cyan-500/80 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-200">{item.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.sub}</div>
                </button>
              ))}
            </div>

            {/* Top Color Selection */}
            {clothingOptions.topType !== 'none' && (
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400">컬러:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {colorSwatches.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => handleUpdate({ topColor: c.value })}
                      style={{ backgroundColor: c.value }}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        clothingOptions.topColor === c.value
                          ? 'border-white scale-125 shadow-md'
                          : 'border-slate-700 hover:scale-110'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottoms Section */}
          <div className="pt-3 border-t border-slate-800">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              하의 선택 (Bottom)
            </span>
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              {bottomItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleUpdate({ bottomType: item.id as any })}
                  className={`p-3 rounded-lg text-left border transition-all ${
                    clothingOptions.bottomType === item.id
                      ? 'bg-cyan-950/40 border-cyan-500/80 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-200">{item.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.sub}</div>
                </button>
              ))}
            </div>

            {/* Bottom Color Selection */}
            {clothingOptions.bottomType !== 'none' && (
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400">컬러:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {colorSwatches.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => handleUpdate({ bottomColor: c.value })}
                      style={{ backgroundColor: c.value }}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        clothingOptions.bottomColor === c.value
                          ? 'border-white scale-125 shadow-md'
                          : 'border-slate-700 hover:scale-110'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Tailoring & Alteration Studio (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-200">
                  의류 수선 편집 스튜디오 (Alteration)
                </h3>
              </div>

              {/* Before / After Toggle Button */}
              <button
                onClick={() =>
                  handleAlterationUpdate('enabled', !clothingOptions.alterations.enabled)
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  clothingOptions.alterations.enabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                <span>수선 적용 {clothingOptions.alterations.enabled ? 'ON (수선 후)' : 'OFF (수선 전)'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              기장과 품을 바꾸어 3D 피팅룸에서 전후 형태를 비교하세요. 실제 판매 상품의 패턴·원단 물성이나 착용감을 검증한 결과는 아닙니다.
            </p>

            <div className="space-y-5">
              {/* 바지 기장 수선 Slider */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-200">하의 바지 기장 수선</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {clothingOptions.alterations.hemShorten} cm (
                    {clothingOptions.alterations.hemShorten === 0
                      ? '기본 기장'
                      : `${Math.abs(clothingOptions.alterations.hemShorten)}cm 숏컷/크롭`}
                    )
                  </span>
                </div>
                <input
                  type="range"
                  min="-8"
                  max="0"
                  step="1"
                  value={clothingOptions.alterations.hemShorten}
                  onChange={(e) => handleAlterationUpdate('hemShorten', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>-8cm (발목 크롭)</span>
                  <span>-4cm (복사뼈)</span>
                  <span>0cm (신발 닿음)</span>
                </div>
              </div>

              {/* 허리둘레 수선 Slider */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-200">허리 품 수선 (줄임 / 늘림)</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {clothingOptions.alterations.waistAdjustment > 0 ? '+' : ''}
                    {clothingOptions.alterations.waistAdjustment} cm
                  </span>
                </div>
                <input
                  type="range"
                  min="-4"
                  max="4"
                  step="1"
                  value={clothingOptions.alterations.waistAdjustment}
                  onChange={(e) =>
                    handleAlterationUpdate('waistAdjustment', parseInt(e.target.value))
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>-4cm (허리 타이트)</span>
                  <span>0cm (기본 둘레)</span>
                  <span>+4cm (허리 여유)</span>
                </div>
              </div>

              {/* 상의 소매 기장 수선 Slider */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-200">상의 소매 기장 수선</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {clothingOptions.alterations.sleeveShorten} cm
                  </span>
                </div>
                <input
                  type="range"
                  min="-6"
                  max="0"
                  step="1"
                  value={clothingOptions.alterations.sleeveShorten}
                  onChange={(e) =>
                    handleAlterationUpdate('sleeveShorten', parseInt(e.target.value))
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>-6cm (손목 노출)</span>
                  <span>-3cm (시계 보임)</span>
                  <span>0cm (정장 표준)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reset Alterations Button */}
          <div className="pt-4 border-t border-slate-800 mt-4 flex justify-end">
            <button
              onClick={() => {
                onChangeOptions({
                  ...clothingOptions,
                  alterations: {
                    enabled: false,
                    waistAdjustment: 0,
                    hemShorten: 0,
                    sleeveShorten: 0,
                    shoulderSlim: 0,
                  },
                });
              }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              수선 수치 기본값 리셋
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
