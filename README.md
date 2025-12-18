# 한밤의 늑대인간 LLM 에디션  
사내 웹/모바일 보드게임 기획서 (최종본)

---

## 1. 프로젝트 개요

### 1.1 프로젝트명
- **프로젝트명**: 한밤의 늑대인간 LLM 에디션
- **영문명**: One Night Ultimate Werewolf – LLM Edition
- **용도**: 사내용 파티게임 + LLM/실시간 웹/TTS 데모 프로젝트

### 1.2 목표
- 사내망 환경에서 **로컬 PC 한 대에 서버**를 띄우고,
- 구성원들이 **각자 스마트폰(웹 브라우저)** 으로 접속해 즐기는 디지털 버전의 *한밤의 늑대인간* 구현.
- 기존 오프라인 진행 + 공식 앱 사회자를 대체/강화:
  - **역할 랜덤 배정 & 카드 조작/교환 로직** 자동화
  - **밤/낮/투표 단계 관리 및 타이머** 자동 제어
  - **방장(호스트) 휴대폰에서 TTS 안내 방송** 재생
- LLM은:
  - 기획/코딩/데이터/스토리 대사 생성에 적극 활용하되,
  - 실제 런타임 의존도는 낮게 (오프라인 스토리 스크립트 중심).

---

## 1.3 현재 구현 상태

> 현재 레포에는 실제 서버/클라이언트 코드가 구현되어 있음. Python FastAPI 서버 + 정적 HTML/JS 클라이언트로 MVP 버전 완성.  
> 목표: **스마트폰 브라우저에서 접속 → 대기 그리드 → 호스트 시나리오 선택 → 게임 시작 → 페이즈 진행(밤/낮/투표/결과)**까지 "동작하는 최소 버전" 완성됨.

### 완료된 기능 요약

- [x] **서버 구축 및 단순화**: Python FastAPI + WebSocket으로 단일 프로세스 서버 구현, 단일 방 메모리 상태 유지
- [x] **프로젝트 구조**: `server/` (FastAPI), `public/` (정적 파일), `scenarios/` (JSON), `requirements.txt` 및 실행 스크립트
- [x] **서버 상태 모델**: RoomState, Player 클래스, 페이즈 관리, WebSocket 이벤트 처리
- [x] **게임 로직**: 시나리오 로딩, 플레이어 수에 따른 변형 선택, 페이즈 전환 타이머, 투표 처리
- [x] **클라이언트 구조**: 정적 HTML/JS, WebSocket 연결, UI 렌더링, 게임 진행 UI
- [x] **오디오 시스템**: 호스트 TTS/나레이션 재생, BGM 랜덤 오프셋 및 페이드 인/아웃
- [x] **UI/UX 디자인**: CSS 변수, 페이즈별 그라데이션, 카드 그리드, 모달, 모바일 최적화

### 미완료된 기능

- [ ] 역할별 밤 행동 UI (MVP 범위 외)
- [ ] 고급 게임 모드 (다중 방, 로그인 등)
- [ ] 추가 시나리오 및 음성 파일

### 현재 코드 구현 상황 검토

#### 서버 (server/main.py)
- [x] FastAPI 앱 초기화 및 WebSocket 엔드포인트 설정
- [x] 정적 파일 서빙 (`public/` 디렉토리)
- [x] 시나리오 로딩 및 API 제공 (`/api/scenarios`)
- [x] 게임 상태 관리 (RoomState, Player)
- [x] WebSocket 메시지 핸들링 (join, scenario_select, start_game, submit_vote 등)
- [x] 페이즈 타이머 및 자동 전환 로직
- [x] 디버그 모드 지원 (환경 변수로 활성화)

#### 클라이언트 (public/)
- [x] HTML 구조 (index.html): 입장 폼, 룸 그리드, 모달 등
- [x] JavaScript 로직 (app.js): WebSocket 연결, UI 업데이트, 오디오 엔진
- [x] CSS 스타일링 (styles.css): 디자인 토큰, 그라데이션, 반응형 레이아웃
- [x] 오디오 엔진: BGM 플레이어 (Web Audio API), 나레이션 플레이어
- [x] 시나리오 선택 모달 및 투표 UI 구현

