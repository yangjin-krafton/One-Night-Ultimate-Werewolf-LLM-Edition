# 한밤의 늑대인간 LLM 에디션  
개발 상세 계획 TODO.md

---

## 0. 전체 진행 전략

- [ ] **1차 목표**:  
  - 한 방 / 한 서버에서  
    - 다수 스마트폰 접속  
    - 기본 역할(늑대/예언자/도둑/말썽꾼/주정뱅이/마을 등)  
    - 밤/낮/투표/결과까지 완주 가능한 버전
  - LLM/스토리/고급 연출은 2차 이후로 분리
- [ ] **우선 순위**:  
  1. 게임 상태머신 + 역할 로직 (서버)  
  2. 멀티 디바이스 접속 + 로비/플로우 UI  
  3. 호스트 TTS (Web Speech)  
  4. 스토리 테마/LLM 활용  

---

## 1. 프로젝트 초기 세팅

### 1.1 저장소/폴더 구조

- [ ] Git 저장소 생성
- [ ] 기본 폴더 구조 확정
  - [ ] `/server` – Node.js + TypeScript
  - [ ] `/client` – React + Vite
  - [ ] `/scripts` – LLM 스토리 생성 등 유틸 스크립트
  - [ ] `/docs` – 기획서, TODO, API 스펙 등

### 1.2 공통 개발 환경

- [ ] Node.js LTS 버전 선택 및 `.nvmrc` 작성
- [ ] 패키지 매니저 선택 (npm/yarn/pnpm) → 통일
- [ ] 공통 설정
  - [ ] `.editorconfig`
  - [ ] `.gitignore`
  - [ ] 코드 포맷: Prettier
  - [ ] Lint: ESLint (TS/React 공통 룰)

---

## 2. 서버 개발 (게임 로직 & 상태 관리)

### 2.1 서버 기본 세팅

- [ ] `/server` 초기화
  - [ ] `npm init` 또는 `pnpm init`
  - [ ] TypeScript 추가 (`tsconfig.json`)
  - [ ] Express 또는 Fastify 설치
  - [ ] Socket.io 서버 설치
- [ ] 기본 엔트리 파일
  - [ ] `src/index.ts` – HTTP + WebSocket 서버 기동
  - [ ] `.env` 기반 포트/환경 설정

### 2.2 도메인 모델 정의

- [ ] 타입/인터페이스 정의 파일 생성 `src/types/game.ts`
  - [ ] `Player` (id, nickname, isHost, connected, ...)
  - [ ] `RoleId` (union type)
  - [ ] `GamePhase` (LOBBY / ROLE_REVEAL / NIGHT_xxx / DAY / VOTING / RESULT)
  - [ ] `GameRoom` (roomId, players[], hostId, gameState, ...)
  - [ ] `GameState` (playerRoleMap, centerCards, logs, currentPhase, timers, ...)
- [ ] 이벤트 타입 정의 `src/types/events.ts`
  - [ ] 클라이언트 → 서버 액션: `join_room`, `start_game`, `night_action`, `vote`, ...
  - [ ] 서버 → 클라이언트 브로드캐스트: `room_update`, `phase_change`, `your_turn`, `action_result`, `vote_result`, ...

### 2.3 방/플레이어 관리

- [ ] `RoomManager` 구현 `src/core/RoomManager.ts`
  - [ ] 방 생성/삭제
  - [ ] 방 목록 조회
  - [ ] 방 입장/퇴장
- [ ] 플레이어 관리
  - [ ] 소켓 연결 시 playerId 부여
  - [ ] 닉네임 설정, 호스트 여부 표시
  - [ ] 연결 끊김 처리 (재접속 / 강제 종료 정책 결정)

### 2.4 게임 상태머신 (Phase 관리)

- [ ] `GameEngine` 구현 `src/core/GameEngine.ts`
  - [ ] `startGame(roomId)`
  - [ ] `assignRoles()`: 플레이어 수 + 3장 → 랜덤 배분
  - [ ] Phase 전이 함수:
    - [ ] `goToRoleReveal()`
    - [ ] `goToNightPhase()`
    - [ ] `goToDayDiscussion()`
    - [ ] `goToVoting()`
    - [ ] `goToResult()`
  - [ ] 각 Phase 시작 시:
    - [ ] 내부 상태 업데이트
    - [ ] 클라이언트에 `phase_change` 이벤트 브로드캐스트
    - [ ] 야간 역할 순서 큐 준비

### 2.5 역할별 야간 로직 구현

각 역할은 서버 기준으로만 카드/정보 조작:

- [ ] 공통 인터페이스 설계
  - [ ] `NightActionHandler` 인터페이스
    - `startPhase(roomId, gameState)`
    - `handleAction(roomId, playerId, payload)`
    - `finishPhase(roomId, gameState)`
