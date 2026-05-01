/**
 * マスター BPM と Sync の tick を管理する。
 * Sync ケーブル接続済みシーケンサはこの tick で advanceStep される。
 */

export const MASTER_BPM_MIN = 40;
export const MASTER_BPM_MAX = 240;

const LAMP_FLASH_MS = 80;

/** @type {Set<(tick: number) => void>} */
const masterSyncReceivers = new Set();
/** key: `${toRow}-${toSlotId}` → advanceStep 関数 */
const masterSyncConnectionKeys = new Map();
/** BPM 変更時に setMasterBpm を渡す対象 */
const masterSyncSequencerInstances = new Set();

let masterBPM = 120;
let masterTick = 0;
let masterSyncIntervalId = null;

export function getMasterBpm() {
  return masterBPM;
}

export function getMasterTick() {
  return masterTick;
}

/** プロジェクト読み込みなどで購読マップのみリセットする */
export function clearMasterSyncSubscriptions() {
  masterSyncReceivers.clear();
  masterSyncConnectionKeys.clear();
  masterSyncSequencerInstances.clear();
}

export function subscribeSequencerMasterSync(toRow, toSlotId, instance) {
  if (!instance?.advanceStep || typeof instance.setSyncConnected !== 'function') return;
  instance.setSyncConnected(true, masterTick, masterBPM);
  masterSyncReceivers.add(instance.advanceStep);
  masterSyncConnectionKeys.set(`${toRow}-${toSlotId}`, instance.advanceStep);
  masterSyncSequencerInstances.add(instance);
}

export function unsubscribeSequencerMasterSync(toRow, toSlotId, instance) {
  const key = `${toRow}-${toSlotId}`;
  const advanceStepFn = masterSyncConnectionKeys.get(key);
  if (advanceStepFn) {
    masterSyncReceivers.delete(advanceStepFn);
    masterSyncConnectionKeys.delete(key);
  }
  if (instance) {
    masterSyncSequencerInstances.delete(instance);
    if (typeof instance.setSyncConnected === 'function') instance.setSyncConnected(false);
  }
}

function updateMasterBpmBar(sliderEl, barFillEl) {
  if (!sliderEl || !barFillEl) return;
  const v = Number(sliderEl.value);
  const pct = ((v - MASTER_BPM_MIN) / (MASTER_BPM_MAX - MASTER_BPM_MIN)) * 100;
  barFillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function startMasterSyncInterval(lampEl) {
  if (masterSyncIntervalId) clearInterval(masterSyncIntervalId);
  masterTick = 0;
  const stepMs = (60 * 1000) / masterBPM / 4;
  masterSyncIntervalId = setInterval(() => {
    masterTick += 1;
    if (lampEl && masterTick % 4 === 0) {
      lampEl.classList.add('synth-master-sync__lamp--on');
      setTimeout(() => lampEl.classList.remove('synth-master-sync__lamp--on'), LAMP_FLASH_MS);
    }
    for (const advanceStep of masterSyncReceivers) {
      try {
        advanceStep(masterTick);
      } catch (_) {}
    }
  }, stepMs);
}

/**
 * マスター BPM UI と interval をひも付ける。既存の main.js と同等のタイミングで interval を開始する。
 */
export function bindMasterSyncUI({
  lamp = document.getElementById('masterSyncLamp'),
  bpmSlider = document.getElementById('masterBpm'),
  bpmValue = document.getElementById('masterBpmValue'),
  bpmBarFill = document.getElementById('masterBpmBarFill'),
} = {}) {
  if (bpmSlider && bpmValue) {
    bpmSlider.addEventListener('input', () => {
      masterBPM = Math.max(MASTER_BPM_MIN, Math.min(MASTER_BPM_MAX, Number(bpmSlider.value)));
      bpmValue.textContent = String(Math.floor(masterBPM));
      updateMasterBpmBar(bpmSlider, bpmBarFill);
      startMasterSyncInterval(lamp);
      masterSyncSequencerInstances.forEach((inst) => {
        if (typeof inst.setMasterBpm === 'function') inst.setMasterBpm(masterBPM);
      });
    });
    bpmValue.textContent = String(masterBPM);
    updateMasterBpmBar(bpmSlider, bpmBarFill);
  }
  startMasterSyncInterval(lamp);
}