#### 시나리오 및 리소스
- [x] 시나리오 JSON 파일 (scenarios/ghost_survey_club.json 등)
- [x] TTS 스크립트 및 오디오 생성 도구 (scripts/ 디렉토리)
- [x] 음성 파일 경로 규칙 구현 (public/assets/voices/)

#### 실행 및 배포
- [x] 개발 실행 스크립트 (run_dev.ps1)
- [x] Python 의존성 (requirements.txt)
- [x] Docker 이미지 (image.Dockerfile)

---

## 1.4 실행 방법

### 개발 서버 실행
프로젝트 루트에서 PowerShell을 열고 다음 명령어로 서버를 실행하세요:

```powershell
# 개발 모드 (자동 리로드)
.\run_dev.ps1
```

또는 수동으로:

```bash
# Python 환경 활성화 (필요 시)
python -m venv venv
venv\Scripts\activate  # Windows
# pip install -r requirements.txt

# 서버 실행
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

서버가 시작되면 `http://localhost:8000`에서 클라이언트에 접속할 수 있습니다. 스마트폰에서는 서버 PC의 IP 주소 (예: `http://192.168.1.100:8000`)로 접속하세요.

### 프로덕션 배포
Docker를 사용한 배포:

```bash
docker build -f image.Dockerfile -t werewolf-server .
docker run -p 8000:8000 werewolf-server
```

---

## 2. 타깃 환경 및 제약

### 2.1 서버 환경
- **위치**: 회사 내부망에 연결된 로컬 PC (Windows 또는 Linux)
- **역할**:
  - 방 생성/삭제/목록 관리
  - 게임 상태 관리 (카드/플레이어/단계)
  - WebSocket 기반 실시간 이벤트 전달
  - (선택) LLM 및 스토리 데이터 제공

### 2.2 클라이언트 환경
- **디바이스**: 각 플레이어의 **스마트폰**
  - iOS Safari / Chrome
  - Android Chrome
- **접속 방식**:
  - `http://<서버 IP 또는 호스트명>:포트` 접속
  - PWA(추가 설치 없이 홈 화면 추가) 지원 가능하면 좋음
- **특징**:
  - 별도 로그인/계정 없이 **닉네임만** 사용
  - 야간에는 **소리 없는 UI** (알림/벨소리 금지, 필요 시 진동 정도만)

### 2.3 네트워크/보안
- **사내망 전용 서비스**
- 외부 인터넷 연결 없이도 동작 가능하도록 설계
  - (LLM/TTS 외부 API는 옵션)
- 게임 데이터(닉네임/역할 등)는 **메모리 중심**, 필요 시 단기 로그만 파일로 저장

---

## 4. 룰 및 게임 디자인

기본 게임 규칙/역할/진행 순서(확장판 포함)는 아래 문서로 통합했습니다.

- [docs/LLM 스토리 생성 지침.md](docs/LLM%20스토리%20생성%20지침.md)

---

## 5. 핵심 UI/UX 설계 (리뉴얼)

> 테스트 프로젝트(초기 버전)는 **동시 여러 방을 만들지 않고**, 접속한 모든 유저가 **하나의 방에서 함께 진행**합니다.
> 모바일 세로 모드(Portrait)를 기본으로 설계하며, 몰입감을 해치지 않는 미니멀한 UI를 지향합니다.

### 5.1 접속 화면 (Landing Page)

**"미스터리한 초대장" 컨셉**
- **레이아웃**: 모바일 세로 화면에 최적화된 단일 컬럼 스택 구조.
- **Visual**:
  - **배경**: 깊은 밤하늘 그라데이션 (CSS `linear-gradient`) + 은은하게 흐르는 별/안개 애니메이션.
  - **타이틀**: 화면 상단 1/3 지점에 "한밤의 늑대인간" 로고 배치. (세리프 폰트, 은은한 광채).
  - **아이콘**: 중앙에 늑대 실루엣 또는 달 아이콘을 배치하여 분위기 조성 (숨쉬기 애니메이션).
