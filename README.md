# FitDimension 3D 수정본

사진을 읽지 않던 고정 비율 계산을 실제 사진 관절·윤곽 검출로 교체한 시제품입니다.

## 먼저 확인할 점

- 정면·측면 사진을 실제 MediaPipe 모델로 분석합니다. 분석이 실패하면 기본 아바타로 대체하지 않습니다.
- 보이는 윤곽에서 길이·너비를 추정하고, 측면 깊이와 타원 단면 가정으로 둘레를 추정합니다. 입력한 실측은 해당 부위의 기준으로 사용합니다.
- 이 버전은 정밀한 인체 스캔 또는 학습된 3D 신체 표면 복원 시스템이 아닙니다. 사진 속 몸과 완전히 동일한 3D 모델을 복원했다고 주장하지 않습니다.
- 얼굴 신원·근육·옷 아래 피부 표면·뒤쪽 형상을 복원하지 않습니다. 실제 신체 재현 정확도는 아직 검증되지 않았습니다.
- 후기 탭은 시연용 데이터입니다. 실제 후기 수집 및 AI 후기 요약은 연결하지 않았습니다.
- 내장 사진 인물의 실측은 알려져 있지 않습니다. 기본 키 178cm, 어깨 46.5cm, 허리 79cm는 시연용 가정값입니다.

## AI Studio에서 프로젝트 열기

1. PC에서 ZIP의 압축을 풀고 `package.json`이 보이는 폴더를 엽니다.
2. GitHub 저장소의 **Add file → Upload files** 화면에 그 폴더 안의 파일과 폴더를 함께 끌어 놓고 저장합니다. 업로드 목록에서 `src/main.tsx`와 `public/models/pose_landmarker_full.task`가 경로째 올라가는지 확인합니다.
3. 저장소 첫 화면에서 `package.json` 옆에 `src`, `public`, `scripts`, `tests`가 각각 보이는지 확인합니다. 필수 파일이 빠졌으면 실행과 빌드에서 누락된 경로를 표시합니다.
4. 새 앱은 AI Studio Build 입력창의 **＋ → Import from GitHub**에서 이 저장소를 선택합니다. 이 프로젝트와 연결된 앱을 갱신하려면 **Settings → GitHub**에서 변경 사항을 가져옵니다.
5. Preview에서 **내 사진과 실측값**과 **사진 분석·체형 생성**을 확인합니다. 예시 사진 분석이 끝나면 3D 피팅룸에서 정면과 측면을 확인할 수 있습니다.

[AI Studio 공식 안내](https://aistudio.google.com/docs/aistudio-build-mode)

중요하게 바뀐 파일:
- src/utils/photoObservation.ts: 실제 이미지 읽기, 관절 검출, 인물 분할, 윤곽 관측
- src/utils/photoAnalyzer.ts: 사진 관측값에서 치수 계산, 실측 보정, 추정 출처 기록
- src/components/AvatarGenerator.ts: 부위별 치수로 3D 형상 생성, 실제 기하에서 치수 재계산
- src/App.tsx: 비동기 분석, 실패 상태, 실측 입력, 분석 전 기본 아바타 제거
- src/components/BiometricAnalysisOverlay.tsx: 실제 관측 지점과 윤곽 표시
- src/components/VerificationPanel.tsx: 고정 정확도 수치 제거, 실제 차이 및 독립 실측 비교
- src/components/ThreeFittingRoom.tsx: 카메라·자동 회전·자원 정리 수정
- package.json, package-lock.json, public 폴더도 함께 반영해야 합니다.

## 내 컴퓨터에서 실행

Node.js 22.12 이상 또는 24 버전이 필요합니다. 이 수정본은 Node.js 24에서 검사했습니다.

압축을 푼 프로젝트 폴더에서 터미널을 열고 실행합니다.

    npm ci
    npm run dev

터미널에 나온 http://localhost:3000 주소를 브라우저에서 엽니다.
index.html을 직접 더블클릭하는 방식으로는 실행하지 않습니다.

신체 분석에는 Gemini API 키가 필요하지 않습니다. 사진 분석은 브라우저에서 수행하며, 앱이 사진을 서버에 업로드하지 않습니다.

배포 파일을 만드는 명령:

    npm run build
    npm run preview

## 사용 순서

1. 내장 사진 예시가 처음에 분석됩니다. 실제 사용 시 정면·측면 전신 사진을 교체합니다.
   내 사진을 처음 올리면 시연용 실측값이 모두 비워집니다. 정면·측면 두 장 모두 교체해야 내 사진 분석을 실행할 수 있습니다.
2. 실제 키를 입력합니다. 직접 측정한 다른 부위만 입력하고 모르는 항목은 비워 둡니다.
3. 사진 분석·체형 생성을 누릅니다.
4. 사진 분석 근거 탭에서 검출한 관절과 윤곽이 사진에 맞는지 확인합니다.
5. 치수·모델 비교 탭에서 계산값과 3D 기하의 차이를 확인합니다.
6. 계산에 입력하지 않은 추가 실측값으로 추정 오차를 별도로 확인합니다.

촬영은 전신이 보이도록, 정면과 측면에서 카메라를 수평으로 유지하고 몸에 가까운 복장으로 해 주세요. 팔과 몸통이 붙으면 팔 두께나 몸통 폭을 분리하기 어렵습니다. 사진의 신발·머리카락·원근·기울기는 오차를 일으킵니다.

## 분석 자원

아래 파일이 프로젝트에 포함되어 있어 실행 시 외부 CDN 다운로드가 필요하지 않습니다.

- public/models/pose_landmarker_full.task
- public/models/face_landmarker.task
- public/mediapipe/wasm/vision_wasm_internal.js
- public/mediapipe/wasm/vision_wasm_internal.wasm
- public/mediapipe/wasm/vision_wasm_module_internal.js
- public/mediapipe/wasm/vision_wasm_module_internal.wasm

자원이 빠졌다면 의존성 설치 후 다음 명령으로 준비할 수 있습니다.

    npm run prepare:vision

MediaPipe JS 패키지와 정적 WASM 자원은 같은 1.2.2 버전을 사용합니다. 패키지 버전만 올리지 마세요.

모델 출처:
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task

모델 SHA-256:
5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1

턱 위치 검출을 위한 Face Landmarker 모델 출처:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Face Landmarker 모델 SHA-256:
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff

Google MediaPipe 라이선스는 public/mediapipe/LICENSE에 포함했습니다.
공식 문서: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js

## 확인 명령

    npm run lint
    npm test
    npm run build

테스트는 사진의 합성 윤곽 입력에 대한 계산 동작, 이미지 크기 변경 시 길이 환산의 일관성, 실측과 모델 변형의 연결을 검사합니다. 단위 테스트 통과를 실제 사람의 신체 측정 정확도 검증으로 해석하지 마세요.

## 원본에서 확인한 문제

원본 analyzeBodyPhotos는 사진 픽셀을 읽지 않고 고정 좌표와 체중·성별로 치수를 생성했습니다. 화면의 분석 선과 점도 그 값으로 만들어졌습니다.

원본에는 100%, 99.8%, 최대 오차 0.2cm 같은 고정 문구와 입력값을 되돌려 주는 모델 측정값이 있었습니다. 이를 제거하고 실제 계산·기하 차이만 보여주도록 바꿨습니다.

원본 아바타는 팔 직경에 해당하는 값을 어깨 구의 반지름에 사용했고, 팔 부위 간 간격과 몸통의 열린 면 때문에 형태가 분리되어 보였습니다. 연결된 단면 기반 형상으로 변경했습니다.
