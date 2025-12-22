# TODO / 구현 현황 정리

이 문서는 현재 게임 UI/UX 구현 상태와, “밤 역할 액션(카드 선택/교환/확인 등)” 기준으로 아직 미구현인 역할 리스트를 빠르게 추적하기 위한 체크리스트입니다.

## 현재 구현된 UI/UX (요약)

### 로비
- 유저 프로필 카드 그리드(호스트 표시/연결 상태 표시) 기반으로 방 상태를 보여줍니다.
- 동일 닉네임 기반 재접속을 지원하도록 설계되어, 새로고침/화면 잠금/브라우저 재시작 이후에도 **같은 이름으로 들어오면 기존 슬롯으로 복귀**하는 흐름을 우선합니다.
- `leave(나가기)`는 명시적 버튼으로 서버에 신호를 보내 “의도된 퇴장”으로 처리합니다.
- 게임 진행 중에는 “새 닉네임 신규 입장”이 게임을 방해하지 않도록 별도 처리가 필요합니다(아래 TODO 참고).

### 밤(NIGHT) 단계: 역할 액션 UI
- 실제 게임 플레이에서도 `public/ui/night_board.js` 스타일의 “카드 선택/확인 UI”를 재사용하도록 통합되어 있습니다.
- 서버에서 `night_step` / `night_private` / `night_result` 이벤트로 액션 안내 및 결과를 동기화합니다.

현재 “카드 조작 UI(선택/교환/확인) + 서버 액션 처리”가 실제로 동작하는 역할:
- `seer` (플레이어 1장 확인 또는 중앙 2장 확인)
- `robber` (플레이어 1명과 카드 교환 + 새 역할 확인)
- `troublemaker` (플레이어 2명 카드 교환)
- `drunk` (중앙 1장과 교환, 본인 확인 없음)
- `werewolf` (늑대가 **1명일 때만** 중앙 1장 확인 UI 표시 / 2명 이상이면 규칙 가이드만 표시)
- `insomniac` (현재 내 역할 1회 확인)
- `apprentice_seer` (중앙 1장 확인)
- `mystic_wolf` (플레이어 1장 확인)
- `revealer` (플레이어 1장 공개/차단)
- `marksman` (플레이어 1~2장 확인)
- `pickpocket` (본인 ↔ 대상 카드 교환, 확인 없음)
- `gremlin` (플레이어 2명 카드 교환, 본인 포함 가능)
- `alpha_wolf` (중앙 늑대 카드 ↔ 플레이어 1명 교환)
- `sentinel` (방패 대상 선택)
- `curator` (아이템 받기 → 대상 선택)
- `bodyguard` (보호 대상 선택)
- `village_idiot` (전체 회전 방향 선택)

정보만 표시(조작 UI는 없음)로 동작하는 역할:
- `minion` (늑대 좌석 힌트)
- `mason` (다른 메이슨 좌석 힌트)

리뉴얼 완료(밤 행동 카드 UI/UX):
- `seer`, `robber`, `troublemaker`, `drunk`, `werewolf`, `insomniac`
- `apprentice_seer`, `mystic_wolf`, `revealer`, `marksman`, `pickpocket`, `gremlin`, `alpha_wolf`, `sentinel`, `curator`, `bodyguard`, `village_idiot`

### 토론/투표(DEBATE/VOTE) 단계 UI
- 상단은 로비처럼 플레이어 프로필 카드가 유지됩니다.
- 하단은 가로 스와이프 정보 카드(Info Deck)를 유지/재사용합니다.
- 게임에서 실제 사용된 역할 덱(`nightDeck`) 기반으로 역할 카드 설명을 보여주는 흐름이 포함되어 있습니다.

### 투표 결과 → 로비 복귀
- 투표 결과 확인 이후, 유저 확인 없이 자동으로 로비로 복귀하는 흐름을 목표로 상태 동기화가 들어가 있습니다.

## 미구현: “밤 역할 액션(카드 조작) UI/서버 로직” 역할 리스트

아래 역할들은 현재 기준으로 “UI에서 카드 조작을 해야 하는 역할”이지만,
서버 `night_action` 처리 및/또는 `night_board` 기반 조작 UI가 아직 구현되지 않았습니다.

### Daybreak/확장 역할 (남은 미구현)
- `paranormal_investigator` (플레이어 카드 확인 + 조건부 역할 변화 처리)
- `witch` (중앙 1장 확인 후 플레이어에게 줄지 선택/교환)

### Bonus/Epic
- `doppelganger` (플레이어 1명 확인 후, 그 역할 액션까지 이어서 수행)
- `copycat` (중앙 1장 확인 후, 그 역할 액션까지 이어서 수행)

### 기타(정의는 있으나 액션/룰 연동 미완)
- `assassin`
- `vampire`
- `count`
- `renfield`
- `thing`

## 다음 작업 제안(우선순위)
- [ ] 게임 진행 중 “새 닉네임 신규 입장” 차단/대기실 분리(재접속은 허용)
- [ ] `witch` → `paranormal_investigator` 순으로 2단계 역할 UI/서버 구현
- [ ] `doppelganger`/`copycat`처럼 “다단계 역할”은 액션 파이프라인(연속 step) 설계 후 구현

## 미구현 역할 구현 지침(실전 체크리스트)

목표: 앞으로 역할을 추가할 때 **“UI/선택 규칙/서버 처리/결과 연출”**을 같은 방식으로 빠르게 붙일 수 있도록, 공통 절차 + 역할별 설계를 명확히 합니다.

### 0) 구현 전 확인(역할 분류)
- **A. 선택만 하면 끝(단일 액션)**: (현재 주요 단일 액션 역할은 구현 완료) — 신규 역할 추가 시 동일 패턴 적용
- **B. 선택 + 추가 확인/추가 선택(2단계)**: `witch`, `paranormal_investigator`
- **C. “다른 역할 액션을 이어서 수행”(연속 step 필요)**: `doppelganger`, `copycat`

역할이 A/B/C 중 어디인지부터 확정하고 시작합니다(특히 C는 서버/클라 구조부터 바꿔야 함).

---

### 1) 서버 구현 흐름(필수)
파일: `server/main.py`

#### 1-1. “액션이 필요한 역할인지” 판정
함수: `_role_action_required_locked(role_id, actor_ids)`
- 단일 역할이지만 “조건부 액션”인 경우(예: `werewolf`처럼 1명일 때만) 여기에서 분기
- `sentinel`처럼 항상 선택이 필요한 역할은 `True`

#### 1-2. 밤 힌트/조건 payload 전달(필요한 경우)
함수: `_send_night_private_locked(step_id, role_id, actor_ids)`
- UI 분기/선택 가능 여부가 서버 판단인 경우(예: 늑대 혼자 여부, 특정 아이템 보유 여부 등) 반드시 `night_private.payload`로 내려줍니다.
- 클라는 이 payload만 보고 UI를 바꿀 수 있어야 합니다(클라 추측 금지).

권장 payload 예시(역할별로 하나만):
- `sentinel`: `{ "allowedSeats": [..], "shieldedSeat": null }` (이미 사용중이면 현재 상태도 포함)
- `curator`: `{ "artifacts": ["claw","mask",...], "alreadyGiven": false }`
- `bodyguard`: `{ "allowedSeats": [..] }`

#### 1-3. 액션 처리(상태 변경)
함수: `handle_night_action()` 내부의 역할별 분기
- 입력 검증(좌석 유효성, 중복 선택 금지, 본인 선택 가능 여부 등)
- 결과 적용(좌석-역할 교환, 중앙-좌석 교환, 아이템 부여, 보호 상태 저장 등)
- 결과로 **클라에 보낼 요약**을 `night_result`로 만듭니다.