- **Input Form**:
  - **닉네임 입력**: 화면 중앙~하단부. 투명한 배경에 밑줄(`border-bottom`) 스타일로 미니멀하게 처리.
    - Placeholder: "당신의 이름은?"
    - Focus 시: 밑줄 색상이 강조색(보라/파랑)으로 변경되며 부드러운 발광 효과.
  - **입장 버튼**: 화면 최하단 또는 입력창 바로 아래.
    - Full-width(꽉 찬 너비) 버튼보다는, 둥근 모서리의 플로팅 버튼 스타일 권장.
    - 텍스트: "입장하기" 또는 "게임 시작".
    - Interaction: 터치 시 햅틱 피드백(진동) 및 버튼이 눌리는 깊이감 표현.
- **UX 디테일**:
  - **자동 저장**: 마지막으로 사용한 닉네임을 로컬 스토리지에서 불러와 자동 입력.
  - **키보드 대응**: 입력창 터치 시 가상 키보드가 UI를 가리지 않도록 `viewport` 높이 대응 (Android/iOS).
  - **트랜지션**: 입장 버튼 클릭 시, 화면이 어두워지며(Fade-out) 대기실(Grid) 화면으로 부드럽게 전환.

### 5.2 입장 로직 및 호스트 권한 (구 4.1)

- 웹에 접속해 **가장 먼저 들어온 참가자가 호스트**가 됩니다.
- 호스트 기기에서 **나레이션(TTS) 재생**을 담당하며, 그 외 UI/권한은 다른 유저와 동일합니다.

### 5.3 대기 화면(그리드 카드 UI) (구 4.2)

- 모든 유저의 화면은 “카드 그리드”이며, 각 카드는 **숫자 + 배경색**만 표시합니다.
- 유저 컬러는 **입장 순서대로** 순차 배정되고, 그리드는 **빈 칸을 앞에서부터 채우는 방식**입니다.
- 유저가 페이지를 닫으면 즉시 방에서 나간 것으로 처리하고, 뒤에 있던 유저가 **앞 칸으로 당겨집니다**.

### 5.4 시나리오 선택/게임 시작 (구 4.3)

- 호스트(1번 유저) 화면 하단에만 **[시나리오 선택]** 버튼이 활성화됩니다.
- 호스트는 미리 준비된 **시나리오 라이브러리**에서 “현재 유저 수에 맞는 시나리오”를 선택합니다.
- 3~5인용 시나리오에서 인원이 부족한 경우(예: 5인용 구성을 3~4명이 플레이), **어떤 역할(카드)을 제외할지**는 UI에서 즉석으로 정하지 않고 **시나리오가 미리 결정**합니다.
- 시나리오 선택 후, **선택한 인원 수와 실제 입장 인원이 정확히 일치**하면 `[시나리오 선택]` 옆에 **[게임 시작]** 버튼이 활성화됩니다.
- 호스트가 [게임 시작]을 누르면, 미리 준비된 TTS가 재생되며 게임 진행이 시작됩니다.

### 5.5 에피소드(라운드) 기반 구성 (구 4.4)

- 하나의 큰 사건(시나리오)을 **여러 에피소드(라운드)**로 나눠 진행합니다.
- 각 에피소드마다 **서로 다른 역할(캐릭터 카드) 조합**으로 1판 게임을 진행합니다.
- 예: 3~5인용 시나리오에서 3개 에피소드를 선택하면 → **나레이션 + 게임 3판**을 연속 진행
- 3판 결과(예: 시민 승리 횟수/투표 결과 등)에 따라 **결말(엔딩)**이 분기될 수 있습니다(단일/멀티 엔딩).
- 목표: 연속 플레이를 통해 사건의 정체가 **조금씩 드러나는 느낌**을 주어 몰입도를 올립니다(LLM은 큰 사건의 흐름을 만들고, 회차별 단서를 배치).

### 5.6 1판(에피소드) 진행 방식(핸드폰 중심) (구 4.5)

1. **시작 연출**
   - 호스트가 [게임 시작]을 누르면, 모든 사람 화면이 “자신의 숫자+배경색”으로 통일됩니다.
   - 호스트 폰에서 나레이션은 **오프닝 → (역할별) 중간 → 마무리** 순으로 진행합니다.
     - 오프닝: 사건/상황 소개 + “밤이 찾아옵니다. 모두 눈을 감아주세요.”
     - 중간: 이번 판에 실제로 포함된 역할들만 순서대로 호출/연출(역할마다 오디오 클립이 여러 조각일 수 있음)
     - 마무리: “날이 밝았습니다…” 같은 전환 멘트
   - 이번 판에 등장하지 않는 역할(시나리오에서 제외된 역할)은 **나레이션/진행에서 자동 스킵**합니다.
2. **밤(역할 행동)**
   - 모든 유저는 눈을 감고, 휴대폰 화면(숫자+색)이 다른 사람에게 보이도록 내려두거나 들고 있습니다.
   - 호스트 폰에서 **이번 판에 등장한 역할 순서**대로 행동 지시/연출 나레이션을 이어서 재생합니다.
   - 해당 역할의 플레이어만, 자신의 폰에서 **필요한 조작 UI(대상 선택/행동 설명/확인 결과)**를 잠깐 보며 은밀히 수행합니다.
   - 제한 시간이 끝나면 화면은 다시 “자신의 숫자+배경색”으로 돌아갑니다.
   - 역할 행동 중 대기 시간에는 호스트 폰에서 사건 연기/스토리 멘트를 계속 재생해, 대기자는 듣고 기다리고 행동자는 조용히 수행할 수 있게 합니다.
3. **날이 밝음**
   - 모든 역할의 행동이 끝나면, 호스트 나레이션이 마무리 멘트를 하고 “눈을 뜨세요. 날이 밝았습니다.”로 종료합니다.
4. **낮(토론)**
   - 유저끼리 시간 제한 없이 자유 토론합니다.
   - 휴대폰 화면에는 “이번 판에 등장한 모든 역할”을 **그리드로 표시**하고, 하단은 **투표 버튼만 대기 상태**로 유지합니다.
5. **투표/공개**
   - 모든 유저가 투표 완료하면 서버가 수신하여 **동시에 투표 결과만 공개**합니다(이때도 카드 앞면/역할은 미공개).
   - 유저가 화면을 터치하면 자신의 폰에서 **최종 역할(카드 앞면)**을 공개합니다.
   - 이후 **{다음 라운드} 준비** 버튼이 활성화됩니다.

### 5.7 3라운드 종료/엔딩 (구 4.6)

- 총 3라운드를 진행합니다.
- 3라운드가 끝나면 `{다음 라운드}` 버튼이 **(엔딩 확인)** 버튼으로 대체됩니다.
- 백엔드에서 3판의 투표/승패 결과를 반영해, 모든 사람에게 **500자 이내의 짧은 소설 엔딩**을 공개합니다.
- 이후 `{나가기}` 버튼을 활성화하여 대기 화면(초기 상태)로 돌아갈 수 있게 합니다.

### 5.8 게임 중 신규 접속자 처리 (구 4.7)

- 게임 진행 중 새로운 유저가 접속하면, “게임 진행 중” 안내와 함께 **대기 화면만 표시**합니다(진행 중인 판에는 합류 불가).

### 5.9 서버 통신/동작(권장: 서버 권위 모델) (구 4.8)

이 프로젝트는 “어느 디바이스가 서버 역할을 하느냐”를 혼동하지 않도록, **서버(PC 1대 권장)가 모든 최종 상태를 권위 있게 관리**하고, **호스트(첫 입장자)는 트리거/나레이션 재생**만 담당하는 모델을 권장합니다.

- 전송 방식: WebSocket(실시간) + (필요 시) 최소 REST(정적 리소스/시나리오 목록 등)
- 서버가 관리하는 최종 상태(예):
  - 접속자/좌석(입장 순서), 호스트 지정/승계
  - 시나리오 선택(인원 부족 시 제외 역할 포함), 라운드/페이즈
  - 역할 배정/센터 카드/교환 결과(비공개), 투표 집계, 엔딩 분기 결과
- 타이머 동기화: 서버는 “남은 초”가 아니라 **종료 시각(timestamp)**을 브로드캐스트 → 클라이언트는 로컬에서 카운트다운 표시

서버 → 클라이언트 이벤트(예시):
- `room_snapshot`: 현재 좌석/호스트/시나리오/라운드/페이즈 스냅샷
- `host_changed`: 호스트 변경(호스트 이탈 시 서버가 자동 승계)
- `scenario_state`: 선택 가능/선택 완료/인원 조건 충족 여부(게임 시작 버튼 활성화 근거)
- `phase_changed`: NIGHT/DEBATE/VOTE/RESULT/REVEAL/ENDING 등 페이즈 전환 + 종료 시각
- `action_request`(개인): “지금 당신 차례” + 조작 UI에 필요한 데이터
- `action_result`(개인): 행동 결과(비공개 정보는 해당 플레이어만)
- `vote_open`: 투표 시작 + 종료 시각
- `vote_result_public`: 투표 집계 결과(이 단계에서는 카드 앞면/역할은 미공개)
- `reveal_enabled`: “터치해서 내 카드 오픈 가능” 전환
- `ending_text`: 500자 이내 엔딩 텍스트(라운드 결과 반영)

클라이언트 → 서버 요청(예시):
- `join/leave`: 입장/퇴장(페이지 닫힘 포함), 서버는 좌석을 재정렬
- `scenario_select`(호스트): 시나리오 선택
- `start_game`(호스트): 게임 시작 트리거
- `submit_action`(개인): 밤 행동 제출
- `submit_vote`(개인): 투표 제출(1인 1표, 재제출 정책은 서버 규칙으로 고정)
- `ready_next`(개인): 다음 라운드 준비 상태

끊김/예외 처리(권장):
- 호스트 이탈: 서버가 자동으로 **다음 좌석 유저에게 호스트 권한 승계**
- 게임 중 이탈: 해당 유저는 진행 라운드에 즉시 재합류하지 않고 “관전/대기” 처리(투표/행동은 타임아웃 규칙으로 마감)

---

## 9. 시스템 아키텍처 개요

### 8.1 구성

* **웹 서버 (게임 서버)**

  * Node.js + TypeScript (Express/Fastify + Socket.io) 권장
  * REST:

    * 방 생성/목록/입장
  * WebSocket:

    * 게임 상태 이벤트 브로드캐스트
    * 플레이어 액션 수신
* **클라이언트**

  * React + Vite (SPA)
  * 상태 관리 (예: Zustand/Redux)
  * 모바일 최적화 레이아웃 + 다크 테마
* **스토리/LLM 데이터**

  * 서버 로컬 JSON 파일로 관리
  * 필요 시 LLM API로 업데이트/생성

### 8.2 네트워크 설계 포인트

* **최소 통신만**:

  * 서버 → 클라이언트:

    * 현재 phase/타이머
    * 내가 행동 가능한지 여부
    * 내가 확인한 카드 결과
  * 클라이언트 → 서버:

    * 야간 역할 행동 (선택 대상)
    * 낮 투표 결과
* 타이머 동기화:

  * 서버에서 “종료 시각(timestamp)”만 전송
  * 각 클라이언트는 로컬 시간 기준으로 카운트다운

---

## 10. TTS 오디오(.wav) 생성 (사전 생성)

게임에서 사용하는 오디오 파일(`voice.wav`)을 `scripts/`의 스크립트로 생성. 주요 백엔드: GPT-SoVITS (고품질) 또는 Windows 내장 TTS (간단).

### 주요 스크립트 명령어 샘플

#### GPT-SoVITS 사용 (캐릭터 기반)
```bash
# 캐릭터 설정으로 감정 태그 분절 + ref/prompt 적용
python scripts/gpt_sovits_tts.py --tts gpt-sovits --character characters/Thema_01/Narrator.json --text "[default]안녕하세요" --out out/tts/narrator.wav

# 단일 ref로 간단 호출
python scripts/gpt_sovits_tts.py --tts gpt-sovits --ref-audio-path /workspace/Ref/Wolf/refs/normal.wav --text "안녕하세요" --out voice.wav
```

