<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-10">
    <header class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="px-3 py-1 rounded-full border border-sky-400/40 bg-sky-500/10 text-xs tracking-widest uppercase">One Night Ultimate Werewolf</div>
        <div class="badge bg-slate-800/70">LLM Edition</div>
      </div>
      <nav class="flex flex-wrap gap-2 text-sm">
        <button
          class="px-3 py-2 rounded-xl border"
          :class="currentPage === 'main' ? 'border-sky-400/50 bg-sky-500/10 text-sky-100' : 'border-slate-800/70 bg-slate-900/50 text-slate-300'"
          @click="currentPage = 'main'"
        >
          메인 (Voice 생성)
        </button>
        <button
          class="px-3 py-2 rounded-xl border"
          :class="currentPage === 'voices' ? 'border-sky-400/50 bg-sky-500/10 text-sky-100' : 'border-slate-800/70 bg-slate-900/50 text-slate-300'"
          @click="currentPage = 'voices'"
        >
          Ref Catalog / 캐릭터 목소리
        </button>
      </nav>
      <div class="flex flex-col gap-2">
        <h1 class="text-3xl font-semibold font-display">TTS Script Editor</h1>
        <p class="text-slate-400 max-w-3xl leading-relaxed">
          LLM이 만든 JSON/CSV 스크립트를 불러와 감정 태그를 Reference Audio에 매핑하고 GPT-SoVITS로 바로 들어보세요.
          모바일 플레이 전에 사회자/캐릭터별 목소리를 빠르게 준비할 수 있도록 설계했습니다.
        </p>
      </div>
      <div class="flex flex-wrap gap-3 text-xs text-slate-300">
        <span class="badge">Vue 3 + Vite</span>
        <span class="badge">Tailwind</span>
        <span class="badge">GPT-SoVITS API 연동</span>
        <span class="badge">JSON / CSV import</span>
      </div>
    </header>

    <section class="grid gap-6 md:grid-cols-3">
      <div class="card p-5 md:col-span-2 space-y-5">
        <div class="section-title">Script Import</div>
        <div class="flex flex-wrap gap-3">
          <button class="border-sky-400/40 bg-sky-500/10 text-sky-100" @click="loadSample">샘플 채우기</button>
          <button class="bg-emerald-500/15 border-emerald-400/40 text-emerald-50" @click="handleImport">JSON/CSV 파싱</button>
          <button class="bg-slate-800/80" @click="clearScript">초기화</button>
          <label class="cursor-pointer bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-800/70 hover:border-sky-400/50 flex items-center gap-2">
            <input ref="fileInput" type="file" accept=".json,.csv,text/csv,application/json" class="hidden" @change="onFilePick" />
            파일 불러오기
          </label>
        </div>
        <textarea v-model="importText" class="w-full min-h-[140px] font-mono" placeholder="LLM이 생성한 JSON 배열 또는 CSV를 붙여넣으세요"></textarea>
        <div class="flex flex-wrap gap-4 text-sm text-slate-400">
          <div>행: <span class="text-sky-200 font-semibold">{{ importText.split('\n').length }}</span></div>
          <div>문자 수: <span class="text-sky-200 font-semibold">{{ importText.length }}</span></div>
          <div v-if="importError" class="text-rose-300">{{ importError }}</div>
        </div>
      </div>

      <div class="card p-5 space-y-4">
        <div class="section-title">API 연결</div>
        <div class="space-y-3">
          <label class="block text-sm text-slate-300">GPT-SoVITS API Base</label>
          <input v-model="settings.apiBase" type="text" placeholder="http://127.0.0.1:9880" />
        </div>
        <div class="space-y-3">
          <label class="block text-sm text-slate-300">Local Ref Base URL (미리듣기용)</label>
          <input v-model="settings.localRefBaseUrl" type="text" placeholder="예: /@fs/D:/Workspace/One-Night-Ultimate-Werewolf-LLM-Edition/" />
          <p class="text-xs text-slate-500">catalog의 wav_path를 브라우저에서 재생할 때만 사용합니다.</p>
        </div>
        <div class="space-y-3">
          <label class="block text-sm text-slate-300">Container Ref Base</label>
          <input v-model="settings.containerRefBase" type="text" placeholder="/workspace/Ref" />
          <p class="text-xs text-slate-500">ref_audio_path가 상대경로면 이 값과 합쳐집니다.</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-slate-300">Media Type</label>
            <select v-model="settings.mediaType">
              <option value="wav">wav (권장)</option>
              <option value="aac">aac</option>
              <option value="ogg">ogg</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-slate-300">언어 (text/prompt)</label>
            <select v-model="settings.textLang">
              <option value="ko-KR">ko-KR</option>
              <option value="en-US">en-US</option>
              <option value="ja-JP">ja-JP</option>
              <option value="zh-CN">zh-CN</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-300">
          <input id="streaming" v-model="settings.streaming" type="checkbox" class="w-4 h-4" />
          <label for="streaming">Streaming Mode 비활성화 (기본 false)</label>
        </div>
      </div>
    </section>

    <section v-if="currentPage === 'main'" class="grid gap-6 md:grid-cols-2">
      <div class="card p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="section-title">Characters & Emotion Mapping</div>
          <button v-if="unusedCharacters.length" class="text-xs bg-emerald-500/15 border-emerald-400/40" @click="seedProfiles">캐릭터 자동 추가</button>
        </div>
        <p class="text-sm text-slate-400">텍스트 내 [태그]를 감지해 캐릭터별 참조 음성에 매핑합니다.</p>
        <div v-if="!profiles.length" class="text-slate-500 text-sm">불러온 캐릭터가 없습니다. 스크립트를 먼저 입력하세요.</div>
        <div v-for="profile in profiles" :key="profile.name" class="border border-slate-800/70 rounded-xl p-4 space-y-3 bg-slate-900/40">
          <div class="flex items-center justify-between">
            <div class="font-semibold text-lg">{{ profile.name }}</div>
            <button class="text-xs bg-rose-500/10 border-rose-400/30" @click="removeProfile(profile.name)">제거</button>
          </div>
          <div class="grid md:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm text-slate-300">기본 Ref (상대 또는 절대)</label>
              <input v-model="profile.defaultRef" type="text" placeholder="Wolf/normal.wav" />
            </div>
            <div>
              <label class="block text-sm text-slate-300">기본 Prompt Text</label>
              <input v-model="profile.promptText" type="text" placeholder="안녕하세요" />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-3">
            <div>
              <label class="block text-sm text-slate-300">개별 Container Base (선택)</label>
              <input v-model="profile.containerBase" type="text" placeholder="/workspace/Ref/Wolf" />
            </div>
            <div>
              <label class="block text-sm text-slate-300">속도 (1=기본)</label>
              <input v-model.number="profile.speed" type="number" step="0.05" min="0.5" max="2" />
            </div>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <div class="text-sm text-slate-300">감정 태그 매핑</div>
              <button class="text-xs bg-sky-500/15 border-sky-400/40" @click="addTag(profile)">+ 태그</button>
            </div>
            <div v-if="!profile.tags.length" class="text-xs text-slate-500">필요한 감정 태그를 추가하세요. 없으면 기본 Ref를 사용합니다.</div>
            <div v-for="(tag, idx) in profile.tags" :key="idx" class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 border border-slate-800/80 rounded-lg p-3 bg-slate-900/60">
              <div class="flex items-center gap-2 w-full md:w-32">
                <span class="text-xs text-slate-400">[{{ tag.name || '태그' }}]</span>
              </div>
              <input v-model="tag.name" class="w-full md:w-28" type="text" placeholder="기쁨" />
              <input v-model="tag.ref" class="w-full" type="text" placeholder="Wolf/excited.wav" />
              <input v-model="tag.prompt" class="w-full" type="text" placeholder="필요 시 덮어쓰기" />
              <button class="text-xs bg-rose-500/10 border-rose-400/40" @click="profile.tags.splice(idx, 1)">삭제</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card p-5 space-y-4">
        <div class="section-title">Generation</div>
        <p class="text-sm text-slate-400">한 번에 전부 생성하거나 개별로 다시 생성할 수 있습니다.</p>
        <div class="flex flex-wrap gap-3">
          <button :disabled="!scriptItems.length || isGenerating" class="bg-emerald-500/15 border-emerald-400/40" @click="generateAll">
            {{ isGenerating ? '생성 중…' : '전체 생성' }}
          </button>
          <button :disabled="!scriptItems.length" class="bg-sky-500/15 border-sky-400/40" @click="downloadProject">
            설정 내보내기
          </button>
          <button :disabled="!scriptItems.length" class="bg-slate-800/70" @click="clearAudio">
            생성 결과 초기화
          </button>
        </div>
        <div class="text-sm text-slate-400">{{ generationHint }}</div>
        <div class="border border-slate-800/70 rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-900/60 text-slate-300">
              <tr>
                <th class="px-3 py-2 text-left">#</th>
                <th class="px-3 py-2 text-left">캐릭터</th>
                <th class="px-3 py-2 text-left">대사</th>
                <th class="px-3 py-2 text-left">태그</th>
                <th class="px-3 py-2 text-left">Ref</th>
                <th class="px-3 py-2 text-left">상태</th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in scriptItems" :key="line.id" class="border-t border-slate-800/60 hover:bg-slate-900/50">
                <td class="px-3 py-2 text-slate-400">{{ idx + 1 }}</td>
                <td class="px-3 py-2 font-semibold">{{ line.character }}</td>
                <td class="px-3 py-2 text-slate-200 max-w-[280px]">
                  <div class="block text-ellipsis overflow-hidden" :title="line.text">{{ line.text }}</div>
                </td>
                <td class="px-3 py-2">
                  <div class="flex gap-2 flex-wrap">
                    <span v-for="tag in line.tags" :key="tag" class="tag">{{ tag }}</span>
                    <span v-if="!line.tags.length" class="text-xs text-slate-500">(none)</span>
                  </div>
                </td>
                <td class="px-3 py-2 text-slate-300">
                  <div class="text-xs break-all">{{ resolveMapping(line).refAudioPath || '미지정' }}</div>
                </td>
                <td class="px-3 py-2">
                  <span :class="statusClass(line.status)">{{ statusLabel(line.status) }}</span>
                  <div v-if="line.message" class="text-[11px] text-slate-400 mt-1">{{ line.message }}</div>
                </td>
                <td class="px-3 py-2 flex items-center gap-2">
                  <button class="text-xs" :disabled="line.status === 'working'" @click="generateOne(line)">재생성</button>
                  <button class="text-xs" :disabled="!line.audioUrl" @click="play(line)">재생</button>
                </td>
              </tr>
              <tr v-if="!scriptItems.length">
                <td colspan="7" class="px-3 py-4 text-center text-slate-500">스크립트를 불러오면 리스트가 여기에 표시됩니다.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section v-if="currentPage === 'main'" class="card p-5 space-y-3">
      <div class="section-title">Activity Log</div>
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="badge">입력 {{ scriptItems.length }} 줄</span>
        <span class="badge">캐릭터 {{ profiles.length }} 명</span>
        <span class="badge" v-if="completedCount">완료 {{ completedCount }} / {{ scriptItems.length }}</span>
      </div>
      <div class="h-48 overflow-auto bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 text-sm font-mono space-y-1">
        <div v-for="entry in logs" :key="entry.id" class="flex gap-3 text-slate-200">
          <span class="text-slate-500 w-20">{{ entry.ts }}</span>
          <span>{{ entry.text }}</span>
        </div>
        <div v-if="!logs.length" class="text-slate-600">아직 로그가 없습니다.</div>
      </div>
    </section>

    <section v-if="currentPage === 'voices'" class="grid gap-6 grid-cols-1">
      <div class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="section-title">Ref 데이터</div>
          <label class="cursor-pointer bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-800/70 hover:border-sky-400/50 flex items-center gap-2 text-xs">
            <input ref="catalogInput" type="file" accept=".csv,text/csv" multiple class="hidden" @change="onCatalogPick" />
            CSV 불러오기
          </label>
        </div>
        <div class="text-sm text-slate-400">
          <div v-if="!catalogRows.length">`Ref/catalogs/*.csv` 파일을 선택하세요. (여러 개 가능)</div>
          <div v-else>로드됨: <span class="text-sky-200 font-semibold">{{ catalogFiles.length }}</span>개 / 행 <span class="text-sky-200 font-semibold">{{ catalogRows.length }}</span> / 필터 후 <span class="text-sky-200 font-semibold">{{ filteredCatalogRows.length }}</span></div>
          <div v-if="catalogError" class="text-rose-300 mt-1">{{ catalogError }}</div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label class="block text-xs text-slate-400 mb-1">speaker</label>
            <input v-model="catalogFilter.speaker" type="text" placeholder="예: Paimon" />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">language</label>
            <input v-model="catalogFilter.language" type="text" placeholder="예: Korean" />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">type</label>
            <input v-model="catalogFilter.type" type="text" placeholder="예: Dialog" />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">text (contains)</label>
            <input v-model="catalogFilter.text" type="text" placeholder="transcription 검색" />
          </div>
        </div>

        <div class="flex flex-wrap gap-3 items-end text-sm">
          <div>
            <label class="block text-xs text-slate-400 mb-1">정렬</label>
            <select v-model="catalogSort.key">
              <option value="speaker">speaker</option>
              <option value="language">language</option>
              <option value="type">type</option>
              <option value="audioduration_s">audioduration_s</option>
              <option value="transcription">transcription</option>
              <option value="wav_path">wav_path</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">방향</label>
            <select v-model="catalogSort.dir">
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">페이지 크기</label>
            <select v-model.number="catalogPage.size">
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
              <option :value="500">500</option>
            </select>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <button class="text-xs" :disabled="catalogPage.page <= 1" @click="catalogPage.page -= 1">이전</button>
            <div class="text-xs text-slate-400">Page {{ catalogPage.page }} / {{ catalogTotalPages }}</div>
            <button class="text-xs" :disabled="catalogPage.page >= catalogTotalPages" @click="catalogPage.page += 1">다음</button>
          </div>
        </div>

        <details class="border border-slate-800/70 rounded-xl px-3 py-2">
          <summary class="cursor-pointer text-sm text-slate-300">컬럼 표시</summary>
          <div class="mt-2 flex flex-wrap gap-3 text-sm text-slate-300">
            <label class="flex items-center gap-2"><input type="checkbox" v-model="catalogColumns.speaker" /> speaker</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="catalogColumns.language" /> language</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="catalogColumns.type" /> type</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="catalogColumns.duration" /> duration</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="catalogColumns.transcription" /> transcription</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="catalogColumns.wav" /> wav_path</label>
          </div>
        </details>

        <div class="border border-slate-800/70 rounded-xl overflow-hidden">
          <div class="max-h-[520px] overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-900/60 text-slate-300 sticky top-0">
                <tr>
                  <th v-if="catalogColumns.speaker" class="px-3 py-2 text-left">speaker</th>
                  <th v-if="catalogColumns.language" class="px-3 py-2 text-left">language</th>
                  <th v-if="catalogColumns.type" class="px-3 py-2 text-left">type</th>
                  <th v-if="catalogColumns.duration" class="px-3 py-2 text-left">duration</th>
                  <th v-if="catalogColumns.transcription" class="px-3 py-2 text-left">transcription</th>
                  <th v-if="catalogColumns.wav" class="px-3 py-2 text-left">wav_path</th>
                  <th class="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedCatalogRows" :key="row.__key" class="border-t border-slate-800/60 hover:bg-slate-900/50">
                  <td v-if="catalogColumns.speaker" class="px-3 py-2 font-semibold">{{ row.speaker || row.speaker_id || 'unknown' }}</td>
                  <td v-if="catalogColumns.language" class="px-3 py-2 text-slate-300">{{ row.language || '' }}</td>
                  <td v-if="catalogColumns.type" class="px-3 py-2 text-slate-300">{{ row.type || '' }}</td>
                  <td v-if="catalogColumns.duration" class="px-3 py-2 text-slate-300">{{ row.audioduration_s || row.audioduration || '' }}</td>
                  <td v-if="catalogColumns.transcription" class="px-3 py-2 text-slate-200 max-w-[280px]">
                    <div class="block text-ellipsis overflow-hidden" :title="row.transcription || row.text || ''">{{ row.transcription || row.text || '' }}</div>
                  </td>
                  <td v-if="catalogColumns.wav" class="px-3 py-2 text-slate-400 max-w-[280px]">
                    <div class="block text-ellipsis overflow-hidden" :title="row.wav_path || row.inGameFilename || ''">{{ row.wav_path || row.inGameFilename || '' }}</div>
                  </td>
                  <td class="px-3 py-2 flex items-center gap-2">
                    <button class="text-xs" @click="previewCatalog(row)">미리듣기</button>
                    <button class="text-xs bg-emerald-500/15 border-emerald-400/40" @click="useAsRef(row)">Ref로 지정</button>
                  </td>
                </tr>
                <tr v-if="catalogRows.length && !filteredCatalogRows.length">
                  <td :colspan="catalogVisibleColumnCount + 1" class="px-3 py-4 text-center text-slate-500">필터 조건에 맞는 행이 없습니다.</td>
                </tr>
                <tr v-if="!catalogRows.length">
                  <td :colspan="catalogVisibleColumnCount + 1" class="px-3 py-4 text-center text-slate-500">CSV를 불러오면 목록이 표시됩니다.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="section-title">캐릭터 JSON 세팅 관련</div>
          <div class="flex flex-wrap gap-2">
            <button class="text-xs" @click="newVoiceJson">새로 만들기</button>
            <button class="text-xs" :disabled="!voiceJsonName.trim()" @click="copyVoiceJson">복사</button>
            <button class="text-xs bg-slate-800/80" :disabled="!voiceJsonName.trim()" @click="saveVoiceJson">저장</button>
            <button class="text-xs bg-slate-800/80" :disabled="!voiceJsonName.trim()" @click="downloadVoiceJson">내보내기</button>
            <label class="cursor-pointer text-xs bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-800/70 hover:border-sky-400/50">
              <input type="file" accept=".json,application/json" class="hidden" @change="importVoiceJson" />
              가져오기
            </label>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-slate-300">파일/이름</label>
            <input v-model="voiceJsonName" type="text" placeholder="예: genshin_ko_voice.json" />
          </div>
          <div>
            <label class="block text-sm text-slate-300">활성 세트</label>
            <select v-model="activeVoiceJsonKey">
              <option value="">(선택)</option>
              <option v-for="k in savedVoiceJsonKeys" :key="k" :value="k">{{ k }}</option>
            </select>
          </div>
        </div>

        <div class="text-sm text-slate-400">
          <div>현재 캐릭터: <span class="text-sky-200 font-semibold">{{ profiles.length }}</span></div>
          <div class="text-xs text-slate-500">저장하면 브라우저 LocalStorage에 보관됩니다. (서버 파일에 자동 저장은 불가)</div>
        </div>

        <div class="border border-slate-800/70 rounded-xl p-3 text-sm space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs text-slate-400">Ref로 지정 대상</label>
            <select v-model="refTarget.profileName" class="min-w-[180px]">
              <option value="">(캐릭터 선택)</option>
              <option v-for="p in profiles" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <select v-model="refTarget.tagName" class="min-w-[140px]">
              <option value="기본">기본</option>
              <option value="기쁜">기쁜</option>
              <option value="확남">확남</option>
              <option value="슬픔">슬픔</option>
              <option value="분노">분노</option>
              <option value="차분">차분</option>
              <option value="엄숙함">엄숙함</option>
            </select>
          </div>
          <div class="text-xs text-slate-500">Catalog에서 “Ref로 지정”을 누르면 위 캐릭터/감정에 ref 경로가 자동 입력됩니다.</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';

const sampleJson = `[
  {"character": "Narrator", "text": "밤이 되었습니다. [엄숙함] 모두 눈을 감아주세요."},
  {"character": "Wolf", "text": "[신남] 오늘 밤은 누구를 잡아먹을까?"},
  {"character": "Seer", "text": "[차분] 조용히 카드를 확인해 주세요."}
]`;

const settings = reactive({
  apiBase: 'http://127.0.0.1:9880',
  localRefBaseUrl: '',
  containerRefBase: '/workspace/Ref',
  mediaType: 'wav',
  textLang: 'ko-KR',
  streaming: false
});

const importText = ref(sampleJson);
const importError = ref('');
const scriptItems = ref([]);
const profiles = ref([]);
const isGenerating = ref(false);
const logs = ref([]);
const fileInput = ref(null);
const catalogInput = ref(null);
let logId = 0;

const currentPage = ref('main');

const catalogFiles = ref([]);
const catalogRows = ref([]);
const catalogError = ref('');
const catalogFilter = reactive({ speaker: '', language: '', type: '', text: '' });
const catalogSort = reactive({ key: 'audioduration_s', dir: 'desc' });
const catalogPage = reactive({ page: 1, size: 100 });
const catalogColumns = reactive({
  speaker: true,
  language: true,
  type: true,
  duration: true,
  transcription: true,
  wav: false
});