`night_result` 설계 원칙:
- “클라 연출에 필요한 최소정보”만 포함(비밀 정보는 포함하지 않음)
- 역할에 따라 공개가 필요한 정보만 포함(예: `apprentice_seer`는 본인이 본 중앙카드 1장만 공개)

---

### 2) 클라이언트 구현 흐름(필수)
파일: `public/app.js`, `public/ui/night_board.js`

#### 2-1. UI 분기 위치
`renderNightOverlay()`의 `// ROLE steps` 아래 역할별 분기 패턴을 따릅니다.
- 이미 리뉴얼된 역할들은 “orbit board 방식”과 “rule-only 패널”을 섞어 씁니다.
- **조건부 UI**가 필요하면(예: 특정 조건이면 선택 UI, 아니면 규칙만) `night_private.payload` 기준으로 분기합니다.

#### 2-2. 선택 상태(state.nightUi) 규칙
권장 규칙:
- 플레이어 선택은 `selectedSeats` (좌석 배열)
- 중앙 선택은 `selectedCenter` (0~2 인덱스 배열)
- 역할마다 `max`(선택 수)를 명시하고, 클릭 시 “토글 + 최대치 유지” 로직으로 통일

#### 2-3. Confirm 버튼
- 버튼 활성화 조건을 `updateXxxOrbitSelection()` 같은 함수로 분리(구현된 역할들처럼)
- Confirm 버튼 눌렀을 때:
  - 선택 불가 뱃지/마크 제거가 필요한 역할은 `clearBlockedBadges(row)` 같이 먼저 처리
  - `submitNightAction(roleId, payload)` 호출

#### 2-4. 결과 연출(applyNightResultOnce)
- `applyNightResultOnce(expectedRoleId, (result)=>{ ... })` 안에서만 1회 적용
- 카드 연출은 `NightBoardUI` 유틸만 사용:
  - 공개(역할 보여주기): `flipRevealRole(el, roleId)`
  - 중앙카드 뒷면 연출: `flipRevealBack(el, { label })`
  - 교환(모션): `swapEls(a,b,{ flip:true, onComplete })`

---

### 3) 역할별 “권장 사양”(서버 payload / 입력 / 결과)
아래는 “미구현 리스트”를 실제 구현 가능한 형태로 쪼갠 최소 요구사항입니다.

#### `sentinel` (방패)
- UI: 플레이어 1명 선택(본인 선택 가능 여부는 룰에 따라 결정) + Confirm
- 서버 입력: `{ seat }`
- 서버 상태: `shieldedSeat` 저장(에피소드/라운드 단위)
- 결과: `night_result`는 보통 공개 필요 없음(본인에게만 “선택 완료” 정도의 UI 메시지로 충분)

#### `alpha_wolf` (중앙 늑대와 교환)
- UI: 중앙 1장 선택 + Confirm
- 서버 입력: `{ centerIndex }`
- 서버 처리: 내 역할과 중앙 선택 카드 교환
- 결과: (공개 정책에 따라) 본인에게만 “교환 완료” 메시지, 필요 시 `newRole` 제공

#### `mystic_wolf` (플레이어 1명 확인)
- UI: 플레이어 1명 선택 + Confirm
- 서버 입력: `{ seat }`
- 결과: `{ seat, role }` (본인만)

#### `apprentice_seer` (중앙 1장 확인)
- UI: 중앙 1장 선택 + Confirm
- 서버 입력: `{ centerIndex }`
- 결과: `{ centerIndex, role }` (본인만)

#### `witch` (중앙 1장 확인 후 플레이어에게 주기/교환)
- 2단계 UI 권장:
  1) 중앙 1장 선택 → 공개(본인만) → “이 카드를 줄 대상 선택” 단계로 전환
  2) 플레이어 1명 선택 → 교환/부여 적용
