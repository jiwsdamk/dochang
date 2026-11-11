/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BodyInputData, ClothingOptions, ModelMeshMeasurements } from './types/body';
import { analyzeBodyPhotos, SAMPLE_IMAGES, PRESET_PROFILES, BodyPreset } from './utils/photoAnalyzer';
import { ThreeFittingRoom } from './components/ThreeFittingRoom';
import { BiometricAnalysisOverlay } from './components/BiometricAnalysisOverlay';
import { VerificationPanel } from './components/VerificationPanel';
import { ClothingFittingModule } from './components/ClothingFittingModule';
import { SimilarBodyReviews } from './components/SimilarBodyReviews';
import { Box, Ruler, CheckCircle, Shirt, Users, Upload, Camera, LoaderCircle, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react';

type AnalysisResult = Awaited<ReturnType<typeof analyzeBodyPhotos>>;
type Tab = 'studio' | 'photo_analysis' | 'verification' | 'clothing' | 'reviews';
const tabs = [
  { id: 'studio', label: '3D 피팅룸', icon: Box },
  { id: 'photo_analysis', label: '사진 분석 근거', icon: Ruler },
  { id: 'verification', label: '치수·모델 비교', icon: CheckCircle },
  { id: 'clothing', label: '의류 조합', icon: Shirt },
  { id: 'reviews', label: '후기 예시', icon: Users },
] as const;
const initialInput: BodyInputData = {
  calibrationPart: 'height', calibrationValue: 178, height: 178,
  shoulderWidth: 46.5, chestCircumference: null, waistCircumference: 79,
  hipCircumference: null, inseam: null, armLength: null,
  headHeight: null, neckLength: null, upperArmGirth: null,
  thighCircumference: null, bellyProtrusion: 0, weight: null, gender: 'unisex',
  frontImage: SAMPLE_IMAGES.maleAthleticFront, sideImage: SAMPLE_IMAGES.maleAthleticSide,
  isSamplePhoto: true,
};
const measuredFields = [
  ['height', '키', true], ['shoulderWidth', '어깨너비', false],
  ['waistCircumference', '허리둘레', false], ['chestCircumference', '가슴둘레', false],
  ['hipCircumference', '엉덩이둘레', false], ['inseam', '안쪽 다리길이', false],
  ['armLength', '어깨~손목 길이', false], ['headHeight', '정수리~턱 길이', false],
  ['neckLength', '턱~어깨선 길이', false], ['upperArmGirth', '위팔둘레', false],
  ['thighCircumference', '허벅지둘레', false],
] as const;
const viewerHeight = 'h-[clamp(440px,72svh,600px)] lg:h-[760px]';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('studio');
  const [bodyInput, setBodyInput] = useState<BodyInputData>(initialInput);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modelMeasurements, setModelMeasurements] = useState<ModelMeshMeasurements | null>(null);
  const [showTapeMeasures, setShowTapeMeasures] = useState(false);
  const [clothingOptions, setClothingOptions] = useState<ClothingOptions>({
    topType: 'none', bottomType: 'none', fit: 'regular',
    topColor: '#334155', bottomColor: '#1e293b',
    alterations: { enabled: false, waistAdjustment: 0, hemShorten: 0, sleeveShorten: 0, shoulderSlim: 0 },
  });
  const requestId = useRef(0);
  const uploadedUrls = useRef<Set<string>>(new Set());
  const resultSectionRef = useRef<HTMLElement>(null);
  const scrollToResultRef = useRef(false);

  const runAnalysis = useCallback(async (input: BodyInputData, showResult = false) => {
    const id = ++requestId.current;
    setLoading(true); setError(''); setResult(null); setModelMeasurements(null);
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      if (!input.isSamplePhoto && (input.frontImage === SAMPLE_IMAGES.maleAthleticFront || input.sideImage === SAMPLE_IMAGES.maleAthleticSide)) {
        throw new Error('내 사진을 사용할 때는 같은 사람의 정면·측면 사진을 모두 올리고 실제 키를 입력해 주세요.');
      }
      const next = await analyzeBodyPhotos(input);
      if (id === requestId.current) {
        scrollToResultRef.current = showResult;
        setResult(next);
      }
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : '사진 분석에 실패했어요. 전신 사진 두 장을 확인하고 다시 시도해 주세요.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void runAnalysis(initialInput);
    return () => { requestId.current += 1; uploadedUrls.current.forEach(url => URL.revokeObjectURL(url)); };
  }, [runAnalysis]);

  useEffect(() => {
    if (result && scrollToResultRef.current) {
      scrollToResultRef.current = false;
      if (window.matchMedia('(max-width: 1023px)').matches) {
        resultSectionRef.current?.scrollIntoView({ block: 'start' });
      }
    }
  }, [result]);

  const changeInput = (patch: Partial<BodyInputData>) => {
    requestId.current += 1;
    setBodyInput(previous => ({ ...previous, ...patch }));
    setResult(null); setModelMeasurements(null); setLoading(false); setError('');
  };
  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>, view: 'front' | 'side') => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('JPG, PNG, WebP 사진을 선택해 주세요.'); return;
    }
    if (file.size > 15 * 1024 * 1024) { setError('사진 한 장은 15MB 이하로 선택해 주세요.'); return; }
    const url = URL.createObjectURL(file);
    uploadedUrls.current.add(url);
    const clearedSampleMeasurements = bodyInput.isSamplePhoto
      ? { ...Object.fromEntries(measuredFields.map(([key]) => [key, key === 'height' ? 0 : null])), calibrationValue: 0 }
      : {};
    changeInput({ ...clearedSampleMeasurements, [view === 'front' ? 'frontImage' : 'sideImage']: url, isSamplePhoto: false });
    event.target.value = '';
  };
  const applySample = (preset?: BodyPreset) => {
    const next: BodyInputData = { ...initialInput,
      frontImage: preset?.frontImage ?? initialInput.frontImage,
      sideImage: preset?.sideImage ?? initialInput.sideImage,
    };
    setBodyInput(next); setActiveTab('studio'); void runAnalysis(next, true);
  };
  const handleMeasurements = useCallback((next: ModelMeshMeasurements) => {
    setModelMeasurements(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);

  const analysis = result?.analysis;
  const dimensions = result?.dimensions;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="lg:sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-5 py-3 lg:py-4 flex flex-wrap gap-2 lg:gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500 text-slate-950"><Box size={22} /></div>
            <div><h1 className="font-bold text-lg">FitDimension 3D</h1><p className="text-[11px] text-slate-400">사진·실측 기반 체형 추정 시제품</p></div>
          </div>
          <nav className="flex gap-1 overflow-x-auto max-w-full" aria-label="기능">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} className={'flex gap-1.5 items-center whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors ' + (activeTab === id ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-400 hover:bg-slate-900')}>
                <Icon size={15} />{label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200 leading-relaxed">
          사진에서 관절과 인물 윤곽을 실제 검출해 체형을 추정합니다. 옷·가려짐·촬영 각도에 따른 오차가 있으며, 정밀 신체 스캔이나 착용감 검증을 완료한 서비스는 아닙니다.
          {bodyInput.isSamplePhoto && <span className="block text-amber-300 mt-1">내장 사진 시연 중 · 키 178cm / 어깨 46.5cm / 허리 79cm는 시연을 위한 가정값입니다.</span>}
        </div>
        {activeTab === 'studio' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div><h2 className="font-bold flex items-center gap-2"><Camera size={17} className="text-cyan-400" />내 사진과 실측값</h2><p className="text-xs text-slate-400 mt-2 leading-relaxed">발끝과 정수리가 보이게, 같은 사람이 정면·측면에서 촬영해 주세요. 몸에 가까운 복장과 팔·몸통 사이 간격이 있으면 분석에 도움이 됩니다.</p></div>
              <div className="grid grid-cols-2 gap-3">
                {(['front', 'side'] as const).map(view => (
                  <label key={view} className="block cursor-pointer group">
                    <span className="text-xs text-slate-300 mb-2 block">{view === 'front' ? '정면 전신 사진' : '측면 전신 사진'}</span>
                    <div className="h-52 xl:h-64 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden relative flex items-center justify-center">
                      <img src={view === 'front' ? bodyInput.frontImage : bodyInput.sideImage} alt={view === 'front' ? '정면 입력 사진' : '측면 입력 사진'} className="w-full h-full object-contain" />
                      <span className="absolute bottom-2 inset-x-2 py-1.5 text-center text-[11px] bg-slate-950/90 rounded-lg text-cyan-300 flex gap-1 justify-center items-center"><Upload size={12} />사진 변경</span>
                    </div>
                    <input aria-label={view === 'front' ? '정면 사진 업로드' : '측면 사진 업로드'} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => handleUpload(event, view)} />
                  </label>
                ))}
              </div>
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-semibold">직접 측정한 항목만 입력 <span className="text-slate-500 text-xs">cm</span></h3>
                <p className="text-xs text-slate-400 mt-1 mb-3">빈칸은 사진에서 추정합니다. 키는 사진의 크기 기준으로 사용합니다.</p>
                <div className="grid grid-cols-2 gap-3">
                  {measuredFields.filter((_, index) => index < 3 || showAdvanced).map(([key, label, required]) => (
                    <label key={key} className="text-xs text-slate-300">
                      <span className="block mb-1.5">{label}{required ? ' *' : ''}</span>
                      <input aria-label={label} type="number" min={key === 'height' ? 80 : 1} max={key === 'height' ? 240 : 220} step="0.1" placeholder={key === 'height' ? '실제 키 입력' : '사진에서 추정'} value={bodyInput[key] || ''} onChange={event => {
                        const value = event.target.value === '' ? null : Number(event.target.value);
                        changeInput(key === 'height' ? { height: value ?? 0, calibrationValue: value ?? 0, calibrationPart: 'height' } : { [key]: value });
                      }} className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 text-slate-100 focus:border-cyan-400 outline-none" />
                    </label>
                  ))}
                </div>
                <button onClick={() => setShowAdvanced(!showAdvanced)} className="mt-3 text-xs text-cyan-300">{showAdvanced ? '추가 실측 항목 접기' : '추가 실측값 입력하기 (선택)'}</button>
              </div>
              <div className="space-y-2">
                <button data-testid="analyze" disabled={loading} onClick={() => void runAnalysis(bodyInput, true)} className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-950 font-bold text-sm px-4 py-3 flex items-center justify-center gap-2">
                  {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Ruler size={18} />}{loading ? '사진 분석 중…' : '사진 분석·체형 생성'}
                </button>
                <button onClick={() => applySample(PRESET_PROFILES[0])} disabled={loading} className="w-full text-xs text-slate-400 py-2 hover:text-slate-100 flex items-center gap-2 justify-center"><RefreshCw size={13} />내장 사진으로 다시 체험</button>
                <p className="text-[11px] text-slate-500 leading-relaxed">사진은 이 브라우저에서 처리합니다. 서버 업로드나 API 키 입력 없이 분석하며, 사진을 자동으로 저장하지 않습니다.</p>
              </div>
              {error && <div role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-xs text-red-200 leading-relaxed"><AlertTriangle size={15} className="inline mr-1" />{error}</div>}
              {loading && <p role="status" className="text-xs text-cyan-200 leading-relaxed">처음에는 신체 검출 모델을 준비합니다. 사진 두 장의 관절·윤곽 분석이 끝나면 아바타가 나타납니다.</p>}
              {analysis && <p className="text-[11px] text-slate-400">분석한 원본 높이: 정면 {Math.round(analysis.frontPixelHeight)}px · 측면 {Math.round(analysis.sidePixelHeight)}px</p>}
            </section>
            <section ref={resultSectionRef} className="lg:col-span-8 min-w-0 scroll-mt-3">
              {dimensions ? (
                <>
                  <div className={viewerHeight}><ThreeFittingRoom dimensions={dimensions} clothingOptions={clothingOptions} showTapeMeasures={showTapeMeasures} onToggleTapeMeasures={() => setShowTapeMeasures(value => !value)} onModelMeasurementsUpdated={handleMeasurements} /></div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {[
                      ['몸통 / 다리', dimensions.torsoLength, dimensions.inseam],
                      ['위팔 / 아래팔 폭', dimensions.upperArmWidth, dimensions.forearmWidth],
                      ['허벅지 / 종아리 폭', dimensions.thighWidth, dimensions.calfWidth],
                      ['머리 / 목 길이', dimensions.headHeight, dimensions.neckLength],
                    ].map(([label, a, b]) => {
                      const first = a as typeof dimensions.height; const second = b as typeof dimensions.height;
                      return <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-xl p-3"><div className="text-[10px] text-slate-400 mb-1">{String(label)}</div><div className="text-sm font-mono font-semibold">{first.value.toFixed(1)} / {second.value.toFixed(1)} <span className="text-[10px] text-slate-500">cm</span></div><div className="text-[10px] text-slate-500 mt-1">{first.source === 'manual' && second.source === 'manual' ? '실측 기준' : '사진 추정 포함'}</div></div>;
                    })}
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-wrap justify-between items-center gap-3">
                    <p className="text-xs text-slate-400">수치 일치는 모델 구성 확인입니다. 실제 체형 재현 정확도와는 구분해 확인해 주세요.</p>
                    <button onClick={() => setActiveTab('photo_analysis')} className="text-xs text-cyan-300 flex gap-1 items-center">사진 분석 근거 보기<ChevronRight size={14} /></button>
                  </div>
                </>
              ) : <div className={viewerHeight + ' bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-7 text-center'}>
                {loading ? <LoaderCircle size={42} className="animate-spin text-cyan-400 mb-5" /> : <Box size={42} className="text-slate-500 mb-5" />}
                <h2 className="text-xl font-bold">{loading ? '사진 속 체형을 분석하고 있어요' : '사진 분석 후 아바타가 생성돼요'}</h2>
                <p className="mt-3 text-sm text-slate-400 max-w-md leading-relaxed">{error || '사진과 실측값을 확인한 뒤 왼쪽의 ‘사진 분석·체형 생성’을 눌러 주세요. 분석 전에는 기본 체형을 내 몸처럼 표시하지 않습니다.'}</p>
              </div>}
            </section>
          </div>
        ) : result ? (
          <>
            {activeTab === 'photo_analysis' && <BiometricAnalysisOverlay inputData={bodyInput} analysis={result.analysis} dimensions={result.dimensions} />}
            {activeTab === 'verification' && <VerificationPanel dimensions={result.dimensions} modelMeasurements={modelMeasurements} />}
            {activeTab === 'clothing' && <ClothingFittingModule clothingOptions={clothingOptions} onChangeOptions={setClothingOptions} dimensions={result.dimensions} />}
            {activeTab === 'reviews' && <><p className="mb-4 rounded-xl bg-amber-950/30 border border-amber-800 p-4 text-sm text-amber-200">이 영역은 시연용 후기 예시입니다. 실제 구매자 후기 수집과 AI 요약은 아직 연결하지 않았습니다.</p><SimilarBodyReviews dimensions={result.dimensions} /></>}
          </>
        ) : <div className="py-24 text-center text-slate-400"><p>{loading ? '사진 분석이 완료되면 이 기능을 확인할 수 있어요.' : '먼저 사진과 실측값을 적용해 주세요.'}</p><button onClick={() => setActiveTab('studio')} className="mt-4 text-cyan-300">사진 입력으로 돌아가기</button></div>}
      </main>
      <footer className="max-w-[1500px] mx-auto w-full px-6 pb-6 pt-3 text-[11px] text-slate-500 space-y-1">
        <p>주의·한계 1 · 사진·실측을 함께 써도 옷·자세·가려짐에 따라 실제 체형·착용감과 차이가 날 수 있어요.</p>
        <p>주의·한계 2 · 가상 의류 수정은 화면 속 비교이며 실제 판매 상품이 바뀌지 않아요. 후기 영역은 현재 시연용입니다.</p>
      </footer>
    </div>
  );
}