- [ ] 역할별 구현
  - [ ] `SeerActionHandler`
    - 플레이어 1명 or 중앙 2장 선택
    - 선택 결과를 해당 예언자에게만 전달
  - [ ] `WerewolfActionHandler`
    - 늑대끼리 서로 정보 공유
    - 외로운 늑대 옵션 → 중앙 1장 정보 전달
  - [ ] `RobberActionHandler`
    - 대상 플레이어와 카드 교환
    - 도둑에게 새 역할 정보 전달
  - [ ] `TroublemakerActionHandler`
    - 플레이어 두 명의 카드 교환
    - 말썽꾼에게 결과 정보 미제공
  - [ ] `DrunkActionHandler`
    - 자신의 카드와 중앙 카드 교환
    - 결과 정보 미제공
  - [ ] `MasonActionHandler`
    - Mason들끼리 닉네임 목록 공유

### 2.6 낮/투표/결과 로직

- [ ] 낮 토론 시작
  - [ ] `phase = DAY_DISCUSSION`
  - [ ] 종료시각 timestamp 세팅
- [ ] 투표 로직
  - [ ] 각 플레이어의 투표값 수신
  - [ ] 투표 완료/타임아웃 처리
  - [ ] 최다 득표자 및 동률 처리
- [ ] 결과 계산
  - [ ] 최종 `playerRoleMap` + 헌터/탄너 등 반영
  - [ ] 승리 팀 계산
  - [ ] 최종 결과 데이터 생성 (각 플레이어의 최종 역할/팀)

### 2.7 유닛 테스트

- [ ] Jest 또는 Vitest 도입
- [ ] 핵심 테스트 작성
  - [ ] 역할별 야간 로직 (예언자/도둑/말썽꾼/주정뱅이 등)
  - [ ] 투표/결과 승리 조건 케이스
  - [ ] 소수/다인수 플레이어 수 시나리오

---

## 3. 클라이언트 개발 (공통)

### 3.1 기본 세팅

- [ ] `/client` 초기화
  - [ ] Vite + React + TypeScript 템플릿 사용
- [ ] 라우팅/페이지 구조 설계
  - [ ] `Main` – 방 만들기 / 방 목록
  - [ ] `Lobby` – 대기실
  - [ ] `RoleReveal` – 내 역할 확인
  - [ ] `Night` – 야간 행동 화면
  - [ ] `Day` – 낮 토론 화면
  - [ ] `Voting` – 투표 화면
  - [ ] `Result` – 결과 화면
- [ ] 상태관리
  - [ ] 최소한의 전역 상태 관리 (Zustand/Redux 등)
  - [ ] `useGameState` hook 설계

### 3.2 UI/디자인 기본

- [ ] 다크 테마 레이아웃
- [ ] 공통 컴포넌트
  - [ ] 버튼, 카드, 모달, 타이머, 플레이어 리스트
- [ ] 반응형 디자인
  - [ ] 스마트폰 기준 (세로 화면) 최우선
  - [ ] PC에서도 문제없이 표시되도록 최소 대응

---

## 4. 실시간 네트워크 & 멀티 디바이스

### 4.1 Socket 클라이언트

- [ ] Socket.io 클라이언트 설치
- [ ] 연결/재연결 처리
  - [ ] 연결 실패/재시도 UI
- [ ] 공통 이벤트 핸들러
  - [ ] `room_update`, `phase_change`, `your_turn`, `action_result`, `vote_result`
- [ ] 클라이언트 액션 → 서버 이벤트 래퍼
  - [ ] `emitJoinRoom`, `emitStartGame`, `emitNightAction`, `emitVote`, ...

### 4.2 방 생성/참여 플로우

- [ ] `방 만들기` 페이지
  - [ ] 닉네임/방 이름/최대 인원/역할 프리셋 입력
  - [ ] 서버에 방 생성 요청
  - [ ] 성공 시 Lobby 페이지로 이동
- [ ] `방 목록` 페이지
  - [ ] 현재 대기중 방 리스트 표시
  - [ ] 선택 후 닉네임 입력 → 방 입장

---

## 5. 게임 화면 구현

### 5.1 Lobby (대기실)

- [ ] 플레이어 리스트 UI
- [ ] 역할 프리셋 요약 표시
- [ ] 호스트:
  - [ ] 역할 구성 수정 UI
  - [ ] “게임 시작” 버튼
- [ ] 참여자:
  - [ ] “호스트가 게임을 시작할 때까지 기다려주세요” 메시지

### 5.2 역할 확인 화면

- [ ] 큰 카드 UI + 역할 이름/설명
- [ ] “길게 누르면 보기” 패턴
  - [ ] 기본은 블러 처리
  - [ ] 누르고 있는 동안만 선명 표시
- [ ] 일정 시간 후 자동 블러/숨김

