# LLM 스토리 생성 지침 (One Night Ultimate Werewolf + Daybreak + Vampire)

이 문서는 **LLM이 “시나리오/사회자 멘트(나레이션)”를 생성할 때 필요한 게임 규칙 요약**입니다.  
목표는 “룰에 맞는 진행 멘트 + 플레이어의 선택/토론을 유도하는 대사”를 만들 수 있게 하는 것입니다.

---

## 0) 이 프로젝트에서 LLM이 만들어야 할 것(중요)

이 프로젝트에서 LLM의 최종 결과물은 **“하나의 큰 JSON 파일(시나리오 라이브러리)”** 입니다.  
호스트(첫 입장자)의 기기에서 이 JSON을 기반으로 **오프닝 → (역할별 진행/연출) → 마무리** 오디오가 재생되고, 게임은 에피소드(라운드) 단위로 이어집니다.

핵심 전제(README 기준):
- 동시 여러 방 없이 **한 방에서 모두 진행**
- 호스트는 “시나리오 선택/게임 시작/나레이션 재생” 담당(서버는 상태 권위자)
- 시나리오는 **여러 에피소드(라운드)**로 구성되며, 3라운드 후 엔딩이 공개될 수 있음
- 3~5인용 시나리오에서 인원이 부족할 때 **제외할 역할(카드)은 시나리오가 미리 결정**(자동 스킵)
- 등장하지 않는 역할은 나레이션에서도 **자동 스킵**되어야 함

---

## 0.1 나레이션 텍스트 규칙(TTS 친화)

- 감정 태그는 **미리 정한 제한된 목록만** 사용합니다(추천).
  - 허용 태그(소문자): `default`, `happy`, `sad`, `angry`, `fearful`, `surprised`
  - 입력 태그 표기: `[happy]`, `[엄숙]`, `{화남}` 처럼 `[]` 또는 `{}` 를 허용하고, 런타임에서 정규화합니다.
  - 한국어 태그를 쓰는 경우 아래 별칭 규칙으로 매핑합니다(예: 캐릭터 설정 `tagAliases`):
    ```json
    {
      "tagAliases": {
        "기쁨": "happy",
        "슬픔": "sad",
        "분노": "angry",
        "공포": "fearful",
        "놀람": "surprised",
        "기본": "default"
      }
    }
    ```
- 감정 태그를 문장 중간/앞에 붙일 수 있습니다: `[happy]`, `[엄숙]`, `{화남}` 등  
  - 런타임에서 태그 기준으로 문장이 자동 분절되어, 구간별로 다른 참조 오디오(감정)를 적용할 수 있습니다.
- “정답/비밀 정보”를 말하지 마세요.
  - 누가 어떤 역할인지, 누가 누구를 바꿨는지 등은 절대 노출 금지(연출/분위기만).
- 같은 사건이라도 문체가 단조로워지지 않게, **서술자/문장 구조/톤을 회차별로 바꾸는 전략**을 사용하세요(아래 6장 참고).

---

## 0.1.1 나레이션 재생 타이밍(집중 구간에 몰아서)

플레이어가 토론/대화 중에는 오디오에 집중하기 어렵기 때문에, 이 프로젝트에서는 나레이션 재생을 아래처럼 제한합니다.

- `speakerId = "Narrator"`(또는 내레이터 보이스)는 **“에피소드 시작 구간”에서만** 재생합니다.
  - 오프닝 소개 + 밤 시작(눈 감기 유도) + 밤 역할 호출/연출 + “날이 밝음” 전환까지를 **한 덩어리**로 재생
- **낮(토론) / 투표 / 투표 결과 공개 / 정체(카드) 공개** 구간은 기본적으로 **나레이션을 재생하지 않습니다**.
  - 대신 UI 텍스트로만 안내(예: “투표 버튼만 대기”, “터치해서 내 카드 공개”)

이 규칙을 JSON 스키마에서도 표현하려면, `narration.playbackPolicy` 같은 필드를 두고 서버/클라이언트가 그 정책을 따르게 합니다(권장).

---

## 0.2 JSON 규격(권장 스키마)

아래는 “하나의 JSON 파일”에 여러 시나리오를 담는 구조입니다.  
서버/클라이언트는 이 JSON을 읽고, 현재 인원수에 맞는 `variant`를 선택해 진행합니다.

```json
{
  "schemaVersion": 1,
  "generatedBy": "LLM",
  "scenarios": [
    {
      "scenarioId": "case_forest_shoe",
      "title": "숲길의 신발",
      "tags": ["horror", "fragment", "first_person"],
      "recommendedPlayerCounts": [3, 4, 5],
      "episodes": [
        {
          "episodeId": "ep1",
          "title": "1화: 첫 흔적",
          "variantByPlayerCount": {
            "3": {
              "roleDeck": ["werewolf", "seer", "robber", "villager", "villager", "tanner"],
              "roleWakeOrder": ["werewolf", "seer", "robber"],
              "narration": {
                "playbackPolicy": {
                  "narratorAllowedPhases": ["episode_start"],
                  "silentPhases": ["debate", "vote", "vote_result", "reveal"]
                },
                "openingClips": [
                  {"speakerId": "Narrator", "text": "[엄숙]신발 한 짝이 숲길 한가운데…"}
                ],
                "roleClips": {
                  "werewolf": {
                    "before": [{"speakerId": "Narrator", "text": "[속삭임]늑대인간은 눈을 뜹니다…"}],
                    "during": [{"speakerId": "Narrator", "text": "[긴장]바람이 창틀을 긁습니다…"}],
                    "after": [{"speakerId": "Narrator", "text": "늑대인간은 눈을 감으세요."}]
                  }
                },
                "nightOutroClips": [{"speakerId": "Narrator", "text": "…그리고, 날이 밝습니다."}]
              }
            }
          }
        }
      ],
      "ending": {
        "branches": [
          {
            "endingId": "ending_village_win",
            "when": "villageWins>=2",
            "text": "[차분]진실은 천천히 모습을 드러냈다…(500자 이내)"
          }
        ]
      }
    }
  ]
}
```

필드 설명(핵심만):
- `scenarioId`/`episodeId`: 고유 ID(영문/숫자/언더스코어 권장)
- `recommendedPlayerCounts`: 시나리오가 지원하는 인원수
- `variantByPlayerCount["N"]`: N명일 때의 “역할 덱 + 나레이션” 한 세트
  - `roleDeck`: 길이가 **(플레이어 수 + 3)** 인 배열(센터 카드 3장 포함)
  - `roleWakeOrder`: 이 판에서 실제로 호출할 역할 순서(등장하지 않는 역할은 여기서 제외 → 자동 스킵)
  - `narration`: 클립 배열/매핑(클립은 여러 조각으로 쪼개도 됨)
- `speakerId`: TTS 캐릭터/보이스 프리셋 키(프로젝트의 캐릭터 설정 JSON과 연결 가능)
- `ending.branches[].when`: 엔딩 분기 조건(서버가 해석하는 규칙 문자열; 초기엔 단순 규칙만 사용 권장)

---

## 1) 게임 한줄 요약

- 플레이어 수만큼 역할카드를 나눠 갖고, **추가 3장은 중앙(센터 카드)**에 둔다.
- **밤 1회**: 역할이 순서대로 눈을 뜨고 능력을 사용(카드/표식이 바뀔 수 있음).
- **낮 1회**: 토론 후 투표로 1명을 처형(특수 효과로 추가 처형/대체 처형 가능).
- **승패는 “최종 상태(밤 이후)” 기준**으로 판정(예외: 일부 독립 승리 조건).

용어:
- **초기 역할**: 시작할 때 받은 카드.
- **최종 역할**: 밤 행동(교환/뒤집기 등) 이후, 투표 직전에 플레이어가 실제로 가진 카드.
- **센터 카드**: 게임에서 공개되지 않은 3장의 카드(일부 역할만 확인/교환 가능).

---

## 2) 승리 조건(핵심)

### 기본(늑대인간 vs 마을)
- 게임에 **늑대인간(계열)이 1명 이상 존재**하면:
  - **마을팀**: 투표로 **늑대인간 1명 이상을 처형**하면 승리
  - **늑대팀**: **늑대인간이 아무도 처형되지 않으면** 승리
- 게임에 **늑대인간이 0명**이면(전부 센터에 있거나, 아예 미포함):
  - **마을팀**: **아무도 처형되지 않으면** 승리(최다 득표 동률로 “처형 없음” 포함)
  - **마을팀**: 누군가 처형되면 패배

### 독립 승리(예외)
- **Tanner(탄너)**: **본인이 처형되면** 혼자 승리(다른 팀 승패보다 우선 처리하는 변형이 많음).
- **Assassin(암살자)**: **암살 표식이 붙은 플레이어가 처형되면** 승리.
- **Apprentice Assassin(견습 암살자)**: **Assassin이 처형되면** 승리(본인 생존 불문).

### 뱀파이어(표식/전염)
- **Vampire(뱀파이어) 1명 이상 존재** 시:
  - **마을팀**: 투표로 **뱀파이어 1명 이상 처형**하면 승리
  - **뱀파이어팀**: **뱀파이어가 아무도 처형되지 않으면** 승리
- 뱀파이어 게임은 **“표식(Mark)”**으로 팀/행동이 변형될 수 있다(아래 참고).

---

## 3) 역할 사전(컴팩트)

