package cl.elpollon.app;

import android.content.Context;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

/**
 * Alarma nativa de pedido nuevo. No usa WebView: suena con pantalla apagada
 * u otra app abierta (el FGS de GPS deja el proceso vivo y FCM llega aquí).
 * Sigue hasta que el repartidor abre y acepta/rechaza, o hasta el TTL (3 min).
 */
final class OfferAlarmPlayer {
    private static final int BEAT_MS = 1200;
    private static final int TONE_MS = 850;
    private static final long MAX_MS = 180_000L;

    private static ToneGenerator tone;
    private static Handler handler;
    private static PowerManager.WakeLock wakeLock;
    private static long deadline;
    private static Context appCtx;
    private static final Runnable beat = OfferAlarmPlayer::playBeat;

    private OfferAlarmPlayer() {}

    static synchronized void start(Context context) {
        stopInternal(false);
        appCtx = context.getApplicationContext();
        deadline = System.currentTimeMillis() + MAX_MS;

        try {
            PowerManager pm = (PowerManager) appCtx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ElPollon::OfferAlarm");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(MAX_MS + 3000L);
            }
        } catch (Exception ignored) {}

        ensureTone();
        if (tone == null) return;
        handler = new Handler(Looper.getMainLooper());
        playBeat();
    }

    static synchronized void stop() {
        stopInternal(true);
    }

    private static void stopInternal(boolean releaseCtx) {
        deadline = 0;
        if (handler != null) {
            handler.removeCallbacks(beat);
            handler = null;
        }
        if (tone != null) {
            try {
                tone.stopTone();
                tone.release();
            } catch (Exception ignored) {}
            tone = null;
        }
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
            } catch (Exception ignored) {}
            wakeLock = null;
        }
        if (releaseCtx) appCtx = null;
    }

    private static void ensureTone() {
        if (tone != null) return;
        try {
            tone = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
        } catch (Exception e) {
            try {
                tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100);
            } catch (Exception ignored) {}
        }
    }

    private static synchronized void playBeat() {
        if (deadline <= 0 || System.currentTimeMillis() >= deadline) {
            stop();
            return;
        }
        ensureTone();
        if (tone == null) {
            stop();
            return;
        }
        try {
            tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, TONE_MS);
        } catch (Exception e) {
            try {
                if (tone != null) {
                    tone.release();
                }
            } catch (Exception ignored) {}
            tone = null;
            ensureTone();
        }
        if (handler != null) {
            handler.postDelayed(beat, BEAT_MS);
        }
    }
}
