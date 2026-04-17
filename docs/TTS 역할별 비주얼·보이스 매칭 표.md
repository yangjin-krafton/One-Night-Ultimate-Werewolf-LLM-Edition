# TTS 역할별 비주얼·보이스 매칭 표

이 문서는 `scripts/role_portraits_prompts.json`의 초상화 프롬프트(Taisho Roman 스타일, 다이쇼 다크 판타지)를 기준으로 27개 역할의 **비주얼 성별·나이·외형**을 정리하고, TTS 대사의 **보이스 톤·화법·호칭**이 그 비주얼과 맞지 않으면 안 된다는 전제 하에 만든 매칭 레퍼런스다.

기존 두 개 말투표는 톤의 결(중세 유럽 / 더빙체 / 콩글리시 / 캐릭터 원형)을 잡는 데 썼다면, 이 문서는 **비주얼과 보이스가 어긋나지 않게** 마지막에 교차 검증할 때 쓴다.

## 성별·연령 축

| 축 | 범위 | 대표 역할 |
|------|------|------|
| 노년 남성 | 60대 이상, 수염, 학자/원로 | `alpha_wolf`, `beholder` |
| 중년 남성 | 40~50대, 묵직한 저음 | `werewolf`, `minion` |
| 청장년 남성 | 30대, 건조·거친 톤 | `hunter`, `thing`, `drunk` |
| 청년 남성 | 20대 전후, 밝거나 중성적 | `prince`, `mason`, `squire`, `tanner` |
| 소년 | 10대 후반, 변성기 직후 | `village_idiot`, `apprentice_tanner` |
| 노년 여성 | 할머니 톤, 나른한 저음 | `dream_wolf` |
| 중년 여성 | 40대 전후, 차분·지혜 또는 이중성 | `seer`, `doppelganger` |
| 청장년 여성 | 30대, 유혹/광기/저주 | `mystic_wolf`, `witch`, `cursed` |
| 청년 여성 | 20대, 사무·신입·힐러 | `robber`, `paranormal_investigator`, `revealer`, `aura_seer`, `villager` |
| 소녀 | 10대 소녀, 마법소녀/지침 | `apprentice_seer`, `insomniac` |
| 작은 요정형 | 성별 외형 모호, 하이 피치 | `troublemaker` |

## 비주얼-보이스 어긋남 체크리스트

아래는 현재 `dark_citadel.tts.json`과 `beginner_dark_fantasy.tts.json`에서 **비주얼과 톤/호칭이 안 맞아 교정이 필요한 항목**이다. 작업 시 이 목록부터 처리한다.

- [ ] `mystic_wolf`: 비주얼은 30대 **암컷** 늑대(관능)인데 현재 `공작 각하` 남성형 호칭 → **여성형**(`공작 부인`)으로 교정
- [ ] `dream_wolf`: 비주얼은 **할머니** 갈색 암컷 늑대인데 현재 `잠자는 늑대인간 왕자님` → **여성 노년**(`대모님 / 할머님`)으로 교정
- [ ] `alpha_wolf`: 비주얼은 **노년** 할아버지 늑대인데 현재 `대왕 전하`는 연령 힌트가 약함 → `원로 전하 / 대원로 폐하`로 노년감 추가
- [ ] `apprentice_seer`: 비주얼은 **마법소녀**인데 `서기관`은 소녀 톤이 묻힘 → `견습 예언자 소녀 / 별 수첩 소녀` 계열로 가볍게
- [ ] `aura_seer`: 비주얼은 **수녀 힐러**인데 `점성관`은 방향이 다름 → `수녀님 / 힐러 수녀님`으로 교정
- [ ] `beholder`: 비주얼은 **학자 할아버지**(안경·수염)인데 `수호 기사`는 무예 이미지 → `노학자 어르신 / 선생`으로 교정
- [ ] `thing`: 비주얼은 **마스크 쓴 30대 남성**인데 `영감`은 노년 어휘 → `마스크 낯선 분 / 그 무언가`로 교정
- [ ] `troublemaker`: 비주얼은 **요정 소녀**인데 `시동`은 남자아이 뉘앙스 → `말썽쟁이 요정 / 장난꾸러기 아가씨`로 교정
- [ ] `insomniac`: 비주얼은 **지친 10대 소녀**인데 `야경꾼`은 장년 남성 이미지 → `불면증 환자 소녀 / 잠 못 든 아가씨`
- [ ] `tanner`: 비주얼은 **20대 중성적 남성**인데 `양반`은 아저씨 톤 → `도령 / 젊은 선생`으로 교정
- [ ] `cursed`: 비주얼은 **30대 여성**인데 `경`은 남성형 기사 호칭 → `저주받은 부인 / 여인`으로 교정
- [ ] `doppelganger`: 비주얼은 **중년 여성(이중 얼굴)**인데 `백작님`은 남성형 기본값 → `부인 / 아주머니`로 교정
- [ ] `robber`: 비주얼은 **20대 중성적 여성**인데 `총각`은 남성 표현 → `강도 양 / 강도`로 교정
- [ ] `villager`: 비주얼은 **20대 여성**인데 `양반`은 나이·성별이 모호 → `아가씨 / 이웃 주민`으로 교정
- [ ] `revealer`: 비주얼은 **20대 초반 신입 여성**인데 `기록관님`은 연륜 있는 느낌 → `신임 기록관 / 기록 아가씨`로 톤 조정
- [ ] `apprentice_tanner`: 비주얼은 **마른 10대 소년**인데 `친구`는 연령 불명 → `소년 / 도령`으로 교정

## 보이스 합성 시 참고 톤 파라미터 (TTS 엔진 공용 지침)

| 범주 | pitch | speed | 숨소리 / 장음 |
|------|------|------|------|
| 노년 남성 (alpha_wolf, beholder) | 낮음 | 느림 | 약한 떨림, 미세 장음 |
| 중년 남성 (werewolf, doppelganger 남성 구간 X) | 낮음~중간 | 중간 | 짧은 호흡 단락 |
| 청장년 남성 (hunter, thing, drunk, minion 일부) | 중간 | 빠름~중간 | hunter 건조, drunk 장음 과장 |
| 청년 남성 (prince, mason, squire, tanner) | 중간~약간 높음 | 중간 | tanner는 한숨·비장감, 나머지 또렷 |
| 소년 (village_idiot, apprentice_tanner) | 높음 | 살짝 느림 | village_idiot 우물우물, apprentice_tanner 약한 울먹 |
| 노년 여성 (dream_wolf) | 낮은~중간 | 매우 느림 | 꿈꾸는 듯한 장음 |
| 중년 여성 (seer, doppelganger) | 중간 | 중간 | seer 또렷, doppelganger 이중 톤 전환 |
| 청장년 여성 (mystic_wolf, witch, cursed) | 중간~낮음 | mystic_wolf 느림, witch 급변동, cursed 떨림 | mystic_wolf 허스키 장음, witch 웃음 섞임 |
| 청년 여성 (robber, paranormal_investigator, revealer, aura_seer, villager) | 중간 | 빠름~중간 | aura_seer 부드러운 상승, revealer 진지 |
| 소녀 (apprentice_seer, insomniac) | 높음 | apprentice_seer 빠름, insomniac 느림 | insomniac 한숨·피곤 |
| 요정 (troublemaker) | 매우 높음 | 빠름 | 키득·끊김 |