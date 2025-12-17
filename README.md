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

## 3. 룰 및 게임 디자인

기본 게임 규칙/역할/진행 순서(확장판 포함)는 아래 문서로 통합했습니다.

- [docs/LLM 스토리 생성 지침.md](docs/LLM%20스토리%20생성%20지침.md)

---

## 4. 핵심 UX/플로우 설계

> 테스트 프로젝트(초기 버전)는 **동시 여러 방을 만들지 않고**, 접속한 모든 유저가 **하나의 방에서 함께 진행**합니다.

### 4.1 입장/호스트

- 웹에 접속해 **가장 먼저 들어온 참가자가 호스트**가 됩니다.
- 호스트 기기에서 **나레이션(TTS) 재생**을 담당하며, 그 외 UI/권한은 다른 유저와 동일합니다.

### 4.2 대기 화면(그리드 카드 UI)

- 모든 유저의 화면은 “카드 그리드”이며, 각 카드는 **숫자 + 배경색**만 표시합니다.
- 유저 컬러는 **입장 순서대로** 순차 배정되고, 그리드는 **빈 칸을 앞에서부터 채우는 방식**입니다.
- 유저가 페이지를 닫으면 즉시 방에서 나간 것으로 처리하고, 뒤에 있던 유저가 **앞 칸으로 당겨집니다**.

### 4.3 시나리오 선택/게임 시작

- 호스트(1번 유저) 화면 하단에만 **[시나리오 선택]** 버튼이 활성화됩니다.
- 호스트는 미리 준비된 **시나리오 라이브러리**에서 “현재 유저 수에 맞는 시나리오”를 선택합니다.
- 3~5인용 시나리오에서 인원이 부족한 경우(예: 5인용 구성을 3~4명이 플레이), **어떤 역할(카드)을 제외할지**는 UI에서 즉석으로 정하지 않고 **시나리오가 미리 결정**합니다.
- 시나리오 선택 후, **선택한 인원 수와 실제 입장 인원이 정확히 일치**하면 `[시나리오 선택]` 옆에 **[게임 시작]** 버튼이 활성화됩니다.
- 호스트가 [게임 시작]을 누르면, 미리 준비된 TTS가 재생되며 게임 진행이 시작됩니다.

### 4.4 에피소드(라운드) 기반 구성

- 하나의 큰 사건(시나리오)을 **여러 에피소드(라운드)**로 나눠 진행합니다.
- 각 에피소드마다 **서로 다른 역할(캐릭터 카드) 조합**으로 1판 게임을 진행합니다.
- 예: 3~5인용 시나리오에서 3개 에피소드를 선택하면 → **나레이션 + 게임 3판**을 연속 진행
- 3판 결과(예: 시민 승리 횟수/투표 결과 등)에 따라 **결말(엔딩)**이 분기될 수 있습니다(단일/멀티 엔딩).
- 목표: 연속 플레이를 통해 사건의 정체가 **조금씩 드러나는 느낌**을 주어 몰입도를 올립니다(LLM은 큰 사건의 흐름을 만들고, 회차별 단서를 배치).

### 4.5 1판(에피소드) 진행 방식(핸드폰 중심)

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

### 4.6 3라운드 종료/엔딩

- 총 3라운드를 진행합니다.
- 3라운드가 끝나면 `{다음 라운드}` 버튼이 **(엔딩 확인)** 버튼으로 대체됩니다.
- 백엔드에서 3판의 투표/승패 결과를 반영해, 모든 사람에게 **500자 이내의 짧은 소설 엔딩**을 공개합니다.
- 이후 `{나가기}` 버튼을 활성화하여 대기 화면(초기 상태)로 돌아갈 수 있게 합니다.

### 4.7 게임 중 신규 접속자 처리

- 게임 진행 중 새로운 유저가 접속하면, “게임 진행 중” 안내와 함께 **대기 화면만 표시**합니다(진행 중인 판에는 합류 불가).

### 4.8 서버 통신/동작(권장: 서버 권위 모델)

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

## 8. 시스템 아키텍처 개요

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

## 9. TTS 오디오(.wav) 생성 (사전 생성)

게임에서 로딩할 오디오 파일 경로(예: `voice.wav`)는 그대로 두고, `scripts/gpt_sovits_tts.py`에서 TTS 백엔드를 선택해 생성할 수 있습니다.

### 9.1 GPT-SoVITS 사용(기본값)

- 캐릭터 설정(`characters/<id>/character.json`)을 쓰는 경우(감정 태그 분절 + ref/prompt 기반):
  - `python scripts/gpt_sovits_tts.py --tts gpt-sovits --character characters/_template/character.json --text-file <대사.txt> --out <voice.wav>`
  - `python scripts/gpt_sovits_tts.py --tts gpt-sovits --character characters/Narrator/teamasterliusu.json --text-file scenarios\ghost_survey_club.json`
    - `--out`을 생략하면 기본값으로 `./out/tts/<name>.wav`에 저장됩니다.
    - ref 오디오/프롬프트가 repo 밖(예: `D:\\GPT_SoVIT\\refs\\...`)에 있으면 `--character-local-ref-base`(호스트 경로)와 `--character-container-ref-base`(SoVITS 컨테이너/서버에서 보이는 마운트 경로)로 오버라이드할 수 있습니다.
