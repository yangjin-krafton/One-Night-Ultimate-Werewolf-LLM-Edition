# Characters (TTS configs)

캐릭터별 TTS 레퍼런스(참고 오디오)와 감정 태그 매핑을 `*.json`으로 관리합니다.

## 폴더 구조

- `characters/<characterId>/character.json`
- (권장) `characters/<characterId>/refs/*.wav` 와 같은 위치에 같은 이름의 `*.txt` 프롬프트 파일
  - 예: `refs/normal.wav` ↔ `refs/normal.txt`

## JSON 필드

- `characterId`: 캐릭터 ID
- `localRefBase`: (옵션) 호스트에서 프롬프트 txt를 읽을 베이스 경로
  - 기본값: `character.json`이 있는 폴더
- `containerRefBase`: (옵션) GPT-SoVITS 컨테이너 내부에서 보이는 ref base 경로
  - 기본값: `/workspace/Ref/<characterId>`
- `defaultRefs`: 기본(정상) 참고 오디오 리스트 (배열)
- `emotionRefs`: 감정별 참고 오디오 리스트 맵 (배열)
- `tagAliases`: 텍스트의 태그를 감정 키로 정규화하는 별칭 맵

## 태그 문법

텍스트에 감정 태그를 넣으면 자동으로 분절되어 각 조각마다 해당 감정의 ref를 랜덤 선택합니다.

- `[happy]너무 좋아요! {화남}뭐라고!?`
- 태그가 없으면 `default`로 처리

실행은 `scripts/gpt_sovits_tts.py`의 `--character` 모드를 사용하세요.

