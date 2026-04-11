# TTS 생성 가이드 (Qwen3-TTS)

## 사전 조건

- Qwen3-TTS 서버: `http://100.66.10.225:3000/tools/qwen3-tts/`
- Python 3.11+
- ffmpeg (WAV → M4A 변환용)

---

## 1. TTS 대사 수정

`public/assets/scenarios_tts/<시나리오>.tts.json` 파일을 편집합니다.

현재 시나리오: `beginner_dark_fantasy`, `dark_citadel`

### 규칙

- 감정 태그를 넣지 말고 **대사만 순수 텍스트로 작성**: `대사 내용.`
- `default`, `fearful` 같은 감정 태그 표기는 Qwen TTS에서 사용하지 않습니다.
- 문장 끝에 **마침표(`.`) 필수** → 문장 분할 + pause 삽입 기준
- 한 문장이 3줄 이상이면 마침표로 분리 (긴 문장에서 음색 변화 방지)
- **openingClips / nightOutroClips**: 배열로 여러 문장을 작성해도 TTS 생성 시 **자동으로 하나의 음성 파일로 합쳐서** 생성됩니다 (클립 분리 없음)
- `쉿`, `크르릉`, `후후`, `히히`, `하아`, `어흠` 같은 숨소리·의성어·추임새는 넣지 않습니다
- 캐릭터 말버릇은 효과음 대신 어휘와 어미로 표현합니다. 예: `조용히`, `끝까지`, `분명히 기억하세요`, `판을 더 비틀어라`

### pause 규칙 (자동 삽입)

| 문장 끝 | pause |
|---------|-------|
| `.` `。` | 0.55초 |
| `!` `！` | 0.50초 |
| `?` `？` | 0.50초 |
| `…` | 0.60초 |
| 기타 | 0.35초 |

---

## 2. 전체 빌드 (권장)

```powershell
cd D:\Weeks\One-Night-Ultimate-Werewolf-LLM-Edition
python scripts/build_tts.py                          # 모든 시나리오
python scripts/build_tts.py beginner_dark_fantasy     # 특정 시나리오만
```

이 한 줄로 아래 전체 과정이 자동 실행됩니다:

1. 기존 음성 삭제
2. Qwen3-TTS로 WAV 생성 (voice lock + xvec + 문장분할)
3. WAV → M4A 변환 (AAC 64kbps, 32kHz mono)
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
python scripts/build_tts.py --skip-clean dark_citadel   # 특정 시나리오만
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
python qwen3_tts.py --mode tag --character ..\characters\Narrator\character.json --text "테스트 문장입니다." --out ..\out\test.wav

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

# 3) WAV → M4A
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

## 캐릭터 → 음성 매핑

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

- **Voice Lock**: 시나리오 시작 시 voice library를 쿼리하여 태그당 1개 참조 음성 고정 (seed=42)
- **Resume**: 이미 존재하는 WAV 또는 M4A 파일은 자동 건너뛰기 (`--skip-clean` 사용 시)
- **Opening/Outro 통합**: openingClips, nightOutroClips 배열의 텍스트를 하나로 합쳐 단일 클립으로 생성
- **문장 분할**: `.?!。…` 기준, 각 문장을 동일 참조로 생성 후 concat
- **Pause 삽입**: 문장 사이에 부호별 무음 자동 삽입
- **x-vector 모드**: 화자 임베딩만 사용하여 음색 일관성 향상
- **Preview 동적 탐색**: 에피소드(ep1~), player variant(pall 등), role 폴더를 자동 탐색하여 통합본 생성