- `--character` 없이 단일 ref로 호출하는 경우:
  - `python scripts/gpt_sovits_tts.py --tts gpt-sovits --ref-audio-path /workspace/Ref/Wolf/refs/normal.wav --text "안녕하세요" --out <voice.wav>`

### 9.2 Windows 내장 TTS 사용(SoVITS 없는 환경용)

- SoVITS/API 없이 Windows SAPI로 바로 `.wav` 생성:
  - `python scripts/gpt_sovits_tts.py --tts windows --text-file <대사.txt> --out <voice.wav>`
- 감정 태그 분절은 유지하고 싶으면 `--character`만 같이 사용(레퍼런스/프롬프트는 사용하지 않음):
  - `python scripts/gpt_sovits_tts.py --tts windows --character characters/_template/character.json --text-file <대사.txt> --out <voice.wav>`
  - python scripts\generate_scenario_audio.py --scenario scenarios\ghost_survey_club.json --tts windows

Windows 음성/속도/볼륨/샘플레이트는 옵션으로 조절할 수 있습니다: `--windows-voice`, `--windows-rate`, `--windows-volume`, `--windows-sample-rate` (또는 `--windows-format` 별칭).

### 9.3 시나리오(JSON)에서 voice.wav 일괄 생성

시나리오(`scenarios/*.json`)의 내레이션 클립을 읽어서 `public/assets/voices/.../voice.wav`를 일괄 생성합니다.

- 테마 캐릭터 폴더 예시(평면 구조): `characters/Thema_01/Narrator.json`
- 실행 예시(SoVITS, Docker 마운트 경로 오버라이드 포함):
  - `python scripts/generate_scenario_audio.py --scenario scenarios\\ghost_survey_club.json --tts gpt-sovits --characters-dir characters\\Thema_01 --character-local-ref-base \"D:\\GPT_SoVIT\" --character-container-ref-base \"/workspace\"`

### 9.4 초보자용 “복붙” 실행 템플릿 (Windows PowerShell)

아래 템플릿은 “SoVITS는 Docker로 실행 중이고, 호스트의 `D:\GPT_SoVIT`를 컨테이너의 `/workspace`로 마운트”한 전형적인 구성을 기준으로 합니다.

#### (권장) 1) 환경변수 한 번 설정 → 2) 매번 짧게 실행

1) PowerShell에서 환경변수(현재 터미널 세션에만 적용):

```powershell
Set-Location D:\Workspace\One-Night-Ultimate-Werewolf-LLM-Edition

$env:GPT_SOVITS_API_BASE = "http://127.0.0.1:9880"
$env:GPT_SOVITS_CHARACTER_LOCAL_REF_BASE = "D:\GPT_SoVIT"
$env:GPT_SOVITS_CHARACTER_CONTAINER_REF_BASE = "/workspace"
$env:GPT_SOVITS_MAX_REF_ATTEMPTS = "12"   # ref 길이(3~10s) 문제 시 자동 재시도 횟수
$env:GPT_SOVITS_REF_MIN_S = "3"
$env:GPT_SOVITS_REF_MAX_S = "10"
```

2-A) 시나리오 JSON을 클립별 `voice.wav`로 일괄 생성(테마 폴더 사용):

```powershell
python scripts\generate_scenario_audio.py `
  --scenario scenarios\ghost_survey_club.json `
  --tts gpt-sovits `
  --characters-dir characters\Thema_01 `
  --on-error windows
```

2-B) 특정 문장만 빠르게 단일 wav 생성(디버깅/샘플용):

```powershell
python scripts\gpt_sovits_tts.py `
  --tts gpt-sovits `
  --character characters\Thema_01\Narrator.json `
  --text "테스트"
```

#### (원라인) 환경변수 없이 한 번에 실행

```powershell
python scripts\generate_scenario_audio.py --scenario scenarios\ghost_survey_club.json --tts gpt-sovits --characters-dir characters\Thema_01 --character-local-ref-base "D:\GPT_SoVIT" --character-container-ref-base "/workspace"
```

#### 자주 하는 실수 체크리스트

- `speakerId`(시나리오) ↔ 캐릭터 파일명(테마 폴더)이 일치해야 합니다. 예: `Narrator` → `characters\Thema_01\Narrator.json`
- 컨테이너 마운트 경로에 따라 `--character-container-ref-base` 값이 달라집니다(예: `/workspace`, `/workspace/refs` 등).
- SoVITS 서버가 다른 PC/포트라면 `GPT_SOVITS_API_BASE`를 해당 주소로 변경하세요.
- 특정 캐릭터 ref가 3~10초 규칙에 걸려 SoVITS가 400을 반환하면 `--on-error windows`(또는 `--on-error skip`)로 전체 배치가 멈추지 않게 할 수 있습니다.

-  python3 scripts/download_genshin_voice_sample.py --query "Paimon" --language "Korean" --character "paimon" --in-game-contains "VO_paimon" --all --out-dir out/genshin-voice --layout in_game_path
