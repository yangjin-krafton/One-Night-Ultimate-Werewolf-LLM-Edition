# 한밤의 늑대인간 LLM 에디션

스마트폰 브라우저에서 여는 정적 파티게임 프로토타입입니다. 현재 저장소는 `public/` 아래 정적 HTML/JS 앱과 미리 생성된 시나리오/TTS 자산 중심으로 동작합니다.

현재 저장소 기준으로 확인되는 범위는 다음과 같습니다.

- 시나리오 선택, 인원 선택, 방 코드 생성/입장
- 밤 진행용 나레이션 플레이어와 역할 정보 UI
- 시나리오 팩 3개, 에피소드 6개
- 생성된 TTS 클립 96개와 에피소드 합본 오디오 6개 포함

## 화면과 오디오 미리보기

### 게임 화면

입장 화면

![입장 화면](thumbs/001.gif)

대기실과 시나리오 선택 화면

![대기실과 시나리오 선택](thumbs/002.gif)

### TTS 샘플

README 뷰어가 `<audio>` 태그를 막는 경우, 바로 아래 링크로 파일을 열면 됩니다.

#### 4인 시나리오 오프닝

<audio controls src="public/assets/voices/four_player_story/ep1/p4/opening/001/voice.m4a"></audio>

- 파일: [public/assets/voices/four_player_story/ep1/p4/opening/001/voice.m4a](public/assets/voices/four_player_story/ep1/p4/opening/001/voice.m4a)
- 예시 톤: "모두 눈을 감으세요. 네 명의 플레이어, 그리고 잠들지 못하는 밤입니다."

#### 기본 시나리오 늑대인간 역할 호출

<audio controls src="public/assets/voices/basic/ep1/p10/role/werewolf/during/001/voice.m4a"></audio>

- 파일: [public/assets/voices/basic/ep1/p10/role/werewolf/during/001/voice.m4a](public/assets/voices/basic/ep1/p10/role/werewolf/during/001/voice.m4a)
- 예시 톤: "늑대인간, 눈을 뜨세요."

#### 에피소드 합본 샘플

<audio controls src="public/assets/voices/flexible_story/flexible_story__ep1__p8__episode.m4a"></audio>

- 파일: [public/assets/voices/flexible_story/flexible_story__ep1__p8__episode.m4a](public/assets/voices/flexible_story/flexible_story__ep1__p8__episode.m4a)
- 설명: 오프닝, 역할 호출, 밤 종료 멘트를 한 파일로 합친 버전입니다.

## 이 프로토타입이 실제로 된 것

- 시나리오와 인원 수를 고르면, 그 조합을 담은 방 코드를 만들 수 있습니다.
- 방 코드는 네트워크 세션이 아니라 정적 설정 코드라서, 같은 코드를 입력하면 같은 시나리오/덱 구성을 다시 열 수 있습니다.
- 클라이언트는 밤 나레이션 재생, 역할 설명, 카드 덱/센터 카드 정보 표시를 담당합니다.
- 음성 자산이 있으면 파일을 재생하고, 없으면 브라우저 `speechSynthesis`로 fallback 합니다.
- 개발 중 빠른 확인을 위한 `gameDebug` 콘솔 API와 UI 프리뷰가 남아 있습니다.

현재 시나리오 팩 기준으로 실사용되는 역할 축은 `werewolf`, `minion`, `mason`, `seer`, `robber`, `troublemaker`, `drunk`, `insomniac`, `villager`, `witch`입니다.

## 현재 포함된 시나리오

| 시나리오 | 권장 인원 | 에피소드 | 실제 특징 |
| --- | --- | --- | --- |
| `basic` | 3~10인 | 2개 | 기본 입문형. 방 코드 생성 시 인원에 맞는 역할 덱을 구성합니다. |
| `flexible_story` | 3~8인 | 2개 | 인원 수에 따라 역할이 점차 확장되는 유연형 시나리오입니다. |
| `four_player_story` | 4인 | 2개 | 4인 전용으로 압축한 빠른 스토리형 시나리오입니다. |

## AI를 어디에 썼는가

이 프로젝트에서 AI는 "런타임 플레이어"보다 "콘텐츠 생성 파이프라인"에 가깝습니다.

- `scenarios/*.json`: 실제 게임 진행용 시나리오 데이터입니다. 역할 덱, 역할 호출 순서, 인원별 variant가 들어 있습니다.
- `scenarios_tts/*.tts.json`: TTS용 대사 소스입니다. 오프닝, 역할별 멘트, 밤 종료 멘트를 분리해 둡니다.
- `docs/LLM 스토리 생성 지침.md`: LLM이 어떤 형태의 JSON과 대사를 만들어야 하는지 정리한 생성 가이드입니다.
- `scripts/generate_scenario_audio.py`: 시나리오/TTS JSON을 읽어 음성 파일과 에피소드 합본 파일을 생성합니다.
- `scripts/gpt_sovits_tts.py`: GPT-SoVITS 또는 Windows TTS를 호출해 실제 음성을 만듭니다.
- `characters/`: 캐릭터별 참조 음성, 감정 태그, 보이스 매핑 설정을 관리합니다.

중요한 점:

- 게임 중에 LLM이 매 턴 판단을 내리지는 않습니다.
- 런타임은 먼저 미리 생성된 오디오 자산을 재생합니다.
- 해당 오디오가 없을 때만 브라우저 `speechSynthesis`로 텍스트를 읽는 fallback이 있습니다.

## 처음 기획 대비 달라진 점

- 실시간 LLM 게임 마스터보다는 "사전 생성 시나리오 + 사전 생성 음성" 구조로 정리됐습니다.
- P2P/서버 동기화 구조는 제거했고, 정적 앱 + 공유 코드 방식으로 단순화했습니다.
- 로그인, 저장, 다중 방, 지속형 메타 진행보다 모바일 UI/오디오 흐름에 집중했습니다.
- 시나리오 팩은 3개로 압축됐고, 긴 캠페인형 스토리보다 1회 플레이 가능한 라운드형 구조가 중심입니다.

## 실행 방법

### Windows PowerShell

```powershell
.\run_dev.ps1
```

기본 포트는 `8001`입니다.

### macOS / Linux / WSL

```bash
python3 -m http.server 8001 --directory public
```

접속 주소:

- 로컬 실행: `http://localhost:8001`
- 같은 네트워크의 휴대폰: `http://<현재 PC IP>:8001`
- GitHub Pages 배포: `public/` 디렉터리를 그대로 서빙

## TTS 자산 작업

먼저 시나리오와 출력 경로만 확인하고 싶다면:

```bash
python3 scripts/generate_scenario_audio.py --scenario scenarios_tts/flexible_story.tts.json --dry-run
```

GPT-SoVITS 서버 연결만 확인하고 싶다면:

```bash
python3 scripts/tts_smoke_test.py --api-base http://127.0.0.1:9880 --ping-only
```

실제 음성 파일을 다시 만들 때:

```bash
python3 scripts/generate_scenario_audio.py \
  --scenario scenarios_tts/flexible_story.tts.json \
  --tts gpt-sovits \
  --characters-dir characters/Thema_01 \
  --api-base http://127.0.0.1:9880
```

## 디버그와 빠른 검증

정적 서버를 띄운 뒤 브라우저 콘솔에서 다음 방식으로 빠르게 UI를 확인할 수 있습니다.

```js
gameDebug.ui.seedPlayers(5)
gameDebug.forceRole("seer")
gameDebug.ui.nightAction("robber")
gameDebug.ui.nightOpening()
```

## 폴더 가이드

- `public/`: 정적 클라이언트, CSS, UI 컴포넌트, 배경음, 생성된 음성 자산
- `scenarios/`: 실제 게임 진행용 시나리오 JSON
- `scenarios_tts/`: TTS 대사 소스 JSON
- `scripts/`: 음성 생성, 오디오 병합, 캐릭터 ref 검사, smoke test
- `characters/`: 역할/캐릭터별 음성 스타일과 감정 태그 설정
- `docs/`: LLM이 시나리오를 생성할 때 참고하는 규칙 문서

## 제한 사항과 검증 상태

- 현재 구조는 정적 앱입니다. 실시간 동기화, 서버 저장, 다중 사용자 상태 공유는 없습니다.
- 방 코드는 네트워크 방 ID가 아니라 설정 공유 코드입니다.
- 번들된 오디오 자산은 시나리오별 대표 variant 중심으로 들어 있고, 런타임이 best-fit 방식으로 재사용하거나 브라우저 TTS로 fallback 합니다.
- 실험용 역할/음성 설정 파일은 더 많지만, 현재 번들 시나리오가 모두 사용하지는 않습니다.
- 자동 테스트는 아직 없습니다.

이번 README 정리 시점의 확인 기준:

- 확인함: 저장소 구조, 시나리오 JSON, TTS 매니페스트, 화면 GIF, 오디오 샘플 경로
- 확인함: `basic 32`, `flexible_story 36`, `four_player_story 28`개의 클립 매니페스트
- 확인함: `public/` 정적 서빙 기준으로 필요한 앱 파일과 오디오 경로가 저장소에 존재합니다.
