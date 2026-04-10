/**
 * Photo Organizer – App.js
 *
 * Single-file Expo application that:
 *  1. Requests Camera, Microphone (Audio), and Media Library permissions on startup.
 *  2. Uses expo-speech-recognition to capture a folder name via voice command.
 *  3. Uses expo-file-system to create a folder with that name in the document directory.
 *  4. Uses expo-camera to let the user take exactly 4 photos, saved into the folder.
 *  5. Shows a "Photo N of 4" counter and saves each photo to the media library as well.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_PHOTOS = 4;

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Permissions ─────────────────────────────────────────────────────────
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [speechPermission, setSpeechPermission] = useState(null);

  // ── App phase ───────────────────────────────────────────────────────────
  // 'setup'  → waiting for all permissions
  // 'speak'  → show Speak button, waiting for voice input
  // 'camera' → taking photos
  // 'done'   → all 4 photos taken
  const [phase, setPhase] = useState('setup');

  // ── Folder state ────────────────────────────────────────────────────────
  const [folderName, setFolderName] = useState('');
  const [folderPath, setFolderPath] = useState('');

  // ── Photo counter ────────────────────────────────────────────────────────
  const [photoCount, setPhotoCount] = useState(0);

  // ── Speech state ─────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  // Use a ref so the 'end' event always reads the latest transcript value.
  const transcriptRef = useRef('');

  const cameraRef = useRef(null);

  // ─── Request all permissions on startup ─────────────────────────────────
  useEffect(() => {
    (async () => {
      requestCameraPermission();
      requestMediaPermission();
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setSpeechPermission(granted);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance to 'speak' once all permissions are granted.
  useEffect(() => {
    if (
      cameraPermission?.granted &&
      mediaPermission?.granted &&
      speechPermission === true &&
      phase === 'setup'
    ) {
      setPhase('speak');
    }
  }, [cameraPermission, mediaPermission, speechPermission, phase]);

  // ─── Speech recognition events ───────────────────────────────────────────
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    transcriptRef.current = text;
    setTranscript(text);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    const captured = transcriptRef.current.trim();
    if (captured) {
      handleFolderNameCaptured(captured);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    Alert.alert('Speech Error', event.error ?? 'An unknown speech error occurred.');
  });

  // ─── Speech actions ───────────────────────────────────────────────────────
  const startListening = () => {
    if (isListening) return;
    transcriptRef.current = '';
    setTranscript('');
    setIsListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
  };

  const stopListening = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  // ─── Folder management ────────────────────────────────────────────────────
  const handleFolderNameCaptured = async (rawName) => {
    // Strip characters not suitable for folder names.
    const sanitized = rawName.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    if (!sanitized) {
      Alert.alert(
        'Invalid Folder Name',
        'Could not detect a valid folder name. Please try again.',
      );
      return;
    }

    const path = `${FileSystem.documentDirectory}${sanitized}/`;
    try {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
      setFolderName(sanitized);
      setFolderPath(path);
      setPhotoCount(0);
      setPhase('camera');
    } catch (err) {
      Alert.alert('Folder Error', err.message);
    }
  };

  // ─── Camera / photo capture ───────────────────────────────────────────────
  const takePhoto = async () => {
    if (!cameraRef.current || photoCount >= MAX_PHOTOS) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      const dest = `${folderPath}photo_${photoCount + 1}.jpg`;

      // Copy from the camera's temp cache into our named folder.
      await FileSystem.copyAsync({ from: photo.uri, to: dest });

      // Also save to the device media library if permission is granted.
      if (mediaPermission?.granted) {
        await MediaLibrary.saveToLibraryAsync(dest);
      }

      const next = photoCount + 1;
      setPhotoCount(next);

      if (next >= MAX_PHOTOS) {
        setPhase('done');
      }
    } catch (err) {
      Alert.alert('Camera Error', err.message);
    }
  };

  // ─── Reset ────────────────────────────────────────────────────────────────
  const resetApp = () => {
    setFolderName('');
    setFolderPath('');
    setPhotoCount(0);
    setTranscript('');
    transcriptRef.current = '';
    setIsListening(false);
    setPhase('speak');
  };

  // ─── Render helpers ───────────────────────────────────────────────────────
  const retryPermissions = async () => {
    if (!cameraPermission?.granted) requestCameraPermission();
    if (!mediaPermission?.granted) requestMediaPermission();
    if (!speechPermission) {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setSpeechPermission(granted);
    }
  };

  // ─── Phase: setup ────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const allGranted =
      cameraPermission?.granted &&
      mediaPermission?.granted &&
      speechPermission === true;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>📷 Photo Organizer</Text>
        <Text style={styles.subtitle}>Requesting permissions…</Text>

        <View style={styles.card}>
          <PermRow label="📸 Camera" ok={cameraPermission?.granted} />
          <PermRow label="🎤 Microphone" ok={speechPermission} />
          <PermRow label="🖼  Media Library" ok={mediaPermission?.granted} />
        </View>

        {!allGranted && (
          <TouchableOpacity style={styles.btn} onPress={retryPermissions}>
            <Text style={styles.btnText}>Grant Permissions</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // ─── Phase: speak ────────────────────────────────────────────────────────
  if (phase === 'speak') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>📷 Photo Organizer</Text>
        <Text style={styles.subtitle}>Speak a folder name to begin</Text>

        {!!transcript && (
          <View style={styles.card}>
            <Text style={styles.transcriptLabel}>Heard:</Text>
            <Text style={styles.transcriptText}>"{transcript}"</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.speakBtn, isListening && styles.speakBtnActive]}
          onPress={isListening ? stopListening : startListening}
          activeOpacity={0.8}
        >
          <Text style={styles.speakIcon}>{isListening ? '⏹' : '🎤'}</Text>
          <Text style={styles.speakBtnText}>{isListening ? 'Stop' : 'Speak'}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          {isListening
            ? 'Listening… say a folder name (e.g. "Pasta 123")'
            : 'Tap the mic to say a folder name'}
        </Text>
      </SafeAreaView>
    );
  }

  // ─── Phase: camera / done ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, styles.cameraContainer]}>
      <StatusBar style="light" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.folderText}>📁 {folderName}</Text>
        {/* Shows "Photo 1 of 4" … "Photo 4 of 4" during capture,
            then stays at "Photo 4 of 4" once all photos are done. */}
        <Text style={styles.counter}>
          Photo {phase === 'done' ? MAX_PHOTOS : photoCount + 1} of {MAX_PHOTOS}
        </Text>
      </View>

      {/* ── Camera preview ─────────────────────────────────────────────── */}
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Photo progress dots overlaid on the preview */}
        <View style={styles.dotRow}>
          {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i < photoCount ? styles.dotFilled : styles.dotEmpty]}
            />
          ))}
        </View>
      </CameraView>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {phase === 'done' ? (
          <>
            <Text style={styles.doneText}>✅ All {MAX_PHOTOS} photos saved!</Text>
            <TouchableOpacity style={styles.btn} onPress={resetApp}>
              <Text style={styles.btnText}>Start Over</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.shutter, photoCount >= MAX_PHOTOS && styles.shutterDisabled]}
            onPress={takePhoto}
            disabled={photoCount >= MAX_PHOTOS}
            accessibilityLabel={`Take photo ${photoCount + 1} of ${MAX_PHOTOS}`}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Permission row helper ────────────────────────────────────────────────────

