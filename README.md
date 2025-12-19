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

### UI Debug (Chrome Console)
빠르게 밤 UI/UX를 확인하려면 개발 모드에서 `gameDebug` 콘솔 커맨드를 사용할 수 있습니다.

Prereq:
- `.\run_dev.ps1`로 실행 (환경변수 `DEBUG_COMMANDS=1` 설정됨)
- 브라우저에서 방에 먼저 입장(Join)해서 seat이 배정된 상태여야 함

Chrome DevTools Console 예시:
```js

"werewolf",
"alpha_wolf",
"mystic_wolf",
"dream_wolf",
"minion",
"seer",
"apprentice_seer",
"paranormal_investigator",
"robber",
"troublemaker",
"drunk",
"insomniac",
"sentinel",
"witch",
"revealer",
"curator",
"bodyguard",
"mason",
"villager"

// 역할 확인 화면 (눈 감기 전/후)
gameDebug.ui.roleCheck({ eyesClosed: false })
gameDebug.ui.roleCheck({ eyesClosed: true })
gameDebug.ui.roleCheck('werewolf')

// 밤 액션 UI 바로 보기 (내 폰이 '행동자'로 표시됨)
gameDebug.ui.nightAction('seer')
gameDebug.ui.nightAction('robber')
gameDebug.ui.nightAction('troublemaker')
gameDebug.ui.nightAction('drunk')
gameDebug.ui.nightAction('insomniac')
gameDebug.ui.nightAction('minion')
gameDebug.ui.nightAction('werewolf') // (테스트용) 센터 확인 가능 플래그 포함

// 밤: 대기/오프닝/아웃트로 미리보기
gameDebug.ui.nightWait()
gameDebug.ui.nightOpening()
gameDebug.ui.nightOutro()

// 클라이언트에만 임시 더미 유저를 추가:
gameDebug.ui.seedPlayers(5) (기본 5명)
// 클라이언트에만 임시 더미 유저를 제거:
gameDebug.ui.clearSeedPlayers()

// 오버레이 닫기
gameDebug.ui.clear()
```

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

#### 역할 덱 선택 정책(인원수 대응)

기본 동작은 `roleDeck`을 **앞에서부터** `플레이어 수 + 3`장만 잘라 사용합니다(=배열 순서가 사실상 우선순위).
이 방식은 소규모 인원(3~6인)에서 **뒤쪽 역할이 거의 등장하지 않는 편중**을 만들 수 있습니다.

이를 피하려면, 해당 변형(variant)에 다음을 추가해 `roleDeck`을 “풀(pool)”로 취급하고, 인원수 구간별로 필수 역할 최소 보장을 줄 수 있습니다.

```json
{
  "roleDeckSelectionPolicy": {
    "mode": "random_pool",
    "rules": [
      { "minPlayers": 3, "maxPlayers": 4, "fixedCards": ["werewolf","seer"], "minCounts": { "werewolf": 1, "seer": 1 } },
      { "minPlayers": 5, "maxPlayers": 10, "fixedCards": ["werewolf","werewolf","seer"], "minCounts": { "werewolf": 2, "seer": 1 } }
    ]
  }
}
```

- `mode: "random_pool"`: `roleDeck`에서 정확히 `플레이어 수 + 3`장을 무작위로 뽑아 이번 판 덱으로 사용
- `rules`: `{minPlayers,maxPlayers}`에 **처음 매칭되는 규칙**을 적용
  - `fixedCards`: 반드시 포함되는 “고정 카드들”(중복 허용)
  - `minCounts`: 역할별 최소 장수 보장(중복 허용, `fixedCards`와 함께 사용 가능)
- 규칙이 없거나 매칭 실패 시 `minCounts`(있다면)로 폴백, 둘 다 없으면 기존(prefix) 방식 유지

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
# 전체 생성 + (기본) 에피소드 wav 병합까지
python scripts/generate_scenario_audio.py --scenario scenarios_tts/ultimate.tts.json --tts gpt-sovits --characters-dir characters/Thema_01 --character-local-ref-base "D:\\GPT_SoVIT" --character-container-ref-base "/workspace/refs"  --api-base http://localhost:9880 --sovits-http-method post

# 최대 인원 변형만 생성
python scripts/generate_scenario_audio.py --scenario scenarios_tts/ghost_survey_club.tts.json --variant-mode max-only --tts gpt-sovits --characters-dir characters/Thema_01
```

#### 캐릭터 ref 파일 점검 및 수정
```bash
# ref 오디오 존재/길이(3~10초) 점검
python scripts/check_character_refs.py --characters-dir characters/genshin --local-ref-base "D:\GPT_SoVIT\refs"

# 자동 수정 (문제 ref 삭제)
python scripts/check_character_refs.py --characters-dir characters/Thema_01 --local-ref-base "D:\GPT_SoVIT\refs" --fix
```

#### 에피소드 wav 병합(미리듣기용)
`generate_scenario_audio.py`는 기본적으로 클립별 `voice.wav` 생성 후, 에피소드 단위 wav까지 자동으로 병합합니다.

- 병합 끄기: `--no-concat-episodes`
- 역할 진행 순서(밤 행동 순서)는 `scenarios/<id>.json`의 `roleWakeOrder`를 자동으로 찾아 반영합니다.
  - 자동 탐색이 안 되면 `--wake-order-scenario scenarios/<id>.json`로 직접 지정

#### Genshin 음성 샘플 다운로드 (옵션)
```bash
python scripts/download_genshin_voice_sample.py --query "Paimon" --language "Korean" --character "paimon" --in-game-contains "VO_paimon" --all --out-dir out/genshin-voice --layout in_game_path
```

## GPT-SoVITS 서버 (Docker / WSL)

이 프로젝트는 GPT-SoVITS의 `api_v2.py`를 Docker 컨테이너에서 실행하는 흐름을 가정합니다.

### 1) 컨테이너 실행 (지속 모드)

`--rm`을 쓰면 종료 시 컨테이너가 삭제되어(= 컨테이너 안에서 `pip install`한 것들이 날아감) 디버깅이 불편합니다. 아래처럼 **컨테이너를 남기는 모드**를 권장합니다.

```bash
docker run -it --gpus all --shm-size=16g --name gpt-sovits \
  -p 9880:9880 \
  -v /mnt/d/GPT_SoVIT:/workspace \
  gpt-sovits:cu124-ready bash
```

다음부터 다시 들어갈 때:

```bash
docker start -ai gpt-sovits
```

### 2) (최초 1회) Python 의존성 설치

컨테이너 안(`/workspace`)에서:

```bash
python3 -m pip install -U pip setuptools wheel
python3 -m pip install -r requirements.txt
python3 -m pip install -r extra-req.txt
```

### 3) RTX 5080(Blackwell) GPU 사용 시: torch nightly 필요

`RuntimeError: CUDA error: no kernel image is available for execution on the device`가 나면, 현재 torch 빌드가 Blackwell을 지원하지 않는 상태입니다. (아래 “자주 겪는 문제” 참고)

컨테이너 안에서:

```bash
python3 -m pip uninstall -y torch torchvision torchaudio
python3 -m pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128
```

### 4) API 서버 실행

컨테이너 안에서:

```bash
python3 api_v2.py -a 0.0.0.0 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml
```

정상 기동 확인:

- `http://127.0.0.1:9880/docs`
- (중요) `0.0.0.0`는 **서버 bind 용도**입니다. 브라우저/클라이언트에서는 `http://127.0.0.1:9880/docs` 또는 `http://localhost:9880/docs`로 접속하세요.

#### 자주 겪는 문제 1) `transformers.modeling_layers` / `peft` 호환
`python3 api_v2.py ...` 실행 시 아래처럼 뜨면:

- `ModuleNotFoundError: No module named 'transformers.modeling_layers'`

컨테이너 안에서:

```bash
python3 -m pip install -U "transformers>=4.56,<5" "peft>=0.12"
```

#### 자주 겪는 문제 2) Blackwell(예: RTX 5080)에서 `no kernel image`
아래 에러가 나면 torch 빌드가 해당 GPU를 지원하지 않는 상태입니다:

- `RuntimeError: CUDA error: no kernel image is available for execution on the device`

컨테이너 안에서(토치 nightly 설치):

```bash
python3 -m pip uninstall -y torch torchvision torchaudio
python3 -m pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128
```

#### 자주 겪는 문제 3) 포트가 이미 사용 중 (`address already in use`)
이미 컨테이너 안에 `api_v2.py -p 9880`가 떠 있으면 새로 띄울 때 실패합니다.

컨테이너 안에서:

```bash
ps aux | grep -E "api_v2\\.py" | grep -v grep
kill <PID>
```

### 5) (WSL 환경) Windows IP로 접속 안 될 때: portproxy

`127.0.0.1:9880/docs`는 되는데 `http://<Windows-IP>:9880/docs`가 안 되면, Windows 관리자 PowerShell에서:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9880 connectaddress=127.0.0.1 connectport=9880
netsh advfirewall firewall add rule name="WSL GPT-SoVITS 9880" dir=in action=allow protocol=TCP localport=9880
```

만약 PowerShell에서 `netsh`가 `CommandNotFoundException`으로 뜨면(환경/Path 이슈), 아래처럼 `netsh.exe`를 절대경로로 실행하세요:

```powershell
& "$env:WINDIR\\System32\\netsh.exe" interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9880 connectaddress=127.0.0.1 connectport=9880
& "$env:WINDIR\\System32\\netsh.exe" advfirewall firewall add rule name="WSL GPT-SoVITS 9880" dir=in action=allow protocol=TCP localport=9880
```

#### (중요) Docker 컨테이너는 반드시 포트를 publish 해야 함
아래처럼 `docker run`에 `-p 9880:9880`가 포함되어 있어야 Windows에서 `localhost:9880`으로 접근할 수 있습니다.
이미 만들어진 컨테이너에 포트 publish를 “추가”할 수는 없어서, 누락했다면 컨테이너를 지우고 다시 만들어야 합니다.

```bash
docker rm -f gpt-sovits
docker run -it --gpus all --shm-size=16g --name gpt-sovits \
  -p 9880:9880 \
  -v /mnt/d/GPT_SoVIT:/workspace \
  gpt-sovits:cu124-ready bash