### 5.3 밤 화면 (플레이어)

- [ ] 공통
  - [ ] “지금은 밤입니다. 방장 폰의 음성을 따라주세요.”
- [ ] 내 차례일 때(해당 역할일 때만)
  - [ ] 선택 UI 표시
    - [ ] 플레이어 리스트 선택
    - [ ] 중앙 카드 선택
  - [ ] “선택 후 확인/완료” 버튼
- [ ] 결과 표시
  - [ ] 확인할 수 있는 정보만 잠깐 노출
  - [ ] 길게 누르기 + 자동 숨김

### 5.4 낮/투표 화면

- [ ] 낮 화면
  - [ ] 토론 타이머
  - [ ] “토론 중입니다” 메시지
  - [ ] 로컬 메모 UI (서버 전송 X)
- [ ] 투표 화면
  - [ ] 플레이어 리스트 카드 선택
  - [ ] “투표 확정” 버튼
  - [ ] 투표 후 상태 표시 (“투표 완료”)

### 5.5 결과 화면

- [ ] 승리 팀 표시
- [ ] 플레이어별 최종 역할/팀
- [ ] (옵션) 밤 중 카드 이동 타임라인 간단 텍스트
- [ ] “다시 하기” 버튼

---

## 6. 호스트 TTS 구현

### 6.1 Web Speech API 래퍼

- [ ] `useTTS` hook 또는 `tts.ts` 유틸 작성
  - [ ] `tts.init()` – 브라우저 지원 여부 체크
  - [ ] `tts.speak(text, options?)`
  - [ ] `tts.playScript(script)` – segments 배열 재생
- [ ] 속성:
  - [ ] `lang: "ko-KR"`
  - [ ] `rate`, `pitch` 옵션화

### 6.2 호스트 디바이스 처리

- [ ] 호스트 클라이언트에서만 TTS 활성
  - [ ] 서버에서 `isHost` 정보 내려줌
- [ ] 게임 시작 전 “음성 테스트” 버튼
  - [ ] 사용자가 버튼 클릭 → TTS 한 번 재생
  - [ ] 자동재생 제한 해제용

### 6.3 스크립트와 Phase 연동

- [ ] Phase 변경 시:
  - [ ] 해당 Phase에 대응하는 스크립트 배열에서 하나 선택
  - [ ] 호스트 클라이언트에서 `tts.playScript()` 호출

---

## 7. LLM/스토리 스크립트 파이프라인 (2차 이후)

### 7.1 데이터 포맷 확정

- [ ] `/docs/story_schema.json` 작성
  - [ ] `theme`
  - [ ] `nightIntro[]`, `roleScripts[]`, `dayIntro[]`, `votingIntro[]`, `resultScripts[]`
  - [ ] 각 항목은 `segments[]` (text + pauseMs)

### 7.2 LLM 프롬프트 설계

- [ ] 프롬프트 초안 작성 (한국어)
  - [ ] 테마 설명
  - [ ] 역할 소개
  - [ ] 출력 형식(JSON) 요구

### 7.3 스토리 생성 스크립트

- [ ] `/scripts/generateStories.ts`
  - [ ] LLM API 호출 (필요 시)
  - [ ] 결과 검증/포맷 체크
  - [ ] `/server/data/stories_*.json` 파일로 저장

### 7.4 클라이언트/서버에서 스토리 로딩

- [ ] 서버 기동 시 스토리 JSON 로드
- [ ] 방 생성 시 테마 선택 → 방에 테마 정보 저장
- [ ] Phase별로 해당 테마의 대사 중 랜덤 선택

---

## 8. QA & 사내 테스트 준비

### 8.1 기본 QA 체크리스트

- [ ] 최소/최대 인원(3인/10인) 케이스
- [ ] 각 역할별 조합 몇 가지 테스트
- [ ] 네트워크 끊김/재접속 시나리오
- [ ] 모바일 기기별 TTS 동작 (Android/iOS)

### 8.2 사내 테스트 버전

- [ ] 서버 실행 스크립트
  - [ ] `npm run server`
- [ ] 클라이언트 빌드/호스팅
  - [ ] `npm run client`
- [ ] 간단 가이드 문서 `/docs/how_to_play_internal.md`
  - [ ] 접속 방법 (서버 IP)
  - [ ] 권장 인원/역할 조합
  - [ ] TTS 테스트 방법

---

## 9. 향후 확장 TODO (선택)

- [ ] 하이브리드 앱(Capacitor) 포팅 및 네이티브 TTS 연동
- [ ] 온디바이스 경량 한국어 TTS 실험(WebAssembly)
- [ ] 토론 로그 → LLM 요약/분석 기능
- [ ] 플레이 리플레이 뷰어 (카드 이동/투표 타임라인 시각화)
- [ ] 다른 확장팩 역할 추가 (Daybreak 등)

---
