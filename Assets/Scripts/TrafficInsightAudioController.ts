/**
 * TrafficInsightAudioController.ts
 *
 * Owns: all sound for TrafficInsight - one AudioComponent per SFX cue (so a
 * click and a chime can overlap) plus one for spoken lines (TextToSpeech).
 * Lives on 'TrafficInsightRoot' next to TrafficInsightMain.
 * Inputs: four SFX tracks (with requireAsset fallbacks), optional
 * TextToSpeechModule, sfxVolume, enableVoice.
 * Must not: build or touch UI, hold app state, or disable any SceneObject.
 */
import { SfxCue } from "./TrafficInsightTypes";
import { tiLog, tiWarn } from "./TrafficInsightSceneContracts";

const FALLBACK_ALERT_CHIME = requireAsset("../GeneratedSFX/AlertChime.wav") as AudioTrackAsset;
const FALLBACK_ROUTE_SET_TONE = requireAsset("../GeneratedSFX/RouteSetTone.wav") as AudioTrackAsset;
const FALLBACK_ARRIVED_TONE = requireAsset("../GeneratedSFX/ArrivedTone.wav") as AudioTrackAsset;
const FALLBACK_BUTTON_CLICK = requireAsset("../GeneratedSFX/ButtonClick.wav") as AudioTrackAsset;

/** Shape of the (deprecated, untyped in StudioLib.d.ts) TextToSpeechModule.synthesize. */
type SynthesizeFn = (
    text: string,
    options: TextToSpeech.Options,
    onSuccess: (track: AudioTrackAsset, words: unknown, phonemes: unknown, voiceStyle: unknown) => void,
    onError: (code: number, description: string) => void
) => void;

@component
export class TrafficInsightAudioController extends BaseScriptComponent {
    @input @allowUndefined alertChime: AudioTrackAsset;
    @input @allowUndefined routeSetTone: AudioTrackAsset;
    @input @allowUndefined arrivedTone: AudioTrackAsset;
    @input @allowUndefined buttonClick: AudioTrackAsset;
    @input @allowUndefined ttsModule: TextToSpeechModule;
    @input @widget(new SliderWidget(0, 1, 0.05)) sfxVolume: number = 0.6;
    @input enableVoice: boolean = true;

    private sfx: { [cue: string]: AudioComponent } = {};
    private voice: AudioComponent | null = null;
    private voiceRequest = 0;

    onAwake(): void {
        this.sfx["AlertChime"] = this.makeSfx(this.alertChime ?? FALLBACK_ALERT_CHIME);
        this.sfx["RouteSetTone"] = this.makeSfx(this.routeSetTone ?? FALLBACK_ROUTE_SET_TONE);
        this.sfx["ArrivedTone"] = this.makeSfx(this.arrivedTone ?? FALLBACK_ARRIVED_TONE);
        this.sfx["ButtonClick"] = this.makeSfx(this.buttonClick ?? FALLBACK_BUTTON_CLICK);

        const voice = this.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent;
        voice.volume = 1.0;
        voice.playbackMode = Audio.PlaybackMode.LowPower;
        this.voice = voice;

        tiLog(this.isVoiceAvailable() ? "audio voice on" : "audio voice off, captions only");
    }

    /** Plays one SFX cue; restarts it if it is already playing. */
    play(cue: SfxCue): void {
        const comp = this.sfx[cue];
        if (!comp || isNull(comp) || !comp.audioTrack) {
            tiWarn("audio cue missing: " + cue);
            return;
        }
        if (comp.isPlaying()) {
            comp.stop(false);
        }
        comp.play(1);
        tiLog("audio=" + cue);
    }

    /** Speaks a line via TextToSpeech when voice is on; otherwise a no-op. */
    speak(text: string): void {
        if (!text || text.trim().length === 0) {
            return;
        }
        if (!this.isVoiceAvailable()) {
            return;
        }
        const voice = this.voice;
        if (!voice || isNull(voice)) {
            return;
        }
        if (voice.isPlaying()) {
            voice.stop(false);
        }
        const request = ++this.voiceRequest;
        try {
            const options = TextToSpeech.Options.create();
            const synthesize = this.getSynthesize();
            if (!synthesize) {
                return;
            }
            synthesize(
                text,
                options,
                (track: AudioTrackAsset) => {
                    // A newer line superseded this one while it was synthesizing.
                    if (request !== this.voiceRequest || isNull(voice) || !track) {
                        return;
                    }
                    if (voice.isPlaying()) {
                        voice.stop(false);
                    }
                    voice.audioTrack = track;
                    voice.play(1);
                    tiLog("audio=voice");
                },
                (code: number, description: string) => {
                    tiWarn("tts error " + code + ": " + description);
                }
            );
        } catch (e) {
            tiWarn("tts failed: " + e);
        }
    }

    /** True when voice is enabled and a usable TextToSpeechModule is wired. */
    isVoiceAvailable(): boolean {
        return this.enableVoice === true && this.getSynthesize() !== null;
    }

    private getSynthesize(): SynthesizeFn | null {
        const tts = this.ttsModule;
        if (!tts || isNull(tts)) {
            return null;
        }
        const fn = (tts as unknown as { synthesize?: unknown }).synthesize;
        if (typeof fn !== "function") {
            return null;
        }
        return (fn as SynthesizeFn).bind(tts);
    }

    private makeSfx(track: AudioTrackAsset): AudioComponent {
        const comp = this.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent;
        comp.audioTrack = track;
        comp.volume = this.sfxVolume;
        comp.playbackMode = Audio.PlaybackMode.LowLatency;
        return comp;
    }
}