- 서버 입력(권장 1회로 묶기): `{ centerIndex, targetSeat }` 또는 단계형 `{ stage:1... }` (둘 중 하나로 통일)
- 결과: 공개 정책 엄격(본인만 무엇을 봤는지 / 누구에게 줬는지)

#### `paranormal_investigator` (연속 확인 + 조건부 역할 변화)
- UI(2단계 이상): 플레이어 1명 확인 → 조건 만족 시 다음 플레이어 확인 가능
- 서버가 조건과 진행 상태를 가진 “세션형” 액션으로 관리하는 편이 안전
- 구현 난이도 높으므로, 먼저 `mystic_wolf`/`seer` 패턴 완성 후 착수 권장

#### `village_idiot` (전체 회전)
- UI: 방향 선택(좌/우) + Confirm (플레이어 카드 클릭 대신 토글 UI)
- 서버 입력: `{ dir: "left" | "right" }`
- 서버 처리: 전체 좌석 역할 회전(또는 중앙 포함 룰이면 명시)
- 결과: 공개 없음(연출은 “교환 모션”을 여러 장에 적용할지 결정 필요)

#### `revealer` (조건부 공개)
- UI: 플레이어 1명 선택
- 서버 입력: `{ seat }`
- 결과: 공개 가능하면 `{ seat, role }`, 불가하면 `{ seat, blocked: true }`

#### `curator` (아이템/유물 지급)
- UI: “아이템 카드(랜덤)” + 플레이어 1명 선택
- 서버 입력: `{ seat }` (아이템은 서버가 정해줘야 공정)
- `night_private.payload`로 `{ artifact: "..." }`를 먼저 내려주고, 선택만 받는 방식 권장

#### `bodyguard` (보호 + 결과 반영)
- UI: 플레이어 1명 선택
- 서버 입력: `{ seat }`
- 서버 상태: 보호 대상 저장, 투표 결과 반영 로직에 연결

#### 기타(정의는 있으나 액션/룰 연동 미완)
아래 역할들은 `ROLE_DEFINITIONS`에 설명은 있으나, 아직 “어느 단계에서 무엇을 선택하고 어떤 정보를 공개하는지”가 정리/구현되지 않았습니다.
먼저 **룰(선택 대상/공개 범위/적용 시점)**을 확정하고, 그 다음 UI/서버를 붙입니다.

- `pickpocket` (소매치기): 밤에 “나 ↔ 대상 1명” 카드 교환(확인 없음) 형태로 `robber`/`troublemaker` 패턴 재사용 권장
- `gremlin` (그렘린): 밤에 플레이어 2명 선택 후 교환(본인 포함 가능) 형태로 `troublemaker` 패턴 재사용 권장
- `marksman` (명사수): “1명 확인” 또는 “2명에게 서로 확인시키기” 중 어떤 모드로 구현할지 확정 필요(모드형 action 권장)
- `assassin` (암살자): “지목”이 언제/어떻게 이뤄지는지(토론 중? 투표 후? 결과 화면?) 확정 후, 결과 판정(승리 조건)을 `RESULT` 단계에 연결
- `vampire` / `count` / `renfield`: 팀/정보/승리 조건이 투표 결과와 연결될 가능성이 높아, 밤 액션 UI보다 **결과 판정 로직**부터 확정 권장
- `thing`: 감염 규칙(전파 조건/표시/영향)을 확정한 뒤 `night_private`(개인 힌트)와 공개 범위를 설계

---

### 4) 다단계 역할(`doppelganger`, `copycat`) 구현 지침(구조 먼저)
이 둘은 “한 역할 액션을 수행한 뒤, 다른 역할의 액션까지 연속으로 수행”해야 합니다.
즉, **클라에서 2개 UI를 한 화면에 억지로 합치기**보다, 서버가 `night_step`을 추가 발행해서 흐름을 끌고 가는 방식이 안전합니다.