#### Windows 내장 TTS 사용 (SoVITS 없음)
```bash
# 기본 Windows SAPI로 생성
python scripts/gpt_sovits_tts.py --tts windows --text-file 대사.txt --out voice.wav

# 캐릭터 설정으로 감정 태그만 적용 (ref 사용 안 함)
python scripts/gpt_sovits_tts.py --tts windows --character characters/_template/character.json --text-file 대사.txt --out voice.wav
```

#### 시나리오 JSON에서 일괄 생성
```bash
# TTS용 JSON은 runtime용(roleDeck/wakeOrder)과 분리하고, 대사(text)만 관리해도 됩니다(compact schema v2).
# 감정 태그([happy]/{기쁨} 등)는 GPT-SoVITS/Windows TTS 모두 `scripts/gpt_sovits_tts.py`에서 분절 처리됩니다.
# 예) {"schemaVersion":2,"scenarioId":"...","playerCount":5,"episodes":{"ep1":{"openingClips":"...","roleClips":{"werewolf":"..."},"nightOutroClips":"..."}}}
#
# SoVITS로 시나리오 클립별 voice.wav 생성 (Docker 마운트 오버라이드)
python scripts/generate_scenario_audio.py --scenario scenarios_tts/ghost_survey_club.tts.json --tts gpt-sovits --characters-dir characters/Thema_01 --character-local-ref-base "D:\GPT_SoVIT" --character-container-ref-base "/workspace/refs"

# 최대 인원 변형만 생성
python scripts/generate_scenario_audio.py --scenario scenarios_tts/ghost_survey_club.tts.json --variant-mode max-only --tts gpt-sovits --characters-dir characters/Thema_01
```

#### 캐릭터 ref 파일 점검 및 수정
```bash
# ref 오디오 존재/길이(3~10초) 점검
python scripts/check_character_refs.py --characters-dir characters/genshin --local-ref-base "D:\GPT_SoVIT\refs"

# 자동 수정 (문제 ref 삭제)
python scripts/check_character_refs.py --characters-dir characters/genshin --local-ref-base "D:\GPT_SoVIT\refs" --fix
```

#### 에피소드 wav 연결 (미리듣기용)
```bash
# 클립별 voice.wav를 에피소드 단위로 이어붙임
python scripts/concat_episode_wavs.py --scenario scenarios_tts/ghost_survey_club.tts.json --voices-base public/assets/voices

# 미리보기 모드
python scripts/concat_episode_wavs.py --scenario scenarios_tts/ghost_survey_club.tts.json --voices-base public/assets/voices --dry-run
```

#### Genshin 음성 샘플 다운로드 (옵션)
```bash
python scripts/download_genshin_voice_sample.py --query "Paimon" --language "Korean" --character "paimon" --in-game-contains "VO_paimon" --all --out-dir out/genshin-voice --layout in_game_path
```

### 환경변수 설정 (PowerShell, 권장)
```powershell
$env:GPT_SOVITS_API_BASE = "http://127.0.0.1:9880"
$env:GPT_SOVITS_CHARACTER_LOCAL_REF_BASE = "D:\GPT_SoVIT"
$env:GPT_SOVITS_CHARACTER_CONTAINER_REF_BASE = "/workspace"
$env:GPT_SOVITS_MAX_REF_ATTEMPTS = "12"
$env:GPT_SOVITS_REF_MIN_S = "3"
$env:GPT_SOVITS_REF_MAX_S = "10"
```

### 체크리스트 요약
- `speakerId` ↔ 캐릭터 파일명 일치 (예: `Narrator` → `characters/Thema_01/Narrator.json`)
- 컨테이너 마운트 경로 확인 (`/workspace` 등)
- SoVITS 서버 포트 변경 시 `GPT_SOVITS_API_BASE` 조정
- ref 길이 문제 시 `--on-error windows`로 대체 TTS 사용