표기:
- **팀**: Village(마을) / Minority(소수파: 늑대·뱀파이어) / Independent(독립) / Variable(복사형)
- **단계**: Dusk(황혼) / Night(밤) / Day(낮) / Election(투표 처리)

### A. One Night Ultimate Werewolf(기본)

| 역할 | 팀 | 단계 | 요약 능력 |
|---|---|---|---|
| Doppelgänger | Variable | Night | 다른 플레이어 카드 1장을 보고 **그 역할을 복사**(이후 해당 역할 순서에 다시 깸) |
| Werewolf | Minority | Night | 서로 확인. **혼자라면 센터 카드 1장** 확인 가능 |
| Minion | Minority | Night | 늑대인간을 알고 돕는다(늑대는 미니언을 모름). **늑대 승리 조건 공유** |
| Mason | Village | Night | 서로의 정체를 확인 |
| Seer | Village | Night | 플레이어 카드 1장 **또는** 센터 카드 2장 확인 |
| Robber | Village | Night | 다른 플레이어와 **카드를 교환**하고, **새 카드 확인** |
| Troublemaker | Village | Night | 다른 두 플레이어의 **카드 위치를 교환**(본인은 결과를 모름) |
| Drunk | Village | Night | 자신의 카드와 **센터 카드 1장 교환**(결과 모름) |
| Insomniac | Village | Night | 밤 마지막에 **자기 카드 확인** |
| Villager | Village | Day | 능력 없음 |
| Hunter | Village | Day | **처형되면**, 본인이 투표한 대상도 함께 사망 처리 |
| Tanner | Independent | Day | 목표는 **본인이 처형되는 것** |

### B. Daybreak(확장)

| 역할 | 팀 | 단계 | 요약 능력 |
|---|---|---|---|
| Sentinel | Village | Night | 플레이어 1명에게 **방패 토큰**(대상 카드가 “보호/고정”되는 변형 규칙에 사용) |
| Alpha Wolf | Minority | Night | “센터 늑대 카드(별도)”를 **아무 플레이어와 교환**(확인 없이) |
| Mystic Wolf | Minority | Night | 늑대인간들과 확인 후, **플레이어 카드 1장 추가 확인** |
| Dream Wolf | Minority | Night | 늑대 호출 때 **엄지 신호만**(늑대들은 “늑대가 있긴 함” 정도만 암시) |
| Apprentice Seer | Village | Night | **센터 카드 1장** 확인 |
| Paranormal Investigator | Village | Night | 플레이어 카드 최대 2장 확인. **늑대/탄너를 보면 즉시 그 역할로 변함** |
| Witch | Village | Night | 센터 카드 1장 확인 후, 그 카드를 **아무 플레이어와 교환**(선택) |
| Village Idiot | Village | Night | 본인을 제외한 모든 카드의 위치를 **좌/우로 1칸 이동** |
| Revealer | Village | Night | 플레이어 카드 1장을 **공개 뒤집기**(늑대/탄너면 불가) |
| Curator | Village | Night | 플레이어 1명에게 **아티팩트 토큰**(토큰별 추가효과) |
| Bodyguard | Village | Election | 본인이 투표한 대상은 **처형 불가**. 최다득표자가 보호되면 **차순 득표자 처형** |

### C. One Night Ultimate Vampire(표식 확장)

뱀파이어는 **황혼(Dusk)**에 먼저 활동하고, 이후 “밤(Night)” 역할들이 이어진다.  
핵심은 **표식(Mark)**이며, 표식은 카드와 별도로 플레이어 앞에 놓여 효과를 준다.

| 역할 | 팀 | 단계 | 요약 능력 |
|---|---|---|---|
| Copycat | Variable | Dusk | 센터 카드 1장을 보고 **그 역할을 복사**(이후 해당 역할 순서에 깸) |
| Vampire | Minority | Dusk | 팀 확인 후, 비뱀파이어 1명에게 **Mark of the Vampire** 부여(전염) |
| The Master | Minority | Dusk | 다른 뱀파이어가 투표로 보호 가능(마스터가 죽을 상황이면 **차순 득표자 처형**) |
| The Count | Minority | Dusk | 뱀파이어 단계 후, 비뱀파이어 1명에게 **Mark of Fear** 부여 |
| Renfield | Minority(또는 Village) | Dusk | 뱀파이어가 누구를 전염시키는지 보고, 자신에게 **Mark of the Bat**. **뱀파이어가 처형되지 않으면 승리**(뱀파이어 0명일 땐 마을팀) |
| Diseased | Village | Dusk | 인접 1명에게 **Mark of Disease** 부여 |
| Cupid | Village | Dusk | 임의 2명에게 **Mark of Love** 부여(한쪽이 죽으면 다른 쪽도 사망) |
| Instigator | Village | Dusk | 임의 1명에게 **Mark of the Traitor** 부여 |
| Priest | Village | Dusk | 자신과 다른 1명에게 **Mark of Clarity** 부여(다른 표식 제거/무효화 성격) |
| Assassin | Independent | Dusk | 임의 1명에게 **Mark of the Assassin** 부여(그가 죽으면 승리) |
| Apprentice Assassin | Independent | Dusk | **Assassin이 죽으면 승리**. Assassin이 없으면 Assassin 역할을 맡아야 함 |
| Marksman | Village | Night | 플레이어 카드 1장과 “다른 플레이어” 표식 1개를 확인 가능 |
| Pickpocket | Village | Night | 다른 플레이어의 표식 1개를 훔쳐오고 **새 표식 확인** |
| Gremlin | Village | Night | 두 플레이어의 **표식 또는 카드**를 교환 |

