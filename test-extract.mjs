import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';

const run = promisify(execFile);

async function fetchText(url, tries = 3) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const { stdout } = await run(
        'curl.exe',
        ['-s', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
        { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      );
      if (!stdout || stdout.length < 200) throw new Error(`Respuesta vacía/corta en ${url}`);
      return stdout;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function extractVBind(html, name) {
  const m = html.match(new RegExp(`v-bind:${name}\\s*=\\s*(["'])`));
  if (!m) return null;
  const quote = m[0].slice(-1);
  const start = m.index + m[0].length;
  const end = html.indexOf(quote, start);
  if (end < 0) return null;
  const slice = html.slice(start, end);
  const decoded = decode(slice);
  return JSON.parse(decoded);
}

async function main() {
  console.log('[sync] Leyendo catálogo de https://dokkaninfo.com/cards …');
  const cardsHtml = await fetchText('https://dokkaninfo.com/cards');
  console.log('HTML length:', cardsHtml.length);

  const cardsJson = extractVBind(cardsHtml, 'cardsjson');
  if (!Array.isArray(cardsJson) || !cardsJson.length) {
    console.log('FAILED to extract cardsjson');
    return;
  }
  console.log('SUCCESS! Got', cardsJson.length, 'cards');

  // Save first card for inspection
  writeFileSync('first-card.json', JSON.stringify(cardsJson[0], null, 2));
  console.log('Saved first card to first-card.json');

  // Show all unique field names across all cards
  const allFields = new Set();
  cardsJson.forEach(card => Object.keys(card).forEach(k => allFields.add(k)));
  console.log('\nAll unique fields:', Array.from(allFields).sort());

  // Show sample values for key fields
  const sample = cardsJson[0];
  console.log('\nSample card (first):');
  console.log('rarity:', sample.rarity, 'type:', typeof sample.rarity);
  console.log('element:', sample.element);
  console.log('lv_max:', sample.lv_max);
  console.log('cost:', sample.cost);
  console.log('hp_init/hp_max/hp_hipo:', sample.hp_init, sample.hp_max, sample.hp_hipo);
  console.log('atk_init/atk_max/atk_hipo:', sample.atk_init, sample.atk_max, sample.atk_hipo);
  console.log('def_init/def_max/def_hipo:', sample.def_init, sample.def_max, sample.def_hipo);
  console.log('release_dates:', sample.release_dates);
  console.log('stats:', sample.stats);
  console.log('hidden_potential:', sample.hidden_potential);
  console.log('link_skill_ids:', sample.link_skill_ids);
  console.log('leader_skill:', sample.leader_skill);
  console.log('passive_skill:', sample.passive_skill);
  console.log('active_skills:', sample.active_skills);
  console.log('standby_skill:', sample.standby_skill);
  console.log('extreme_z_awakening:', sample.extreme_z_awakening);
  console.log('is_reversibly_exchanged:', sample.is_reversibly_exchanged);
  console.log('reversible_exchange_character_id:', sample.reversible_exchange_character_id);
  console.log('transformation_path_characters:', sample.transformation_path_characters);
  console.log('treasure_exchanges:', sample.treasure_exchanges);
  console.log('is_freely_obtainable:', sample.is_freely_obtainable);
  console.log('is_stage_drop_reward:', sample.is_stage_drop_reward);
  console.log('is_world_tournament_reward:', sample.is_world_tournament_reward);
  console.log('has_battle_motion:', sample.has_battle_motion);
  console.log('character_id:', sample.character_id);
  console.log('canonical_id:', sample.canonical_id);
  console.log('ki_multipliers:', sample.ki_multipliers);
  console.log('thumbnail_id:', sample.thumbnail_id);
  console.log('icon_id:', sample.icon_id);
  console.log('has_images:', sample.has_images);
  console.log('has_eza:', sample.has_eza);
  console.log('has_seza:', sample.has_seza);
  console.log('awoken_max:', sample.awoken_max);
  console.log('bg_element:', sample.bg_element);
  console.log('bg_effect_id:', sample.bg_effect_id);
  console.log('resource_id:', sample.resource_id);
  console.log('open_at:', sample.open_at);
  console.log('eza:', sample.eza);
  console.log('eza_open_at:', sample.eza_open_at);
  console.log('seza:', sample.seza);
  console.log('seza_open_at:', sample.seza_open_at);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });