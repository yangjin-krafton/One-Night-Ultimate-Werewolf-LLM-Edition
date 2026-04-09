# TTS 생성 가이드 (Qwen3-TTS)

## 사전 조건

- Qwen3-TTS 서버: `http://100.66.10.225:3000/tools/qwen3-tts/`
- Python 3.11+
- ffmpeg (WAV → M4A 변환용)

---

## 1. TTS 대사 수정

`scenarios_tts/full_moon.tts.json` 파일을 편집합니다.

### 규칙

- 감정 태그를 넣지 말고 **대사만 순수 텍스트로 작성**: `대사 내용.`
- `default`, `fearful` 같은 감정 태그 표기는 Qwen TTS에서 사용하지 않습니다.
- 문장 끝에 **마침표(`.`) 필수** → 문장 분할 + pause 삽입 기준
- 한 문장이 3줄 이상이면 마침표로 분리 (긴 문장에서 음색 변화 방지)

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
python scripts/build_tts.py
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
| `python scripts/build_tts.py` | 전체 빌드 |
| `python scripts/build_tts.py --dry-run` | 생성 없이 클립 목록만 출력 |
| `python scripts/build_tts.py --skip-generate` | M4A 변환 + Preview만 |
| `python scripts/build_tts.py --skip-clean` | 기존 파일 유지, 없는 것만 생성 (이어하기) |
| `python scripts/build_tts.py --no-preview` | Preview 생성 건너뛰기 |

---

## 3. 서버 다운 후 이어서 생성

이미 생성된 WAV는 자동으로 건너뜁니다.

```powershell
python scripts/build_tts.py --skip-clean
```

---

## 4. 개별 클립 테스트

```powershell
cd D:\Weeks\One-Night-Ultimate-Werewolf-LLM-Edition\scripts
$env:PYTHONUTF8 = "1"

# 특정 캐릭터로 단일 클립 테스트
python qwen3_tts.py --mode tag --character ..\characters\Thema_01\Narrator.json --text "테스트 문장입니다." --out ..\out\test.wav

# 서버 연결 확인
python tts_smoke_test.py --backend qwen3 --ping-only
```

---

## 5. 수동 실행 (단계별)

`build_tts.py` 없이 각 단계를 직접 실행하는 경우:

```powershell
cd D:\Weeks\One-Night-Ultimate-Werewolf-LLM-Edition
$env:PYTHONUTF8 = "1"

# 1) 삭제
Remove-Item -Recurse -Force public\assets\voices\full_moon -ErrorAction SilentlyContinue

# 2) TTS 생성
python scripts/generate_scenario_audio.py --scenario scenarios_tts/full_moon.tts.json --tts qwen3 --characters-dir characters/Thema_01 --no-concat-episodes --qwen3-use-xvec

# 3) WAV → M4A
Get-ChildItem -Recurse public\assets\voices\full_moon -Filter "voice.wav" | ForEach-Object {
  $out = $_.FullName -replace '\.wav$', '.m4a'
  ffmpeg -y -i $_.FullName -c:a aac -b:a 64k -ar 32000 -ac 1 $out -loglevel error
  if ($LASTEXITCODE -eq 0) { Remove-Item $_.FullName }
}

# 4) Manifest 업데이트
python -c @"
import json; from pathlib import Path
p = Path('public/assets/voices/full_moon/_manifest.json')
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

| 역할 | 원신 캐릭터 | Voice Tag |
|------|-----------|-----------|
| Narrator | 리넷 | lynette_기본 |
| werewolf | 느비예트 | neuvillette_기본 |
| alpha_wolf | 윤진 | yunjin_기본 |
| mystic_wolf | 이토 | itto_기본 |
| dream_wolf | 실로넨 | xilonen_기본 |
| minion | 도토레 | dottore_기본 |
| mason | 마비카 | mavuika_기본 |
| seer | 리사 | lisa_기본 |
| apprentice_seer | 모나 | mona_기본 |
| paranormal_investigator | 감우 | ganyu_기본 |
| robber | 데히아 | dehya_기본 |
| troublemaker | 페이몬 | paimon_기본 |
| witch | 실로넨 | xilonen_기본 |
| village_idiot | 카베 | kaveh_기본 |
| drunk | 이토 | itto_기본 |
| sentinel | 알베도 | albedo_기본 |
| curator | 윤진 | yunjin_기본 |
| insomniac | 감우 | ganyu_기본 |
| revealer | 야에미코 | yaeMiko_기본 |
| bodyguard | 이토 | itto_기본 |

---

## 기술 노트

- **Voice Lock**: 시나리오 시작 시 voice library를 쿼리하여 태그당 1개 참조 음성 고정 (seed=42)
- **Resume**: 이미 존재하는 WAV 파일은 자동 건너뛰기 (`--skip-clean` 사용 시)
- **문장 분할**: `.?!。…` 기준, 각 문장을 동일 참조로 생성 후 concat
- **Pause 삽입**: 문장 사이에 부호별 무음 자동 삽입
- **x-vector 모드**: 화자 임베딩만 사용하여 음색 일관성 향상
