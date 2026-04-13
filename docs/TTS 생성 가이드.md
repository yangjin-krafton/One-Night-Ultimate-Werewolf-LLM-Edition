# TTS 생성 가이드 (Qwen3-TTS)

## 사전 조건

- Qwen3-TTS 서버: `http://100.66.10.225:3000/tools/qwen3-tts/`
- Python 3.11+
- ffmpeg (WAV -> M4A 변환용)

---

## 1. TTS 대사 수정

`public/assets/scenarios_tts/<시나리오>.tts.json` 파일을 편집합니다.

현재 시나리오: `beginner_dark_fantasy`, `dark_citadel`

### 기본 규칙

- 대사는 순수 텍스트만 쓰는 방식이 아니라, 필요할 때 **인라인 감정/프로소디 태그**를 함께 사용할 수 있습니다.
- 태그 형식은 `[excited]`, `[whisper]`, `[pause]` 처럼 **대괄호 태그**를 텍스트 안에 직접 넣습니다.
- 태그는 **영어 표기 우선**입니다. 한국어 태그보다 영어 태그가 안정적입니다.
- 태그는 앞에서부터 다음 태그가 나오기 전까지의 텍스트에 적용된다고 생각하면 됩니다.
- 여러 태그를 함께 줄 때는 `[excited, whisper]`처럼 쉼표로 묶습니다.
- 문장은 너무 길게 몰아쓰지 말고 마침표 기준으로 끊습니다. 긴 문장은 음색과 리듬이 흔들리기 쉽습니다.
- `openingClips / nightOutroClips`는 배열로 여러 문장을 작성해도 TTS 생성 시 **자동으로 하나의 음성 파일로 합쳐서** 생성됩니다.
- 효과음을 남발하지 말고, 감정은 태그와 어휘 선택으로 먼저 해결합니다.

### 태그 작성 규칙

```text
[태그] 텍스트
텍스트 [태그] 텍스트
[태그1, 태그2] 텍스트
```

예시:

```text
[low voice] 이제 밤이 되었습니다.
[excited] 성공했습니다. [short pause] 하지만 아직 끝난 건 아닙니다.
문을 열면 안 됩니다. [pause] 절대 뒤를 돌아보지 마세요.
```

### 감정 / 프로소디 태그

태그는 고정 목록만 가능한 것은 아니지만, 아래 표현부터 우선 사용합니다.

#### 감정 (Emotion)

| 태그 | 설명 |
|------|------|
| `[excited]` | 흥분된 |
| `[excited tone]` | 흥분된 톤 |
| `[angry]` | 화남 |
| `[sad]` | 슬픔 |
| `[surprised]` | 놀람 |
| `[shocked]` | 충격 |
| `[delight]` | 기쁨, 환희 |
| `[moaning]` | 신음 섞인 톤 |

#### 웃음 / 호흡음

| 태그 | 설명 |
|------|------|
| `[laughing]` | 웃음 |
| `[laughing tone]` | 웃음 섞인 톤 |
| `[chuckle]` | 낄낄 웃음 |
| `[chuckling]` | 낄낄대기 |
| `[inhale]` | 숨 들이쉬기 |
| `[exhale]` | 숨 내쉬기 |
| `[panting]` | 헐떡임 |
| `[sigh]` | 한숨 |
| `[tsk]` | 혀 차는 소리 |
| `[clearing throat]` | 헛기침 |
| `[audience laughter]` | 청중 웃음 소리 |

#### 말투 / 전달 방식

| 태그 | 설명 |
|------|------|
| `[whisper]` | 속삭임 |
| `[singing]` | 노래하듯 |
| `[screaming]` | 비명 |
| `[shouting]` | 외치기 |
| `[interrupting]` | 말 끊기 |
| `[low voice]` | 낮은 목소리 |
| `[with strong accent]` | 강한 억양 |

#### 강조 / 볼륨

| 태그 | 설명 |
|------|------|
| `[emphasis]` | 강조 |
| `[loud]` | 크게 |
| `[volume up]` | 볼륨 높이기 |
| `[volume down]` | 볼륨 낮추기 |
| `[low volume]` | 낮은 볼륨 |
| `[echo]` | 에코 느낌 |

#### 정지 / 끊김

| 태그 | 설명 |
|------|------|
| `[pause]` | 긴 정지 |
| `[short pause]` | 짧은 정지 |
| `[break]` | 한번 끊고 이어가기 |