권장 설계(안정적인 순서):
1) 서버가 `night_step` 큐를 동적으로 확장(현재 step 완료 시 다음 step을 삽입)
2) `doppelganger/copycat` 액션 결과로 “변신한 역할”을 서버가 확정
3) 서버가 다음 `night_step.roleId`를 그 역할로 발행하고, 해당 역할의 `night_private`도 함께 발행
4) 클라는 기존 역할 UI를 그대로 재사용(새로운 UI 최소화)

필수 체크:
- 연속 step에서 `stepId`가 바뀌므로, 클라의 `state.nightUi` 초기화/보존 규칙을 명확히
- private 정보(`night_private`)는 “해당 stepId+roleId”에 귀속되게 유지(레이스 방지)
- “복사된 역할”이 액션이 없는 역할이면 step을 즉시 완료 처리(서버)

## 카드 조작 UI/UX 상세 스펙 (비주얼/모션/연출)

목표: `public/ui/night_board.js` 기반 “카드 조작 UI”를 역할별로 재사용하고, 필요에 따라 **모듈 단위로 켜고/끄는** 조립형 구성으로 유지합니다.

### 화면 구성(레이아웃)
- **상단/중앙**: 중앙 카드 3장(항상 3장 고정), “중앙 카드 슬롯(0~2)”로 표현
- **주변/하단**: 플레이어 프로필 카드(좌석)들이 “기차길(레일)”을 따라 배치된 **오빗(원형/호 형태)** 보드
- **하단 바(Bottom Bar)**: 역할 안내/경고 문구 + “확인(Confirm)” 버튼(필요 시 “취소/되돌리기” 포함)

### 공통 컴포넌트(모듈화 단위)
아래 컴포넌트는 역할마다 조합해서 씁니다(필요 시 비활성/숨김 가능).

- `CenterCardRow` (중앙 3장)
  - 슬롯 단위로 선택 가능 여부/선택 상태/뒤집힘 상태를 관리
  - “선택 불가(잠금)” 오버레이(🚫/자물쇠) 지원
- `PlayerOrbitRail` (유저 카드 레일 배치)
  - 플레이어 카드가 레일을 따라 이동/정렬되는 연출(“기차길 이동”) 지원
  - 연결 끊김/관전 여부/호스트 표시 등 프로필 카드 상태를 그대로 재사용
- `SelectionOutline`
  - 선택된 카드에만 **아웃라인/글로우**(예: 청록/금색) 적용
  - 다중 선택(예: troublemaker 2명, seer 중앙 2장)에서 “1/2 선택” 상태도 표현
- `DisabledMark`
  - 선택 불가 카드에 “금지 마크 + 낮은 불투명도” 적용
  - 클릭/탭 시 짧은 “shake” 모션 + 이유 토스트(선택 불가 사유)
- `RoleBadge / HintChip`
  - “당신 차례 / 선택 가능 / 대기 중” 같은 짧은 칩 UI(역할 공통)
- `BottomActionBar`
  - 확인 버튼 + 규칙 텍스트(역할별 문구) + 필요 시 “되돌리기/미리보기 토글”

### 상태(State) 정의(공통)
- `idle`: 아무것도 선택 전(가이드만 표시)
- `selecting`: 선택 진행 중(아웃라인/카운트 표시)
- `locked`: 서버 제출 후 대기(입력 잠금 + 로딩 표시)
- `revealing`: 플립/스왑 등 결과 연출 재생 중(입력 잠금)
- `done`: 결과 확인 완료(다음 단계로 넘어가기/자동 닫기)

### 모션/연출(애니메이션 스펙)
역할마다 다르게 보이더라도, “모션 프리셋”을 재사용합니다.

- **카드 뒤집기(역할 확인용 Flip Reveal)**
  - 선택한 카드가 `flip`(Y축 180도)로 전환되며 뒷면에 역할명/아이콘 표시
  - 공개 범위:
    - 개인 공개(예: seer/robber 결과)는 **내 화면에서만** reveal
    - 공용 공개(리빌 단계)는 서버 브로드캐스트 기반으로 동일 연출