const voiceJsonName = ref('character_voices.json');
const activeVoiceJsonKey = ref('');
const refTarget = reactive({ profileName: '', tagName: '기본' });

const unusedCharacters = computed(() => {
  const names = new Set(scriptItems.value.map((s) => s.character));
  profiles.value.forEach((p) => names.delete(p.name));
  return Array.from(names);
});

const savedVoiceJsonKeys = computed(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith('voiceJson:')) keys.push(k.replace(/^voiceJson:/, ''));
  }
  return keys.sort((a, b) => a.localeCompare(b));
});

const completedCount = computed(() => scriptItems.value.filter((l) => l.status === 'done').length);

const generationHint = computed(() => {
  if (!scriptItems.value.length) return '스크립트를 먼저 불러오세요.';
  return '모든 줄에서 ref_audio_path가 채워져 있어야 API 호출이 성공합니다. 비워두면 기본 Ref가 사용됩니다.';
});

watch(
  () => [catalogFilter.speaker, catalogFilter.language, catalogFilter.type, catalogFilter.text].join('|'),
  () => {
    catalogPage.page = 1;
  }
);

watch(
  () => scriptItems.value.map((s) => s.character).join(','),
  () => seedProfiles()
);

watch(
  () => activeVoiceJsonKey.value,
  () => {
    if (!activeVoiceJsonKey.value) return;
    const raw = localStorage.getItem(`voiceJson:${activeVoiceJsonKey.value}`);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      if (Array.isArray(payload?.profiles)) {
        profiles.value = payload.profiles;
        voiceJsonName.value = payload.name || activeVoiceJsonKey.value;
        log(`보이스 JSON 로드: ${activeVoiceJsonKey.value}`);
      }
    } catch (e) {
      log(`보이스 JSON 로드 실패: ${e?.message || e}`);
    }
  }
);