### pause 규칙

- 문장부호만으로도 기본 pause가 들어갑니다.
- 다만 **의도적으로 더 멈춰야 하는 부분은 문장부호 뒤에 `[pause]`, `[short pause]`, `[break]`를 직접 넣어** 길이를 명시합니다.
- 특히 마침표 뒤에는 필요하면 `.[pause]`, `. [pause]`, `. [short pause]`처럼 정지 태그를 붙여 템포를 고정합니다.

예시:

```text
그 문은 열리지 않았습니다. [pause] 그런데 발자국 소리는 점점 가까워졌습니다.
지금부터 투표를 시작합니다. [short pause] 모두 눈을 뜨세요.
[whisper] 아직 끝나지 않았어요. [pause] 조용히 들으세요.
```

### 문장부호 기반 기본 정지 시간

| 문장 끝 | 기본 정지 시간 |
|---------|----------------|
| `.` `。` | 0.55초 |
| `!` `！` | 0.50초 |
| `?` `？` | 0.50초 |
| `…` | 0.60초 |
| 기타 | 0.35초 |

### 작성 권장 예시

- 내레이션: `[low voice] 이제 모두 눈을 감아 주세요. [pause] 아무 소리도 내면 안 됩니다.`
- 긴장 유도: `[whisper] 방금, 누군가 움직였습니다. [short pause] 들으셨나요?`
- 발표 톤: `[emphasis] 지금부터 결과를 공개합니다. [pause] 가장 많은 표를 받은 사람은...`

---

## 2. 전체 빌드 (권장)

```powershell
cd D:\Weeks\One-Night-Ultimate-Werewolf-LLM-Edition
python scripts/build_tts.py
python scripts/build_tts.py beginner_dark_fantasy
```

이 한 줄로 아래 전체 과정이 자동 실행됩니다:

1. 기존 음성 삭제
2. Qwen3-TTS로 WAV 생성 (voice lock + 감정 태그 처리 + 문장분할)
3. WAV -> M4A 변환 (AAC 64kbps, 32kHz mono)
4. Manifest URL 업데이트
5. 에피소드 미리듣기 Preview 생성

### build_tts.py 옵션

| 명령 | 설명 |
|------|------|
| `python scripts/build_tts.py` | 전체 빌드 (모든 시나리오) |
| `python scripts/build_tts.py dark_citadel` | 특정 시나리오만 빌드 |
| `python scripts/build_tts.py --dry-run` | 생성 없이 클립 목록만 출력 (파일 삭제 없음) |
| `python scripts/build_tts.py --skip-generate` | M4A 변환 + Preview만 |
| `python scripts/build_tts.py --skip-clean` | 기존 파일 유지, 없는 것만 생성 (이어하기) |
| `python scripts/build_tts.py --no-preview` | Preview 생성 건너뛰기 |

---

## 3. 서버 다운 후 이어서 생성

이미 생성된 WAV 또는 M4A 파일이 있으면 자동으로 건너뜁니다.

```powershell
python scripts/build_tts.py --skip-clean
python scripts/build_tts.py --skip-clean dark_citadel
```

---

## 4. Preview (미리듣기 통합본)

에피소드별 전체 나레이션을 하나의 M4A로 합친 파일입니다.

- 에피소드/player variant 폴더를 **동적으로 탐색** (ep1, ep2, ep3, pall 등)
- role 순서는 `public/assets/scenarios/<시나리오>.json`의 `roleWakeOrder` 기준
- 출력 위치: `public/assets/voices/<시나리오>/preview/`
- Preview만 재생성: `python scripts/build_tts.py --skip-generate`

---

## 5. 개별 클립 테스트

```powershell
cd D:\Weeks\One-Night-Ultimate-Werewolf-LLM-Edition\scripts
$env:PYTHONUTF8 = "1"

# 특정 캐릭터로 단일 클립 테스트
python qwen3_tts.py --mode tag --character ..\characters\Narrator\character.json --text "[low voice] 테스트 문장입니다. [pause] 다음 문장입니다." --out ..\out\test.wav

# 서버 연결 확인
python tts_smoke_test.py --backend qwen3 --ping-only
```

---

## 6. 수동 실행 (단계별)

`build_tts.py` 없이 각 단계를 직접 실행하는 경우:

