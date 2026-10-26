import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine.js';
import { Synth } from './audio/synth.js';
import { loadProfile, saveProfile, defaultProfile } from './lib/storage.js';
import { bottleService } from './lib/bottles.js';
import { floraById } from './lib/flora.js';
import Hud from './components/Hud.jsx';
import StartScreen from './components/StartScreen.jsx';
import SanctuarySheet from './components/SanctuarySheet.jsx';
import BottlesSheet, { CatchModal } from './components/BottlesSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
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
  const [sheet, setSheet] = useState(null); // 'sanctuary' | 'bottles' | 'catch' | 'settings'
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
      onCollect: (n) => setProfile((p) => ({ ...p, sparks: p.sparks + n })),
      onPlant: (id) =>
        setProfile((p) => ({
          ...p,
          sparks: Math.max(0, p.sparks - floraById[id].cost),
          garden: { ...p.garden, [id]: (p.garden[id] || 0) + 1 },
        })),
      onBottle: async () => {
        setCaught(null);
        setSheet('catch');
        const b = await bottleService.catchOne(profileRef.current.caught);
        setCaught(b);
        setProfile((p) => ({ ...p, caught: [b, ...p.caught].slice(0, 100) }));
      },
      onToast: showToast,
      onHud: (h) => {
        setHud((prev) => (prev.altitude === h.altitude && prev.zone === h.zone && prev.inThermal === h.inThermal ? prev : h));
        if (h.altitude > profileRef.current.bestAltitude) {
          setProfile((p) => (h.altitude > p.bestAltitude ? { ...p, bestAltitude: h.altitude } : p));
        }
      },
    }));
    engine.setCalm(profileRef.current.calm);
    engine.setSlow(true);
    engine.start();
    return () => {
      engine.destroy();
      clearInterval(synth.timer);
      synth.ctx?.close();
    };
  }, [showToast]);

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
    setProfile((p) => ({ ...p, sent: [b, ...p.sent].slice(0, 100) }));
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
      {tutorial && <Tutorial onDone={finishTutorial} />}
      {sheet === 'catch' && <CatchModal bottle={caught} onClose={() => setSheet(null)} />}
    </div>
  );
}