주요 표식(마크):
- **Mark of the Vampire**: 해당 플레이어는 “뱀파이어로 취급”(기존 역할 능력은 유지될 수 있음).
- **Mark of Fear**: (비뱀파이어) **밤 행동을 할 수 없음**.
- **Mark of Disease**: 이 표식이 있는 플레이어에게 투표한 사람은 **승리 불가**(표식 보유자는 승리 가능).
- **Mark of Love**: 둘 중 한 명이 죽으면 **다른 한 명도 함께 사망**.
- **Mark of the Traitor**: **자기 팀의 누군가가 죽어야** 승리(팀이 1명뿐이면 무효에 가깝게 처리).
- **Mark of Clarity**: 다른 표식을 제거/무효화 성격. 역할/팀은 “카드 기준”으로 명확화.
- **Mark of the Assassin**: 암살자 승리 조건의 대상 표식.

---

## 4) 진행 순서(웨이크 오더) — LLM용

LLM이 멘트를 만들 때는 “사용 중인 역할만” 호출하면 된다. 아래는 **확장 포함 표준 흐름**이다.

### 4.1 (뱀파이어 포함 시) 황혼(Dusk)
1. Copycat
2. Vampires (+ The Master 포함)
3. The Count
4. Renfield
5. Diseased
6. Cupid
7. Instigator
8. Priest
9. Assassin
10. Apprentice Assassin
11. (사랑의 표식이 있으면) Lovers가 서로 확인하는 짧은 단계

### 4.2 밤(Night) — 늑대/마을/데이브레이크
1. Sentinel
2. Doppelgänger (뱀파이어와 같이 쓰면 더 앞에서 깰 수 있음)
3. Werewolves (Alpha Wolf/Mystic Wolf/Dream Wolf 포함)
4. Minion
5. Masons
6. Seer (Apprentice Seer, Paranormal Investigator, Marksman 등 파생)
7. Robber (Witch, Pickpocket 등 파생)
8. Troublemaker (Village Idiot, Gremlin 등 파생)
9. Drunk
10. Insomniac
11. Revealer
12. Curator

### 4.3 낮(Day)
1. 모두 눈을 뜨고 토론(보통 3~5분)
2. 투표 및 처형(Bodyguard/Hunter/Love 등 효과 반영)
3. 공개 및 승리 판정

---

## 5) LLM “스토리/사회자 멘트” 생성 지침(시스템 프롬프트 템플릿)

아래 블록을 그대로 시스템 프롬프트로 사용하고, 사용자 메시지로 “지원 인원/에피소드 수/톤/원하는 문체 다양성”을 넣습니다.  
출력은 반드시 **JSON 하나만** 반환하도록 강제하세요.

실사용용(8000자 이내) 프롬프트는 아래 파일을 사용하세요.
- `docs/LLM_SYSTEM_PROMPT_8K.md`

## 6) 문체/서술 다양성 가이드(중요)

“내용(사건)만 바꾸고 말투/리듬이 고정되면” 에피소드들이 비슷하게 느껴집니다.  
아래 전략을 **시나리오/에피소드마다 2~3개씩 섞어서** 문체를 바꾸세요.

- 서술자(목소리) 바꾸기: 1인칭 주민/외부 탐정/일기/라디오 속보/아이 시점/구전 설화 등
- 문장 구조 바꾸기: 단문 연타/산문시/질문 연속/건조한 보고서/생략으로 긴장 만들기
- 연출 바꾸기: 시간 순서 뒤집기/은유·비유/과감한 생략/현장 중계체
- 톤 바꾸기: 건조/디테일 과한 공포/초현실/코미디/블랙유머

권장 운영:
- `scenario.tags`에 문체 키워드를 넣고(예: `["radio_news","dry_report"]`),
- 에피소드마다 `openingClips`의 문체를 확실히 갈아타서 “새 에피소드 체감”을 즉시 주기.
