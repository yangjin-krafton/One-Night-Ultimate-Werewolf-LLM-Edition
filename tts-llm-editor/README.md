# 🐺 One Night TTS Editor (LLM Edition)

이 프로젝트는 **One Night Ultimate Werewolf** 게임을 위한 대사 생성 및 관리 도구입니다.  
LLM(ChatGPT, Claude 등)이 작성한 대사 스크립트(JSON/CSV)를 가져와, **GPT-SoVITS**를 통해 감정 표현이 담긴 고품질 음성을 생성하는 데 특화되어 있습니다.

## 🎯 프로젝트 목표 (Goal)

- **LLM 친화적 워크플로우**: LLM이 생성한 구조화된 데이터(JSON)를 그대로 활용.
- **감정 태그 시스템**: 텍스트 내 `[기쁨]`, `[속삭임]` 등의 태그를 감지하여, 캐릭터별로 미리 설정된 Reference Audio로 자동 매핑.
- **게임 특화**: 사회자(Narrator), 늑대인간, 예언자 등 캐릭터별 프로필 및 보이스 프리셋 관리.

## ✨ 주요 기능 (Key Features)

### 1. 스크립트 가져오기 (Script Import)
- LLM이 작성한 JSON 또는 CSV 파일을 붙여넣거나 업로드하여 대사 리스트를 생성합니다.
- **지원 포맷 예시 (JSON)**:
  ```json
  [
    {
      "character": "Narrator",
      "text": "밤이 되었습니다. [엄숙함] 모두 눈을 감아주세요."
    },
    {
      "character": "Wolf",
      "text": "[신남] 크크크, 오늘 밤은 누구를 잡아먹을까?"
    }
  ]
  ```

### 2. 감정 태그 매핑 (Emotion Tag Mapping)
- 캐릭터별로 감정 태그와 GPT-SoVITS Reference Audio를 연결합니다.
- **예시**:
  - **Wolf**:
    - `[기본]` -> `Ref/Wolf/normal.wav`
    - `[신남]` -> `Ref/Wolf/excited.wav`
    - `[분노]` -> `Ref/Wolf/angry.wav`

### 3. 오디오 생성 및 제어 (Generation & Control)
- GPT-SoVITS API (`api_v2.py`)와 연동하여 음성 생성.
- 개별 대사 다시 생성 및 파라미터(Speed, Pitch) 미세 조정.
- 전체 스크립트 연속 재생 (Play All).

### 4. 내보내기 (Export)
- 생성된 오디오 파일들을 캐릭터/대사 순서에 맞춰 정리하여 다운로드.
- 프로젝트 설정(캐릭터 매핑 정보) 저장.

## 🛠 기술 스택 (Tech Stack)

- **Frontend**: Vue.js 3, Vite
- **Styling**: Tailwind CSS
- **Backend**: GPT-SoVITS API (Existing `api_v2.py`)
- **Icons**: SVG (Heroicons or Custom Game Icons)

## 🚀 시작하기 (Getting Started)

### 설치 및 실행
- Node.js 18+ 환경을 권장합니다.
- 아래 명령은 `tts-llm-editor` 폴더 기준입니다.
  ```bash
  # 의존성 설치
  npm install

  # 개발 서버 실행
  npm run dev
  ```
  기본 포트는 `5173`이며, 동일 네트워크에서 접근하려면 `http://<호스트IP>:5173` 으로 접속합니다.

### GPT-SoVITS 연결
이 툴은 로컬 또는 원격에서 실행 중인 GPT-SoVITS API 서버가 필요합니다.
- 기본 주소: `http://127.0.0.1:9880` (설정에서 변경 가능)

### 사용 흐름
1. **스크립트 입력**: LLM이 생성한 JSON 배열 또는 `character,text` CSV를 붙여넣거나 파일로 불러옵니다.
2. **캐릭터 매핑**: 감정 태그(`[기쁨]` 등)를 캐릭터별 Reference Audio에 연결합니다. 상대경로 입력 시 `Container Ref Base`와 결합됩니다.
3. **생성**: `전체 생성` 또는 개별 `재생성` 버튼으로 GPT-SoVITS `/tts`를 호출해 음성을 만듭니다.
4. **재생/내보내기**: 각 줄을 바로 재생하거나, 프로젝트 설정/스크립트를 JSON으로 다운로드할 수 있습니다.