function log(text) {
  const ts = new Date().toLocaleTimeString();
  logs.value.unshift({ id: ++logId, ts, text });
}

function loadSample() {
  importText.value = sampleJson;
  importError.value = '';
  log('샘플 JSON을 불러왔습니다.');
}

function clearScript() {
  importText.value = '';
  scriptItems.value = [];
  importError.value = '';
  log('스크립트와 결과를 초기화했습니다.');
}

function clearAudio() {
  scriptItems.value = scriptItems.value.map((line) => ({ ...line, audioUrl: '', status: 'idle', message: '' }));
  log('오디오 URL과 상태를 초기화했습니다.');
}

function parseCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (!rows.length) throw new Error('CSV가 비어 있습니다.');
  const header = rows[0].split(',').map((h) => h.trim().toLowerCase());
  const charIdx = header.indexOf('character');
  const textIdx = header.indexOf('text');
  if (charIdx === -1 || textIdx === -1) throw new Error('CSV 헤더에 character,text가 필요합니다.');
  return rows.slice(1).map((row, i) => {
    const cols = row.split(',');
    return {
      character: cols[charIdx] || `Character ${i + 1}`,
      text: cols[textIdx] || ''
    };
  });
}

function parseCsvRows(text) {
  const out = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((c) => String(c).trim() !== '')) out.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => String(c).trim() !== '')) out.push(row);
  return out;
}

