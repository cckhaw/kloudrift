import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine.js';
import { Synth } from './audio/synth.js';
import { loadProfile, saveProfile, defaultProfile } from './lib/storage.js';
import { bottleService } from './lib/bottles.js';
import { floraById } from './lib/flora.js';
import { addProgress, rollDaily, unclaimedDone, GOAL_REWARD } from './lib/daily.js';
import Hud from './components/Hud.jsx';
import StartScreen from './components/StartScreen.jsx';
import SanctuarySheet from './components/SanctuarySheet.jsx';
import BottlesSheet, { CatchModal } from './components/BottlesSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import DailySheet from './components/DailySheet.jsx';
import Tutorial from './components/Tutorial.jsx';

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const synthRef = useRef(null);
  const toastTimer = useRef(0);

  const [profile, setProfile] = useState(loadProfile);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [started, setStarted] = useState(false);
  const [sheet, setSheet] = useState(null); // 'sanctuary' | 'bottles' | 'catch' | 'settings' | 'daily'
  const [tutorial, setTutorial] = useState(false);
  const [caught, setCaught] = useState(null);
  const [hud, setHud] = useState({ altitude: 0, zone: 'Low Drift', inThermal: false });
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // Persist progress (debounced — sparks change several times a second).
  useEffect(() => {
    const id = setTimeout(() => saveProfile(profile), 400);
    return () => clearTimeout(id);
  }, [profile]);

  // Engine + audio lifecycle
  useEffect(() => {
    const synth = (synthRef.current = new Synth());
    synth.muted = profileRef.current.muted;
    synth.volume = profileRef.current.volume;

    const engine = (engineRef.current = new Engine(canvasRef.current, {
      audio: synth,
      getProfile: () => profileRef.current,
      onCollect: (n) => setProfile((p) => ({ ...p, sparks: p.sparks + n, daily: addProgress(p.daily, 'sparks', n) })),
      onProgress: (type, n) => setProfile((p) => ({ ...p, daily: addProgress(p.daily, type, n) })),
      onPlant: (id) =>
        setProfile((p) => ({
          ...p,
          sparks: Math.max(0, p.sparks - floraById[id].cost),
          garden: { ...p.garden, [id]: (p.garden[id] || 0) + 1 },
          daily: addProgress(p.daily, 'plant', 1),
        })),
      onBottle: async () => {
        setCaught(null);
        setSheet('catch');
        const b = await bottleService.catchOne(profileRef.current.caught);
        setCaught(b);
        setProfile((p) => ({ ...p, caught: [b, ...p.caught].slice(0, 100), daily: addProgress(p.daily, 'bottle', 1) }));
      },
      onToast: showToast,
      onHud: (h) => {
        setHud((prev) => (prev.altitude === h.altitude && prev.zone === h.zone && prev.inThermal === h.inThermal ? prev : h));
        const cur = profileRef.current;
        if (h.altitude > cur.bestAltitude || h.altitude > (rollDaily(cur.daily).progress.altitude || 0)) {
          setProfile((p) => ({
            ...p,
            bestAltitude: Math.max(p.bestAltitude, h.altitude),
            daily: addProgress(p.daily, 'altitude', h.altitude),
          }));
        }
      },
    }));
    if (import.meta.env.DEV) window.__kloudrift = engine; // test hook, dev builds only
    engine.setCalm(profileRef.current.calm);
    engine.setSlow(true);
    engine.start();
    return () => {
      engine.destroy();
      clearInterval(synth.timer);
      synth.ctx?.close();
    };
  }, [showToast]);

  // Gentle goals pay out automatically the moment they are complete.
  useEffect(() => {
    const done = unclaimedDone(profile.daily);
    if (!done.length) return;
    setProfile((p) => {
      const d = rollDaily(p.daily);
      const fresh = unclaimedDone(d);
      if (!fresh.length) return p;
      return { ...p, sparks: p.sparks + fresh.length * GOAL_REWARD, daily: { ...d, claimed: [...d.claimed, ...fresh.map((g) => g.id)] } };
    });
    showToast(`Gentle goal complete · +${done.length * GOAL_REWARD} sparks`);
  }, [profile.daily, showToast]);

  // The world drifts in slow motion behind the start screen and any open sheet.
  useEffect(() => {
    engineRef.current?.setSlow(!started || sheet !== null || tutorial);
    engineRef.current?.setPaused(sheet === 'settings');
  }, [started, sheet, tutorial]);

  const begin = () => {
    synthRef.current.muted = profile.muted;
    synthRef.current.start();
    setStarted(true);
    if (profile.tutorialDone) showToast('Drag anywhere to glide');
    else setTutorial(true);
  };

  const toggleMute = () => updateSettings({ muted: !profile.muted });

  const updateSettings = (patch) => {
    if ('muted' in patch) synthRef.current.setMuted(patch.muted);
    if ('volume' in patch) synthRef.current.setVolume(patch.volume);
    if ('calm' in patch) engineRef.current.setCalm(patch.calm);
    setProfile((p) => ({ ...p, ...patch }));
  };

  const finishTutorial = () => {
    setTutorial(false);
    setProfile((p) => ({ ...p, tutorialDone: true }));
  };

  const resetProgress = () => {
    const fresh = { ...defaultProfile(), muted: profile.muted, volume: profile.volume, calm: profile.calm, tutorialDone: true };
    setProfile(fresh);
    setSheet(null);
    showToast('A fresh sky');
  };

  const releaseBottle = async (text) => {
    const b = await bottleService.release(text);
    setProfile((p) => ({ ...p, sent: [b, ...p.sent].slice(0, 100), daily: addProgress(p.daily, 'bottle', 1) }));
    setSheet(null);
    engineRef.current.launchBottle();
    synthRef.current.bottle();
    showToast('Your bottle drifts away');
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-twilight font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Sky" />

      {started && (
        <Hud
          sparks={profile.sparks}
          hud={hud}
          muted={profile.muted}
          toast={toast}
          sheetOpen={sheet !== null || tutorial}
          onMute={toggleMute}
          onOpen={setSheet}
        />
      )}

      {!started && <StartScreen onBegin={begin} best={profile.bestAltitude} />}

      {sheet === 'sanctuary' && (
        <SanctuarySheet
          profile={profile}
          onSelect={(id) => setProfile((p) => ({ ...p, selectedFlora: id }))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'bottles' && <BottlesSheet profile={profile} onRelease={releaseBottle} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && (
        <SettingsSheet
          profile={profile}
          onChange={updateSettings}
          onReplayTutorial={() => {
            setSheet(null);
            setTutorial(true);
          }}
          onReset={resetProgress}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'daily' && <DailySheet profile={profile} onClose={() => setSheet(null)} />}
      {tutorial && <Tutorial onDone={finishTutorial} />}
      {sheet === 'catch' && <CatchModal bottle={caught} onClose={() => setSheet(null)} />}
    </div>
  );
}