```

### 환경변수 설정 (PowerShell, 권장)
```powershell
$env:GPT_SOVITS_API_BASE = "http://localhost:9880"
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

### 빠른 점검 커맨드 (Windows)
`/docs` 접속 확인:

- `http://localhost:9880/docs`

ping-only 스모크 테스트:

```powershell
python scripts/tts_smoke_test.py --api-base http://localhost:9880 --ping-only
```

실제 TTS 생성(컨테이너 기준 ref 경로를 넣어야 함):

```powershell
python scripts/tts_smoke_test.py --api-base http://localhost:9880 `
  --ref-audio-path "/workspace/refs/genshin-voice/Korean/VO_AQ/VO_dehya/vo_XMAQ005_10_dehya_01.wav" `
  --text "테스트입니다." --out out_smoke.wav
```

### `generate_scenario_audio.py` 실행 팁 (RemoteDisconnected 등)
`http.client.RemoteDisconnected`는 보통 다음 중 하나입니다:
- Windows→WSL2→Docker 경로에서 `127.0.0.1` 대신 `localhost`로 접근해야 하는 경우
- 긴 GET URL(특히 `prompt_text`)을 프록시/스택이 끊는 경우

권장(Windows) - 안정적으로 동작하는 설정(POST 강제):

```powershell
$env:GPT_SOVITS_API_BASE="http://localhost:9880"
python scripts/generate_scenario_audio.py --scenario scenarios_tts/daybreak_wolves_tutorial.tts.json `
  --tts gpt-sovits --characters-dir characters/Thema_01 `
  --character-local-ref-base "D:\GPT_SoVIT" --character-container-ref-base "/workspace/refs" `
  --sovits-http-method post
```

추가 옵션(필요 시):
- `--sovits-request-retries 5`: 일시적인 네트워크 끊김에 더 강하게 재시도
- `--sovits-max-url-chars 1200`: GET URL이 길어질 때(특히 `prompt_text`) 서버/프록시가 끊는 환경에서 안전장치 강화

#### fast-langdetect 관련 400 에러
아래처럼 뜨면:
- `fast-langdetect: Cache directory not found: /workspace/GPT_SoVITS/pretrained_models/fast_langdetect`

`generate_scenario_audio.py`는 내부적으로 **prompt_text 없이 재시도**해서 계속 진행할 수 있게 되어 있습니다. 그래도 막히면(환경에 따라 `prompt_lang is required`), `--sovits-http-method post`를 유지하고 로그를 확인하세요.

#### NLTK tagger 관련 400 에러
아래처럼 뜨면:
- `Resource averaged_perceptron_tagger_eng not found`

이는 컨테이너 안에서 NLTK 데이터가 없어서 발생합니다. 해결:
- `D:\GPT_SoVIT\api_v2.py`는 서버 시작 시 `nltk_data`를 자동으로 준비하도록 보완되어 있습니다(재시작 필요).
- 수동으로 하려면 컨테이너 안에서:

```bash
python3 - <<'PY'
import nltk, os
from pathlib import Path
base = Path('/workspace/GPT_SoVITS/pretrained_models/nltk_data')
base.mkdir(parents=True, exist_ok=True)
os.environ['NLTK_DATA']=str(base)
nltk.download('averaged_perceptron_tagger', download_dir=str(base))
try: nltk.download('averaged_perceptron_tagger_eng', download_dir=str(base))
except Exception: pass
nltk.download('punkt', download_dir=str(base))
print('ok', base)
PY
```

#### 에피소드 오디오 병합(역할 진행 순서)
에피소드 wav를 병합할 때 역할 진행 순서는 `scenarios_tts/*.tts.json`이 아니라, 런타임 시나리오(`scenarios/*.json`)의 `roleWakeOrder`를 기준으로 정렬합니다.

- 기본 동작: `scenarios_tts/<id>.tts.json`를 처리하면 `scenarios/<id>.json`를 자동으로 찾아 `roleWakeOrder`를 사용합니다.
- 자동 탐색이 안 되면 `--wake-order-scenario scenarios/<id>.json`로 직접 지정하세요.