- **카드 교체(교환 Flip Swap)**
  - 교환 대상 2장의 “플립 → 위치 교환 → 플립 복귀” 연출(또는 “슬라이드 교환 + 플립”)
  - troublemaker/robber 등에서 동일 프리셋 사용
- **기차길 이동(Orbit Rail Motion)**
  - 특정 역할에서 “선택 대상 강조”를 위해 레일 상 카드들이 살짝 이동/정렬되는 연출
  - 기본은 과하지 않게: 미세 이동 + scale(1.02) 정도로 존재감만 부여
- **선택 피드백**
  - 선택 시: outline on + 짧은 “pop”(scale up/down)
  - 선택 해제 시: outline off + 원위치
  - 선택 불가 시: shake + DisabledMark 강조
- **하단 버튼**
  - `Confirm`는 “가능해지기 전까지 soft-disabled”(불투명/블러/클릭 불가)
  - 가능 상태로 전환 시: 강조(glow) + 짧은 enter 모션

### 조립형 옵션(필요 시 끄고/켜기)
역할/디바이스/디버그에 따라 기능을 쉽게 조절할 수 있어야 합니다.

- `enableMotion`: 전체 모션 on/off (저사양 기기, 접근성 고려)
- `enableHaptics`: 모바일 진동 피드백(가능한 브라우저에서만)
- `enableDisabledShake`: 선택 불가 shake 모션 on/off
- `enableRailMotion`: 레일 이동 연출 on/off
- `enablePreviewMode`: 디버그에서 “미리보기/되돌리기” 토글 노출
- `showCenterCards`: 중앙 카드 UI 자체를 숨김(예: 늑대 2명 이상일 때 규칙 가이드만)

### 재사용 구조(역할별 UI를 빠르게 늘리기 위한 규칙)
- 역할별 UI는 “0) 공통 보드 생성 → 1) 선택 규칙(validator) → 2) 제출 payload 빌더 → 3) 결과 연출(apply result)”만 구현하면 되도록 분리
- 서버는 `night_step.requiresAction` + `night_private.payload`로 “누가 무엇을 할 수 있는지”만 알려주고,
  클라이언트는 동일한 보드 코드에서 역할별 정책만 바꿔서 렌더링

### 참고(연결되는 파일/기준)
- 보드 스타일/카드 플립/스왑 기반: `public/ui/night_board.js`
- 카드 생성(프로필/정보카드 등) 유틸: `public/ui/cards.js`
- 실제 게임 단계에서 보드 호출/결과 적용: `public/app.js`

## 구현된 역할별 “사용 모듈/이벤트/코드 포인트” (코드 확인 기반)

### 공통(모든 밤 역할 UI 공용)
- 보드/모션 유틸: `public/ui/night_board.js`의 `window.NightBoardUI`
  - `startTrackMotion(arenaEl, itemEls)`: 유저 카드가 레일(기차길) 따라 도는 오빗 모션
  - `flipRevealRole(el, {roleId,...})` / `flipRevealBack(el, ...)` / `flipRevertRole(el)`: 카드 뒤집기/복귀
  - `swapEls(a, b, ...)`: 카드 2장 위치 교환(모션 포함)
  - `setInteractive(el, enabled)` + `setBlockedBadge(el, show)`: 선택 불가/차단 마크
  - `createRuleOnlyPanel({text})`: 규칙 가이드만 띄우는 패널
- 화면 렌더링/상태/제출: `public/app.js`의 `renderNightOverlay()`
  - 입력/선택 상태 저장: `state.nightUi` (`selectedSeats`, `selectedCenter`)
  - 서버 액션 제출: `send({ type: "night_action", data: { stepId, action } })`
  - 결과 반영(1회만 적용): `applyNightResultOnce(expectedRoleId, applyFn)`
  - 역할별 보드 핸들(재사용/상태 유지): `state.nightSeerBoard`, `state.nightRobberBoard`, `state.nightTroublemakerBoard`, `state.nightDrunkBoard`, `state.nightWerewolfBoard`
- 서버 단계/결과: `server/main.py`
  - “액션 필요 역할” 판정: `_role_action_required_locked()`
  - 역할별 액션 적용: `handle_night_action()`
  - 역할별 힌트(payload): `_send_night_private_locked()`

### `seer` (예언자)
- UI 모듈 조합: `CenterCardRow(2장 선택)` + `PlayerOrbitRail(1명 선택)` + `BottomActionBar(확인)`
- 선택 규칙(클라): 플레이어 1명 OR 중앙 2장 중 하나만 성립
  - 확인 버튼 활성 조건: `selectedSeats.length === 1 || selectedCenter.length === 2` (`updateSeerOrbitSelection`)
- 제출 payload(서버로): `action.mode === "player" | "center"`
  - 플레이어: `{ mode: "player", seat }`
  - 중앙: `{ mode: "center", indices: [i1, i2] }`
- 결과 연출: `night_result.roleId === "seer"`에서
  - 플레이어 1장/중앙 2장을 `NightBoardUI.flipRevealRole(...)`로 공개

### `robber` (강도)
- UI 모듈 조합: `PlayerOrbitRail(1명 선택)` + `BottomActionBar(확인)`
- 제출 payload: `{ seat }`
- 결과 연출: `night_result.roleId === "robber"`에서
  - 내 카드와 대상 카드 `NightBoardUI.swapEls(mine, target)`로 교체 연출
  - 이후 내 카드에 `flipRevealRole(mine, newRole)`로 새 역할 확인

### `troublemaker` (문제아)
- UI 모듈 조합: `PlayerOrbitRail(2명 선택)` + `BottomActionBar(확인)`
- 제출 payload: `{ seats: [aSeat, bSeat] }`
- 결과 연출: `night_result.roleId === "troublemaker"`에서 `swapEls(aEl, bEl)`만 수행(역할 공개 없음)

### `drunk` (주정뱅이)
- UI 모듈 조합: `CenterCardRow(1장 선택)` + `PlayerOrbitRail(표시만, 선택 불가)` + `BottomActionBar(확인)`
  - 오빗의 플레이어 카드에 `NightBoardUI.setInteractive(false)` + `NightBoardUI.setBlockedBadge(true)`로 “선택 불가” 표시
- 제출 payload: `{ centerIndex }`
- 결과/공개: 서버에서도 “교환만 수행, 공개 없음” 흐름(클라도 `night_result`로 reveal하지 않음)

### `werewolf` (늑대인간)
- UI 분기: **늑대가 1명일 때만** 중앙 1장 확인 UI 제공
  - `night_private.payload.canPeekCenter === true`면 중앙 선택 UI(1장) 표시
  - 아니면 `NightBoardUI.createRuleOnlyPanel(ruleText)`로 규칙만 표시(조작 UI 없음)
- 제출 payload(가능할 때만): `{ centerIndex }`
- 결과 연출: `night_result.roleId === "werewolf"`에서 선택한 중앙 카드에 `flipRevealRole(...)`로 공개

### `minion` / `mason` (정보만 제공)
- UI: 규칙/힌트 텍스트 중심(조작 UI 없음)
  - `NightBoardUI.createRuleOnlyPanel(...)` 기반
  - 서버 힌트는 `night_private`로 전달 (`_send_night_private_locked`)

### `insomniac` (불면증)
- UI: 하단 버튼으로 “내 카드 확인” 1회 플립(조작 UI는 단순)
- 현재 구현 포인트: `public/app.js`의 `roleId === "insomniac"` 분기에서 `flipRevealRole(card, rid)` 수행
- 참고/TODO: 서버는 `night_result`로 “현재 역할”을 전달할 수 있으므로(스왑 반영), 최종적으로는 그 값을 우선 사용하도록 정리 필요