function parseCatalogCsv(text, sourceName) {
  const rows = parseCsvRows(text);
  if (!rows.length) throw new Error('CSV가 비어 있습니다.');
  const header = rows[0].map((h) => String(h || '').trim());
  const idx = {};
  header.forEach((h, i) => {
    idx[h] = i;
  });
  const get = (r, key) => {
    const i = idx[key];
    if (i === undefined) return '';
    return r[i] ?? '';
  };
  return rows.slice(1).map((r, i) => ({
    __key: `${sourceName}:${i}`,
    speaker: get(r, 'speaker'),
    speaker_id: get(r, 'speaker_id'),
    language: get(r, 'language'),
    type: get(r, 'type'),
    transcription: get(r, 'transcription'),
    text: get(r, 'text'),
    audioduration_s: get(r, 'audioduration_s'),
    audioduration: get(r, 'audioduration'),
    inGameFilename: get(r, 'inGameFilename'),
    wav_path: get(r, 'wav_path')
  }));
}

const filteredCatalogRows = computed(() => {
  const s = catalogFilter.speaker.trim().toLowerCase();
  const l = catalogFilter.language.trim().toLowerCase();
  const t = catalogFilter.type.trim().toLowerCase();
  const q = catalogFilter.text.trim().toLowerCase();
  return catalogRows.value.filter((r) => {
    const speaker = String(r.speaker || r.speaker_id || '').toLowerCase();
    const lang = String(r.language || '').toLowerCase();
    const type = String(r.type || '').toLowerCase();
    const text = String(r.transcription || r.text || '').toLowerCase();
    if (s && !speaker.includes(s)) return false;
    if (l && !lang.includes(l)) return false;
    if (t && !type.includes(t)) return false;
    if (q && !text.includes(q)) return false;
    return true;
  });
});

