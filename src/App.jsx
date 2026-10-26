import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine.js';
import { Synth } from './audio/synth.js';
import { loadProfile, saveProfile, defaultProfile } from './lib/storage.js';
import { bottleService } from './lib/bottles.js';
import { floraById } from './lib/flora.js';
import { nextLevel, levelById, STAR_REWARD } from './game/levels.js';
import { addProgress, rollDaily, unclaimedDone, GOAL_REWARD } from './lib/daily.js';
import Hud from './components/Hud.jsx';
import StartScreen from './components/StartScreen.jsx';
import SanctuarySheet from './components/SanctuarySheet.jsx';
import BottlesSheet, { CatchModal } from './components/BottlesSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import DailySheet from './components/DailySheet.jsx';
import Tutorial from './components/Tutorial.jsx';
import JourneySheet from './components/JourneySheet.jsx';
import { LevelIntro, LevelComplete } from './components/LevelSheets.jsx';

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const synthRef = useRef(null);
  const toastTimer = useRef(0);
  const pendingMode = useRef(null); // mode to launch once the first-run tutorial ends

  const [profile, setProfile] = useState(loadProfile);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [started, setStarted] = useState(false);
  const [sheet, setSheet] = useState(null); // 'sanctuary' | 'bottles' | 'catch' | 'settings' | 'daily' | 'journey' | 'intro' | 'levelDone'
  const [tutorial, setTutorial] = useState(false);
  const [caught, setCaught] = useState(null);
  const [level, setLevel] = useState(null); // level currently loaded in the engine
  const [result, setResult] = useState(null); // last level-complete payload
  const [hud, setHud] = useState({ mode: 'free', altitude: 0, zone: 'Low Drift', inThermal: false });
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
      onLevelComplete: (r) => {
        const count = r.stars.filter(Boolean).length;
        const prev = profileRef.current.journey.stars[r.level.id] || 0;
        const newStars = Math.max(0, count - prev);
        setProfile((p) => ({
          ...p,
          sparks: p.sparks + newStars * STAR_REWARD,
          journey: { ...p.journey, stars: { ...p.journey.stars, [r.level.id]: Math.max(count, p.journey.stars[r.level.id] || 0) } },
        }));
        setResult({ ...r, newStars });
        setSheet('levelDone');
      },
      onToast: showToast,
      onHud: (h) => {
        setHud((prev) => (Object.keys(h).length === Object.keys(prev).length && Object.keys(h).every((k) => prev[k] === h[k]) ? prev : h));
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
    if (import.meta.env.DEV) Object.assign(window, { __kloudrift: engine, __levels: levelById }); // test hooks, dev builds only
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

  const startFree = () => {
    engineRef.current.startFree();
    setLevel(null);
    setSheet(null);
    showToast('Free Drift — no goal, just sky');
  };

  const openLevel = (lvl) => {
    engineRef.current.startLevel(lvl);
    setLevel(lvl);
    setSheet('intro');
  };

  const launch = (mode) => {
    if (mode === 'journey') setSheet('journey');
    else startFree();
  };

  const begin = (mode) => {
    synthRef.current.muted = profile.muted;
    synthRef.current.volume = profile.volume;
    synthRef.current.start();
    setStarted(true);
    if (profile.tutorialDone) launch(mode);
    else {
      pendingMode.current = mode;
      setTutorial(true);
    }
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
    if (pendingMode.current) launch(pendingMode.current);
    pendingMode.current = null;
  };

  const resetProgress = () => {
    const fresh = { ...defaultProfile(), muted: profile.muted, volume: profile.volume, calm: profile.calm, tutorialDone: true };
    setProfile(fresh);
    setSheet(null);
    showToast('A fresh sky');
  };

  const reportBottle = async (b) => {
    await bottleService.report(b.id);
    setProfile((p) => ({ ...p, caught: p.caught.filter((c) => c.id !== b.id) }));
    setSheet(null);
    showToast('Thanks — that bottle has been reported');
  };

  const releaseBottle = async (text) => {
    const { bottle: b, shared } = await bottleService.release(text); // may throw BottleRejected → shown in the sheet
    setProfile((p) => ({ ...p, sent: [b, ...p.sent].slice(0, 100), daily: addProgress(p.daily, 'bottle', 1) }));
    setSheet(null);
    engineRef.current.launchBottle();
    synthRef.current.bottle();
    showToast(shared ? 'Your bottle drifts away' : 'Offline — your bottle stays on this device');
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

      {!started && <StartScreen onJourney={() => begin('journey')} onFree={() => begin('free')} best={profile.bestAltitude} stars={profile.journey.stars} />}

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
          onJourney={() => setSheet('journey')}
          onFreeDrift={startFree}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'journey' && <JourneySheet stars={profile.journey.stars} onPlay={openLevel} onFreeDrift={startFree} onClose={() => setSheet(null)} />}
      {sheet === 'intro' && level && (
        <LevelIntro level={level} best={profile.journey.stars[level.id] || 0} onFly={() => setSheet(null)} onMap={() => setSheet('journey')} />
      )}
      {sheet === 'levelDone' && result && (
        <LevelComplete
          result={result}
          newStars={result.newStars}
          hasNext={Boolean(nextLevel(result.level))}
          onNext={() => openLevel(nextLevel(result.level))}
          onRetry={() => {
            engineRef.current.startLevel(result.level);
            setSheet(null);
          }}
          onMap={() => setSheet('journey')}
        />
      )}
      {sheet === 'daily' && <DailySheet profile={profile} onClose={() => setSheet(null)} />}
      {tutorial && <Tutorial onDone={finishTutorial} />}
      {sheet === 'catch' && <CatchModal bottle={caught} onReport={reportBottle} onClose={() => setSheet(null)} />}
    </div>
  );
}
