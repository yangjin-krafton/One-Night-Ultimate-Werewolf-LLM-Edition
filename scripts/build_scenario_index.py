"""
Scan public/assets/scenarios/*.json and generate _index.json
for automatic scenario registration.

Usage:
    python scripts/build_scenario_index.py
"""

import json
import glob
import os
import sys

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPTS_DIR)
SCENARIOS_DIR = os.path.join(PROJECT_ROOT, 'public', 'assets', 'scenarios')

# ── tag → Korean theme label ──
TAG_THEME_LABELS = {
    'classic_theme':    '원작 테마',
    'dark_fantasy':     '다크 판타지',
    'sci_fi_horror':    'SF 호러',
    'hospital_horror':  '병원 호러',
    'school_horror':    '학교 호러',
    'colonial_horror':  '식민지 괴담',
    'folk_occult':      '오컬트',
    'third_world_horror': '제3세계 호러',
    'occult':           '오컬트',
}

# ── episode profile → default title suffix ──
PROFILE_TITLES = {
    'tutorial_long': '안내 진행',
    'standard_mid':  '표준 진행',
    'expert_fast':   '빠른 진행',
}


def derive_subtitle(data):
    """Derive subtitle from scenarioMode + tags."""
    mode = data.get('scenarioMode', 'advanced')
    mode_label = '초보자형' if mode == 'beginner' else '숙련자형'

    # find the first matching theme tag
    theme = ''
    for tag in data.get('tags', []):
        if tag in TAG_THEME_LABELS:
            theme = TAG_THEME_LABELS[tag]
            break

    parts = [mode_label]
    if theme:
        parts.append(theme)
    parts.append('전체 역할 풀')
    return ' · '.join(parts)


def derive_episode_title(ep_id, profile):
    """Derive a default episode title from profile type."""
    ep_num = ep_id.replace('ep', '')
    suffix = PROFILE_TITLES.get(profile, profile)
    return f'EP{ep_num}: {suffix}'


def build_index():
    pattern = os.path.join(SCENARIOS_DIR, '*.json')
    entries = []

    for path in sorted(glob.glob(pattern)):
        basename = os.path.basename(path)
        # skip the index file itself
        if basename.startswith('_'):
            continue

        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        scenario_id = data.get('scenarioId', basename.replace('.json', ''))

        # subtitle: use explicit field or derive
        subtitle = data.get('subtitle') or derive_subtitle(data)

        # episodes: use explicit episodeTitles or derive from episodeProfiles
        episode_titles = data.get('episodeTitles', {})
        profiles = data.get('episodeProfiles', {})
        episodes = []
        for ep_id in sorted(profiles.keys()):
            title = episode_titles.get(ep_id) or derive_episode_title(ep_id, profiles[ep_id])
            episodes.append({'id': ep_id, 'title': title})

        # playerCounts: use explicit or default
        player_counts = data.get('playerCounts', [3, 4, 5, 6, 7, 8, 9, 10])

        entries.append({
            'id': scenario_id,
            'title': data.get('title', scenario_id),
            'subtitle': subtitle,
            'playerCounts': player_counts,
            'episodes': episodes,
        })

    out_path = os.path.join(SCENARIOS_DIR, '_index.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f'[build_scenario_index] {len(entries)} scenarios -> {out_path}')
    return entries


if __name__ == '__main__':
    build_index()