function _sortValue(row, key) {
  if (key === 'audioduration_s') {
    const v = row.audioduration_s || row.audioduration || '';
    const n = Number(v);
    return Number.isFinite(n) ? n : -1;
  }
  if (key === 'transcription') return String(row.transcription || row.text || '');
  if (key === 'speaker') return String(row.speaker || row.speaker_id || '');
  return String(row[key] || '');
}

const sortedCatalogRows = computed(() => {
  const key = catalogSort.key;
  const dir = catalogSort.dir;
  const rows = filteredCatalogRows.value.slice();
  rows.sort((a, b) => {
    const av = _sortValue(a, key);
    const bv = _sortValue(b, key);
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
    const cmp = String(av).localeCompare(String(bv));
    return dir === 'asc' ? cmp : -cmp;
  });
  return rows;
});

const catalogTotalPages = computed(() => Math.max(1, Math.ceil(sortedCatalogRows.value.length / catalogPage.size)));

watch(
  () => [sortedCatalogRows.value.length, catalogPage.size].join('|'),
  () => {
    if (catalogPage.page > catalogTotalPages.value) catalogPage.page = catalogTotalPages.value;
    if (catalogPage.page < 1) catalogPage.page = 1;
  }
);

const pagedCatalogRows = computed(() => {
  const start = (catalogPage.page - 1) * catalogPage.size;
  const end = start + catalogPage.size;
  return sortedCatalogRows.value.slice(start, end);
});

const catalogVisibleColumnCount = computed(() => {
  let n = 0;
  if (catalogColumns.speaker) n += 1;
  if (catalogColumns.language) n += 1;
  if (catalogColumns.type) n += 1;
  if (catalogColumns.duration) n += 1;
  if (catalogColumns.transcription) n += 1;
  if (catalogColumns.wav) n += 1;
  return n;
});

function parseScript(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('입력된 내용이 없습니다.');
  try {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json)) return json;
  } catch (e) {
    /* ignore json error */
  }
  return parseCsv(trimmed);
}