```powershell
cd D:\Weeks\One-Night-Ultimate-Werewolf-LLM-Edition
$env:PYTHONUTF8 = "1"

# 1) 삭제
Remove-Item -Recurse -Force public\assets\voices\dark_citadel -ErrorAction SilentlyContinue

# 2) TTS 생성
python scripts/generate_scenario_audio.py --scenario public/assets/scenarios_tts/dark_citadel.tts.json --tts qwen3 --characters-dir characters --no-concat-episodes --qwen3-use-xvec

# 3) WAV -> M4A
Get-ChildItem -Recurse public\assets\voices\dark_citadel -Filter "voice.wav" | ForEach-Object {
  $out = $_.FullName -replace '\.wav$', '.m4a'
  ffmpeg -y -i $_.FullName -c:a aac -b:a 64k -ar 32000 -ac 1 $out -loglevel error
  if ($LASTEXITCODE -eq 0) { Remove-Item $_.FullName }
}

# 4) Manifest 업데이트
python -c @"
import json; from pathlib import Path
p = Path('public/assets/voices/dark_citadel/_manifest.json')
m = json.loads(p.read_text('utf-8'))
for c in m['clips']:
    c['wavPath'] = c['wavPath'].replace('.wav', '.m4a')
    c['url'] = c['url'].replace('.wav', '.m4a')
p.write_text(json.dumps(m, ensure_ascii=False, indent=2), 'utf-8')
print(f'Updated {len(m["clips"])} clips')
"@
```

### generate_scenario_audio.py 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--qwen3-api-base` | Qwen3-TTS 서버 URL | `http://100.66.10.225:3000/tools/qwen3-tts` |
| `--qwen3-mode` | `tag` / `clone` / `clone_from_file` | `tag` |
| `--qwen3-use-xvec` | x-vector 모드 (음색 일관성) | off |
| `--qwen3-temperature` | 생성 다양성 (0.1~1.0) | `0.7` |
| `--qwen3-max-tokens` | 최대 생성 토큰 | `2048` |
| `--limit N` | 처음 N개 클립만 | 전체 |
| `--dry-run` | 목록만 출력 | off |

---

## 캐릭터 -> 음성 매핑

`characters/voice_map.json`에서 관리합니다.

| 역할 | Voice Tag |
|------|-----------|
| Narrator | The_Great_Spirit_of_This_Land |
| doppelganger | Beidou |
| villager | Gorou |
| werewolf | Asfand |
| minion | The_Doctor |
| mason | Balam |
| seer | Asami |
| robber | Ajaw |
| troublemaker | Adele |
| tanner | Albert |
| drunk | Maloney |
| hunter | Rosaria |
| insomniac | Avin |
| alpha_wolf | Amadhiah |
| mystic_wolf | Amane |
| dream_wolf | Shrimati |
| apprentice_seer | Aloy |
| paranormal_investigator | Chiori |
| witch | Granny_Shan |
| village_idiot | Aikawa_Susumu |
| revealer | Amber |
| aura_seer | Barbara |
| prince | Kiminami_Anna |
| cursed | Mualani |
| apprentice_tanner | Collei |
| thing | Lyney |
| squire | Albedo |
| beholder | Child |

---

## 기술 노트

- **Voice Lock**: 시나리오 시작 시 voice library를 조회해 태그당 1개 참조 음성을 고정합니다.
- **Emotion Tag Parsing**: 대사 내부의 `[excited]`, `[whisper]`, `[pause]` 같은 태그를 유지한 채 처리합니다.
- **Resume**: 이미 존재하는 WAV 또는 M4A 파일은 자동 건너뜁니다 (`--skip-clean` 사용 시).
- **Opening/Outro 통합**: `openingClips`, `nightOutroClips` 배열의 텍스트를 하나로 합쳐 단일 클립으로 생성합니다.
- **문장 분할**: `.?!。…` 기준으로 문장을 나눈 뒤 합칩니다.
- **Pause 삽입**: 문장부호에 따른 기본 무음이 들어가고, 필요하면 `[pause]`, `[short pause]`, `[break]`로 추가 정지를 명시합니다.
- **x-vector 모드**: 화자 임베딩만 사용해 음색 일관성을 높입니다.
- **Preview 동적 탐색**: 에피소드(ep1~), player variant(pall 등), role 폴더를 자동 탐색해 통합본을 생성합니다.
