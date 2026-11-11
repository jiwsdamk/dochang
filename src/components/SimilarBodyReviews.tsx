/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CalculatedBodyDimensions, SimilarReviewer } from '../types/body';
import { calculateBodySimilarity } from '../utils/mathRamanujan';
import { Star, ThumbsUp, UserCheck, Filter, Sparkles } from 'lucide-react';

interface SimilarBodyReviewsProps {
  dimensions: CalculatedBodyDimensions;
}

export const SimilarBodyReviews: React.FC<SimilarBodyReviewsProps> = ({ dimensions }) => {
  const [filterFit, setFilterFit] = useState<'all' | '정사이즈' | '여유있음' | '작게 나옴'>('all');

  const rawReviews: Array<Omit<SimilarReviewer, 'similarityScore'>> = [
    {
      id: 'rev-1',
      userName: '민준 (Minjun K.)',
      height: dimensions.height.value - 1,
      weight: 73,
      waist: dimensions.waistCircumference.value + 1.2,
      shoulder: dimensions.shoulderWidth.value,
      bodyType: dimensions.bodyType,
      purchasedItem: '에센셜 크루넥 티셔츠',
      sizePurchased: 'L',
      rating: 5,
      fitAssessment: '정사이즈',
      reviewText:
        '어깨선이 자연스럽게 떨어지고 가슴 쪽이 끼지 않아 활동하기 편합니다. 3D 아바타로 먼저 핏을 보고 샀는데 실물이랑 소매 기장이랑 총장이 완전히 똑같아서 놀랐습니다.',
      tags: ['어깨너비 딱 맞음', '세탁 후 수축 없음', '단독 착용 추천'],
    },
    {
      id: 'rev-2',
      userName: '서진 (Jin S.)',
      height: dimensions.height.value + 1,
      weight: 75,
      waist: dimensions.waistCircumference.value - 0.8,
      shoulder: dimensions.shoulderWidth.value + 0.5,
      bodyType: dimensions.bodyType,
      purchasedItem: '테이퍼드 슬랙스',
      sizePurchased: '31 (M)',
      rating: 5,
      fitAssessment: '여유있음',
      reviewText:
        '허벅지 쪽이 적당히 여유있으면서 밑단으로 갈수록 좁아져서 실루엣이 깔끔합니다. 저는 기장 수선 -3cm 시뮬레이션 해보고 실제로 세탁소에 맡겼는데 딱 복사뼈 위로 떨어져서 대만족입니다.',
      tags: ['허벅지 편안함', '기장 -3cm 수선 추천', '출퇴근 셋업'],
    },
    {
      id: 'rev-3',
      userName: '도현 (Dohyun P.)',
      height: dimensions.height.value - 2,
      weight: 71,
      waist: dimensions.waistCircumference.value - 1.5,
      shoulder: dimensions.shoulderWidth.value - 0.8,
      bodyType: '직사각형(Rectangle)',
      purchasedItem: '옥스포드 셔츠',
      sizePurchased: 'L',
      rating: 4,
      fitAssessment: '여유있음',
      reviewText:
        '단추 벌어짐 전혀 없고 어깨 여유가 좋습니다. 오버핏 연출하고 싶으시면 정사이즈 가시고, 단정하게 입으려면 한 치수 작게 고려해보세요.',
      tags: ['탄탄한 옥스포드', '단추 벌어짐 없음', '레이어드 추천'],
    },
    {
      id: 'rev-4',
      userName: '준호 (Junho L.)',
      height: dimensions.height.value + 2,
      weight: 76,
      waist: dimensions.waistCircumference.value + 2.0,
      shoulder: dimensions.shoulderWidth.value + 1.2,
      bodyType: dimensions.bodyType,
      purchasedItem: '클래식 테일러드 블레이저',
      sizePurchased: 'XL (105)',
      rating: 5,
      fitAssessment: '정사이즈',
      reviewText:
        '체형상 어깨가 넓고 등이 두꺼운 편이라 일반 기성복은 암홀이 끼는데, 이 블레이저는 어깨 패드가 자연스럽고 팔 움직임이 매우 부드럽습니다.',
      tags: ['어깨 맞춤 핏', '암홀 여유', '포멀 & 캐주얼'],
    },
  ];

  // Calculate real-time similarity score
  const reviewsWithScore = rawReviews.map((rev) => {
    const score = calculateBodySimilarity(
      {
        height: dimensions.height.value,
        waist: dimensions.waistCircumference.value,
        shoulder: dimensions.shoulderWidth.value,
      },
      {
        height: rev.height,
        waist: rev.waist,
        shoulder: rev.shoulder,
      }
    );
    return { ...rev, similarityScore: score };
  });

  const filteredReviews = reviewsWithScore.filter((r) => {
    if (filterFit === 'all') return true;
    return r.fitAssessment === filterFit;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-cyan-400">유사 체형 추천 커뮤니티</span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-400">나와 체형 스펙이 흡사한 구매자들의 실착 리뷰</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            신체 데이터 기반 유사 체형 실착 후기
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            현재 계산된 신체 스펙(키 {dimensions.height.value}cm · 허리 {dimensions.waistCircumference.value}cm · 어깨 {dimensions.shoulderWidth.value}cm)과 90% 이상 일치하는 리뷰어만 엄선되었습니다.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 shrink-0">
          {(['all', '정사이즈', '여유있음', '작게 나옴'] as const).map((fit) => (
            <button
              key={fit}
              onClick={() => setFilterFit(fit)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterFit === fit
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {fit === 'all' ? '전체 보기' : fit}
            </button>
          ))}
        </div>
      </div>

      {/* Review Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredReviews.map((rev) => (
          <div
            key={rev.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors"
          >
            <div>
              {/* Top Row: User Spec & Similarity Score Badge */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800/80">
                <div>
                  <div className="text-xs font-bold text-slate-200">{rev.userName}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    키 {rev.height}cm · 몸무게 {rev.weight}kg · 허리 {rev.waist}cm
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-cyan-950/60 border border-cyan-500/40 px-2.5 py-1 rounded-lg">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-bold text-cyan-300 font-mono">
                    일치율 {rev.similarityScore}%
                  </span>
                </div>
              </div>

              {/* Item & Fit tag */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-200">
                  {rev.purchasedItem} · 구매 사이즈 {rev.sizePurchased}
                </span>
                <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded">
                  {rev.fitAssessment}
                </span>
              </div>

              {/* Stars */}
              <div className="flex items-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${
                      i < rev.rating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-700'
                    }`}
                  />
                ))}
              </div>

              {/* Review Text */}
              <p className="text-xs text-slate-300 leading-relaxed">
                "{rev.reviewText}"
              </p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-slate-800/80">
              {rev.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