function PermRow({ label, ok }) {
  return (
    <View style={styles.permRow}>
      <Text style={styles.permLabel}>{label}</Text>
      <Text style={[styles.permStatus, ok ? styles.ok : styles.notOk]}>
        {ok ? '✓ Granted' : '✗ Pending'}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Shared ────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cameraContainer: {
    padding: 0,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#a8a8b3',
    marginBottom: 32,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 32,
  },
  btn: {
    backgroundColor: '#e94560',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Permissions ────────────────────────────────────────────────────────────
  permRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  permLabel: {
    color: '#e0e0e0',
    fontSize: 15,
  },
  permStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  ok: { color: '#4ecca3' },
  notOk: { color: '#e94560' },

  // ── Speak screen ───────────────────────────────────────────────────────────
  speakBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0f3460',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#e94560',
    // Shadow (iOS)
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    // Elevation (Android)
    elevation: 10,
  },
  speakBtnActive: {
    backgroundColor: '#e94560',
    borderColor: '#fff',
    shadowColor: '#fff',
  },
  speakIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  speakBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hint: {
    color: '#a8a8b3',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  transcriptLabel: {
    color: '#a8a8b3',
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  transcriptText: {
    color: '#4ecca3',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Camera screen ─────────────────────────────────────────────────────────
  header: {
    backgroundColor: '#1a1a2e',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    // Push content below the status bar on Android
    paddingTop: Platform.OS === 'android' ? 36 : 14,
  },
  folderText: {
    color: '#4ecca3',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  counter: {
    color: '#e0e0e0',
    fontSize: 15,
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  // Progress dots overlay on camera preview
  dotRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginHorizontal: 5,
  },
  dotFilled: {
    backgroundColor: '#e94560',
    borderColor: '#e94560',
  },
  dotEmpty: {
    backgroundColor: 'transparent',
    borderColor: '#fff',
  },
  controls: {
    backgroundColor: '#1a1a2e',
    width: '100%',
    paddingVertical: 28,
    alignItems: 'center',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.3,
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  doneText: {
    color: '#4ecca3',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
});