function normalizeLine(entry, idx) {
  const character = String(entry.character || `Character ${idx + 1}`).trim();
  const text = String(entry.text || '').trim();
  const tags = extractEmotionTags(text);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${idx}`,
    character,
    text,
    tags,
    status: 'idle',
    message: '',
    audioUrl: ''
  };
}

function handleImport() {
  importError.value = '';
  try {
    const parsed = parseScript(importText.value);
    scriptItems.value = parsed.map((row, idx) => normalizeLine(row, idx));
    log(`스크립트 ${scriptItems.value.length}줄을 불러왔습니다.`);
  } catch (e) {
    importError.value = e?.message || String(e);
    log(`IMPORT ERROR: ${importError.value}`);
  }
}

function extractEmotionTags(text) {
  const matches = Array.from(String(text).matchAll(/\[([^\]]+)\]/g));
  return matches.map((m) => m[1].trim()).filter(Boolean);
}

function seedProfiles() {
  unusedCharacters.value.forEach((name) => {
    profiles.value.push({
      name,
      defaultRef: '',
      promptText: '',
      containerBase: '',
      speed: 1,
      tags: []
    });
  });
}

function ensureTag(profile, tagName) {
  if (!profile) return null;
  profile.tags = profile.tags || [];
  let tag = profile.tags.find((t) => String(t.name || '').toLowerCase() === String(tagName).toLowerCase());
  if (!tag) {
    tag = { name: tagName, ref: '', prompt: '' };
    profile.tags.push(tag);
  }
  return tag;
}

function stripLeadingRefPrefix(p) {
  if (!p) return '';
  const clean = String(p).replace(/\\+/g, '/');
  return clean.startsWith('Ref/') ? clean.slice(4) : clean;
}

function buildLocalAudioUrl(wavPath) {
  if (!wavPath) return '';
  const base = String(settings.localRefBaseUrl || '').replace(/\\+/g, '/').replace(/\/$/, '');
  const rel = String(wavPath).replace(/\\+/g, '/').replace(/^\//, '');
  if (!base) return rel;
  return `${base}/${rel}`;
}

async function previewCatalog(row) {
  const url = buildLocalAudioUrl(row.wav_path || row.inGameFilename);
  if (!url) {
    log('미리듣기 실패: wav_path 없음');
    return;
  }
  try {
    audio.src = url;
    audio.currentTime = 0;
    await audio.play();
    log(`미리듣기: ${row.speaker || row.speaker_id || 'unknown'}`);
  } catch (e) {
    log(`미리듣기 실패: ${e?.message || e}`);
  }
}

function useAsRef(row) {
  const profileName = refTarget.profileName || '';
  if (!profileName) {
    log('Ref 지정 실패: 캐릭터 선택 필요');
    return;
  }
  const profile = profiles.value.find((p) => p.name === profileName);
  if (!profile) {
    log('Ref 지정 실패: 캐릭터 프로필 없음');
    return;
  }

  const tagName = refTarget.tagName || '기본';
  const targetPath = stripLeadingRefPrefix(row.wav_path || row.inGameFilename || '');
  if (!targetPath) {
    log('Ref 지정 실패: wav_path 없음');
    return;
  }

  if (tagName === '기본') {
    profile.defaultRef = targetPath;
  } else {
    const tag = ensureTag(profile, tagName);
    if (tag) tag.ref = targetPath;
  }
  log(`Ref 지정: ${profileName} / ${tagName} -> ${targetPath}`);
}

function onCatalogPick(event) {
  catalogError.value = '';
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  catalogFiles.value = files.map((f) => ({ name: f.name, size: f.size }));
  catalogRows.value = [];

  Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, text: reader.result || '' });
          reader.onerror = () => reject(new Error(`파일 읽기 실패: ${file.name}`));
          reader.readAsText(file, 'utf-8');
        })
    )
  )
    .then((items) => {
      const all = [];
      items.forEach((it) => {
        all.push(...parseCatalogCsv(String(it.text), it.name));
      });
      catalogRows.value = all;
      log(`Catalog CSV 로드: ${catalogRows.value.length}행`);
    })
    .catch((e) => {
      catalogError.value = e?.message || String(e);
      log(`CATALOG ERROR: ${catalogError.value}`);
    });
}

function newVoiceJson() {
  profiles.value = [];
  activeVoiceJsonKey.value = '';
  voiceJsonName.value = 'character_voices.json';
  log('새 보이스 JSON 시작');
}

function saveVoiceJson() {
  const key = voiceJsonName.value.trim() || 'character_voices.json';
  const payload = { name: key, profiles: profiles.value, savedAt: new Date().toISOString() };
  localStorage.setItem(`voiceJson:${key}`, JSON.stringify(payload));
  activeVoiceJsonKey.value = key;
  log(`보이스 JSON 저장: ${key}`);
}

function copyVoiceJson() {
  const base = voiceJsonName.value.trim() || 'character_voices.json';
  const copyName = base.replace(/\.json$/i, '') + '_copy.json';
  voiceJsonName.value = copyName;
  saveVoiceJson();
}

function downloadVoiceJson() {
  const key = voiceJsonName.value.trim() || 'character_voices.json';
  const payload = { name: key, profiles: profiles.value };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = key;
  a.click();
  URL.revokeObjectURL(url);
  log(`보이스 JSON 내보내기: ${key}`);
}

function importVoiceJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ''));
      if (!Array.isArray(payload?.profiles)) throw new Error('profiles 배열이 필요합니다.');
      profiles.value = payload.profiles;
      voiceJsonName.value = payload.name || file.name || 'character_voices.json';
      activeVoiceJsonKey.value = '';
      log(`보이스 JSON 가져오기: ${voiceJsonName.value}`);
    } catch (e) {
      log(`보이스 JSON 가져오기 실패: ${e?.message || e}`);
    }
  };
  reader.readAsText(file, 'utf-8');
}

function removeProfile(name) {
  profiles.value = profiles.value.filter((p) => p.name !== name);
  log(`${name} 프로필을 제거했습니다.`);
}

function addTag(profile) {
  profile.tags = profile.tags || [];
  profile.tags.push({ name: '', ref: '', prompt: '' });
}

function resolveMapping(line) {
  const profile = profiles.value.find((p) => p.name === line.character);
  const firstTag = line.tags[0] || '기본';
  const tagMatch = profile?.tags?.find((t) => t.name && t.name.toLowerCase() === firstTag.toLowerCase());
  const promptText = (tagMatch?.prompt || profile?.promptText || '').trim();
  const refRaw = (tagMatch?.ref || profile?.defaultRef || '').trim();
  const refAudioPath = normalizeRefPath(refRaw, profile?.containerBase || settings.containerRefBase);
  return { profile, tag: firstTag, refAudioPath, promptText };
}

function normalizeRefPath(ref, base) {
  if (!ref) return '';
  const cleanRef = ref.replace(/\\+/g, '/').replace(/^\//, '');
  if (ref.startsWith('/')) return ref;
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  const cleanBase = (base || '').replace(/\\+/g, '/').replace(/\/$/, '');
  return `${cleanBase}/${cleanRef}`;
}

async function generateAll() {
  if (!scriptItems.value.length) return;
  isGenerating.value = true;
  log('전체 생성 시작');
  for (const line of scriptItems.value) {
    // eslint-disable-next-line no-await-in-loop
    await generateOne(line, { silent: true });
  }
  isGenerating.value = false;
  log('전체 생성 완료');
}

async function generateOne(line, opts = {}) {
  const mapping = resolveMapping(line);
  if (!mapping.refAudioPath) {
    updateStatus(line, 'error', 'ref_audio_path 없음');
    if (!opts.silent) log('ref_audio_path가 비어 있어 호출을 건너뜁니다.');
    return;
  }

  const apiBase = settings.apiBase.replace(/\/$/, '');
  const url = new URL(`${apiBase}/tts`);
  url.searchParams.set('text', line.text || '');
  url.searchParams.set('text_lang', settings.textLang);
  url.searchParams.set('prompt_lang', settings.textLang);
  url.searchParams.set('ref_audio_path', mapping.refAudioPath);
  url.searchParams.set('media_type', settings.mediaType);
  url.searchParams.set('streaming_mode', String(settings.streaming));
  if (mapping.promptText) url.searchParams.set('prompt_text', mapping.promptText);

  updateStatus(line, 'working', '생성 중');
  log(`GET ${url.toString()}`);

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    line.audioUrl = objUrl;
    updateStatus(line, 'done', mapping.refAudioPath);
    if (!opts.silent) log(`완료: ${line.character} - ${line.text.slice(0, 40)}`);
  } catch (e) {
    updateStatus(line, 'error', e?.message || String(e));
    log(`ERROR (${line.character}): ${e?.message || e}`);
  }
}

function updateStatus(line, status, message = '') {
  line.status = status;
  line.message = message;
}

const audio = new Audio();

function play(line) {
  if (!line.audioUrl) return;
  audio.src = line.audioUrl;
  audio.currentTime = 0;
  audio.play();
  log(`재생: ${line.character}`);
}

function downloadProject() {
  const payload = {
    settings: { ...settings },
    profiles: profiles.value,
    script: scriptItems.value.map((s) => ({ character: s.character, text: s.text }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tts-editor-project.json';
  a.click();
  URL.revokeObjectURL(url);
  log('프로젝트 설정을 다운로드했습니다.');
}

function onFilePick(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importText.value = reader.result || '';
    log(`${file.name} 파일을 읽었습니다.`);
  };
  reader.readAsText(file, 'utf-8');
}

function statusLabel(status) {
  switch (status) {
    case 'done':
      return '완료';
    case 'working':
      return '생성 중';
    case 'error':
      return '오류';
    default:
      return '대기';
  }
}

function statusClass(status) {
  const base = 'text-xs font-semibold px-2 py-1 rounded-full border';
  if (status === 'done') return `${base} text-emerald-200 border-emerald-500/40 bg-emerald-500/10`;
  if (status === 'working') return `${base} text-sky-100 border-sky-500/40 bg-sky-500/10`;
  if (status === 'error') return `${base} text-rose-200 border-rose-500/40 bg-rose-500/10`;
  return `${base} text-slate-300 border-slate-700 bg-slate-800/70`;
}
</script>
